/**
 * TDSE UI, diagnostic, absorber, and disorder setters.
 *
 * Simple setters for TDSE configuration flags and clamped numeric parameters
 * that don't require CFL/KK recomputation. Extracted from tdseSetters.ts to
 * keep file sizes under the max-lines limit.
 *
 * @module stores/slices/geometry/setters/tdseUiSetters
 */

import {
  isTdseDensityView,
  isTdseDisorderDistribution,
  isTdseFieldView,
  type TdseDisorderDistribution,
  type TdseFieldView,
} from '@/lib/geometry/extended/tdse'
import { logger } from '@/lib/logger'
import {
  DEFAULT_METRIC_CONFIG,
  MAX_ADS_RADIUS,
  MAX_DOUBLE_THROAT_SEPARATION,
  MAX_HUBBLE_RATE,
  MAX_SCHWARZSCHILD_MASS,
  MAX_SPHERE_RADIUS,
  MAX_THROAT_RADIUS,
  MAX_TORUS_PERIOD,
  type MetricConfig,
  MIN_ADS_RADIUS,
  MIN_DOUBLE_THROAT_SEPARATION,
  MIN_HUBBLE_RATE,
  MIN_SCHWARZSCHILD_MASS,
  MIN_SPHERE_RADIUS,
  MIN_THROAT_RADIUS,
  MIN_TORUS_PERIOD,
  normalizeMetricForLattice,
} from '@/lib/physics/tdse/metrics/types'
import { normalizeMirrorAxisForLattice } from '@/lib/physics/tdse/wormholeCoupling'

import {
  clampUint32Seed,
  nestedClampedSetter,
  nestedIntSetter,
  type SetterContext,
} from './sliceSetterUtils'

/** Default fall-back throat radius b₀ when none is otherwise available. */
const DEFAULT_THROAT_RADIUS = 0.5
/** Default Schwarzschild mass M when none is otherwise available. */
const DEFAULT_SCHWARZSCHILD_MASS = 1.0
/** Default Hubble rate H when none is otherwise available. */
const DEFAULT_HUBBLE_RATE = 0.3
/** Default AdS radius L when none is otherwise available. */
const DEFAULT_ADS_RADIUS = 1.0
/** Default 2-sphere radius R when none is otherwise available. */
const DEFAULT_SPHERE_RADIUS = 1.0
/** Default torus periods (one per axis). */
const DEFAULT_TORUS_PERIOD: [number, number, number] = [1, 1, 1]
/** Default double-throat separation s. */
const DEFAULT_DOUBLE_THROAT_SEPARATION = 4.0

/**
 * Clamp a numeric param to `[min, max]`. If `value` is not finite, fall back
 * to `fallback` and emit a dev-mode warning. Pure helper used by the metric
 * normalizer.
 *
 * @param value - Incoming raw value (may be undefined / non-finite)
 * @param fallback - Last-known good value
 * @param min - Inclusive minimum
 * @param max - Inclusive maximum
 * @param fieldName - Param name for the warning
 */
function clampOrFallback(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
  fieldName: string
): number {
  if (value === undefined) return Math.max(min, Math.min(max, fallback))
  if (!Number.isFinite(value)) {
    logger.warn(`metric.${fieldName}: non-finite ${value}, falling back to ${fallback}`)
    return Math.max(min, Math.min(max, fallback))
  }
  return Math.max(min, Math.min(max, value))
}

/**
 * Project an arbitrary `MetricConfig` payload to its canonical form for the
 * given `kind`: only kind-relevant fields survive, each clamped to the
 * physical bound. Missing fields fall back to `prev` (when same kind) or to
 * the per-kind defaults.
 */
