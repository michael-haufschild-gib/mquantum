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

import { defaultDiracGridPerDim, DIRAC_MAX_TOTAL_SITES } from '@/lib/geometry/extended/dirac'
import { FREE_SCALAR_MAX_TOTAL_SITES } from '@/lib/geometry/extended/freeScalar'
import type { SchroedingerConfig } from '@/lib/geometry/extended/types'
import { computeDefaultPow2GridPerDim } from '@/lib/math/ndArray'
export { clampDtWithCfl, computeCflLimit } from '@/lib/physics/latticeCfl'

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

/** Maximum total TDSE/BEC lattice sites — FFT needs power-of-2 per axis */
export const TDSE_MAX_TOTAL_SITES = 262144 // 64^3

/** Maximum total free scalar lattice sites (~8MB for phi+pi buffers) */
export const MAX_TOTAL_SITES = FREE_SCALAR_MAX_TOTAL_SITES

/** Maximum unsigned 32-bit seed representable in shader u32 uniforms. */
export const UINT32_SEED_MAX = 0xffffffff

/** Clamp a finite numeric seed into the shader/runtime u32 seed domain. */
export function clampUint32Seed(seed: number): number {
  return Math.min(UINT32_SEED_MAX, Math.floor(Math.max(0, seed)))
}

/**
 * Compute the largest power-of-2 grid size per dimension that keeps total
 * sites within a given budget. All lattice modes need power-of-2 per axis for FFT.
 *
 * @param d - Number of spatial dimensions
 * @param maxTotalSites - Maximum total lattice sites budget
 * @returns Power-of-2 grid size per dimension, clamped to [2, 128]
 */
export const computeDefaultGridPerDim = (d: number, maxTotalSites: number): number => {
  return computeDefaultPow2GridPerDim(d, maxTotalSites)
}

/**
 * Compute default per-dimension grid size for TDSE/BEC modes.
 * @param d - Number of spatial dimensions
 */
export const defaultTdseGridPerDim = (d: number): number =>
  computeDefaultGridPerDim(d, TDSE_MAX_TOTAL_SITES)

/**
 * Compute default per-dimension grid size for free scalar field mode.
 * @param d - Number of spatial dimensions
 */
export const defaultGridPerDim = (d: number): number => computeDefaultGridPerDim(d, MAX_TOTAL_SITES)

export { defaultDiracGridPerDim, DIRAC_MAX_TOTAL_SITES }

// ---------------------------------------------------------------------------
// Nested domain setter factories
// ---------------------------------------------------------------------------
// These eliminate boilerplate for the common pattern:
//   (value) => { validate; clamp; setWithVersion(state => ({
//     schroedinger: { ...state.schroedinger, DOMAIN: { ...DOMAIN, FIELD: clamped } }
//   })) }
// Used by tdse, bec, dirac, freeScalar, openQuantum setter files.

/** Union of SchroedingerConfig keys that hold nested domain config objects. */
type DomainKey =
  | 'tdse'
  | 'bec'
  | 'dirac'
  | 'freeScalar'
  | 'openQuantum'
  | 'quantumWalk'
  | 'wheelerDeWitt'
  | 'antiDeSitter'

/** Config keys whose nested object carries a `needsReset` flag under `schroedinger.*`. */
export type ResettableConfigKey = {
  [K in DomainKey]: SchroedingerConfig[K] extends { needsReset: boolean } ? K : never
}[DomainKey]

/**
 * Clear `needsReset` on a `schroedinger` sub-config without version bump.
 *
 * Used by the generic `clearComputeNeedsReset` store action so each mode's
 * clear logic doesn't need its own dedicated setter.
 */
export function clearSchrodingerModeNeedsReset(
  set: ZustandSet,
  configKey: ResettableConfigKey
): void {
  set((state) => ({
    schroedinger: {
      ...state.schroedinger,
      [configKey]: { ...state.schroedinger[configKey], needsReset: false },
    },
  }))
}

/**
 * Mark `needsReset` on a `schroedinger` sub-config WITH version bump.
 *
 * Used by the generic `markComputeNeedsReset` store action so each mode's
 * mark-dirty logic doesn't need its own dedicated setter.
 */
export function markSchrodingerModeNeedsReset(
  setWithVersion: ZustandSet,
  configKey: ResettableConfigKey
): void {
  setWithVersion((state) => ({
    schroedinger: {
      ...state.schroedinger,
      [configKey]: { ...state.schroedinger[configKey], needsReset: true },
    },
  }))
}

/**
 * Create a setter that validates, clamps, and writes a single numeric field
 * on a nested domain config (e.g. `schroedinger.bec.trapOmega`).
 *
 * @param ctx - Setter context
 * @param domain - Domain key in SchroedingerConfig
 * @param field - Field name within the domain config
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 */
export function nestedClampedSetter<
  D extends DomainKey,
  K extends string & keyof SchroedingerConfig[D],
>(ctx: SetterContext, domain: D, field: K, min: number, max: number): (value: number) => void {
  return (value: number) => {
    if (!ctx.isFinite(value)) {
      ctx.warnNonFinite(`${domain}.${field}`, value)
      return
    }
    const clamped = Math.max(min, Math.min(max, value))
    ctx.setWithVersion((state) => ({
      schroedinger: {
        ...state.schroedinger,
        [domain]: { ...state.schroedinger[domain], [field]: clamped },
      },
    }))
  }
}

/**
 * Create a setter that writes a single field on a nested domain config
 * without numeric validation or clamping. Used for booleans, enums, strings.
 *
 * @param ctx - Setter context
 * @param domain - Domain key in SchroedingerConfig
 * @param field - Field name within the domain config
 */
export function nestedValueSetter<
  D extends DomainKey,
  K extends string & keyof SchroedingerConfig[D],
>(ctx: SetterContext, domain: D, field: K): (value: SchroedingerConfig[D][K]) => void {
  return (value: SchroedingerConfig[D][K]) => {
    ctx.setWithVersion((state) => ({
      schroedinger: {
        ...state.schroedinger,
        [domain]: { ...state.schroedinger[domain], [field]: value },
      },
    }))
  }
}

/**
 * Create a setter that validates, clamps, rounds to integer, and writes a
 * single numeric field on a nested domain config.
 *
 * @param ctx - Setter context
 * @param domain - Domain key in SchroedingerConfig
 * @param field - Field name within the domain config
 * @param min - Minimum allowed value
 * @param max - Maximum allowed value
 */
export function nestedIntSetter<
  D extends DomainKey,
  K extends string & keyof SchroedingerConfig[D],
>(
  ctx: SetterContext,
  domain: D,
  field: K,
  min: number,
  max: number,
  round: 'floor' | 'round' = 'round'
): (value: number) => void {
  const roundFn = round === 'floor' ? Math.floor : Math.round
  return (value: number) => {
    if (!ctx.isFinite(value)) {
      ctx.warnNonFinite(`${domain}.${field}`, value)
      return
    }
    const clamped = Math.max(min, Math.min(max, roundFn(value)))
    ctx.setWithVersion((state) => ({
      schroedinger: {
        ...state.schroedinger,
        [domain]: { ...state.schroedinger[domain], [field]: clamped },
      },
    }))
  }
}
