import { AssetRegistered } from '../generated/BondPositionManager/BondPositionManager'
import { Substitute as AssetContract } from '../generated/BondPositionManager/Substitute'
import { Asset, Token } from '../generated/schema'

import { fetchTokenDecimals, fetchTokenName, fetchTokenSymbol } from './helpers'

export function handleAssetRegistered(event: AssetRegistered): void {
  const assetAddress = event.params.asset
  const assetContract = AssetContract.bind(assetAddress)
  const underlyingToken = assetContract.underlyingToken()

  let token = Token.load(underlyingToken.toHexString())
  if (token === null) {
    token = new Token(underlyingToken.toHexString())
    token.symbol = fetchTokenSymbol(underlyingToken)
    token.name = fetchTokenName(underlyingToken)
    token.decimals = fetchTokenDecimals(underlyingToken)
    token.asset = assetAddress.toHexString()
    token.save()
  }

  let asset = Asset.load(assetAddress.toHexString())
  if (asset === null) {
    asset = new Asset(assetAddress.toHexString())
    asset.symbol = fetchTokenSymbol(assetAddress)
    asset.name = fetchTokenName(assetAddress)
    asset.decimals = fetchTokenDecimals(assetAddress)
    asset.save()
  }
}
