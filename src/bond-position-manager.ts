import { Address, BigInt, store, ethereum } from '@graphprotocol/graph-ts'

import {
  BondPositionManager as BondPositionManagerContract,
  RegisterAsset,
  UpdatePosition,
  Transfer,
} from '../generated/BondPositionManager/BondPositionManager'
import { OrderBook as OrderBookContract } from '../generated/templates/OrderNFT/OrderBook'
import { Substitute as AssetContract } from '../generated/BondPositionManager/Substitute'
import { AssetStatus, BondPosition, PositionStatus } from '../generated/schema'

import {
  ADDRESS_ZERO,
  createAsset,
  createEpoch,
  createPositionStatus,
  createToken,
  getEpochIndexByTimestamp,
} from './helpers'
import { getChainId } from './addresses'

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

  const tokenId = event.params.tokenId
  const bondPositionManager = BondPositionManagerContract.bind(event.address)
  const position = bondPositionManager.getPosition(tokenId)

  const positionStatus = createPositionStatus()
  let bondPosition = BondPosition.load(tokenId.toString())
  if (bondPosition === null) {
    bondPosition = new BondPosition(tokenId.toString())
    bondPosition.amount = BigInt.zero()
    bondPosition.principal = BigInt.zero()
    bondPosition.createdAt = event.block.timestamp
    bondPosition.fromEpoch = createEpoch(
      getEpochIndexByTimestamp(event.block.timestamp),
    ).id

    positionStatus.totalBondPositionCount =
      positionStatus.totalBondPositionCount.plus(BigInt.fromI32(1))
    positionStatus.save()
  }
  const amountDelta = event.params.amount.minus(bondPosition.amount)
  const shouldRemove = event.params.amount.equals(BigInt.zero())
  if (!shouldRemove) {
    bondPosition.user = bondPositionManager.ownerOf(tokenId).toHexString()
    bondPosition.principal = bondPosition.principal
      .plus(amountDelta)
      .plus(boughtAmount)
      .minus(soldAmount)
    bondPosition.amount = event.params.amount
    bondPosition.toEpoch = createEpoch(BigInt.fromI32(position.expiredWith)).id
    bondPosition.substitute = position.asset.toHexString()
    bondPosition.underlying = AssetContract.bind(position.asset)
      .underlyingToken()
      .toHexString()
    bondPosition.updatedAt = event.block.timestamp
    bondPosition.save()
  }

  for (
    let epochIndex = BigInt.fromString(bondPosition.fromEpoch).toI32();
    epochIndex <= BigInt.fromString(bondPosition.toEpoch).toI32();
    epochIndex++
  ) {
    const assetStatusKey = bondPosition.underlying
      .concat('-')
      .concat(epochIndex.toString())
    const assetStatus = AssetStatus.load(assetStatusKey) as AssetStatus
    assetStatus.totalDeposited = assetStatus.totalDeposited.plus(amountDelta)
    assetStatus.save()
  }

  if (shouldRemove) {
    store.remove('BondPosition', tokenId.toString())

    positionStatus.totalBondPositionCount =
      positionStatus.totalBondPositionCount.minus(BigInt.fromI32(1))
    positionStatus.save()
  }
}

export function handleBondPositionTransfer(event: Transfer): void {
  const bondPosition = BondPosition.load(event.params.tokenId.toString())
  if (bondPosition === null) {
    return
  }
  if (event.params.to.toHexString() != ADDRESS_ZERO) {
    const bondPositionManager = BondPositionManagerContract.bind(event.address)
    bondPosition.user = bondPositionManager
      .ownerOf(event.params.tokenId)
      .toHexString()
    bondPosition.save()
  }
}
