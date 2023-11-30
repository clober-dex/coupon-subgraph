import { Address, BigInt } from '@graphprotocol/graph-ts'

import { Multicall3 } from '../generated/MarketFactory/Multicall3'

const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11'
const DEV_CHAIN_ID = BigInt.fromI32(7777)
const TEST_CHAIN_ID = BigInt.fromI32(421613)

export const ETH_UNDERLYING_ADDRESS =
  '0x82af49447d8a07e3bd95bd0d56f35241523fbab1'

export function getCouponMarketDeployerAddress(): string {
  const multiCall = Multicall3.bind(Address.fromString(MULTICALL3_ADDRESS))
  const chainId = multiCall.getChainId()
  if (chainId == DEV_CHAIN_ID) {
    return '0xa0e3174f4d222c5cbf705a138c6a9369935eed81'
  } else if (chainId == TEST_CHAIN_ID) {
    return '0xa0e3174f4d222c5cbf705a138c6a9369935eed81'
  } else {
    return '0x1f88547fc4e1dc1a924aeaade65108eeb9ddeed4'
  }
}
