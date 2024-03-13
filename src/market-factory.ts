import { Address, BigInt } from '@graphprotocol/graph-ts'

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
  createAssetStatus,
  createEpoch,
  createToken,
  getCouponId,
  getEpochIndex,
} from './helpers'
import { getCouponMarketDeployerAddress } from './addresses'

export function handleCreateStableMarket(event: CreateStableMarket): void {
  const epochIndex = getEpochIndex(event.params.baseToken)
  if (
    epochIndex.isZero() ||
    event.transaction.from.toHexString().toLowerCase() !=
      getCouponMarketDeployerAddress().toLowerCase()
  ) {
    return
  }
  const couponId = getCouponId(event.params.baseToken)
  const quoteToken = createToken(event.params.quoteToken)
  const baseToken = createToken(event.params.baseToken)
  const market = new Market(event.params.market.toHexString()) as Market
  market.couponId = couponId
  market.orderToken = event.params.orderToken
  market.baseToken = baseToken.id
  market.quoteToken = quoteToken.id
  market.quoteUnit = event.params.quoteUnit
  market.makerFee = BigInt.fromI32(event.params.makerFee)
  market.takerFee = BigInt.fromI32(event.params.takerFee)
  market.a = event.params.a
  market.d = event.params.d
  market.r = BigInt.zero()
  market.epoch = createEpoch(epochIndex).id

  // create the tracked contract based on the template
  OrderNFTTemplate.create(event.params.orderToken)
  OrderBookTemplate.create(event.params.market)

  market.save()

  createAssetStatus(
    event.params.quoteToken,
    epochIndex,
    Address.fromString(market.id),
  )
}

export function handleCreateVolatileMarket(event: CreateVolatileMarket): void {
  const epochIndex = getEpochIndex(event.params.baseToken)
  if (
    epochIndex.isZero() ||
    event.transaction.from.toHexString().toLowerCase() !=
      getCouponMarketDeployerAddress().toLowerCase()
  ) {
    return
  }
  const couponId = getCouponId(event.params.baseToken)
  const quoteToken = createToken(event.params.quoteToken)
  const baseToken = createToken(event.params.baseToken)
  const market = new Market(event.params.market.toHexString()) as Market
  market.couponId = couponId
  market.orderToken = event.params.orderToken
  market.baseToken = baseToken.id
  market.quoteToken = quoteToken.id
  market.quoteUnit = event.params.quoteUnit
  market.makerFee = BigInt.fromI32(event.params.makerFee)
  market.takerFee = BigInt.fromI32(event.params.takerFee)
  market.a = event.params.a
  market.d = BigInt.zero()
  market.r = event.params.r
  market.epoch = createEpoch(epochIndex).id

  // create the tracked contract based on the template
  OrderNFTTemplate.create(event.params.orderToken)
  OrderBookTemplate.create(event.params.market)

  market.save()

  createAssetStatus(
    event.params.quoteToken,
    epochIndex,
    Address.fromString(market.id),
  )
}
