/**
 * TDSE (Time-Dependent Schroedinger Equation) setter factory.
 *
 * Extracts all `setTdse*`, `applyTdsePreset`, and `resetTdseField`
 * methods from the schroedingerSlice.
 *
 * @module stores/slices/geometry/setters/tdseSetters
 */

import {
  DEFAULT_TDSE_CONFIG,
  isTdseInitialCondition,
  isTdsePotentialType,
  type TdseConfig,
  type TdseDisorderDistribution,
  type TdseDriveWaveform,
  type TdseFieldView,
  type TdseInitialCondition,
  type TdsePotentialType,
} from '@/lib/geometry/extended/types'
import { reduceGridToFit } from '@/lib/math/ndArray'
import { clampKKState, computeEffectiveSpacing } from '@/lib/physics/compactification'
import { type MetricConfig, normalizeMetricForLattice } from '@/lib/physics/tdse/metrics/types'
import { normalizeMirrorAxisForLattice } from '@/lib/physics/tdse/wormholeCoupling'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'
import {
  canApplyPresetRequest,
  createLatestPresetRequestGuard,
  loadPresetModule,
  type SchroedingerPresetApplyOptions,
} from '@/stores/utils/dynamicPresetImport'

import {
  clampDtWithCfl,
  computeCflLimit,
  defaultTdseGridPerDim,
  nestedClampedSetter,
  nestedIntSetter,
  type SetterContext,
  TDSE_MAX_TOTAL_SITES,
} from './sliceSetterUtils'
import { createTdsePotentialSetters } from './tdsePotentialSetters'
import { createTdseStochasticSetters, type TdseStochasticSetters } from './tdseStochasticSetters'
import { createTdseUiSetters } from './tdseUiSetters'

/** Actions exposed by the TDSE setter bundle (including stochastic, potential, UI sub-bundles). */
export interface TdseSetters extends TdseStochasticSetters {
  setTdseLatticeDim: (dim: number) => void
  setTdseGridSize: (size: number[]) => void
  setTdseSpacing: (spacing: number[]) => void
  setTdseMass: (mass: number) => void
  setTdseHbar: (hbar: number) => void
  setTdseDt: (dt: number) => void
  setTdseStepsPerFrame: (steps: number) => void
  setTdseInitialCondition: (condition: TdseInitialCondition) => void
  setTdsePacketCenter: (center: number[]) => void
  setTdsePacketWidth: (width: number) => void
  setTdsePacketAmplitude: (amplitude: number) => void
  setTdsePacketMomentum: (momentum: number[]) => void
  setTdsePotentialType: (type: TdsePotentialType) => void
  setTdseBarrierHeight: (height: number) => void
  setTdseBarrierWidth: (width: number) => void
  setTdseBarrierCenter: (center: number) => void
  setTdseWellDepth: (depth: number) => void
  setTdseWellWidth: (width: number) => void
  setTdseHarmonicOmega: (omega: number) => void
  setTdseStepHeight: (height: number) => void
  setTdseSlitSeparation: (separation: number) => void
  setTdseSlitWidth: (width: number) => void
  setTdseWallThickness: (thickness: number) => void
  setTdseWallHeight: (height: number) => void
  setTdseLatticeDepth: (depth: number) => void
  setTdseLatticePeriod: (period: number) => void
  setTdseDoubleWellLambda: (lambda: number) => void
  setTdseDoubleWellSeparation: (separation: number) => void
  setTdseDoubleWellAsymmetry: (asymmetry: number) => void
  setTdseRadialWellInner: (r: number) => void
  setTdseRadialWellOuter: (r: number) => void
  setTdseRadialWellDepth: (depth: number) => void
  setTdseRadialWellTilt: (tilt: number) => void
  setTdseAnharmonicLambda: (lambda: number) => void
  setTdseBhMass: (mass: number) => void
  setTdseBhMultipoleL: (ell: number) => void
  setTdseBhSpin: (spin: number) => void
  setTdseDisorderStrength: (strength: number) => void
  setTdseDisorderSeed: (seed: number) => void
  setTdseDriveEnabled: (enabled: boolean) => void
  setTdseDriveWaveform: (waveform: TdseDriveWaveform) => void
  setTdseDriveFrequency: (frequency: number) => void
  setTdseDriveAmplitude: (amplitude: number) => void
  setTdseDisorderDistribution: (distribution: TdseDisorderDistribution) => void
  setTdseAbsorberEnabled: (enabled: boolean) => void
  setTdseAbsorberWidth: (width: number) => void
  setTdsePmlTargetReflection: (r: number) => void
  setTdseFieldView: (view: TdseFieldView) => void
  setTdseAutoScale: (autoScale: boolean) => void
  setTdseShowPotential: (show: boolean) => void
  setTdseAutoLoop: (autoLoop: boolean) => void
  setTdseDiagnosticsEnabled: (enabled: boolean) => void
  setTdseDiagnosticsInterval: (interval: number) => void
  setTdseObservablesEnabled: (enabled: boolean) => void
  setTdseImaginaryTimeEnabled: (enabled: boolean) => void
  setTdseCustomPotentialExpression: (expression: string) => void
  setTdseSlicePosition: (dimIndex: number, value: number) => void
  setTdseCompactDim: (dimIndex: number, compact: boolean) => void
  setTdseCompactRadius: (dimIndex: number, radius: number) => void
  applyTdsePreset: (presetId: string, options?: SchroedingerPresetApplyOptions) => Promise<void>
  resetTdseField: () => void
  // ER=EPR Double-trace Wormhole Coupling
  setTdseWormholeEnabled: (enabled: boolean) => void
  setTdseWormholeG: (g: number) => void
  setTdseWormholeAxis: (axis: number) => void
  setTdseWormholeHudEnabled: (enabled: boolean) => void
  // Curved-space kinetic operator (Laplace–Beltrami)
  setTdseMetric: (cfg: MetricConfig) => void
  // Curved-space TDSE v2 — Wave 6 visualization (render-only)
  setShowCurvatureOverlay: (enabled: boolean) => void
  setDensityView: (view: 'coordinate' | 'proper') => void
  setCurvatureOverlayOpacity: (opacity: number) => void
}

