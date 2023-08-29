import { Address } from '@graphprotocol/graph-ts'

import { RegisterAsset } from '../generated/BondPositionManager/BondPositionManager'
import { Substitute as AssetContract } from '../generated/BondPositionManager/Substitute'

import { createAsset, createToken } from './helpers'

export function handleRegisterAsset(event: RegisterAsset): void {
  const substitute = createToken(event.params.asset)

  const substituteUnderlying = createToken(
    AssetContract.bind(event.params.asset).underlyingToken(),
  )

  const asset = createAsset(Address.fromString(substituteUnderlying.id))
  asset.substitutes = asset.substitutes.concat([substitute.id])
  asset.save()
}
