import {
  DEFAULT_FREE_SCALAR_CONFIG,
  DEFAULT_PREHEATING_CONFIG,
  FREE_SCALAR_MAX_TOTAL_SITES,
  isFreeScalarFieldView,
  isFreeScalarInitialCondition,
  sanitizeKSpaceVizConfig,
} from '@/lib/geometry/extended/freeScalar'
import { type FreeScalarConfig } from '@/lib/geometry/extended/types'
import { sanitizePowerOfTwoGridSizes } from '@/lib/math/ndArray'

import { reconcileCosmologyInvariants } from '../slices/geometry/setters/freeScalarCosmologySetters'
import { clampDtWithCfl } from '../slices/geometry/setters/sliceSetterUtils'

function clampFiniteNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

function clampFiniteInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  round: 'floor' | 'round' = 'round'
): number {
  const candidate = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  const rounded = round === 'floor' ? Math.floor(candidate) : Math.round(candidate)
  return Math.max(min, Math.min(max, rounded))
}

function finiteArrayValue(
  value: unknown,
  index: number,
  fallback: readonly number[],
  fill: number
): number {
  const raw = Array.isArray(value) ? value[index] : undefined
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const fallbackValue = fallback[index] ?? fallback[fallback.length - 1] ?? fill
  return Number.isFinite(fallbackValue) ? fallbackValue : fill
}

function normalizeNumberArray(
  value: unknown,
  fallback: readonly number[],
  length: number,
  fill: number,
  transform: (value: number) => number = (value) => value
): number[] {
  return Array.from({ length }, (_, index) =>
    transform(finiteArrayValue(value, index, fallback, fill))
  )
}

function normalizeClampedNumberArray(
  value: unknown,
  fallback: readonly number[],
  length: number,
  fill: number,
  min: number,
  max: number
): number[] {
  return normalizeNumberArray(value, fallback, length, fill, (entry) =>
    Math.max(min, Math.min(max, entry))
  )
}

function normalizeFreeScalarSlicePositions(
  value: unknown,
  gridSize: readonly number[],
  spacing: readonly number[],
  latticeDim: number
): number[] {
  const targetLength = Math.max(0, latticeDim - 3)
  return Array.from({ length: targetLength }, (_, index) => {
    const raw = Array.isArray(value) ? value[index] : undefined
    const finite = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
    const axis = index + 3
    const halfExtent = (gridSize[axis] ?? 1) * (spacing[axis] ?? 0.1) * 0.5
    const limit = Number.isFinite(halfExtent) && halfExtent > 0 ? halfExtent : 0
    return Math.max(-limit, Math.min(limit, finite))
  })
}

function normalizeFreeScalarPreheatingConfig(value: unknown): {
  config: typeof DEFAULT_PREHEATING_CONFIG
  changed: boolean
  requiresReset: boolean
} {
  const defaults = DEFAULT_PREHEATING_CONFIG
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { config: { ...defaults }, changed: true, requiresReset: false }
  }

  const record = value as Record<string, unknown>
  const enabled = typeof record.enabled === 'boolean' ? record.enabled : defaults.enabled
  const amplitude = clampFiniteNumber(record.amplitude, defaults.amplitude, 0, 1)
  const frequency = clampFiniteNumber(record.frequency, defaults.frequency, 0.1, 10)
  const changed =
    enabled !== record.enabled || amplitude !== record.amplitude || frequency !== record.frequency

  return {
    config: { enabled, amplitude, frequency },
    changed,
    requiresReset: enabled && changed,
  }
}

function sanitizeFreeScalarEnums(config: FreeScalarConfig): Partial<FreeScalarConfig> {
  const patch: Partial<FreeScalarConfig> = {}
  if (!isFreeScalarInitialCondition(config.initialCondition)) {
    patch.initialCondition = DEFAULT_FREE_SCALAR_CONFIG.initialCondition
    patch.needsReset = true
  }
  if (!isFreeScalarFieldView(config.fieldView)) {
    patch.fieldView = DEFAULT_FREE_SCALAR_CONFIG.fieldView
  }
  return patch
}

