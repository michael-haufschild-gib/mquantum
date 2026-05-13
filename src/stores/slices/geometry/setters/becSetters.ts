/**
 * BEC (Gross-Pitaevskii) setter factory.
 *
 * Extracts all `setBec*`, `applyBecPreset`, and `resetBecField`
 * methods from the schroedingerSlice.
 *
 * @module stores/slices/geometry/setters/becSetters
 */

import { DEFAULT_BEC_CONFIG, type TdseDisorderDistribution } from '@/lib/geometry/extended/types'
import { reduceGridToFit } from '@/lib/math/ndArray'
import { clampKKState, computeEffectiveSpacing } from '@/lib/physics/compactification'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'
import {
  canApplyPresetRequest,
  createLatestPresetRequestGuard,
  loadPresetModule,
} from '@/stores/utils/dynamicPresetImport'

import { resizeBecArrays } from './becResize'
import {
  type BecSetters,
  isBecDisorderDistribution,
  isBecFieldView,
  isBecInitialCondition,
} from './becSetterDomain'
import {
  clampDtWithCfl,
  clampUint32Seed,
  computeCflLimit,
  defaultTdseGridPerDim,
  nestedClampedSetter,
  nestedIntSetter,
  type SetterContext,
  TDSE_MAX_TOTAL_SITES,
} from './sliceSetterUtils'

/**
 * Creates all BEC setter actions for the schroedingerSlice.
 * @param ctx - Shared setter context with set/get and validation helpers
 */
