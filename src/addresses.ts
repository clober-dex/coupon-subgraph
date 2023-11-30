import { Address, BigInt } from '@graphprotocol/graph-ts'

import { Multicall3 } from '../generated/MarketFactory/Multicall3'

const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11'
const DEV_CHAIN_ID = BigInt.fromI32(7777)
const TEST_CHAIN_ID = BigInt.fromI32(421613)

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

export function getCouponOracleAddress(): string {
  const multiCall = Multicall3.bind(Address.fromString(MULTICALL3_ADDRESS))
  const chainId = multiCall.getChainId()
  if (chainId == DEV_CHAIN_ID) {
    return '0x8831c769874fF23ED5DF0daacfD84Cc147335506'
  } else if (chainId == TEST_CHAIN_ID) {
    return '0xE0dBCB42CCAc63C949cE3EF879A647DDb662916d'
  } else {
    return '0xF8e9ab02b057978c29Ca57c7E086D46983764A13'
  }
}
