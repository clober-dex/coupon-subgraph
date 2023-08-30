import { Address, BigInt, store, ethereum, log } from '@graphprotocol/graph-ts'

import {
  BondPositionManager as BondPositionManagerContract,
  RegisterAsset,
  Transfer,
  UpdatePosition,
} from '../generated/BondPositionManager/BondPositionManager'
import { OrderBook as OrderBookContract } from '../generated/templates/OrderNFT/OrderBook'
import { Substitute as AssetContract } from '../generated/BondPositionManager/Substitute'
import { AssetStatus, BondPosition, Market } from '../generated/schema'
import {
  DepositController as DepositControllerContract,
  DepositController__getCouponMarketInputCouponKeyStruct,
} from '../generated/BondPositionManager/DepositController'

import { ADDRESS_ZERO, createAsset, createEpoch, createToken } from './helpers'
import {
  BOND_POSITION_MANAGER_ADDRESS,
  DEPOSIT_CONTROLLER_ADDRESS,
} from './addresses'

export function handleRegisterAsset(event: RegisterAsset): void {
  const substitute = createToken(event.params.asset)

  const substituteUnderlying = createToken(
    AssetContract.bind(event.params.asset).underlyingToken(),
  )

  const asset = createAsset(Address.fromString(substituteUnderlying.id))
  asset.substitutes = asset.substitutes.concat([substitute.id])
  asset.save()
}

export function handleUpdateBondPosition(event: UpdatePosition): void {
  const tokenId = event.params.tokenId
  const bondPositionManager = BondPositionManagerContract.bind(
    Address.fromString(BOND_POSITION_MANAGER_ADDRESS),
  )

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
      // bid
      boughtAmount = boughtAmount.plus(orderBookContract.rawToQuote(rawAmount))
    } else {
      // ask
      soldAmount = soldAmount.plus(orderBookContract.rawToQuote(rawAmount))
    }
  }

  let bondPosition = BondPosition.load(tokenId.toString())
  if (bondPosition === null) {
    bondPosition = new BondPosition(tokenId.toString())
    bondPosition.principal = BigInt.zero()
  }
  const previousPrincipal = bondPosition.principal
  bondPosition.user = bondPositionManager.ownerOf(tokenId).toHexString()
  bondPosition.amount = event.params.amount
  bondPosition.principal = event.params.amount
    .minus(soldAmount)
    .plus(boughtAmount)

  const position = bondPositionManager.getPosition(tokenId)
  bondPosition.fromEpoch = createEpoch(BigInt.fromI32(position.expiredWith)).id
  bondPosition.toEpoch = createEpoch(BigInt.fromI32(position.expiredWith)).id
  bondPosition.substitute = position.asset.toHexString()
  bondPosition.underlying = AssetContract.bind(position.asset)
    .underlyingToken()
    .toHexString()
  bondPosition.save()

  const couponKey = buildCouponKey(
    position.asset,
    BigInt.fromI32(position.expiredWith),
  )
  const depositControllerContract = DepositControllerContract.bind(
    Address.fromString(DEPOSIT_CONTROLLER_ADDRESS),
  )
  const marketAddress = depositControllerContract.getCouponMarket(couponKey)
  const assetStatusKey = bondPosition.underlying
    .concat('-')
    .concat(bondPosition.toEpoch)
  let assetStatus = AssetStatus.load(assetStatusKey)
  if (assetStatus === null) {
    assetStatus = new AssetStatus(assetStatusKey)
    assetStatus.asset = bondPosition.underlying
    assetStatus.epoch = bondPosition.toEpoch
    assetStatus.market = marketAddress.toHexString()
    assetStatus.totalDeposits = bondPosition.principal
  } else {
    assetStatus.totalDeposits = assetStatus.totalDeposits
      .plus(bondPosition.principal)
      .minus(previousPrincipal)
  }
  assetStatus.save()
}

export function handleBondPositionTransfer(event: Transfer): void {
  const bondPosition = BondPosition.load(event.params.tokenId.toString())
  if (bondPosition === null) {
    return
  }

  const bondPositionManager = BondPositionManagerContract.bind(
    Address.fromString(BOND_POSITION_MANAGER_ADDRESS),
  )
  bondPosition.user = bondPositionManager
    .ownerOf(event.params.tokenId)
    .toHexString()

  if (bondPosition.user == ADDRESS_ZERO) {
    store.remove('BondPosition', bondPosition.id)
  } else {
    bondPosition.save()
  }
}

function buildCouponKey(
  asset: Address,
  epoch: BigInt,
): DepositController__getCouponMarketInputCouponKeyStruct {
  const fixedSizedArray: Array<ethereum.Value> = [
    ethereum.Value.fromAddress(asset),
    ethereum.Value.fromUnsignedBigInt(epoch),
  ]
  return changetype<DepositController__getCouponMarketInputCouponKeyStruct>(
    fixedSizedArray,
  )
}