/**
 * Resize TDSE arrays to match a new latticeDim, preserving existing values
 * where possible and filling new dimensions with defaults.
 */
export const resizeTdseArrays = (prev: TdseConfig, newDim: number): Partial<TdseConfig> => {
  const gridDefault = defaultTdseGridPerDim(newDim)
  const gridSize = Array.from({ length: newDim }, () => gridDefault)
  // Compute spacing for preserved dimensions first, then use dim-0 spacing as
  // default for new dimensions. The old hardcoded 0.1 created severe asymmetries
  // (up to 10:1 extent ratio) that made higher-dim TDSE look broken.
  const dim0Spacing =
    prev.gridSize.length > 0 && prev.spacing.length > 0
      ? Math.max(0.01, Math.min(1.0, (prev.gridSize[0]! * prev.spacing[0]!) / gridDefault))
      : 0.1
  const spacing = Array.from({ length: newDim }, (_, i) => {
    if (i < prev.spacing.length && i < prev.gridSize.length) {
      const oldExtent = prev.gridSize[i]! * prev.spacing[i]!
      return Math.max(0.01, Math.min(1.0, oldExtent / gridDefault))
    }
    return dim0Spacing
  })
  const packetCenter = Array.from({ length: newDim }, (_, i) =>
    i < prev.packetCenter.length ? prev.packetCenter[i]! : 0
  )
  const packetMomentum = Array.from({ length: newDim }, (_, i) =>
    i < prev.packetMomentum.length ? prev.packetMomentum[i]! : 0
  )
  const slicePositions = Array.from({ length: Math.max(0, newDim - 3) }, (_, i) =>
    i < prev.slicePositions.length ? prev.slicePositions[i]! : 0
  )
  const minFeature0 = 2 * spacing[0]!
  const minFeature1 = newDim >= 2 ? 2 * spacing[1]! : minFeature0
  const wallThickness = Math.max(prev.wallThickness, minFeature0)
  const barrierWidth = Math.max(prev.barrierWidth, minFeature0)
  const slitWidth = Math.max(prev.slitWidth, minFeature1)
  const packetWidth = Math.max(prev.packetWidth, minFeature0)
  const slitSeparation = Math.max(prev.slitSeparation, slitWidth + minFeature1)

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
    prev.mass,
    clampDtWithCfl
  )
  return {
    latticeDim: newDim,
    gridSize,
    spacing,
    packetCenter,
    packetMomentum,
    slicePositions,
    compactDims,
    compactRadii: kk.compactRadii,
    dt: kk.dt,
    wallThickness,
    barrierWidth,
    slitWidth,
    slitSeparation,
    packetWidth,
    wormholeMirrorAxis: normalizeMirrorAxisForLattice(prev.wormholeMirrorAxis, newDim),
  }
}

