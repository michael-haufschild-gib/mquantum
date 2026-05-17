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

function clampFiniteNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
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
  }) as unknown as Record<string, unknown>

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
