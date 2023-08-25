import { BigInt } from '@graphprotocol/graph-ts'

import {
  CreateStableMarket,
  CreateVolatileMarket,
} from '../generated/MarketFactory/MarketFactory'
import { Market } from '../generated/schema'
import {
  OrderNFT as OrderNFTTemplate,
  OrderBook as OrderBookTemplate,
} from '../generated/templates'

import {
  createToken,
  getEndTimestamp,
  getEpochIndex,
  getStartTimestamp,
} from './helpers'

const COUPON_MARKET_DEPLOYER_ADDRESS =
  '0xa0e3174f4d222c5cbf705a138c6a9369935eed81'

export function handleCreateStableMarket(event: CreateStableMarket): void {
  const epochIndex = getEpochIndex(event.params.baseToken)
  if (
    epochIndex === BigInt.fromI32(0) ||
    event.transaction.from.toHexString().toLowerCase() !==
      COUPON_MARKET_DEPLOYER_ADDRESS.toLowerCase()
  ) {
    return
  }

  const quoteToken = createToken(event.params.quoteToken)
  const baseToken = createToken(event.params.baseToken)
  const market = new Market(event.params.market.toHexString()) as Market
  market.orderToken = event.params.orderToken
  market.baseToken = baseToken.id
  market.quoteToken = quoteToken.id
  market.quoteUnit = event.params.quoteUnit
  market.makerFee = BigInt.fromI32(event.params.makerFee)
  market.takerFee = BigInt.fromI32(event.params.takerFee)
  market.a = event.params.a
  market.d = event.params.d
  market.r = BigInt.fromI32(0)

  market.epoch = epochIndex
  market.startTimestamp = getStartTimestamp(epochIndex)
  market.endTimestamp = getEndTimestamp(epochIndex)

  // create the tracked contract based on the template
  OrderNFTTemplate.create(event.params.orderToken)
  OrderBookTemplate.create(event.params.market)

  market.save()
}

export function handleCreateVolatileMarket(event: CreateVolatileMarket): void {
  const epochIndex = getEpochIndex(event.params.baseToken)
  if (
    epochIndex === BigInt.fromI32(0) ||
    event.transaction.from.toHexString().toLowerCase() !=
      COUPON_MARKET_DEPLOYER_ADDRESS.toLowerCase()
  ) {
    return
  }

  const quoteToken = createToken(event.params.quoteToken)
  const baseToken = createToken(event.params.baseToken)
  const market = new Market(event.params.market.toHexString()) as Market
  market.orderToken = event.params.orderToken
  market.baseToken = baseToken.id
  market.quoteToken = quoteToken.id
  market.quoteUnit = event.params.quoteUnit
  market.makerFee = BigInt.fromI32(event.params.makerFee)
  market.takerFee = BigInt.fromI32(event.params.takerFee)
  market.a = event.params.a
  market.d = BigInt.fromI32(0)
  market.r = event.params.r

  market.epoch = epochIndex
  market.startTimestamp = getStartTimestamp(epochIndex)
  market.endTimestamp = getEndTimestamp(epochIndex)

  // create the tracked contract based on the template
  OrderNFTTemplate.create(event.params.orderToken)
  OrderBookTemplate.create(event.params.market)

  market.save()
}
