/**
 * Dimension-change resize helpers for the Schroedinger slice.
 *
 * When the global geometry dimension changes, every compute mode's lattice
 * config (grid sizes, spacings, CFL-clamped dt, cosmology invariants) must be
 * resized in the same store update. These helpers compute those nested config
 * updates; `createSchroedingerSlice` spreads them via
 * {@link applyModeResizeUpdates}. Extracted from `schroedingerSlice.ts` for
 * the file-size budget.
 *
 * @module stores/slices/geometry/setters/dimensionResize
 */

import { MAX_DIMENSION, MIN_DIMENSION } from '@/constants/dimension'
import { resizeQuantumWalkArrays } from '@/lib/geometry/extended/quantumWalk'
import type {
  BecConfig,
  DiracConfig,
  FreeScalarConfig,
  SchroedingerConfig,
  TdseConfig,
} from '@/lib/geometry/extended/types'
import { isHydrogenFamilyQuantumType } from '@/lib/geometry/registry'

import { resizeBecArrays } from './becResize'
import { resizeDiracArrays } from './diracSetters'
import { reconcileCosmologyInvariants } from './freeScalarCosmologySetters'
import { resizeFreeScalarArrays } from './freeScalarSetters'
import { clampDtWithCfl } from './sliceSetterUtils'
import { resizeTdseArrays } from './tdseSetters'
import { resizeWdwForGeometryDimension } from './wheelerDeWittSetters'

/** Nested per-mode config updates produced by a dimension change. */
export interface ModeResizeUpdates {
  freeScalar?: Partial<FreeScalarConfig>
  tdse?: Partial<TdseConfig>
  bec?: Partial<BecConfig>
  dirac?: Partial<DiracConfig>
  quantumWalk?: Partial<import('@/lib/geometry/extended/quantumWalk').QuantumWalkConfig>
  wheelerDeWitt?: Partial<SchroedingerConfig['wheelerDeWitt']>
}

/** Derive hydrogen-specific adjustments when switching to 2D. */
export function buildHydrogenDimUpdate(
  dimension: number,
  current: SchroedingerConfig
): Record<string, unknown> {
  if (dimension !== 2) return {}
  if (!isHydrogenFamilyQuantumType(current.quantumMode)) return {}

  const update: Record<string, unknown> = {}
  // In 2D hydrogen, l is not independent — it equals |m|.
  // The shader uses abs(magneticM) as effective l, but keep the store consistent.
  const absM = Math.abs(current.magneticQuantumNumber)
  if (current.azimuthalQuantumNumber !== absM) {
    update.azimuthalQuantumNumber = absM
  }
  // Force position representation (momentum/Wigner not implemented for 2D hydrogen)
  if (current.representation !== 'position') {
    update.representation = 'position'
  }
  return update
}

function resizeFreeScalarForDim(
  prev: SchroedingerConfig['freeScalar'],
  dimension: number
): Partial<FreeScalarConfig> | undefined {
  if (prev.latticeDim === dimension) return undefined
  const resized = resizeFreeScalarArrays(prev, dimension)
  const newSpacing = resized.spacing ?? prev.spacing
  const newDt = clampDtWithCfl(prev.dt, newSpacing, dimension, prev.mass)
  // Stage the post-resize config so the cosmology invariant check sees the
  // new latticeDim / gridSize / spacing. Without this, dimension changes via
  // the global dimension slider (syncActiveComputeModeLatticeDim) or the
  // React initialization hook (initializeSchroedingerForDimension) bypass
  // the reconcile, leaving cosmology enabled at unsupported spacetime dims
  // or with an eta0 below the new safe threshold.
  const staged: FreeScalarConfig = { ...prev, ...resized, dt: newDt, needsReset: true }
  const reconciled = reconcileCosmologyInvariants(staged)
  return { ...resized, dt: newDt, needsReset: true, ...reconciled }
}

