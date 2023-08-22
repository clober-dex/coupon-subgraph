import { RegisterAsset } from '../generated/BondPositionManager/BondPositionManager'
import { Substitute as AssetContract } from '../generated/BondPositionManager/Substitute'
import { Substitute, Token } from '../generated/schema'

import { fetchTokenDecimals, fetchTokenName, fetchTokenSymbol } from './helpers'

export function handleRegisterAsset(event: RegisterAsset): void {
  const substituteAddress = event.params.asset
  const substituteContract = AssetContract.bind(substituteAddress)
  const underlyingToken = substituteContract.underlyingToken()

  let token = Token.load(underlyingToken.toHexString())
  if (token === null) {
    token = new Token(underlyingToken.toHexString())
    token.symbol = fetchTokenSymbol(underlyingToken)
    token.name = fetchTokenName(underlyingToken)
    token.decimals = fetchTokenDecimals(underlyingToken)
    token.save()
  }

  let substitute = Substitute.load(substituteAddress.toHexString())
  if (substitute === null) {
    substitute = new Substitute(substituteAddress.toHexString())
    substitute.symbol = fetchTokenSymbol(substituteAddress)
    substitute.name = fetchTokenName(substituteAddress)
    substitute.decimals = fetchTokenDecimals(substituteAddress)
    substitute.underlying = underlyingToken.toHexString()
    substitute.save()
  }
}