function normalizeFreeScalarScalarControls(
  freeScalar: Record<string, unknown>
): Record<string, unknown> {
  const defaults = DEFAULT_FREE_SCALAR_CONFIG
  const latticeDim = clampFiniteInteger(freeScalar.latticeDim, defaults.latticeDim, 1, 11, 'floor')
  const gridSize = Array.isArray(freeScalar.gridSize)
    ? (freeScalar.gridSize as number[])
    : defaults.gridSize
  const spacing = normalizeClampedNumberArray(
    freeScalar.spacing,
    defaults.spacing,
    latticeDim,
    0.1,
    0.01,
    1.0
  )
  const mass = clampFiniteNumber(freeScalar.mass, defaults.mass, 0.0, 10.0)
  const requestedDt =
    typeof freeScalar.dt === 'number' && Number.isFinite(freeScalar.dt)
      ? freeScalar.dt
      : defaults.dt

  return {
    ...freeScalar,
    latticeDim,
    spacing,
    mass,
    dt: clampDtWithCfl(requestedDt, spacing, latticeDim, mass),
    stepsPerFrame: clampFiniteInteger(
      freeScalar.stepsPerFrame,
      defaults.stepsPerFrame,
      1,
      16,
      'floor'
    ),
    packetCenter: normalizeNumberArray(
      freeScalar.packetCenter,
      defaults.packetCenter,
      latticeDim,
      0
    ),
    packetWidth: clampFiniteNumber(freeScalar.packetWidth, defaults.packetWidth, 0.01, 5.0),
    packetAmplitude: clampFiniteNumber(
      freeScalar.packetAmplitude,
      defaults.packetAmplitude,
      0.01,
      10.0
    ),
    modeK: normalizeNumberArray(freeScalar.modeK, defaults.modeK, latticeDim, 0, Math.round),
    vacuumSeed:
      typeof freeScalar.vacuumSeed === 'number' && Number.isFinite(freeScalar.vacuumSeed)
        ? Math.round(freeScalar.vacuumSeed)
        : defaults.vacuumSeed,
    selfInteractionLambda: clampFiniteNumber(
      freeScalar.selfInteractionLambda,
      defaults.selfInteractionLambda,
      0.01,
      10.0
    ),
    selfInteractionVev: clampFiniteNumber(
      freeScalar.selfInteractionVev,
      defaults.selfInteractionVev,
      0.1,
      5.0
    ),
    absorberWidth: clampFiniteNumber(freeScalar.absorberWidth, defaults.absorberWidth, 0.05, 0.5),
    pmlTargetReflection: clampFiniteNumber(
      freeScalar.pmlTargetReflection,
      defaults.pmlTargetReflection,
      1e-12,
      0.999
    ),
    diagnosticsInterval: clampFiniteInteger(
      freeScalar.diagnosticsInterval,
      defaults.diagnosticsInterval,
      1,
      120
    ),
    slicePositions: normalizeFreeScalarSlicePositions(
      freeScalar.slicePositions,
      gridSize,
      spacing,
      latticeDim
    ),
  }
}

/**
 * Normalize restored free-scalar config fields that bypass public setters.
 *
 * Scene loading writes the merged object directly into Zustand state, so this
 * helper re-applies invariants normally enforced by setters: preheating shape,
 * power-of-two grid budget, k-space visualization bounds, enum domains, and
 * cosmology safety clamps.
 */
export function normalizeFreeScalarLoadedConfig(
  normalized: Record<string, unknown>
): Record<string, unknown> {
  const fs = normalized.freeScalar
  if (!fs || typeof fs !== 'object' || Array.isArray(fs)) return normalized

  let freeScalar = fs as Record<string, unknown>
  const preheating = normalizeFreeScalarPreheatingConfig(freeScalar.preheating)
  if (preheating.changed) {
    freeScalar = {
      ...freeScalar,
      preheating: preheating.config,
      needsReset: preheating.requiresReset ? true : freeScalar.needsReset,
    }
  }

  freeScalar = sanitizePowerOfTwoGridSizes(freeScalar as unknown as FreeScalarConfig, {
    maxTotalSites: FREE_SCALAR_MAX_TOTAL_SITES,
    maxDimensions: 11,
  }) as unknown as Record<string, unknown>
  freeScalar = normalizeFreeScalarScalarControls(freeScalar)

  freeScalar = {
    ...freeScalar,
    kSpaceViz: sanitizeKSpaceVizConfig((freeScalar as unknown as FreeScalarConfig).kSpaceViz),
  }

  const enumPatch = sanitizeFreeScalarEnums(freeScalar as unknown as FreeScalarConfig)
  if (Object.keys(enumPatch).length > 0) {
    freeScalar = { ...freeScalar, ...enumPatch }
  }

  const reconciled = reconcileCosmologyInvariants(freeScalar as unknown as FreeScalarConfig)
  if (Object.keys(reconciled).length > 0) {
    freeScalar = { ...freeScalar, ...reconciled }
  }

  return { ...normalized, freeScalar }
}