function normalizeMetricConfig(cfg: MetricConfig, prev: MetricConfig): MetricConfig {
  if (!cfg || typeof cfg !== 'object' || !('kind' in cfg)) return prev
  const samePrev = prev.kind === cfg.kind ? prev : undefined
  switch (cfg.kind) {
    case 'flat':
      return { kind: 'flat' }
    case 'morrisThorne': {
      const fallback = samePrev?.throatRadius ?? prev.throatRadius ?? DEFAULT_THROAT_RADIUS
      return {
        kind: 'morrisThorne',
        throatRadius: clampOrFallback(
          cfg.throatRadius,
          fallback,
          MIN_THROAT_RADIUS,
          MAX_THROAT_RADIUS,
          'throatRadius'
        ),
      }
    }
    case 'schwarzschild': {
      const fallback = samePrev?.schwarzschildMass ?? DEFAULT_SCHWARZSCHILD_MASS
      return {
        kind: 'schwarzschild',
        schwarzschildMass: clampOrFallback(
          cfg.schwarzschildMass,
          fallback,
          MIN_SCHWARZSCHILD_MASS,
          MAX_SCHWARZSCHILD_MASS,
          'schwarzschildMass'
        ),
      }
    }
    case 'deSitter': {
      const fallback = samePrev?.hubbleRate ?? DEFAULT_HUBBLE_RATE
      return {
        kind: 'deSitter',
        hubbleRate: clampOrFallback(
          cfg.hubbleRate,
          fallback,
          MIN_HUBBLE_RATE,
          MAX_HUBBLE_RATE,
          'hubbleRate'
        ),
      }
    }
    case 'antiDeSitter': {
      const fallback = samePrev?.adsRadius ?? DEFAULT_ADS_RADIUS
      return {
        kind: 'antiDeSitter',
        adsRadius: clampOrFallback(
          cfg.adsRadius,
          fallback,
          MIN_ADS_RADIUS,
          MAX_ADS_RADIUS,
          'adsRadius'
        ),
      }
    }
    case 'sphere2D': {
      const fallback = samePrev?.sphereRadius ?? DEFAULT_SPHERE_RADIUS
      return {
        kind: 'sphere2D',
        sphereRadius: clampOrFallback(
          cfg.sphereRadius,
          fallback,
          MIN_SPHERE_RADIUS,
          MAX_SPHERE_RADIUS,
          'sphereRadius'
        ),
      }
    }
    case 'torus': {
      const prevPeriod = samePrev?.torusPeriod
      const incoming = Array.isArray(cfg.torusPeriod) ? cfg.torusPeriod : undefined
      const periodOf = (i: 0 | 1 | 2): number =>
        clampOrFallback(
          incoming && incoming.length === 3 ? incoming[i] : undefined,
          prevPeriod?.[i] ?? DEFAULT_TORUS_PERIOD[i],
          MIN_TORUS_PERIOD,
          MAX_TORUS_PERIOD,
          `torusPeriod[${i}]`
        )
      return { kind: 'torus', torusPeriod: [periodOf(0), periodOf(1), periodOf(2)] }
    }
    case 'doubleThroat': {
      const sepFallback = samePrev?.doubleThroatSeparation ?? DEFAULT_DOUBLE_THROAT_SEPARATION
      const radFallback = samePrev?.doubleThroatRadius ?? prev.throatRadius ?? DEFAULT_THROAT_RADIUS
      return {
        kind: 'doubleThroat',
        doubleThroatSeparation: clampOrFallback(
          cfg.doubleThroatSeparation,
          sepFallback,
          MIN_DOUBLE_THROAT_SEPARATION,
          MAX_DOUBLE_THROAT_SEPARATION,
          'doubleThroatSeparation'
        ),
        doubleThroatRadius: clampOrFallback(
          cfg.doubleThroatRadius,
          radFallback,
          MIN_THROAT_RADIUS,
          MAX_THROAT_RADIUS,
          'doubleThroatRadius'
        ),
      }
    }
    default:
      return prev
  }
}

/**
 * Structural equality on canonical MetricConfig objects. Both inputs must
 * already be in normalized form (only kind-relevant fields populated).
 */
function metricsEqual(a: MetricConfig, b: MetricConfig): boolean {
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'flat':
      return true
    case 'morrisThorne':
      return a.throatRadius === (b as typeof a).throatRadius
    case 'schwarzschild':
      return a.schwarzschildMass === (b as typeof a).schwarzschildMass
    case 'deSitter':
      return a.hubbleRate === (b as typeof a).hubbleRate
    case 'antiDeSitter':
      return a.adsRadius === (b as typeof a).adsRadius
    case 'sphere2D':
      return a.sphereRadius === (b as typeof a).sphereRadius
    case 'torus': {
      const ap = a.torusPeriod
      const bp = (b as typeof a).torusPeriod
      if (!ap || !bp) return false
      return ap[0] === bp[0] && ap[1] === bp[1] && ap[2] === bp[2]
    }
    case 'doubleThroat': {
      const bb = b as typeof a
      return (
        a.doubleThroatSeparation === bb.doubleThroatSeparation &&
        a.doubleThroatRadius === bb.doubleThroatRadius
      )
    }
  }
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

