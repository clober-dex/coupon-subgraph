import { Address, BigInt, store, ethereum } from '@graphprotocol/graph-ts'

import {
  BondPositionManager as BondPositionManagerContract,
  RegisterAsset,
  Transfer,
  UpdatePosition,
} from '../generated/BondPositionManager/BondPositionManager'
import { OrderBook as OrderBookContract } from '../generated/templates/OrderNFT/OrderBook'
import { Substitute as AssetContract } from '../generated/BondPositionManager/Substitute'
import { BondPosition } from '../generated/schema'

import {
  ADDRESS_ZERO,
  createAsset,
  createToken,
  getEndTimestamp,
  getEpochIndexByTimestamp,
  getStartTimestamp,
} from './helpers'
import { BOND_POSITION_MANAGER_ADDRESS } from './addresses'

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
  }
  bondPosition.user = bondPositionManager.ownerOf(tokenId).toHexString()
  const position = bondPositionManager.getPosition(tokenId)
  const currentEpochIndex = getEpochIndexByTimestamp(event.block.timestamp)

  bondPosition.amount = event.params.amount
  bondPosition.principal = event.params.amount
    .minus(soldAmount)
    .plus(boughtAmount)
  bondPosition.startEpoch = currentEpochIndex
  bondPosition.startTimestamp = getStartTimestamp(currentEpochIndex)
  bondPosition.expiryEpoch = BigInt.fromI32(position.expiredWith)
  bondPosition.expiryTimestamp = getEndTimestamp(
    BigInt.fromI32(position.expiredWith),
  )
  bondPosition.substitute = position.asset.toHexString()
  bondPosition.underlying = AssetContract.bind(position.asset)
    .underlyingToken()
    .toHexString()
  bondPosition.save()
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
