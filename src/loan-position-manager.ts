import { Address } from '@graphprotocol/graph-ts'

import {
  SetLoanConfiguration,
  LoanPositionManager as LoanPositionManagerContract,
} from '../generated/LoanPositionManager/LoanPositionManager'
import { Substitute as AssetContract } from '../generated/LoanPositionManager/Substitute'
import { Collateral } from '../generated/schema'

import { createAsset, createToken } from './helpers'

export function handleSetLoanConfiguration(event: SetLoanConfiguration): void {
  createToken(event.params.collateral)

  const collateralUnderlying = createToken(
    AssetContract.bind(event.params.collateral).underlyingToken(),
  )

  let collateral = Collateral.load(collateralUnderlying.id)
  if (collateral === null) {
    collateral = new Collateral(collateralUnderlying.id)
    collateral.underlying = collateralUnderlying.id
    const loanConfiguration = LoanPositionManagerContract.bind(
      event.address,
    ).getLoanConfiguration(event.params.collateral, event.params.debt)
    collateral.liquidationTargetLtv = loanConfiguration.liquidationTargetLtv
    collateral.liquidationThreshold = loanConfiguration.liquidationThreshold
    collateral.save()
  }

  const substituteUnderlying = createToken(
    AssetContract.bind(event.params.debt).underlyingToken(),
  )

  const asset = createAsset(Address.fromString(substituteUnderlying.id))
  asset.collaterals = asset.collaterals.concat([collateralUnderlying.id])
  asset.save()
}
