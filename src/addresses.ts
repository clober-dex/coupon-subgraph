import { Address, BigInt } from '@graphprotocol/graph-ts'

import { Multicall3 } from '../generated/BondPositionManager/Multicall3'

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
    // TODO: Update this address
    return '0x0000000000000000000000000000000000000000'
  }
}

export function getBondPositionManagerAddress(): string {
  const multiCall = Multicall3.bind(Address.fromString(MULTICALL3_ADDRESS))
  const chainId = multiCall.getChainId()
  if (chainId == DEV_CHAIN_ID) {
    return '0x00644a534bDea310ee2FCCF1c2821Df769A0b12F'
  } else if (chainId == TEST_CHAIN_ID) {
    return '0x06ad1569cc3f430D16f906D21Cd2D1DA6eCA8e48'
  } else {
    // TODO: Update this address
    return '0x0000000000000000000000000000000000000000'
  }
}

export function getDepositControllerAddress(): string {
  const multiCall = Multicall3.bind(Address.fromString(MULTICALL3_ADDRESS))
  const chainId = multiCall.getChainId()
  if (chainId == DEV_CHAIN_ID) {
    return '0xDbAb42F029333BF720814732Bb3e3D74c074B558'
  } else if (chainId == TEST_CHAIN_ID) {
    return '0x724D0757261c4d0461A0fd71929e080447162148'
  } else {
    // TODO: Update this address
    return '0x0000000000000000000000000000000000000000'
  }
}