export function createBecSetters(ctx: SetterContext): BecSetters {
  const { setWithVersion, isFinite, warnNonFinite, hasOnlyFinite } = ctx
  const D = 'bec' as const
  const beginPresetRequest = createLatestPresetRequestGuard()
  const setBooleanField = (
    field: 'autoScale' | 'absorberEnabled' | 'diagnosticsEnabled' | 'hawkingPairInjection',
    value: boolean
  ) => {
    if (typeof value !== 'boolean') return
    setWithVersion((state) => ({
      schroedinger: {
        ...state.schroedinger,
        bec: { ...state.schroedinger.bec, [field]: value },
      },
    }))
  }

  return {
    setBecInteractionStrength: nestedClampedSetter(ctx, D, 'interactionStrength', -1000, 10000),
    setBecTrapOmega: nestedClampedSetter(ctx, D, 'trapOmega', 0.01, 10.0),
    setBecTrapAnisotropy: (dimIndex, ratio) => {
      if (!isFinite(ratio)) {
        warnNonFinite('bec.trapAnisotropy', ratio)
        return
      }
      const clamped = Math.max(0.1, Math.min(10.0, ratio))
      setWithVersion((state) => {
        const arr = [...state.schroedinger.bec.trapAnisotropy]
        if (dimIndex >= 0 && dimIndex < arr.length) {
          arr[dimIndex] = clamped
        }
        return {
          schroedinger: {
            ...state.schroedinger,
            bec: { ...state.schroedinger.bec, trapAnisotropy: arr },
          },
        }
      })
    },
    setBecInitialCondition: (condition) => {
      if (!isBecInitialCondition(condition)) return
      setWithVersion((state) => {
        const bec = state.schroedinger.bec
        const fieldView =
          condition !== 'blackHoleAnalog' && bec.fieldView === 'hawkingFlux'
            ? 'density'
            : bec.fieldView
        return {
          schroedinger: {
            ...state.schroedinger,
            bec: { ...bec, initialCondition: condition, fieldView, needsReset: true },
          },
        }
      })
    },
    setBecFieldView: (view) => {
      if (!isBecFieldView(view)) return
      if (
        view === 'hawkingFlux' &&
        ctx.get().schroedinger.bec.initialCondition !== 'blackHoleAnalog'
      ) {
        return
      }
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, fieldView: view },
        },
      }))
    },
    setBecVortexCharge: (charge) => {
      if (!isFinite(charge)) {
        warnNonFinite('bec.vortexCharge', charge)
        return
      }
      const clamped = Math.max(-4, Math.min(4, Math.round(charge)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, vortexCharge: clamped, needsReset: true },
        },
      }))
    },
    setBecVortexLatticeCount: (count) => {
      if (!isFinite(count)) {
        warnNonFinite('bec.vortexLatticeCount', count)
        return
      }
      const clamped = Math.max(1, Math.min(16, Math.round(count)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, vortexLatticeCount: clamped, needsReset: true },
        },
      }))
    },
    setBecVortexPlane1: (plane) => {
      if (!Array.isArray(plane) || plane.length < 2 || !hasOnlyFinite(plane)) {
        warnNonFinite('bec.vortexPlane1', plane)
        return
      }
      const latDim = useGeometryStore.getState().dimension
      const a = Math.max(0, Math.min(latDim - 1, Math.round(plane[0])))
      const b = Math.max(0, Math.min(latDim - 1, Math.round(plane[1])))
      if (a === b) return // axes must differ
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: {
            ...state.schroedinger.bec,
            vortexPlane1: [a, b] as [number, number],
            needsReset: true,
          },
        },
      }))
    },
    setBecVortexPlane2: (plane) => {
      if (!Array.isArray(plane) || plane.length < 2 || !hasOnlyFinite(plane)) {
        warnNonFinite('bec.vortexPlane2', plane)
        return
      }
      const latDim = useGeometryStore.getState().dimension
      const a = Math.max(0, Math.min(latDim - 1, Math.round(plane[0])))
      const b = Math.max(0, Math.min(latDim - 1, Math.round(plane[1])))
      if (a === b) return
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: {
            ...state.schroedinger.bec,
            vortexPlane2: [a, b] as [number, number],
            needsReset: true,
          },
        },
      }))
    },
    setBecVortexSeparation: (sep) => {
      if (!isFinite(sep)) return
      const clamped = Math.max(0, Math.min(5.0, sep))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, vortexSeparation: clamped, needsReset: true },
        },
      }))
    },
    setBecVortexPairCount: (count) => {
      if (!isFinite(count)) {
        warnNonFinite('bec.vortexPairCount', count)
        return
      }
      const clamped = Math.max(1, Math.min(2, Math.round(count)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, vortexPairCount: clamped, needsReset: true },
        },
      }))
    },
    setBecSolitonDepth: (depth) => {
      if (!isFinite(depth)) return
      const clamped = Math.max(0, Math.min(1, depth))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, solitonDepth: clamped, needsReset: true },
        },
      }))
    },
    setBecSolitonVelocity: (velocity) => {
      if (!isFinite(velocity)) return
      const clamped = Math.max(-1, Math.min(1, velocity))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, solitonVelocity: clamped, needsReset: true },
        },
      }))
    },
    setBecHawkingVmax: (v) => {
      if (!isFinite(v)) {
        warnNonFinite('bec.hawkingVmax', v)
        return
      }
      const clamped = Math.max(0.5, Math.min(5.0, v))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, hawkingVmax: clamped, needsReset: true },
        },
      }))
    },
    setBecHawkingLh: (lh) => {
      if (!isFinite(lh)) {
        warnNonFinite('bec.hawkingLh', lh)
        return
      }
      const clamped = Math.max(0.1, Math.min(1.5, lh))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, hawkingLh: clamped, needsReset: true },
        },
      }))
    },
    setBecHawkingDeltaN: (dn) => {
      if (!isFinite(dn)) {
        warnNonFinite('bec.hawkingDeltaN', dn)
        return
      }
      const clamped = Math.max(0, Math.min(0.6, dn))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, hawkingDeltaN: clamped, needsReset: true },
        },
      }))
    },
    setBecHawkingPairInjection: (enabled) => {
      setBooleanField('hawkingPairInjection', enabled)
    },
    setBecHawkingInjectRate: (rate) => {
      if (!isFinite(rate)) {
        warnNonFinite('bec.hawkingInjectRate', rate)
        return
      }
      const clamped = Math.max(0, Math.min(0.5, rate))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, hawkingInjectRate: clamped },
        },
      }))
    },
    setBecHawkingSeed: (seed) => {
      if (!isFinite(seed)) return
      const clamped = clampUint32Seed(seed)
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, hawkingSeed: clamped, needsReset: true },
        },
      }))
    },
    // Anderson-style disorder overlay on the trap potential.
    // Mirrors TDSE's disorder plumbing — the same generic dispatcher runs
    // because BEC shares the TDSE compute pass (see TdseBecConfigBuilder).
    setBecDisorderStrength: nestedClampedSetter(ctx, D, 'disorderStrength', 0, 100),
    setBecDisorderSeed: (seed: number) => {
      if (!isFinite(seed)) {
        warnNonFinite('bec.disorderSeed', seed)
        return
      }
      const clamped = clampUint32Seed(seed)
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, disorderSeed: clamped },
        },
      }))
    },
    setBecDisorderDistribution: (distribution: TdseDisorderDistribution) => {
      if (!isBecDisorderDistribution(distribution)) return
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, disorderDistribution: distribution },
        },
      }))
    },
    setBecAutoScale: (autoScale) => {
      setBooleanField('autoScale', autoScale)
    },
    setBecAbsorberEnabled: (enabled) => {
      setBooleanField('absorberEnabled', enabled)
    },
    setBecAbsorberWidth: nestedClampedSetter(ctx, D, 'absorberWidth', 0.05, 0.5),
    setBecPmlTargetReflection: nestedClampedSetter(ctx, D, 'pmlTargetReflection', 1e-12, 0.999),
    setBecDiagnosticsEnabled: (enabled) => {
      setBooleanField('diagnosticsEnabled', enabled)
    },
    setBecDiagnosticsInterval: nestedIntSetter(ctx, D, 'diagnosticsInterval', 1, 60),
    setBecDt: (dt) => {
      if (!isFinite(dt)) {
        warnNonFinite('bec.dt', dt)
        return
      }
      setWithVersion((state) => {
        const { gridSize, spacing, compactDims, compactRadii, latticeDim, mass } =
          state.schroedinger.bec
        // CFL must be evaluated on the EFFECTIVE spacing (2π·R/N for compact
        // dims), not the raw user-set spacing. With small compactRadii the
        // effective spacing is far below raw, so the actual stability bound
        // is much tighter — using raw spacing here lets the user push dt
        // above the real CFL and the GP integrator goes unstable.
        const effSpacing = computeEffectiveSpacing(
          gridSize,
          spacing,
          compactDims,
          compactRadii,
          latticeDim
        )
        const cflLimit = computeCflLimit(effSpacing, latticeDim, mass)
        const maxDt = Math.min(0.05, cflLimit * 0.9)
        const clamped = Math.max(0.0001, Math.min(maxDt, dt))
        return {
          schroedinger: {
            ...state.schroedinger,
            bec: { ...state.schroedinger.bec, dt: clamped },
          },
        }
      })
    },
    setBecStepsPerFrame: nestedIntSetter(ctx, D, 'stepsPerFrame', 1, 16),
    setBecMass: (mass) => {
      if (!isFinite(mass)) return
      const clamped = Math.max(0.1, Math.min(10, mass))
      setWithVersion((state) => {
        const bec = state.schroedinger.bec
        const kk = clampKKState(
          bec.dt,
          bec.gridSize,
          bec.spacing,
          bec.compactDims,
          bec.compactRadii,
          bec.latticeDim,
          clamped,
          clampDtWithCfl
        )
        return {
          schroedinger: {
            ...state.schroedinger,
            bec: { ...bec, mass: clamped, ...kk },
          },
        }
      })
    },
    setBecHbar: nestedClampedSetter(ctx, D, 'hbar', 0.1, 10),
    setBecGridSize: (size) => {
      if (!hasOnlyFinite(size)) {
        warnNonFinite('bec.gridSize', size)
        return
      }
      setWithVersion((state) => {
        const { latticeDim } = state.schroedinger.bec
        const gridDefault = defaultTdseGridPerDim(latticeDim)
        const minGrid = Math.max(2, gridDefault)
        const snapped = Array.from({ length: latticeDim }, (_, i) => {
          const s = i < size.length ? size[i]! : minGrid
          const val = Math.max(2, Math.min(128, Math.round(s)))
          const log2 = Math.round(Math.log2(val))
          return Math.max(2, Math.min(gridDefault, 2 ** log2))
        })
        reduceGridToFit(snapped, TDSE_MAX_TOTAL_SITES)
        const bec = state.schroedinger.bec
        const kk = clampKKState(
          bec.dt,
          snapped,
          bec.spacing,
          bec.compactDims,
          bec.compactRadii,
          latticeDim,
          bec.mass,
          clampDtWithCfl
        )
        return {
          schroedinger: {
            ...state.schroedinger,
            bec: { ...bec, gridSize: snapped, ...kk, needsReset: true },
          },
        }
      })
    },
    setBecSpacing: (spacing) => {
      if (!hasOnlyFinite(spacing)) {
        warnNonFinite('bec.spacing', spacing)
        return
      }
      setWithVersion((state) => {
        const bec = state.schroedinger.bec
        const clamped = Array.from({ length: bec.latticeDim }, (_, i) => {
          const s = i < spacing.length ? spacing[i]! : 0.15
          return Math.max(0.01, Math.min(1.0, s))
        })
        const kk = clampKKState(
          bec.dt,
          bec.gridSize,
          clamped,
          bec.compactDims,
          bec.compactRadii,
          bec.latticeDim,
          bec.mass,
          clampDtWithCfl
        )
        return {
          schroedinger: {
            ...state.schroedinger,
            bec: { ...bec, spacing: clamped, ...kk, needsReset: true },
          },
        }
      })
    },
    setBecSlicePosition: (dimIndex, value) => {
      if (!isFinite(value)) return
      const clamped = Math.max(-1, Math.min(1, value))
      setWithVersion((state) => {
        const arr = [...state.schroedinger.bec.slicePositions]
        if (dimIndex >= 0 && dimIndex < arr.length) {
          arr[dimIndex] = clamped
        }
        return {
          schroedinger: {
            ...state.schroedinger,
            bec: { ...state.schroedinger.bec, slicePositions: arr },
          },
        }
      })
    },
    setBecCompactDim: (dimIndex, compact) => {
      if (typeof compact !== 'boolean') return
      setWithVersion((state) => {
        const bec = state.schroedinger.bec
        const compactDims = [...(bec.compactDims ?? [])]
        if (dimIndex >= 0 && dimIndex < bec.latticeDim) {
          while (compactDims.length < bec.latticeDim) compactDims.push(false)
          compactDims[dimIndex] = compact
        }
        const kk = clampKKState(
          bec.dt,
          bec.gridSize,
          bec.spacing,
          compactDims,
          bec.compactRadii,
          bec.latticeDim,
          bec.mass,
          clampDtWithCfl
        )
        return {
          schroedinger: {
            ...state.schroedinger,
            bec: { ...bec, compactDims, ...kk, needsReset: true },
          },
        }
      })
    },
    setBecCompactRadius: (dimIndex, radius) => {
      if (!isFinite(radius)) {
        warnNonFinite('bec.compactRadii', radius)
        return
      }
      setWithVersion((state) => {
        const bec = state.schroedinger.bec
        const rawRadii = [...(bec.compactRadii ?? [])]
        if (dimIndex >= 0 && dimIndex < bec.latticeDim) {
          while (rawRadii.length < bec.latticeDim) rawRadii.push(0.15)
          rawRadii[dimIndex] = radius
        }
        const kk = clampKKState(
          bec.dt,
          bec.gridSize,
          bec.spacing,
          bec.compactDims,
          rawRadii,
          bec.latticeDim,
          bec.mass,
          clampDtWithCfl
        )
        return {
          schroedinger: {
            ...state.schroedinger,
            bec: { ...bec, ...kk, needsReset: true },
          },
        }
      })
    },
    applyBecPreset: (presetId, options) => {
      const isLatestRequest = beginPresetRequest()
      return loadPresetModule(
        () => import('@/lib/physics/bec/presets'),
        'becSetters',
        `BEC presets for '${presetId}'`,
        ({ getBecPreset }) => {
          if (!canApplyPresetRequest(isLatestRequest, ctx.get().schroedinger.quantumMode, options))
            return
          const preset = getBecPreset(presetId)
          if (!preset) return
          setWithVersion((state) => {
            const globalDim = useGeometryStore.getState().dimension
            const {
              latticeDim: _presetDim,
              gridSize: _presetGrid,
              spacing: _presetSpacing,
              trapAnisotropy: _presetAniso,
              slicePositions: _presetSlice,
              ...safeOverrides
            } = preset.overrides
            const merged = {
              ...DEFAULT_BEC_CONFIG,
              ...safeOverrides,
              slicePositions: state.schroedinger.bec.slicePositions,
              needsReset: true,
            }
            const resized = resizeBecArrays(merged, globalDim)
            const parentAbsorber =
              preset.overrides.absorberEnabled !== undefined
                ? {
                    absorberEnabled: preset.overrides.absorberEnabled,
                    absorberWidth:
                      preset.overrides.absorberWidth ?? state.schroedinger.absorberWidth,
                  }
                : {}
            return {
              schroedinger: {
                ...state.schroedinger,
                ...preset.renderingOverrides,
                ...parentAbsorber,
                bec: { ...merged, ...resized, needsReset: true },
              },
            }
          })
          useDiagnosticsStore.getState().resetBec()
        }
      )
    },
    resetBecField: () => {
      useDiagnosticsStore.getState().resetBec()
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, needsReset: true },
        },
      }))
    },
  }
}