/**
 * Creates UI, diagnostic, absorber, and disorder setters for the TDSE slice.
 * @param ctx - Shared setter context with set/get and validation helpers
 */
export function createTdseUiSetters(ctx: SetterContext) {
  const D = 'tdse' as const

  return {
    setTdseDisorderSeed: (seed: number) => {
      if (!ctx.isFinite(seed)) {
        ctx.warnNonFinite('tdse.disorderSeed', seed)
        return
      }
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, disorderSeed: clampUint32Seed(seed) },
        },
      }))
    },
    setTdseDisorderDistribution: (distribution: TdseDisorderDistribution) => {
      if (!isTdseDisorderDistribution(distribution)) return
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, disorderDistribution: distribution },
        },
      }))
    },
    setTdseAbsorberEnabled: (enabled: boolean) => {
      if (!isBoolean(enabled)) return
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          absorberEnabled: enabled,
          [D]: { ...state.schroedinger[D], absorberEnabled: enabled },
        },
      }))
    },
    setTdseAbsorberWidth: (value: number) => {
      if (!ctx.isFinite(value)) {
        ctx.warnNonFinite(`${D}.absorberWidth`, value)
        return
      }
      const clamped = Math.max(0.05, Math.min(0.5, value))
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          absorberWidth: clamped,
          [D]: { ...state.schroedinger[D], absorberWidth: clamped },
        },
      }))
    },
    setTdsePmlTargetReflection: nestedClampedSetter(ctx, D, 'pmlTargetReflection', 1e-12, 0.999),
    setTdseFieldView: (view: TdseFieldView) => {
      if (!isTdseFieldView(view)) return
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          [D]: { ...state.schroedinger[D], fieldView: view },
        },
      }))
    },
    setTdseAutoScale: (autoScale: boolean) => {
      if (!isBoolean(autoScale)) return
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          [D]: { ...state.schroedinger[D], autoScale },
        },
      }))
    },
    setTdseShowPotential: (showPotential: boolean) => {
      if (!isBoolean(showPotential)) return
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          [D]: { ...state.schroedinger[D], showPotential },
        },
      }))
    },
    setTdseAutoLoop: (autoLoop: boolean) => {
      if (!isBoolean(autoLoop)) return
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          [D]: { ...state.schroedinger[D], autoLoop },
        },
      }))
    },
    setTdseDiagnosticsEnabled: (enabled: boolean) => {
      if (!isBoolean(enabled)) return
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          [D]: { ...state.schroedinger[D], diagnosticsEnabled: enabled },
        },
      }))
    },
    setTdseDiagnosticsInterval: nestedIntSetter(ctx, D, 'diagnosticsInterval', 1, 60, 'floor'),
    setTdseObservablesEnabled: (enabled: boolean) => {
      if (!isBoolean(enabled)) return
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          [D]: { ...state.schroedinger[D], observablesEnabled: enabled },
        },
      }))
    },
    setTdseImaginaryTimeEnabled: (enabled: boolean) => {
      if (!isBoolean(enabled)) return
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          [D]: { ...state.schroedinger[D], imaginaryTimeEnabled: enabled },
        },
      }))
    },
    setTdseCustomPotentialExpression: (expression: string) => {
      if (typeof expression !== 'string') return
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          [D]: { ...state.schroedinger[D], customPotentialExpression: expression },
        },
      }))
    },
    /**
     * Toggle the ER=EPR double-trace wormhole coupling. A transition of the
     * flag resets ψ: enabling the coupling mid-evolution introduces a
     * discontinuity that is hard to interpret visually, and disabling it
     * similarly leaves the wavefunction carrying hidden L↔R correlations
     * that no longer match the running Hamiltonian. An idempotent write
     * (same value on both sides) does NOT flip `needsReset` so UI round
     * trips don't kick the simulation.
     */
    setTdseWormholeEnabled: (enabled: boolean) => {
      if (!isBoolean(enabled)) return
      ctx.setWithVersion((state) => {
        const prev = state.schroedinger.tdse
        const next = !!enabled
        if (prev.wormholeCouplingEnabled === next) return state
        return {
          schroedinger: {
            ...state.schroedinger,
            tdse: { ...prev, wormholeCouplingEnabled: next, needsReset: true },
          },
        }
      })
    },
    /** Clamp coupling `g` to `[0, 5]`. Non-finite is rejected with a warning. */
    setTdseWormholeG: (g: number) => {
      if (!ctx.isFinite(g)) {
        ctx.warnNonFinite(`${D}.wormholeCouplingG`, g)
        return
      }
      const clamped = Math.max(0, Math.min(5, g))
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, wormholeCouplingG: clamped },
        },
      }))
    },
    /**
     * Set the mirror-plane axis index. Accepts only `0 | 1 | 2`; other
     * values are silently floored/clamped to the `{0,1,2}` range.
     */
    setTdseWormholeAxis: (axis: number) => {
      if (!Number.isFinite(axis)) return
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: {
            ...state.schroedinger.tdse,
            wormholeMirrorAxis: normalizeMirrorAxisForLattice(
              axis,
              state.schroedinger.tdse.latticeDim
            ),
          },
        },
      }))
    },
    /**
     * Toggle the coherence HUD overlay. This is a pure UI flag — it does
     * not affect the wavefunction evolution, only whether the readback
     * path runs at the diagnostic cadence. Uses `set` rather than
     * `setWithVersion` so that toggling the panel does not participate in
     * any schroedingerVersion-keyed recompute flows.
     */
    setTdseWormholeHudEnabled: (enabled: boolean) => {
      if (!isBoolean(enabled)) return
      ctx.set((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, wormholeCoherenceHudEnabled: !!enabled },
        },
      }))
    },
    /** Toggle the Ricci-scalar curvature overlay. Pure render flag. */
    setShowCurvatureOverlay: (enabled: boolean) => {
      if (!isBoolean(enabled)) return
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          [D]: { ...state.schroedinger[D], showCurvatureOverlay: enabled },
        },
      }))
    },
    /**
     * Select the density-volume view mode. `coordinate` = bare |ψ|²,
     * `proper` = |ψ|²·√|g|. Render-only.
     */
    setDensityView: (view: 'coordinate' | 'proper') => {
      if (!isTdseDensityView(view)) return
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          [D]: { ...state.schroedinger[D], densityView: view },
        },
      }))
    },
    /**
     * Clamp the Wave 6 overlay opacity into `[0, 1]`. Render-only.
     */
    setCurvatureOverlayOpacity: nestedClampedSetter(ctx, D, 'curvatureOverlayOpacity', 0, 1),
    /**
     * Set the spatial metric for the TDSE kinetic operator. A change of
     * `kind` or any kind-relevant parameter invalidates the running
     * wavefunction (the Laplace-Beltrami operator it was propagated under
     * no longer matches), so this setter flips `needsReset`. An idempotent
     * write — identical normalized config — is a no-op that leaves
     * `needsReset` untouched so harmless UI round-trips don't kick the
     * simulation.
     *
     * Each kind only retains its relevant fields; mismatched fields are
     * silently stripped to keep the stored config small and semantically
     * clean. Invalid / non-finite numeric params are clamped to the
     * matching bound and a dev-mode warning is emitted.
     */
    setTdseMetric: (cfg: MetricConfig) => {
      ctx.setWithVersion((state) => {
        const prev: MetricConfig = state.schroedinger.tdse.metric ?? DEFAULT_METRIC_CONFIG
        const next = normalizeMetricForLattice(
          normalizeMetricConfig(cfg, prev),
          state.schroedinger.tdse.latticeDim
        )
        if (metricsEqual(prev, next)) return state
        return {
          schroedinger: {
            ...state.schroedinger,
            tdse: { ...state.schroedinger.tdse, metric: next, needsReset: true },
          },
        }
      })
    },
  }
}
