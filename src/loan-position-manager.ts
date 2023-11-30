import {
  Address,
  BigInt,
  Bytes,
  ethereum,
  store,
  log,
} from '@graphprotocol/graph-ts'

import {
  LiquidatePosition,
  LoanPositionManager as LoanPositionManagerContract,
  SetLoanConfiguration,
  Transfer,
  UpdatePosition,
} from '../generated/LoanPositionManager/LoanPositionManager'
import { OrderBook as OrderBookContract } from '../generated/templates/OrderNFT/OrderBook'
import { Substitute as AssetContract } from '../generated/LoanPositionManager/Substitute'
import { AssetStatus, Collateral, LoanPosition } from '../generated/schema'

import {
  ADDRESS_ZERO,
  createAsset,
  createEpoch,
  createToken,
  getEpochIndexByTimestamp,
} from './helpers'

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
    collateral.totalCollateralized = BigInt.zero()
    collateral.totalBorrowed = BigInt.zero()
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
    loanPosition.collateralAmount = BigInt.zero()
    loanPosition.liquidationRepaidAmount = BigInt.zero()
    loanPosition.createdAt = event.block.timestamp
    loanPosition.fromEpoch = createEpoch(
      getEpochIndexByTimestamp(event.block.timestamp),
    ).id
    loanPosition.toEpoch = createEpoch(BigInt.fromI32(position.expiredWith)).id
    loanPosition.isLeveraged = false
    loanPosition.borrowedCollateralAmount = BigInt.zero()

    if (event.transaction.input.toHexString().slice(0, 10) == '0xcc84c6b9') {
      // parse with `ethabi decode params -t`
      const decoded = ethereum.decode(
        '(address,address,uint256,uint256,uint256,uint16,(address,uint256,bytes32),(uint256,(uint256,uint8,bytes32,bytes32)))',
        Bytes.fromHexString(event.transaction.input.toHexString().slice(10)),
      )
      if (decoded) {
        const data = decoded.toTuple()
        const swapData = data[7].toTuple()[3].toTuple()
        const swapAmount = swapData[1].toBigInt()
        if (swapAmount.gt(BigInt.zero())) {
          loanPosition.isLeveraged = true

          const transferEvents = (
            event.receipt as ethereum.TransactionReceipt
          ).logs.filter(
            (log) =>
              log.topics[0].toHexString() ==
              '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
          )
          let erc20Value = BigInt.fromI32(0)
          for (let i = 0; i < transferEvents.length; i++) {
            const decoded = ethereum.decode(
              '(address,address,uint256)',
              transferEvents[i].data,
            ) as ethereum.Value
            const data = decoded.toTuple()
            const from = data[0].toAddress()
            if (from == event.transaction.from) {
              erc20Value = erc20Value.plus(data[2].toBigInt())
            }
          }
          loanPosition.borrowedCollateralAmount =
            position.collateralAmount.minus(
              event.transaction.value.plus(erc20Value),
            )
        }
      }
    }
  }
  const prevDebtAmount = loanPosition.amount
  const debtAmountDelta = event.params.debtAmount.minus(loanPosition.amount)
  const collateralAmountDelta = event.params.collateralAmount.minus(
    loanPosition.collateralAmount,
  )
  const prevToEpoch = BigInt.fromString(loanPosition.toEpoch).toI32()

  const shouldRemove =
    event.params.collateralAmount.equals(BigInt.zero()) &&
    event.params.debtAmount.equals(BigInt.zero())
  if (!shouldRemove) {
    loanPosition.user = loanPositionManager.ownerOf(positionId).toHexString()
    loanPosition.collateral = position.collateralToken
      .toHexString()
      .concat('-')
      .concat(position.debtToken.toHexString())
    loanPosition.collateralAmount = position.collateralAmount
    loanPosition.principal = loanPosition.principal
      .plus(debtAmountDelta)
      .plus(soldAmount)
      .minus(boughtAmount)
    loanPosition.amount = event.params.debtAmount
    loanPosition.toEpoch = createEpoch(BigInt.fromI32(position.expiredWith)).id
    loanPosition.substitute = position.debtToken.toHexString()
    loanPosition.underlying = AssetContract.bind(position.debtToken)
      .underlyingToken()
      .toHexString()
    loanPosition.updatedAt = event.block.timestamp
    loanPosition.save()
  }

  const collateral = Collateral.load(loanPosition.collateral)
  if (collateral) {
    collateral.totalCollateralized = collateral.totalCollateralized.plus(
      collateralAmountDelta,
    )
    collateral.totalBorrowed = collateral.totalBorrowed.plus(debtAmountDelta)
    collateral.save()
  }

  const toEpoch = BigInt.fromString(loanPosition.toEpoch).toI32()
  for (
    let epochIndex = BigInt.fromString(loanPosition.fromEpoch).toI32();
    epochIndex <= max(toEpoch, prevToEpoch);
    epochIndex++
  ) {
    const assetStatusKey = loanPosition.underlying
      .concat('-')
      .concat(epochIndex.toString())
    const assetStatus = AssetStatus.load(assetStatusKey) as AssetStatus

    const epochDelta = toEpoch - prevToEpoch
    if (epochDelta < 0) {
      // epoch decreased
      if (epochIndex > toEpoch) {
        assetStatus.totalBorrowed =
          assetStatus.totalBorrowed.minus(prevDebtAmount)
      } else {
        assetStatus.totalBorrowed =
          assetStatus.totalBorrowed.plus(debtAmountDelta)
      }
    } else if (epochDelta > 0) {
      // epoch increased
      if (epochIndex > prevToEpoch) {
        assetStatus.totalBorrowed = assetStatus.totalBorrowed.plus(
          loanPosition.amount,
        )
      } else {
        assetStatus.totalBorrowed =
          assetStatus.totalBorrowed.plus(debtAmountDelta)
      }
    } else {
      // epoch unchanged
      assetStatus.totalBorrowed =
        assetStatus.totalBorrowed.plus(debtAmountDelta)
    }
    assetStatus.save()
  }

  if (shouldRemove) {
    store.remove('LoanPosition', positionId.toString())
  }
}

export function handleLoanPositionTransfer(event: Transfer): void {
  const loanPosition = LoanPosition.load(event.params.tokenId.toString())
  if (loanPosition === null) {
    return
  }
  if (event.params.to.toHexString() != ADDRESS_ZERO) {
    const loanPositionManager = LoanPositionManagerContract.bind(event.address)
    loanPosition.user = loanPositionManager
      .ownerOf(event.params.tokenId)
      .toHexString()
    loanPosition.save()
  }
}

export function handleLiquidatePosition(event: LiquidatePosition): void {
  const loanPosition = LoanPosition.load(event.params.positionId.toString())
  if (loanPosition === null) {
    return
  }
  loanPosition.liquidationRepaidAmount =
    loanPosition.liquidationRepaidAmount.plus(event.params.repayAmount)
  loanPosition.save()
}
