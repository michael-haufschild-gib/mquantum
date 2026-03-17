/**
 * Shared utilities and types for schroedingerSlice setter factories.
 *
 * Each setter domain (TDSE, FSF, Dirac, BEC, Open Quantum) receives a
 * SetterContext to access the Zustand set/get functions and shared
 * validation helpers without duplicating them across files.
 *
 * @module stores/slices/geometry/setters/sliceSetterUtils
 */

import type { StoreApi } from 'zustand'
import type { ExtendedObjectSlice } from '../types'

type ZustandSet = StoreApi<ExtendedObjectSlice>['setState']
type ZustandGet = StoreApi<ExtendedObjectSlice>['getState']

/**
 * Context object passed to each setter factory. Provides Zustand set/get
 * plus validation helpers so that setter files don't need to redefine them.
 */
export interface SetterContext {
  /** Zustand set wrapped with automatic schroedingerVersion increment */
  setWithVersion: ZustandSet
  /** Raw Zustand set (no version bump — used for non-physics mutations like clearing flags) */
  set: ZustandSet
  /** Raw Zustand get */
  get: ZustandGet
  /** Returns true if value is a finite number */
  isFinite: (value: number) => boolean
  /** Returns true if every element in the array is a finite number */
  hasOnlyFinite: (values: number[]) => boolean
  /** Logs a non-finite input warning (dev mode only) */
  warnNonFinite: (name: string, value: unknown) => void
}

/**
 * CFL stability limit for the lattice Klein-Gordon field.
 *
 * For a leapfrog integrator the maximum eigenfrequency is:
 *   omega_max^2 = m^2 + sum_i (2/a_i)^2
 * and the stability condition is dt * omega_max < 2, giving:
 *   dt_max = 2 / sqrt(m^2 + sum_i (2/a_i)^2)
 *
 * @param spacing - Lattice spacing per dimension
 * @param latticeDim - Active spatial dimensions
 * @param mass - Klein-Gordon mass parameter
 */
export const computeCflLimit = (spacing: number[], latticeDim: number, mass: number): number => {
  let sumInvA2 = 0
  for (let i = 0; i < latticeDim; i++) {
    const a = spacing[i]!
    const twoOverA = 2 / a
    sumInvA2 += twoOverA * twoOverA
  }
  const omegaMax = Math.sqrt(mass * mass + sumInvA2)
  return 2 / omegaMax
}

/**
 * Clamp dt to be within [0.001, min(0.1, CFL limit * safety factor)].
 * Uses a 0.9 safety factor to stay well within the stable region.
 *
 * @param dt - Requested time step
 * @param spacing - Lattice spacing
 * @param latticeDim - Active dimensions
 * @param mass - Klein-Gordon mass parameter
 */
export const clampDtWithCfl = (
  dt: number,
  spacing: number[],
  latticeDim: number,
  mass: number
): number => {
  const cflLimit = computeCflLimit(spacing, latticeDim, mass)
  const maxDt = Math.min(0.1, cflLimit * 0.9)
  return Math.max(0.001, Math.min(maxDt, dt))
}

/** Maximum total TDSE/BEC lattice sites — FFT needs power-of-2 per axis */
export const TDSE_MAX_TOTAL_SITES = 262144 // 64^3

/**
 * Compute default per-dimension grid size for a given TDSE/BEC dimensionality.
 * TDSE requires power-of-2 per axis for FFT. Ensures total sites within budget.
 */
export const defaultTdseGridPerDim = (d: number): number => {
  const raw = Math.round(Math.pow(TDSE_MAX_TOTAL_SITES, 1 / d))
  let pow2 = 2 ** Math.floor(Math.log2(Math.max(2, raw)))
  pow2 = Math.max(2, Math.min(128, pow2))
  while (pow2 > 2 && Math.pow(pow2, d) > TDSE_MAX_TOTAL_SITES) {
    pow2 = pow2 / 2
  }
  return pow2
}

/** Maximum total free scalar lattice sites (~8MB for phi+pi buffers) */
export const MAX_TOTAL_SITES = 1048576

/**
 * Compute default per-dimension grid size for a given free scalar dimensionality.
 * Ensures total sites stays within MAX_TOTAL_SITES budget.
 */
export const defaultGridPerDim = (d: number): number => {
  const raw = Math.round(Math.pow(MAX_TOTAL_SITES, 1 / d))
  let pow2 = 2 ** Math.floor(Math.log2(Math.max(2, raw)))
  pow2 = Math.max(2, Math.min(128, pow2))
  while (pow2 > 2 && Math.pow(pow2, d) > MAX_TOTAL_SITES) {
    pow2 = pow2 / 2
  }
  return pow2
}
