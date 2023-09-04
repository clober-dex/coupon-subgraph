import { BigInt, Address, ethereum, BigDecimal } from '@graphprotocol/graph-ts'

import { Asset, AssetStatus, Epoch, Token } from '../generated/schema'
import { Wrapped1155Metadata } from '../generated/MarketFactory/Wrapped1155Metadata'
import { ERC20 } from '../generated/MarketFactory/ERC20'
import { ERC20SymbolBytes } from '../generated/MarketFactory/ERC20SymbolBytes'
import { ERC20NameBytes } from '../generated/MarketFactory/ERC20NameBytes'
import { Substitute as AssetContract } from '../generated/BondPositionManager/Substitute'
import { DepositController__getCouponMarketInputCouponKeyStruct } from '../generated/BondPositionManager/DepositController'

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'

export function isNullEthValue(value: string): boolean {
  return (
    value ==
    '0x0000000000000000000000000000000000000000000000000000000000000001'
  )
}

export const ZERO_BI = BigInt.fromI32(0)
export const ONE_BI = BigInt.fromI32(1)

export function exponentToBigDecimal(decimals: BigInt): BigDecimal {
  let bd = BigDecimal.fromString('1')
  for (let i = ZERO_BI; i.lt(decimals as BigInt); i = i.plus(ONE_BI)) {
    bd = bd.times(BigDecimal.fromString('10'))
  }
  return bd
}

export function fetchTokenSymbol(tokenAddress: Address): string {
  const contract = ERC20.bind(tokenAddress)
  const contractSymbolBytes = ERC20SymbolBytes.bind(tokenAddress)

  // try types string and bytes32 for symbol
  let symbolValue = 'unknown'
  const symbolResult = contract.try_symbol()
  if (symbolResult.reverted) {
    const symbolResultBytes = contractSymbolBytes.try_symbol()
    if (!symbolResultBytes.reverted) {
      // for broken pairs that have no symbol function exposed
      if (!isNullEthValue(symbolResultBytes.value.toHexString())) {
        symbolValue = symbolResultBytes.value.toString()
      }
    }
  } else {
    symbolValue = symbolResult.value
  }

  return symbolValue
}

export function fetchTokenName(tokenAddress: Address): string {
  const contract = ERC20.bind(tokenAddress)
  const contractNameBytes = ERC20NameBytes.bind(tokenAddress)

  // try types string and bytes32 for name
  let nameValue = 'unknown'
  const nameResult = contract.try_name()
  if (nameResult.reverted) {
    const nameResultBytes = contractNameBytes.try_name()
    if (!nameResultBytes.reverted) {
      // for broken exchanges that have no name function exposed
      if (!isNullEthValue(nameResultBytes.value.toHexString())) {
        nameValue = nameResultBytes.value.toString()
      }
    }
  } else {
    nameValue = nameResult.value
  }

  return nameValue
}

export function fetchTokenDecimals(tokenAddress: Address): BigInt {
  const contract = ERC20.bind(tokenAddress)
  // try types uint8 for decimals
  let decimalValue = 18
  const decimalResult = contract.try_decimals()
  if (!decimalResult.reverted) {
    decimalValue = decimalResult.value
  }
  return BigInt.fromI32(decimalValue as i32)
}

export function createToken(tokenAddress: Address): Token {
  let token = Token.load(tokenAddress.toHexString())
  if (token === null) {
    token = new Token(tokenAddress.toHexString())
    token.symbol = fetchTokenSymbol(tokenAddress)
    token.name = fetchTokenName(tokenAddress)
    token.decimals = fetchTokenDecimals(tokenAddress)
    token.save()
  }
  return token
}

export function createAsset(assetAddress: Address): Asset {
  let asset = Asset.load(assetAddress.toHexString())
  if (asset === null) {
    asset = new Asset(assetAddress.toHexString())
    asset.underlying = assetAddress.toHexString()
    asset.substitutes = []
    asset.collaterals = []
  }
  return asset
}

export function buildCouponKey(
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

export function createAssetStatus(
  substituteAddress: Address,
  epoch: BigInt,
  marketAddress: Address,
): AssetStatus {
  const underlying = AssetContract.bind(substituteAddress)
    .underlyingToken()
    .toHexString()
  const assetStatusKey = underlying.concat('-').concat(epoch.toString())
  let assetStatus = AssetStatus.load(assetStatusKey)
  if (assetStatus === null) {
    assetStatus = new AssetStatus(assetStatusKey)
    assetStatus.asset = underlying
    assetStatus.epoch = epoch.toString()
    assetStatus.market = marketAddress.toHexString()
    assetStatus.totalDeposited = BigInt.fromI32(0)
    assetStatus.save()
  }
  return assetStatus
}

export function createEpoch(epochIndex: BigInt): Epoch {
  let epoch = Epoch.load(epochIndex.toString())
  if (epoch === null) {
    epoch = new Epoch(epochIndex.toString())
    epoch.startTimestamp = getStartTimestamp(epochIndex)
    epoch.endTimestamp = getEndTimestamp(epochIndex)
    epoch.save()
  }
  return epoch
}

export function getEpochIndex(couponAddress: Address): BigInt {
  const couponContract = Wrapped1155Metadata.bind(couponAddress)
  const couponId = couponContract.try_tokenId()
  if (couponId.reverted) {
    return BigInt.fromI64(0)
  }
  return couponId.value.rightShift(160)
}

export function getStartTimestamp(epochIndex: BigInt): BigInt {
  const _epochIndex = epochIndex.toU64()
  const startYear = (1970 + _epochIndex / 2).toString()
  const startQuarter = _epochIndex % 2 ? '07-01' : '01-01'
  const startDate = Date.fromString(startYear.concat('-').concat(startQuarter))

  return BigInt.fromI64(startDate.getTime() / 1000)
}

export function getEndTimestamp(epochIndex: BigInt): BigInt {
  return getStartTimestamp(epochIndex.plus(BigInt.fromI32(1))).minus(
    BigInt.fromI32(1),
  )
}

export function getEpochIndexByTimestamp(timestamp: BigInt): BigInt {
  const date = new Date(timestamp.toI64() * 1000)
  const year = date.getUTCFullYear()
  const half = Date.fromString(year.toString().concat('-07-01')).getTime()
  return BigInt.fromI32((year - 1970) * 2 + (date.getTime() < half ? 0 : 1))
}
