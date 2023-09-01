import { Address, BigInt, store, ethereum } from '@graphprotocol/graph-ts'

import {
  BondPositionManager as BondPositionManagerContract,
  RegisterAsset,
  Transfer,
  UpdatePosition,
} from '../generated/BondPositionManager/BondPositionManager'
import { OrderBook as OrderBookContract } from '../generated/templates/OrderNFT/OrderBook'
import { Substitute as AssetContract } from '../generated/BondPositionManager/Substitute'
import { AssetStatus, BondPosition } from '../generated/schema'

import {
  ADDRESS_ZERO,
  createAsset,
  createEpoch,
  createToken,
  getEpochIndexByTimestamp,
} from './helpers'
import { getBondPositionManagerAddress } from './addresses'

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
      // bid
      boughtAmount = boughtAmount.plus(orderBookContract.rawToQuote(rawAmount))
    } else {
      // ask
      soldAmount = soldAmount.plus(orderBookContract.rawToQuote(rawAmount))
    }
  }

  const tokenId = event.params.tokenId
  const bondPositionManager = BondPositionManagerContract.bind(
    Address.fromString(getBondPositionManagerAddress()),
  )
  const position = bondPositionManager.getPosition(tokenId)

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
  bondPosition.fromEpoch = createEpoch(
    getEpochIndexByTimestamp(event.block.timestamp),
  ).id
  bondPosition.toEpoch = createEpoch(BigInt.fromI32(position.expiredWith)).id
  bondPosition.substitute = position.asset.toHexString()
  bondPosition.underlying = AssetContract.bind(position.asset)
    .underlyingToken()
    .toHexString()
  bondPosition.save()

  for (
    let epochIndex = BigInt.fromString(bondPosition.fromEpoch).toI32();
    epochIndex <= BigInt.fromString(bondPosition.toEpoch).toI32();
    epochIndex++
  ) {
    const assetStatusKey = bondPosition.underlying
      .concat('-')
      .concat(epochIndex.toString())
    const assetStatus = AssetStatus.load(assetStatusKey) as AssetStatus
    assetStatus.totalDeposited = assetStatus.totalDeposited
      .plus(bondPosition.principal)
      .minus(previousPrincipal)
    assetStatus.save()
  }
}

export function handleBondPositionTransfer(event: Transfer): void {
  const bondPosition = BondPosition.load(event.params.tokenId.toString())
  if (bondPosition === null) {
    return
  }
  const bondPositionManager = BondPositionManagerContract.bind(
    Address.fromString(getBondPositionManagerAddress()),
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
