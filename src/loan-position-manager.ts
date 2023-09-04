import {
  Address,
  BigInt,
  ethereum,
  store,
  log,
  BigDecimal,
} from '@graphprotocol/graph-ts'

import {
  SetLoanConfiguration,
  LoanPositionManager as LoanPositionManagerContract,
  UpdatePosition,
} from '../generated/LoanPositionManager/LoanPositionManager'
import { Substitute as AssetContract } from '../generated/LoanPositionManager/Substitute'
import { Collateral, LoanPosition, Token } from '../generated/schema'
import { OrderBook as OrderBookContract } from '../generated/templates/OrderNFT/OrderBook'
import { CouponOracle as CouponOracleContract } from '../generated/LoanPositionManager/CouponOracle'

import {
  createAsset,
  createEpoch,
  createToken,
  exponentToBigDecimal,
  getEpochIndexByTimestamp,
} from './helpers'
import { getCouponOracleAddress } from './addresses'

export function handleSetLoanConfiguration(event: SetLoanConfiguration): void {
  createToken(event.params.collateral)

  const collateralUnderlying = createToken(
    AssetContract.bind(event.params.collateral).underlyingToken(),
  )

  const key = event.params.collateral
    .toHexString()
    .concat('-')
    .concat(event.params.debt.toHexString())
  let collateral = Collateral.load(key)
  if (collateral === null) {
    collateral = new Collateral(key)
    collateral.underlying = collateralUnderlying.id
    collateral.substitute = event.params.collateral.toHexString()
    const loanConfiguration = LoanPositionManagerContract.bind(
      event.address,
    ).getLoanConfiguration(event.params.collateral, event.params.debt)
    collateral.liquidationTargetLtv = loanConfiguration.liquidationTargetLtv
    collateral.liquidationThreshold = loanConfiguration.liquidationThreshold
    collateral.save()
  }

  const substituteUnderlying = createToken(
    AssetContract.bind(event.params.debt).underlyingToken(),
  )

  const asset = createAsset(Address.fromString(substituteUnderlying.id))
  asset.collaterals = asset.collaterals.concat([key])
  asset.save()
}

export function handleUpdateLoanPosition(event: UpdatePosition): void {
  const takeEvents = (event.receipt as ethereum.TransactionReceipt).logs.filter(
    (log) =>
      log.topics[0].toHexString() ==
      '0x9754cddf091a07317cd2bfc6ead4610d1a7401cf0ea4176a44ab9366d4042d7d',
  )
  let boughtAmount = BigInt.zero()
  let soldAmount = BigInt.zero()
  for (let i = 0; i < takeEvents.length; i++) {
    const orderBookContract = OrderBookContract.bind(takeEvents[i].address)
    const decoded = ethereum.decode(
      '(uint16,uint64,uint8)',
      takeEvents[i].data,
    ) as ethereum.Value
    const data = decoded.toTuple()
    const rawAmount = data[1].toBigInt()
    const options = data[2].toI32()
    if (options & 0x1) {
      // bid (withdraw)
      boughtAmount = boughtAmount.plus(orderBookContract.rawToQuote(rawAmount))
    } else {
      // ask (deposit)
      soldAmount = soldAmount.plus(orderBookContract.rawToQuote(rawAmount))
    }
  }

  const positionId = event.params.positionId
  const loanPositionManager = LoanPositionManagerContract.bind(event.address)
  const position = loanPositionManager.getPosition(positionId)

  let loanPosition = LoanPosition.load(positionId.toString())
  if (loanPosition === null) {
    loanPosition = new LoanPosition(positionId.toString())
    loanPosition.amount = BigInt.zero()
    loanPosition.principal = BigInt.zero()
  }
  // const previousAmount = loanPosition.amount
  let mightBeDeleted = false
  if (event.params.debtAmount.equals(BigInt.zero())) {
    mightBeDeleted = true
    log.info('mightBeDeleted', [positionId.toString()])
  } else {
    loanPosition.user = loanPositionManager.ownerOf(positionId).toHexString()
    loanPosition.collateral = position.collateralToken
      .toHexString()
      .concat('-')
      .concat(position.debtToken.toHexString())
    loanPosition.collateralAmount = position.collateralAmount
    loanPosition.principal = loanPosition.principal
      .plus(event.params.debtAmount)
      .minus(loanPosition.amount)
      .plus(soldAmount)
      .minus(boughtAmount)
    loanPosition.amount = event.params.debtAmount
    loanPosition.fromEpoch = createEpoch(
      getEpochIndexByTimestamp(event.block.timestamp),
    ).id
    loanPosition.toEpoch = createEpoch(BigInt.fromI32(position.expiredWith)).id
    loanPosition.substitute = position.debtToken.toHexString()
    loanPosition.underlying = AssetContract.bind(position.debtToken)
      .underlyingToken()
      .toHexString()

    const couponOracle = CouponOracleContract.bind(
      Address.fromString(getCouponOracleAddress()),
    )
    const priceDecimals = couponOracle.decimals()
    const collateralToken = Token.load(
      position.collateralToken.toHexString(),
    ) as Token
    const collateralAmount = BigDecimal.fromString(
      position.collateralAmount.toString(),
    ).div(exponentToBigDecimal(collateralToken.decimals))
    const collateralPrice = BigDecimal.fromString(
      couponOracle.getAssetPrice(position.collateralToken).toString(),
    ).div(exponentToBigDecimal(BigInt.fromI32(priceDecimals)))

    const deptToken = Token.load(position.debtToken.toHexString()) as Token
    const deptAmount = BigDecimal.fromString(
      position.debtAmount.toString(),
    ).div(exponentToBigDecimal(deptToken.decimals))
    const deptPrice = BigDecimal.fromString(
      couponOracle.getAssetPrice(position.debtToken).toString(),
    ).div(exponentToBigDecimal(BigInt.fromI32(priceDecimals)))

    loanPosition.createdAt = event.block.timestamp
    loanPosition.ltv = deptAmount
      .times(deptPrice)
      .div(collateralAmount.times(collateralPrice))
      .times(BigDecimal.fromString('100'))
    loanPosition.save()
  }

  if (mightBeDeleted) {
    store.remove('LoanPosition', positionId.toString())
  }
}
