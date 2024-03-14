import {
  Address,
  BigDecimal,
  BigInt,
  ethereum,
  store,
} from '@graphprotocol/graph-ts'

import {
  LiquidatePosition,
  LoanPositionManager as LoanPositionManagerContract,
  SetLoanConfiguration,
  Transfer,
  UpdatePosition,
} from '../generated/LoanPositionManager/LoanPositionManager'
import { OrderBook as OrderBookContract } from '../generated/templates/OrderNFT/OrderBook'
import { Substitute as AssetContract } from '../generated/LoanPositionManager/Substitute'
import {
  AssetStatus,
  Collateral,
  LeverageHistory,
  LiquidationHistory,
  LoanPosition,
  Market,
  Token,
} from '../generated/schema'
import { CouponOracle as CouponOracleContract } from '../generated/LoanPositionManager/CouponOracle'

import {
  ADDRESS_ZERO,
  calculatePnl,
  calculateProfit,
  createAsset,
  createEpoch,
  createPositionStatus,
  createToken,
  exponentToBigDecimal,
  getEpochIndexByTimestamp,
} from './helpers'
import { getCouponOracleAddress } from './addresses'

export function handleSetLoanConfiguration(event: SetLoanConfiguration): void {
  createToken(event.params.collateral)

  const collateralUnderlying = createToken(
    AssetContract.bind(event.params.collateral).underlyingToken(),
  )

  const key = event.params.collateral
    .toHexString()
    .concat('-')
    .concat(event.params.debt.toHexString())
  let collateral = Collateral.load(key)
  if (collateral === null) {
    collateral = new Collateral(key)
    collateral.underlying = collateralUnderlying.id
    collateral.substitute = event.params.collateral.toHexString()
    const loanConfiguration = LoanPositionManagerContract.bind(
      event.address,
    ).getLoanConfiguration(event.params.collateral, event.params.debt)
    collateral.liquidationTargetLtv = loanConfiguration.liquidationTargetLtv
    collateral.liquidationThreshold = loanConfiguration.liquidationThreshold
    collateral.totalCollateralized = BigInt.zero()
    collateral.totalBorrowed = BigInt.zero()
    collateral.save()
  }

  const substituteUnderlying = createToken(
    AssetContract.bind(event.params.debt).underlyingToken(),
  )

  const asset = createAsset(Address.fromString(substituteUnderlying.id))
  asset.collaterals = asset.collaterals.concat([key])
  asset.save()
}

