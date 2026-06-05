/**
 * TDSE disorder strength scaling helpers.
 *
 * The UI exposes Anderson disorder in tight-binding units W/t. Runtime upload
 * paths need the physical energy scale W * t_eff, where
 * t_eff = hbar^2 / (2m dx_eff^2). `dx_eff` is the tightest finite effective
 * spacing across active axes, including compactification and curved-metric
 * overrides, not just raw axis-0 slider spacing.
 *
 * @module rendering/webgpu/passes/TDSEDisorderScaling
 */

import type { TdseConfig } from '@/lib/geometry/extended/types'
import { computeTdseEffectiveSpacing } from '@/lib/physics/tdse/effectiveSpacing'

const DEFAULT_DX = 0.1
const DEFAULT_HBAR = 1
const DEFAULT_MASS = 1
const MIN_LATTICE_DIM = 1
const MAX_LATTICE_DIM = 11

function positiveFinite(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && value! > 0 ? value! : fallback
}

function nonNegativeFinite(value: number | undefined): number {
  return Number.isFinite(value) && value! > 0 ? value! : 0
}

function finiteNumberArray(value: number[] | undefined): number[] {
  return Array.isArray(value) ? value : []
}

function positiveFiniteMinimum(values: number[]): number | undefined {
  let min: number | undefined
  for (const value of values) {
    if (!Number.isFinite(value) || value <= 0) continue
    min = min === undefined ? value : Math.min(min, value)
  }
  return min
}

function safeLatticeDim(value: number | undefined): number {
  if (!Number.isFinite(value)) return MIN_LATTICE_DIM
  return Math.max(MIN_LATTICE_DIM, Math.min(MAX_LATTICE_DIM, Math.floor(value!)))
}

/** Finite physical scaling values derived from a TDSE disorder config. */
export interface TdseDisorderScaling {
  dx: number
  hbar: number
  mass: number
  tEff: number
  disorderStrength: number
  effectiveStrength: number
}

/**
 * Convert UI disorder strength W/t to physical potential amplitude.
 *
 * Invalid or corrupted config values fall back to finite conservative values so
 * disorder upload paths never write NaN/Infinity to GPU buffers.
 */
export function computeTdseDisorderScaling(config: TdseConfig): TdseDisorderScaling {
  const latticeDim = safeLatticeDim(config.latticeDim)
  const rawSpacing = finiteNumberArray(config.spacing)
  const spacing = computeTdseEffectiveSpacing({
    ...config,
    latticeDim,
    gridSize: finiteNumberArray(config.gridSize),
    spacing: rawSpacing,
    compactDims: Array.isArray(config.compactDims) ? config.compactDims : undefined,
    compactRadii: finiteNumberArray(config.compactRadii),
  })
  const dx =
    positiveFiniteMinimum(spacing.slice(0, latticeDim)) ??
    positiveFiniteMinimum(rawSpacing.slice(0, latticeDim)) ??
    DEFAULT_DX
  const hbar = positiveFinite(config.hbar, DEFAULT_HBAR)
  const mass = positiveFinite(config.mass, DEFAULT_MASS)
  const disorderStrength = nonNegativeFinite(config.disorderStrength)
  const tEff = (hbar * hbar) / (2 * mass * dx * dx)
  return {
    dx,
    hbar,
    mass,
    tEff,
    disorderStrength,
    effectiveStrength: disorderStrength * tEff,
  }
}