const normalizeTdseVector = (
  values: number[],
  fallback: readonly number[],
  latticeDim: number
): number[] => {
  const dim = Math.max(
    1,
    Math.min(
      11,
      Math.floor(Number.isFinite(latticeDim) ? latticeDim : DEFAULT_TDSE_CONFIG.latticeDim)
    )
  )
  return Array.from({ length: dim }, (_, i) => {
    const next = values[i]
    if (Number.isFinite(next)) return next!
    const prev = fallback[i]
    return Number.isFinite(prev) ? prev! : 0
  })
}

function isValidIndex(index: number, upperBoundExclusive: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < upperBoundExclusive
}

/**
 * Creates all TDSE-related setter actions for the schroedingerSlice.
 * @param ctx - Shared setter context with set/get and validation helpers
 */
export function createTdseSetters(ctx: SetterContext): TdseSetters {
  const { setWithVersion, isFinite, warnNonFinite, hasOnlyFinite } = ctx
  const D = 'tdse' as const
  const beginPresetRequest = createLatestPresetRequestGuard()

  return {
    setTdseLatticeDim: (dim) => {
      if (!isFinite(dim)) {
        warnNonFinite('tdse.latticeDim', dim)
        return
      }
      const clamped = Math.max(1, Math.min(11, Math.floor(dim)))
      setWithVersion((state) => {
        const prev = state.schroedinger.tdse
        const resized = resizeTdseArrays(prev, clamped)
        const potentialType =
          clamped < 2 && prev.potentialType === 'doubleSlit' ? 'barrier' : prev.potentialType
        const metric = normalizeMetricForLattice(prev.metric, clamped)
        return {
          schroedinger: {
            ...state.schroedinger,
            tdse: { ...prev, ...resized, potentialType, metric, needsReset: true },
          },
        }
      })
    },
    setTdseGridSize: (size) => {
      if (!hasOnlyFinite(size)) {
        warnNonFinite('tdse.gridSize', size)
        return
      }
      setWithVersion((state) => {
        const { latticeDim } = state.schroedinger.tdse
        const minGrid = Math.max(2, defaultTdseGridPerDim(latticeDim))
        const snapped = Array.from({ length: latticeDim }, (_, i) => {
          const s = i < size.length ? size[i]! : minGrid
          const val = Math.max(2, Math.min(128, Math.round(s)))
          const log2 = Math.round(Math.log2(val))
          return Math.max(2, Math.min(128, 2 ** log2))
        })
        const clamped = reduceGridToFit([...snapped], TDSE_MAX_TOTAL_SITES)
        const td = state.schroedinger.tdse
        const kk = clampKKState(
          td.dt,
          clamped,
          td.spacing,
          td.compactDims,
          td.compactRadii,
          latticeDim,
          td.mass,
          clampDtWithCfl
        )
        return {
          schroedinger: {
            ...state.schroedinger,
            tdse: { ...td, gridSize: clamped, ...kk, needsReset: true },
          },
        }
      })
    },
    setTdseSpacing: (spacing) => {
      if (!hasOnlyFinite(spacing)) {
        warnNonFinite('tdse.spacing', spacing)
        return
      }
      setWithVersion((state) => {
        const td = state.schroedinger.tdse
        const clamped = Array.from({ length: td.latticeDim }, (_, i) =>
          Math.max(0.01, Math.min(1.0, i < spacing.length ? spacing[i]! : 0.1))
        )
        const kk = clampKKState(
          td.dt,
          td.gridSize,
          clamped,
          td.compactDims,
          td.compactRadii,
          td.latticeDim,
          td.mass,
          clampDtWithCfl
        )
        return {
          schroedinger: {
            ...state.schroedinger,
            tdse: { ...td, spacing: clamped, ...kk, needsReset: true },
          },
        }
      })
    },
    setTdseMass: (mass) => {
      if (!isFinite(mass)) {
        warnNonFinite('tdse.mass', mass)
        return
      }
      const clamped = Math.max(0.01, Math.min(100.0, mass))
      setWithVersion((state) => {
        const td = state.schroedinger.tdse
        const kk = clampKKState(
          td.dt,
          td.gridSize,
          td.spacing,
          td.compactDims,
          td.compactRadii,
          td.latticeDim,
          clamped,
          clampDtWithCfl
        )
        return {
          schroedinger: {
            ...state.schroedinger,
            tdse: { ...td, mass: clamped, ...kk },
          },
        }
      })
    },
    setTdseHbar: nestedClampedSetter(ctx, D, 'hbar', 0.01, 10.0),
    setTdseDt: (dt) => {
      if (!isFinite(dt)) {
        warnNonFinite('tdse.dt', dt)
        return
      }
      setWithVersion((state) => {
        const td = state.schroedinger.tdse
        // CFL must be evaluated on the EFFECTIVE spacing (2π·R/N for compact
        // dims). With small compactRadii the effective spacing is far below
        // raw, so the actual stability bound is much tighter — clamping
        // against [0.0001, 0.05] alone lets the user push dt above the real
        // CFL once a compact dim is active and the integrator goes unstable.
        const effSpacing = computeEffectiveSpacing(
          td.gridSize,
          td.spacing,
          td.compactDims,
          td.compactRadii,
          td.latticeDim
        )
        const cflLimit = computeCflLimit(effSpacing, td.latticeDim, td.mass)
        const maxDt = Math.min(0.05, cflLimit * 0.9)
        const clamped = Math.max(0.0001, Math.min(maxDt, dt))
        return {
          schroedinger: {
            ...state.schroedinger,
            tdse: { ...td, dt: clamped },
          },
        }
      })
    },
    setTdseStepsPerFrame: nestedIntSetter(ctx, D, 'stepsPerFrame', 1, 16, 'floor'),
    setTdseInitialCondition: (condition) => {
      if (!isTdseInitialCondition(condition)) return
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, initialCondition: condition, needsReset: true },
        },
      }))
    },
    setTdsePacketCenter: (center) => {
      if (!Array.isArray(center) || !hasOnlyFinite(center)) {
        warnNonFinite('tdse.packetCenter', center)
        return
      }
      setWithVersion((state) => {
        const td = state.schroedinger.tdse
        return {
          schroedinger: {
            ...state.schroedinger,
            tdse: {
              ...td,
              packetCenter: normalizeTdseVector(center, td.packetCenter, td.latticeDim),
              needsReset: true,
            },
          },
        }
      })
    },
    setTdsePacketWidth: (width) => {
      if (!isFinite(width)) {
        warnNonFinite('tdse.packetWidth', width)
        return
      }
      const clamped = Math.max(0.01, Math.min(5.0, width))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, packetWidth: clamped, needsReset: true },
        },
      }))
    },
    setTdsePacketAmplitude: (amplitude) => {
      if (!isFinite(amplitude)) {
        warnNonFinite('tdse.packetAmplitude', amplitude)
        return
      }
      const clamped = Math.max(0.01, Math.min(10.0, amplitude))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, packetAmplitude: clamped, needsReset: true },
        },
      }))
    },
    setTdsePacketMomentum: (momentum) => {
      if (!Array.isArray(momentum) || !hasOnlyFinite(momentum)) {
        warnNonFinite('tdse.packetMomentum', momentum)
        return
      }
      setWithVersion((state) => {
        const td = state.schroedinger.tdse
        return {
          schroedinger: {
            ...state.schroedinger,
            tdse: {
              ...td,
              packetMomentum: normalizeTdseVector(momentum, td.packetMomentum, td.latticeDim),
              needsReset: true,
            },
          },
        }
      })
    },
    setTdsePotentialType: (potentialType) => {
      if (!isTdsePotentialType(potentialType)) return
      setWithVersion((state) => {
        const prev = state.schroedinger.tdse
        // Switching to or from the Regge–Wheeler ringdown potential reshapes
        // V(x) so dramatically that any stale wavefunction is visually and
        // physically meaningless. Force a reset whenever the BH potential is
        // on either side of the transition — but ONLY when the value actually
        // changes. An idempotent reassignment (same type on both sides) must
        // preserve the existing `needsReset` flag so unrelated clicks can't
        // cause the wavefunction to snap back to the packet mid-evolution.
        const bhTransition =
          prev.potentialType !== potentialType &&
          (prev.potentialType === 'blackHoleRingdown' || potentialType === 'blackHoleRingdown')
        // CSL decoherence is physically meaningless for the Regge–Wheeler
        // equation (classical wave scattering, not quantum measurement).
        // Disable stochastic + branching when entering BH ringdown so
        // stale state doesn't block unrelated controls (e.g. color algorithm).
        const disableCSL = potentialType === 'blackHoleRingdown'
        return {
          schroedinger: {
            ...state.schroedinger,
            tdse: {
              ...prev,
              potentialType,
              needsReset: bhTransition ? true : prev.needsReset,
              ...(disableCSL && { stochasticEnabled: false, branchingEnabled: false }),
            },
          },
        }
      })
    },
    // Potential and drive parameter setters (data-driven, extracted to tdsePotentialSetters.ts)
    ...(createTdsePotentialSetters(ctx) as unknown as Pick<
      TdseSetters,
      | 'setTdseBarrierHeight'
      | 'setTdseBarrierWidth'
      | 'setTdseBarrierCenter'
      | 'setTdseWellDepth'
      | 'setTdseWellWidth'
      | 'setTdseHarmonicOmega'
      | 'setTdseStepHeight'
      | 'setTdseSlitSeparation'
      | 'setTdseSlitWidth'
      | 'setTdseWallThickness'
      | 'setTdseWallHeight'
      | 'setTdseLatticeDepth'
      | 'setTdseLatticePeriod'
      | 'setTdseDoubleWellLambda'
      | 'setTdseDoubleWellSeparation'
      | 'setTdseDoubleWellAsymmetry'
      | 'setTdseRadialWellInner'
      | 'setTdseRadialWellOuter'
      | 'setTdseRadialWellDepth'
      | 'setTdseRadialWellTilt'
      | 'setTdseAnharmonicLambda'
      | 'setTdseBhMass'
      | 'setTdseBhMultipoleL'
      | 'setTdseBhSpin'
      | 'setTdseDisorderStrength'
      | 'setTdseDisorderSeed'
      | 'setTdseDriveEnabled'
      | 'setTdseDriveWaveform'
      | 'setTdseDriveFrequency'
      | 'setTdseDriveAmplitude'
    >),
    // UI, diagnostic, absorber, and disorder setters (extracted to tdseUiSetters.ts)
    ...createTdseUiSetters(ctx),
    setTdseSlicePosition: (dimIndex, value) => {
      if (!isFinite(value)) {
        warnNonFinite('tdse.slicePositions', value)
        return
      }
      if (!isValidIndex(dimIndex, ctx.get().schroedinger.tdse.slicePositions.length)) return
      setWithVersion((state) => {
        const td = state.schroedinger.tdse
        const slicePositions = [...td.slicePositions]
        const halfExtent =
          (td.gridSize[dimIndex + 3] ?? 1) * (td.spacing[dimIndex + 3] ?? 0.1) * 0.5
        slicePositions[dimIndex] = Math.max(-halfExtent, Math.min(halfExtent, value))
        return {
          schroedinger: {
            ...state.schroedinger,
            tdse: { ...td, slicePositions },
          },
        }
      })
    },
    setTdseCompactDim: (dimIndex, compact) => {
      if (typeof compact !== 'boolean') return
      if (!isValidIndex(dimIndex, ctx.get().schroedinger.tdse.latticeDim)) return
      setWithVersion((state) => {
        const td = state.schroedinger.tdse
        const compactDims = [...(td.compactDims ?? [])]
        while (compactDims.length < td.latticeDim) compactDims.push(false)
        compactDims[dimIndex] = compact
        const kk = clampKKState(
          td.dt,
          td.gridSize,
          td.spacing,
          compactDims,
          td.compactRadii,
          td.latticeDim,
          td.mass,
          clampDtWithCfl
        )
        return {
          schroedinger: {
            ...state.schroedinger,
            tdse: { ...td, compactDims, ...kk, needsReset: true },
          },
        }
      })
    },
    setTdseCompactRadius: (dimIndex, radius) => {
      if (!isFinite(radius)) {
        warnNonFinite('tdse.compactRadii', radius)
        return
      }
      if (!isValidIndex(dimIndex, ctx.get().schroedinger.tdse.latticeDim)) return
      setWithVersion((state) => {
        const td = state.schroedinger.tdse
        const rawRadii = [...(td.compactRadii ?? [])]
        while (rawRadii.length < td.latticeDim) rawRadii.push(0.15)
        rawRadii[dimIndex] = radius
        const kk = clampKKState(
          td.dt,
          td.gridSize,
          td.spacing,
          td.compactDims,
          rawRadii,
          td.latticeDim,
          td.mass,
          clampDtWithCfl
        )
        return {
          schroedinger: {
            ...state.schroedinger,
            tdse: { ...td, ...kk, needsReset: true },
          },
        }
      })
    },
    applyTdsePreset: (presetId, options) => {
      const isLatestRequest = beginPresetRequest()
      return loadPresetModule(
        () => import('@/lib/physics/tdse/presets'),
        'tdseSetters',
        `TDSE presets for '${presetId}'`,
        ({ getTdsePreset }) => {
          if (!canApplyPresetRequest(isLatestRequest, ctx.get().schroedinger.quantumMode, options))
            return
          const preset = getTdsePreset(presetId)
          if (!preset) return
          setWithVersion((state) => {
            const globalDim = useGeometryStore.getState().dimension
            const { latticeDim: _presetDim, ...safeOverrides } = preset.overrides
            const base = {
              ...DEFAULT_TDSE_CONFIG,
              ...safeOverrides,
              slicePositions: state.schroedinger.tdse.slicePositions,
              needsReset: true,
            }
            const resized = resizeTdseArrays(base, globalDim)
            const potentialType =
              globalDim < 2 && base.potentialType === 'doubleSlit'
                ? ('barrier' as const)
                : base.potentialType
            const parentAbsorber =
              preset.overrides.absorberEnabled !== undefined
                ? {
                    absorberEnabled: preset.overrides.absorberEnabled,
                    absorberWidth:
                      preset.overrides.absorberWidth ?? state.schroedinger.absorberWidth,
                    pmlTargetReflection:
                      preset.overrides.pmlTargetReflection ??
                      state.schroedinger.pmlTargetReflection,
                  }
                : {}
            return {
              schroedinger: {
                ...state.schroedinger,
                ...preset.renderingOverrides,
                ...parentAbsorber,
                tdse: { ...base, ...resized, potentialType, needsReset: true },
              },
            }
          })
          useDiagnosticsStore.getState().resetTdse()
        }
      )
    },
    resetTdseField: () => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          tdse: { ...state.schroedinger.tdse, needsReset: true },
        },
      }))
    },
    ...createTdseStochasticSetters(ctx),
  }
}
