import { Address, BigInt, store } from '@graphprotocol/graph-ts'

import {
  BondPositionManager as BondPositionManagerContract,
  RegisterAsset,
  Transfer,
  UpdatePosition,
} from '../generated/BondPositionManager/BondPositionManager'
import { Substitute as AssetContract } from '../generated/BondPositionManager/Substitute'
import { BondPosition } from '../generated/schema'

import {
  ADDRESS_ZERO,
  createAsset,
  createToken,
  getEndTimestamp,
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

function updateBondPosition(tokenId: BigInt): BondPosition {
  const bondPositionManager = BondPositionManagerContract.bind(
    Address.fromString(BOND_POSITION_MANAGER_ADDRESS),
  )
  let bondPosition = BondPosition.load(tokenId.toString())
  if (bondPosition === null) {
    bondPosition = new BondPosition(tokenId.toString())
  }
  const position = bondPositionManager.getPosition(tokenId)
  bondPosition.user = bondPositionManager.ownerOf(tokenId).toHexString()
  bondPosition.amount = position.amount
  bondPosition.expiryEpoch = BigInt.fromI32(position.expiredWith)
  bondPosition.expiryTimestamp = getEndTimestamp(
    BigInt.fromI32(position.expiredWith),
  )
  bondPosition.substitute = position.asset.toHexString()
  bondPosition.underlying = AssetContract.bind(position.asset)
    .underlyingToken()
    .toHexString()
  bondPosition.save()
  return bondPosition as BondPosition
}

export function handleUpdateBondPosition(event: UpdatePosition): void {
  updateBondPosition(event.params.tokenId)
}

export function handleBondPositionTransfer(event: Transfer): void {
  const bondPosition = updateBondPosition(event.params.tokenId)
  if (event.params.to.toHexString() == ADDRESS_ZERO) {
    store.remove('BondPosition', bondPosition.id)
  }
}