export function handleUpdateLoanPosition(event: UpdatePosition): void {
  const positionId = event.params.positionId
  const loanPositionManager = LoanPositionManagerContract.bind(event.address)
  const position = loanPositionManager.getPosition(positionId)

  const takeEvents = (event.receipt as ethereum.TransactionReceipt).logs.filter(
    (log) =>
      log.topics[0].toHexString() ==
      '0x9754cddf091a07317cd2bfc6ead4610d1a7401cf0ea4176a44ab9366d4042d7d',
  )
  let boughtAmount = BigInt.zero()
  let soldAmount = BigInt.zero()
  for (let i = 0; i < takeEvents.length; i++) {
    const orderBookContract = OrderBookContract.bind(takeEvents[i].address)
    const decoded = ethereum.decode(
      '(uint16,uint64,uint8)',
      takeEvents[i].data,
    ) as ethereum.Value
    const data = decoded.toTuple()
    const rawAmount = data[1].toBigInt()
    const options = data[2].toI32()
    const takeEventMarket = Market.load(takeEvents[i].address.toHexString())
    if (
      takeEventMarket === null ||
      takeEventMarket.couponId.isZero() ||
      takeEventMarket.quoteToken != position.debtToken.toHexString()
    ) {
      continue
    }
    if (options & 0x1) {
      // bid (withdraw)
      boughtAmount = boughtAmount.plus(orderBookContract.rawToQuote(rawAmount))
    } else {
      // ask (deposit)
      soldAmount = soldAmount.plus(orderBookContract.rawToQuote(rawAmount))
    }
  }

  const odosSwapEvents = (
    event.receipt as ethereum.TransactionReceipt
  ).logs.filter(
    (log) =>
      log.topics[0].toHexString() ==
      '0x823eaf01002d7353fbcadb2ea3305cc46fa35d799cb0914846d185ac06f8ad05',
  )
  const decodedOdosSwapEvent =
    odosSwapEvents.length > 0
      ? ethereum.decode(
          '(address,uint256,address,uint256,address,int256,uint32)',
          odosSwapEvents[0].data,
        )
      : null

  const positionStatus = createPositionStatus()
  let loanPosition = LoanPosition.load(positionId.toString())
  const couponOracle = CouponOracleContract.bind(
    Address.fromString(getCouponOracleAddress()),
  )
  const priceDecimals = couponOracle.decimals()
  const collateralCurrencyPrice = BigDecimal.fromString(
    couponOracle.getAssetPrice(position.collateralToken).toString(),
  ).div(exponentToBigDecimal(BigInt.fromI32(priceDecimals)))
  const debtCurrencyPrice = BigDecimal.fromString(
    couponOracle.getAssetPrice(position.debtToken).toString(),
  ).div(exponentToBigDecimal(BigInt.fromI32(priceDecimals)))
  if (loanPosition === null) {
    loanPosition = new LoanPosition(positionId.toString())
    loanPosition.amount = BigInt.zero()
    loanPosition.principal = BigInt.zero()
    loanPosition.collateralAmount = BigInt.zero()
    loanPosition.createdAt = event.block.timestamp
    loanPosition.fromEpoch = createEpoch(
      getEpochIndexByTimestamp(event.block.timestamp),
    ).id
    loanPosition.toEpoch = createEpoch(BigInt.fromI32(position.expiredWith)).id
    loanPosition.isLeveraged = false
    loanPosition.borrowedCollateralAmount = BigInt.zero()
    loanPosition.entryCollateralCurrencyPrice = collateralCurrencyPrice
    loanPosition.averageCollateralCurrencyPrice = collateralCurrencyPrice
    loanPosition.averageCollateralWithoutBorrowedCurrencyPrice =
      collateralCurrencyPrice
    loanPosition.entryDebtCurrencyPrice = debtCurrencyPrice
    loanPosition.averageDebtCurrencyPrice = debtCurrencyPrice
    if (decodedOdosSwapEvent) {
      loanPosition.isLeveraged = true
    }

    positionStatus.totalLoanPositionCount =
      positionStatus.totalLoanPositionCount.plus(BigInt.fromI32(1))
    positionStatus.save()
  }
  const prevDebtAmount = loanPosition.amount
  const debtAmountDelta = event.params.debtAmount.minus(loanPosition.amount)
  const collateralAmountDelta = event.params.collateralAmount.minus(
    loanPosition.collateralAmount,
  )
  const prevToEpoch = BigInt.fromString(loanPosition.toEpoch).toI32()

  const shouldRemove =
    event.params.collateralAmount.equals(BigInt.zero()) &&
    event.params.debtAmount.equals(BigInt.zero())
  if (!shouldRemove) {
    let borrowedCollateralAmountDelta = BigInt.zero()
    if (
      loanPosition.isLeveraged &&
      decodedOdosSwapEvent &&
      collateralAmountDelta.notEqual(BigInt.zero())
    ) {
      const data = decodedOdosSwapEvent.toTuple()
      const inputAmount = data[1].toBigInt()
      const amountOut = data[3].toBigInt()
      if (collateralAmountDelta.gt(BigInt.zero())) {
        borrowedCollateralAmountDelta = amountOut
      } else {
        borrowedCollateralAmountDelta = inputAmount.neg()
      }
    }

    if (collateralAmountDelta.gt(BigInt.zero())) {
      // adjust average collateral currency price
      loanPosition.averageCollateralCurrencyPrice =
        loanPosition.averageCollateralCurrencyPrice
          .times(
            BigDecimal.fromString(loanPosition.collateralAmount.toString()),
          )
          .plus(
            collateralCurrencyPrice.times(
              BigDecimal.fromString(collateralAmountDelta.toString()),
            ),
          )
          .div(
            BigDecimal.fromString(
              loanPosition.collateralAmount
                .plus(collateralAmountDelta)
                .toString(),
            ),
          )
    }

    const collateralAmountDeltaWithoutBorrowed = collateralAmountDelta.minus(
      borrowedCollateralAmountDelta,
    )

    if (collateralAmountDeltaWithoutBorrowed.gt(BigInt.zero())) {
      const collateralAmountWithoutBorrowed =
        loanPosition.collateralAmount.minus(
          loanPosition.borrowedCollateralAmount,
        )
      loanPosition.averageCollateralWithoutBorrowedCurrencyPrice =
        loanPosition.averageCollateralWithoutBorrowedCurrencyPrice
          .times(
            BigDecimal.fromString(collateralAmountWithoutBorrowed.toString()),
          )
          .plus(
            collateralCurrencyPrice.times(
              BigDecimal.fromString(
                collateralAmountDeltaWithoutBorrowed.toString(),
              ),
            ),
          )
          .div(
            BigDecimal.fromString(
              collateralAmountWithoutBorrowed
                .plus(collateralAmountDeltaWithoutBorrowed)
                .toString(),
            ),
          )
    }

    if (debtAmountDelta.gt(BigInt.zero())) {
      // adjust average debt currency price
      loanPosition.averageDebtCurrencyPrice =
        loanPosition.averageDebtCurrencyPrice
          .times(BigDecimal.fromString(loanPosition.amount.toString()))
          .plus(
            debtCurrencyPrice.times(
              BigDecimal.fromString(debtAmountDelta.toString()),
            ),
          )
          .div(
            BigDecimal.fromString(
              loanPosition.amount.plus(debtAmountDelta).toString(),
            ),
          )
    }

    loanPosition.user = loanPositionManager.ownerOf(positionId).toHexString()
    loanPosition.collateral = position.collateralToken
      .toHexString()
      .concat('-')
      .concat(position.debtToken.toHexString())
    loanPosition.collateralAmount = position.collateralAmount
    loanPosition.borrowedCollateralAmount =
      loanPosition.borrowedCollateralAmount.plus(borrowedCollateralAmountDelta)
    loanPosition.principal = loanPosition.principal
      .plus(debtAmountDelta)
      .plus(soldAmount)
      .minus(boughtAmount)
    loanPosition.amount = event.params.debtAmount
    loanPosition.toEpoch = createEpoch(BigInt.fromI32(position.expiredWith)).id
    loanPosition.substitute = position.debtToken.toHexString()
    loanPosition.underlying = AssetContract.bind(position.debtToken)
      .underlyingToken()
      .toHexString()
    loanPosition.updatedAt = event.block.timestamp

    loanPosition.save()
  }

  const collateral = Collateral.load(loanPosition.collateral)
  if (collateral) {
    collateral.totalCollateralized = collateral.totalCollateralized.plus(
      collateralAmountDelta,
    )
    collateral.totalBorrowed = collateral.totalBorrowed.plus(debtAmountDelta)
    collateral.save()
  }

  const toEpoch = BigInt.fromString(loanPosition.toEpoch).toI32()
  for (
    let epochIndex = BigInt.fromString(loanPosition.fromEpoch).toI32();
    epochIndex <= max(toEpoch, prevToEpoch);
    epochIndex++
  ) {
    const assetStatusKey = loanPosition.underlying
      .concat('-')
      .concat(epochIndex.toString())
    const assetStatus = AssetStatus.load(assetStatusKey) as AssetStatus

    const epochDelta = toEpoch - prevToEpoch
    if (epochDelta < 0) {
      // epoch decreased
      if (epochIndex > toEpoch) {
        assetStatus.totalBorrowed =
          assetStatus.totalBorrowed.minus(prevDebtAmount)
      } else {
        assetStatus.totalBorrowed =
          assetStatus.totalBorrowed.plus(debtAmountDelta)
      }
    } else if (epochDelta > 0) {
      // epoch increased
      if (epochIndex > prevToEpoch) {
        assetStatus.totalBorrowed = assetStatus.totalBorrowed.plus(
          loanPosition.amount,
        )
      } else {
        assetStatus.totalBorrowed =
          assetStatus.totalBorrowed.plus(debtAmountDelta)
      }
    } else {
      // epoch unchanged
      assetStatus.totalBorrowed =
        assetStatus.totalBorrowed.plus(debtAmountDelta)
    }
    assetStatus.save()
  }

  if (shouldRemove) {
    if (loanPosition.isLeveraged) {
      const leverageHistory = new LeverageHistory(loanPosition.id)
      leverageHistory.user = loanPosition.user
      leverageHistory.collateral = loanPosition.collateral
      leverageHistory.collateralAmount = loanPosition.collateralAmount
      leverageHistory.amount = loanPosition.amount
      leverageHistory.principal = loanPosition.principal
      leverageHistory.substitute = loanPosition.substitute
      leverageHistory.underlying = loanPosition.underlying
      leverageHistory.fromEpoch = loanPosition.fromEpoch
      leverageHistory.toEpoch = loanPosition.toEpoch
      leverageHistory.createdAt = loanPosition.createdAt
      leverageHistory.closedAt = event.block.timestamp
      leverageHistory.entryCollateralCurrencyPrice =
        loanPosition.entryCollateralCurrencyPrice
      leverageHistory.averageCollateralCurrencyPrice =
        loanPosition.averageCollateralCurrencyPrice
      leverageHistory.averageCollateralWithoutBorrowedCurrencyPrice =
        loanPosition.averageCollateralWithoutBorrowedCurrencyPrice
      leverageHistory.closedCollateralCurrencyPrice = collateralCurrencyPrice
      leverageHistory.entryDebtCurrencyPrice =
        loanPosition.entryDebtCurrencyPrice
      leverageHistory.averageDebtCurrencyPrice =
        loanPosition.averageDebtCurrencyPrice
      leverageHistory.closedDebtCurrencyPrice = debtCurrencyPrice
      leverageHistory.borrowedCollateralAmount =
        loanPosition.borrowedCollateralAmount

      const collateral = Collateral.load(
        leverageHistory.collateral,
      ) as Collateral
      const collateralUnderlying = Token.load(collateral.underlying) as Token
      const debtUnderlying = Token.load(leverageHistory.underlying) as Token
      const collateralDecimals = collateralUnderlying.decimals.toI32()
      const debtDecimals = debtUnderlying.decimals.toI32()

      leverageHistory.pnl = calculatePnl(
        BigDecimal.fromString(leverageHistory.collateralAmount.toString()).div(
          exponentToBigDecimal(BigInt.fromI32(collateralDecimals)),
        ),
        BigDecimal.fromString(
          leverageHistory.borrowedCollateralAmount.toString(),
        ).div(exponentToBigDecimal(BigInt.fromI32(collateralDecimals))),
        BigDecimal.fromString(leverageHistory.amount.toString()).div(
          exponentToBigDecimal(BigInt.fromI32(debtDecimals)),
        ),
        leverageHistory.closedCollateralCurrencyPrice,
        leverageHistory.averageCollateralWithoutBorrowedCurrencyPrice,
        leverageHistory.closedDebtCurrencyPrice,
      )

      leverageHistory.profit = calculateProfit(
        BigDecimal.fromString(leverageHistory.collateralAmount.toString()).div(
          exponentToBigDecimal(BigInt.fromI32(collateralDecimals)),
        ),
        BigDecimal.fromString(
          leverageHistory.borrowedCollateralAmount.toString(),
        ).div(exponentToBigDecimal(BigInt.fromI32(collateralDecimals))),
        BigDecimal.fromString(leverageHistory.amount.toString()).div(
          exponentToBigDecimal(BigInt.fromI32(debtDecimals)),
        ),
        leverageHistory.closedCollateralCurrencyPrice,
        leverageHistory.averageCollateralWithoutBorrowedCurrencyPrice,
        leverageHistory.closedDebtCurrencyPrice,
      )

      leverageHistory.save()
    }
    store.remove('LoanPosition', positionId.toString())

    positionStatus.totalLoanPositionCount =
      positionStatus.totalLoanPositionCount.minus(BigInt.fromI32(1))
    positionStatus.save()
  }
}

