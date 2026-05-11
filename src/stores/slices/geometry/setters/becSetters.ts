/**
 * BEC (Gross-Pitaevskii) setter factory.
 *
 * Extracts all `setBec*`, `applyBecPreset`, and `resetBecField`
 * methods from the schroedingerSlice.
 *
 * @module stores/slices/geometry/setters/becSetters
 */

import {
  type BecConfig,
  type BecFieldView,
  type BecInitialCondition,
  DEFAULT_BEC_CONFIG,
  type TdseDisorderDistribution,
} from '@/lib/geometry/extended/types'
import { reduceGridToFit } from '@/lib/math/ndArray'
import { thomasFermiMuND, thomasFermiRadius } from '@/lib/physics/bec/chemicalPotential'
import { clampKKState, computeEffectiveSpacing } from '@/lib/physics/compactification'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'
import { beginDynamicPresetApply, loadPresetModule } from '@/stores/utils/dynamicPresetImport'

import {
  clampDtWithCfl,
  computeCflLimit,
  defaultTdseGridPerDim,
  nestedClampedSetter,
  nestedIntSetter,
  nestedValueSetter,
  type SetterContext,
  TDSE_MAX_TOTAL_SITES,
} from './sliceSetterUtils'

/** Actions exposed by the BEC (Gross-Pitaevskii) setter bundle. */
export interface BecSetters {
  setBecInteractionStrength: (g: number) => void
  setBecTrapOmega: (omega: number) => void
  setBecTrapAnisotropy: (dimIndex: number, ratio: number) => void
  setBecInitialCondition: (condition: BecInitialCondition) => void
  setBecFieldView: (view: BecFieldView) => void
  setBecVortexCharge: (charge: number) => void
  setBecVortexLatticeCount: (count: number) => void
  setBecVortexPlane1: (plane: [number, number]) => void
  setBecVortexPlane2: (plane: [number, number]) => void
  setBecVortexSeparation: (sep: number) => void
  setBecVortexPairCount: (count: number) => void
  setBecSolitonDepth: (depth: number) => void
  setBecSolitonVelocity: (velocity: number) => void
  setBecHawkingVmax: (v: number) => void
  setBecHawkingLh: (lh: number) => void
  setBecHawkingDeltaN: (dn: number) => void
  setBecHawkingPairInjection: (enabled: boolean) => void
  setBecHawkingInjectRate: (rate: number) => void
  setBecHawkingSeed: (seed: number) => void
  setBecDisorderStrength: (strength: number) => void
  setBecDisorderSeed: (seed: number) => void
  setBecDisorderDistribution: (distribution: TdseDisorderDistribution) => void
  setBecAutoScale: (autoScale: boolean) => void
  setBecAbsorberEnabled: (enabled: boolean) => void
  setBecAbsorberWidth: (width: number) => void
  setBecPmlTargetReflection: (r: number) => void
  setBecDiagnosticsEnabled: (enabled: boolean) => void
  setBecDiagnosticsInterval: (interval: number) => void
  setBecDt: (dt: number) => void
  setBecStepsPerFrame: (steps: number) => void
  setBecMass: (mass: number) => void
  setBecHbar: (hbar: number) => void
  setBecGridSize: (size: number[]) => void
  setBecSpacing: (spacing: number[]) => void
  setBecSlicePosition: (dimIndex: number, value: number) => void
  setBecCompactDim: (dimIndex: number, compact: boolean) => void
  setBecCompactRadius: (dimIndex: number, radius: number) => void
  applyBecPreset: (presetId: string) => Promise<void>
  resetBecField: () => void
}

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
  const mass = prev.mass ?? 1.0
  const mu = g > 0 ? thomasFermiMuND(newDim, g, omega) : 0
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

/**
 * Creates all BEC setter actions for the schroedingerSlice.
 * @param ctx - Shared setter context with set/get and validation helpers
 */
export function createBecSetters(ctx: SetterContext): BecSetters {
  const { setWithVersion, isFinite, warnNonFinite, hasOnlyFinite } = ctx
  const D = 'bec' as const

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
      const clamped = Math.max(-4, Math.min(4, Math.round(charge)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, vortexCharge: clamped, needsReset: true },
        },
      }))
    },
    setBecVortexLatticeCount: (count) => {
      const clamped = Math.max(1, Math.min(16, Math.round(count)))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, vortexLatticeCount: clamped, needsReset: true },
        },
      }))
    },
    setBecVortexPlane1: (plane) => {
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
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, hawkingPairInjection: !!enabled },
        },
      }))
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
      const clamped = Math.max(0, Math.floor(seed)) >>> 0
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
      const clamped = Math.floor(Math.max(0, seed))
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, disorderSeed: clamped },
        },
      }))
    },
    setBecDisorderDistribution: (distribution: TdseDisorderDistribution) => {
      setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          bec: { ...state.schroedinger.bec, disorderDistribution: distribution },
        },
      }))
    },
    setBecAutoScale: nestedValueSetter(ctx, D, 'autoScale'),
    setBecAbsorberEnabled: nestedValueSetter(ctx, D, 'absorberEnabled'),
    setBecAbsorberWidth: nestedClampedSetter(ctx, D, 'absorberWidth', 0.05, 0.5),
    setBecPmlTargetReflection: nestedClampedSetter(ctx, D, 'pmlTargetReflection', 1e-12, 0.999),
    setBecDiagnosticsEnabled: nestedValueSetter(ctx, D, 'diagnosticsEnabled'),
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
      setWithVersion((state) => {
        const arr = [...state.schroedinger.bec.slicePositions]
        if (dimIndex >= 0 && dimIndex < arr.length) {
          arr[dimIndex] = value
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
    applyBecPreset: (presetId) => {
      const isCurrentPresetApply = beginDynamicPresetApply()
      return loadPresetModule(
        () => import('@/lib/physics/bec/presets'),
        'becSetters',
        `BEC presets for '${presetId}'`,
        ({ getBecPreset }) => {
          if (!isCurrentPresetApply()) return
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
