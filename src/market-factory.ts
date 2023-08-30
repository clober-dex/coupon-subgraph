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

import { createEpoch, createToken, getEpochIndex } from './helpers'
import { COUPON_MARKET_DEPLOYER_ADDRESS } from './addresses'

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
  market.epoch = createEpoch(epochIndex).id

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
  market.epoch = createEpoch(epochIndex).id

  // create the tracked contract based on the template
  OrderNFTTemplate.create(event.params.orderToken)
  OrderBookTemplate.create(event.params.market)

  market.save()
}
