import { BigInt, store } from '@graphprotocol/graph-ts'

import {
  Transfer,
  OrderNFT as OrderNFTContract,
} from '../generated/templates/OrderNFT/OrderNFT'
import { OrderBook as OrderBookContract } from '../generated/templates/OrderNFT/OrderBook'
import { Depth } from '../generated/schema'

import { ADDRESS_ZERO } from './helpers'

export function handleNFTTransfer(event: Transfer): void {
  if (
    event.params.from.toHexString() != ADDRESS_ZERO &&
    event.params.to.toHexString() != ADDRESS_ZERO
  ) {
    return
  }

  const orderNFTContract = OrderNFTContract.bind(event.address)
  const marketAddress = orderNFTContract.market()

  const orderBookContract = OrderBookContract.bind(marketAddress)
  const tokenId = event.params.tokenId
  const isBid = tokenId.rightShift(248).toU64()
  const bidSide = isBid === 1
  const priceIndex = tokenId
    .rightShift(232)
    .bitAnd(BigInt.fromI32(2).pow(16).minus(BigInt.fromI32(1)))
    .toI32()

  const depthId = marketAddress
    .toHexString()
    .concat('-')
    .concat(priceIndex.toString())
    .concat('-')
    .concat(isBid.toString())
  let depth = Depth.load(depthId)
  let rawAmount = BigInt.zero()
  if (depth === null) {
    depth = new Depth(depthId)
    depth.market = marketAddress.toHexString()
    depth.priceIndex = BigInt.fromI32(priceIndex)
    depth.price = orderBookContract.indexToPrice(priceIndex)
    depth.isBid = bidSide

    rawAmount = orderBookContract.getDepth(bidSide, priceIndex)
    depth.rawAmount = rawAmount
  } else {
    rawAmount = orderBookContract.getDepth(bidSide, priceIndex)
    depth.rawAmount = rawAmount
  }

  if (rawAmount.equals(BigInt.zero())) {
    store.remove('Depth', depthId)
  } else {
    depth.save()
  }
}
