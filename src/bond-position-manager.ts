import { RegisterAsset } from '../generated/BondPositionManager/BondPositionManager'
import { Substitute as AssetContract } from '../generated/BondPositionManager/Substitute'
import { Asset, Token } from '../generated/schema'
import { SetLoanConfiguration } from '../generated/BondPositionManager/LoanPositionManager'

import { fetchTokenDecimals, fetchTokenName, fetchTokenSymbol } from './helpers'

export function handleRegisterAsset(event: RegisterAsset): void {
  const substituteAddress = event.params.asset
  const underlyingAddress =
    AssetContract.bind(substituteAddress).underlyingToken()

  let underlying = Token.load(underlyingAddress.toHexString())
  if (underlying === null) {
    underlying = new Token(underlyingAddress.toHexString())
    underlying.symbol = fetchTokenSymbol(underlyingAddress)
    underlying.name = fetchTokenName(underlyingAddress)
    underlying.decimals = fetchTokenDecimals(underlyingAddress)
    underlying.save()
  }

  let substitute = Token.load(substituteAddress.toHexString())
  if (substitute === null) {
    substitute = new Token(substituteAddress.toHexString())
    substitute.symbol = fetchTokenSymbol(substituteAddress)
    substitute.name = fetchTokenName(substituteAddress)
    substitute.decimals = fetchTokenDecimals(substituteAddress)
    substitute.save()
  }

  let asset = Asset.load(underlyingAddress.toHexString())
  if (asset === null) {
    asset = new Asset(underlyingAddress.toHexString())
    asset.underlying = underlyingAddress.toHexString()
    asset.substitutes = []
    asset.collaterals = []
  }
  asset.substitutes = asset.substitutes.concat([substitute.id])
  asset.save()
}

export function handleSetLoanConfiguration(event: SetLoanConfiguration): void {
  const collateralAddress = event.params.collateral
  const collateralUnderlyingAddress =
    AssetContract.bind(collateralAddress).underlyingToken()
  let collateral = Token.load(collateralUnderlyingAddress.toHexString())
  if (collateral === null) {
    collateral = new Token(collateralUnderlyingAddress.toHexString())
    collateral.symbol = fetchTokenSymbol(collateralUnderlyingAddress)
    collateral.name = fetchTokenName(collateralUnderlyingAddress)
    collateral.decimals = fetchTokenDecimals(collateralUnderlyingAddress)
    collateral.save()
  }

  const substituteAddress = event.params.debt
  const underlyingAddress =
    AssetContract.bind(substituteAddress).underlyingToken()

  let asset = Asset.load(underlyingAddress.toHexString())
  if (asset === null) {
    asset = new Asset(underlyingAddress.toHexString())
    asset.underlying = underlyingAddress.toHexString()
    asset.substitutes = []
    asset.collaterals = []
  }
  asset.collaterals = asset.collaterals.concat([collateral.id])
  asset.save()
}
