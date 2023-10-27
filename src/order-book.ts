import { BigInt, store } from '@graphprotocol/graph-ts'

import {
  OrderBook as OrderBookContract,
  TakeOrder,
} from '../generated/templates/OrderNFT/OrderBook'
import { Depth } from '../generated/schema'

export function handleTakeOrder(event: TakeOrder): void {
  const marketAddress = event.address
  const priceIndex = event.params.priceIndex
  const isTakingBidSide = event.params.options & 1 ? 0 : 1
  const depthId = marketAddress
    .toHexString()
    .concat('-')
    .concat(priceIndex.toString())
    .concat('-')
    .concat(isTakingBidSide.toString())
  const depth = Depth.load(depthId)
  if (depth === null) {
    return
  }
  const orderBookContract = OrderBookContract.bind(marketAddress)
  const rawAmount = orderBookContract.getDepth(
    isTakingBidSide === 1,
    priceIndex,
  )
  depth.rawAmount = rawAmount
  depth.baseAmount =
    isTakingBidSide === 1
      ? orderBookContract.rawToQuote(rawAmount)
      : orderBookContract.rawToBase(rawAmount, priceIndex, false)

  if (rawAmount.equals(BigInt.zero())) {
    store.remove('Depth', depthId)
  } else {
    depth.save()
  }
}