export function handleLoanPositionTransfer(event: Transfer): void {
  const loanPosition = LoanPosition.load(event.params.tokenId.toString())
  if (loanPosition === null) {
    return
  }
  if (event.params.to.toHexString() != ADDRESS_ZERO) {
    const loanPositionManager = LoanPositionManagerContract.bind(event.address)
    loanPosition.user = loanPositionManager
      .ownerOf(event.params.tokenId)
      .toHexString()
    loanPosition.save()
  }
}

export function handleLiquidatePosition(event: LiquidatePosition): void {
  const loanPosition = LoanPosition.load(event.params.positionId.toString())
  if (loanPosition === null) {
    return
  }
  const collateral = Collateral.load(loanPosition.collateral)
  const underlying = createToken(Address.fromString(loanPosition.underlying))
  if (collateral === null) {
    return
  }

  const liquidationHistory = new LiquidationHistory(
    event.transaction.hash.toHexString(),
  )
  liquidationHistory.positionId = event.params.positionId
  liquidationHistory.underlying = underlying.id
  liquidationHistory.collateral = collateral.id
  liquidationHistory.borrower = loanPosition.user
  liquidationHistory.liquidator = event.params.liquidator.toHexString()
  liquidationHistory.liquidatedCollateralAmount = event.params.liquidationAmount
  liquidationHistory.repaidDebtAmount = event.params.repayAmount
  liquidationHistory.protocolFeeAmount = event.params.protocolFeeAmount

  const couponOracle = CouponOracleContract.bind(
    Address.fromString(getCouponOracleAddress()),
  )
  const priceDecimals = couponOracle.decimals()
  liquidationHistory.collateralCurrencyPrice = BigDecimal.fromString(
    couponOracle
      .getAssetPrice(Address.fromString(collateral.underlying))
      .toString(),
  ).div(exponentToBigDecimal(BigInt.fromI32(priceDecimals)))
  liquidationHistory.debtCurrencyPrice = BigDecimal.fromString(
    couponOracle
      .getAssetPrice(Address.fromString(loanPosition.underlying))
      .toString(),
  ).div(exponentToBigDecimal(BigInt.fromI32(priceDecimals)))
  liquidationHistory.timestamp = event.block.timestamp
  liquidationHistory.save()
}