function resizeTdseForDim(
  prev: SchroedingerConfig['tdse'],
  dimension: number
): Partial<TdseConfig> | undefined {
  if (prev.latticeDim === dimension) return undefined
  const potentialType = dimension < 2 && prev.potentialType === 'doubleSlit' ? 'barrier' : undefined
  return {
    ...resizeTdseArrays(prev, dimension),
    ...(potentialType ? { potentialType } : {}),
    needsReset: true,
  }
}

function resizeSimpleModeForDim<T extends { latticeDim: number }>(
  prev: T,
  dimension: number,
  resizeFn: (p: T, d: number) => Partial<T>,
  needsReset = true
): Partial<T> | undefined {
  if (prev.latticeDim === dimension) return undefined
  return { ...resizeFn(prev, dimension), ...(needsReset ? { needsReset: true } : {}) } as Partial<T>
}

/** Mode-to-resize-key dispatcher — avoids a long if/else chain. */
const MODE_RESIZE_MAP: Record<
  string,
  ((state: SchroedingerConfig, dim: number) => ModeResizeUpdates) | undefined
> = {
  freeScalarField: (state, dim) => {
    const update = resizeFreeScalarForDim(state.freeScalar, dim)
    return update ? { freeScalar: update } : {}
  },
  tdseDynamics: (state, dim) => {
    const update = resizeTdseForDim(state.tdse, dim)
    return update ? { tdse: update } : {}
  },
  becDynamics: (state, dim) => {
    const update = resizeSimpleModeForDim(state.bec, dim, resizeBecArrays)
    return update ? { bec: update } : {}
  },
  diracEquation: (state, dim) => {
    const update = resizeSimpleModeForDim(state.dirac, dim, resizeDiracArrays)
    return update ? { dirac: update } : {}
  },
  quantumWalk: (state, dim) => {
    const update = resizeSimpleModeForDim(state.quantumWalk, dim, resizeQuantumWalkArrays, false)
    return update ? { quantumWalk: update } : {}
  },
  wheelerDeWitt: (state, dim) => {
    const update = resizeWdwForGeometryDimension(state.wheelerDeWitt, dim)
    return update ? { wheelerDeWitt: update } : {}
  },
}

/** Clamp finite public dimension input to the supported Schroedinger range. */
export function clampSchroedingerDimensionInput(dimension: number): number | null {
  if (!Number.isFinite(dimension)) return null
  return Math.max(MIN_DIMENSION, Math.min(MAX_DIMENSION, Math.floor(dimension)))
}

/** Compute resize updates for the active compute mode (only when latticeDim changed). */
export function buildModeResizeUpdates(
  currentState: SchroedingerConfig,
  dimension: number
): ModeResizeUpdates {
  const handler = MODE_RESIZE_MAP[currentState.quantumMode]
  return handler ? handler(currentState, dimension) : {}
}

/** Spread mode resize updates onto the schroedinger state, merging nested configs. */
export function applyModeResizeUpdates(
  schroedinger: SchroedingerConfig,
  updates: ModeResizeUpdates
): Partial<SchroedingerConfig> {
  const result: Partial<SchroedingerConfig> = {}
  if (updates.freeScalar) {
    result.freeScalar = { ...schroedinger.freeScalar, ...updates.freeScalar }
  }
  if (updates.tdse) {
    result.tdse = { ...schroedinger.tdse, ...updates.tdse }
  }
  if (updates.bec) {
    result.bec = { ...schroedinger.bec, ...updates.bec }
  }
  if (updates.dirac) {
    result.dirac = { ...schroedinger.dirac, ...updates.dirac }
  }
  if (updates.quantumWalk) {
    result.quantumWalk = { ...schroedinger.quantumWalk, ...updates.quantumWalk }
  }
  if (updates.wheelerDeWitt) {
    result.wheelerDeWitt = { ...schroedinger.wheelerDeWitt, ...updates.wheelerDeWitt }
  }
  return result
}
