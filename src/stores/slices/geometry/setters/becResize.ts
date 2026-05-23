/**
 * BEC lattice resize helpers shared by setters, mode transitions, and presets.
 *
 * @module stores/slices/geometry/setters/becResize
 */

import { type BecConfig } from '@/lib/geometry/extended/types'
import { thomasFermiMuND, thomasFermiRadius } from '@/lib/physics/bec/chemicalPotential'
import { resolveBecMass } from '@/lib/physics/bec/waterfallParams'
import { clampKKState } from '@/lib/physics/compactification'

import { clampDtWithCfl, defaultTdseGridPerDim } from './sliceSetterUtils'

/**
 * Resize BEC arrays to match a new latticeDim, computing TF-aware spacing.
 */
export const resizeBecArrays = (prev: BecConfig, newDim: number): Partial<BecConfig> => {
  const gridDefault = defaultTdseGridPerDim(newDim)
  const gridSize = Array.from({ length: newDim }, () => gridDefault)

  const trapAnisotropy = Array.from({ length: newDim }, (_, i) =>
    i < prev.trapAnisotropy.length ? prev.trapAnisotropy[i]! : 1.0
  )

  const g = prev.interactionStrength ?? 500
  const omega = prev.trapOmega ?? 1.0
  const mass = resolveBecMass(prev)
  let anisotropyProduct = 1.0
  for (let d = 0; d < newDim; d++) {
    anisotropyProduct *= trapAnisotropy[d] ?? 1.0
  }
  const geometricOmega = omega * Math.pow(anisotropyProduct, 1 / newDim)
  const mu = g > 0 ? thomasFermiMuND(newDim, g, geometricOmega, mass) : 0
  const COVERAGE = 1.3
  const spacing = Array.from({ length: newDim }, (_, i) => {
    const effectiveOmega = omega * (trapAnisotropy[i] ?? 1.0)
    const Rtf = mu > 0 ? thomasFermiRadius(mu, mass, effectiveOmega) : 2.0
    return Math.max(0.05, (2 * Rtf * COVERAGE) / gridDefault)
  })

  const slicePositions = Array.from({ length: Math.max(0, newDim - 3) }, (_, i) =>
    i < prev.slicePositions.length ? prev.slicePositions[i]! : 0
  )
  const compactDims = Array.from({ length: newDim }, (_, i) =>
    i < (prev.compactDims?.length ?? 0) ? (prev.compactDims[i] ?? false) : false
  )
  const rawRadii = Array.from({ length: newDim }, (_, i) =>
    i < (prev.compactRadii?.length ?? 0) ? (prev.compactRadii[i] ?? 0.15) : 0.15
  )
  const kk = clampKKState(
    prev.dt,
    gridSize,
    spacing,
    compactDims,
    rawRadii,
    newDim,
    mass,
    clampDtWithCfl
  )
  return {
    latticeDim: newDim,
    gridSize,
    spacing,
    trapAnisotropy,
    slicePositions,
    compactDims,
    compactRadii: kk.compactRadii,
    dt: kk.dt,
  }
}
