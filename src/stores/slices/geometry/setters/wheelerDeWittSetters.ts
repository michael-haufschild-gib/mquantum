/**
 * Wheeler–DeWitt minisuperspace setters.
 *
 * Each setter writes a field on `schroedinger.wheelerDeWitt` and bumps the
 * schroedinger version counter. Physics-affecting setters also set
 * `needsReset = true` so the strategy re-runs the CPU solver on the next
 * render frame.
 *
 * @module stores/slices/geometry/setters/wheelerDeWittSetters
 */

import type {
  WdwBoundaryCondition,
  WdwMinisuperspaceDimension,
  WheelerDeWittConfig,
  WdwSrmtClock,
} from '@/lib/geometry/extended/wheelerDeWitt'
import {
  WDW_SOLVER_4D_MAX_GRID_NA,
  WDW_SOLVER_4D_MAX_GRID_NPHI,
  WDW_SOLVER_MAX_COSMOLOGICAL_CONSTANT,
  WDW_SOLVER_MAX_GRID_NA,
  WDW_SOLVER_MAX_GRID_NPHI,
  WDW_SOLVER_MAX_INFLATON_MASS,
  WDW_SOLVER_MAX_INFLATON_MASS_ASYMMETRY,
  WDW_SOLVER_MIN_COSMOLOGICAL_CONSTANT,
  WDW_SOLVER_MIN_INFLATON_MASS,
  WDW_SOLVER_MIN_INFLATON_MASS_ASYMMETRY,
} from '@/lib/physics/wheelerDeWitt/solverInputValidation'
import {
  canApplyPresetRequest,
  createLatestPresetRequestGuard,
  loadPresetModule,
  type SchroedingerPresetApplyOptions,
} from '@/stores/utils/dynamicPresetImport'
import { useGeometryStore } from '@/stores/scene/geometryStore'

import {
  nestedClampedSetter,
  nestedIntSetter,
  nestedValueSetter,
  type SetterContext,
} from './sliceSetterUtils'

/** Grid-size preset tuple: (Na, Nphi). All within the solver's CFL budget at
 * default `(aMin=0.1, aMax=1.5, phiExtent=3.5)` and the hard minima (>= 3).
 * Medium/high use Nphi=40 to maintain adequate φ-resolution within the
 * physically interesting region `|φ| < 2` given `phiExtent=3.5`. The
 * `publication` preset raises Nphi to 48 for thesis-grade fringe resolution;
 * CFL at (256, 48) stays inside budget. */
export type WdwGridPreset = 'low' | 'medium' | 'high' | 'publication'
export const WDW_GRID_PRESETS: Record<WdwGridPreset, { gridNa: number; gridNphi: number }> = {
  low: { gridNa: 64, gridNphi: 16 },
  medium: { gridNa: 128, gridNphi: 40 },
  high: { gridNa: 192, gridNphi: 40 },
  publication: { gridNa: 256, gridNphi: 48 },
}
export type WdwGridPreset4D = Exclude<WdwGridPreset, 'publication'>
export const WDW_GRID_PRESETS_4D: Record<WdwGridPreset4D, { gridNa: number; gridNphi: number }> = {
  low: { gridNa: 48, gridNphi: 12 },
  medium: { gridNa: 64, gridNphi: 16 },
  high: { gridNa: 96, gridNphi: 20 },
}

/** WDW supports the global 3D and 4D dimension selector states. */
export function resolveWdwDimensionFromGeometry(dimension: number): WdwMinisuperspaceDimension {
  return dimension === 4 ? 4 : 3
}

/** Build the WDW config update implied by a global dimension change. */
export function resizeWdwForGeometryDimension(
  prev: WheelerDeWittConfig,
  geometryDimension: number
): Partial<WheelerDeWittConfig> | undefined {
  const target = resolveWdwDimensionFromGeometry(geometryDimension)
  const current = prev.minisuperspaceDimension ?? 3

  if (target === 4) {
    if (
      current === 4 &&
      prev.streamlinesEnabled === false &&
      prev.worldlineEnabled === false &&
      prev.srmtEnabled === false
    ) {
      return undefined
    }
    return {
      minisuperspaceDimension: 4,
      ...(current === 4 ? {} : WDW_GRID_PRESETS_4D.low),
      phi3SliceNormalized: prev.phi3SliceNormalized ?? 0.5,
      streamlinesEnabled: false,
      worldlineEnabled: false,
      srmtEnabled: false,
      needsReset: current !== 4 ? true : prev.needsReset,
    }
  }

  if (current === 3) return undefined
  return {
    minisuperspaceDimension: 3,
    ...WDW_GRID_PRESETS.medium,
    needsReset: true,
  }
}

/** Actions exposed by the Wheeler–DeWitt setter bundle. */
export interface WheelerDeWittSetters {
  setWdwMinisuperspaceDimension: (dimension: WdwMinisuperspaceDimension) => void
  setWdwPhi3SliceNormalized: (slice: number) => void
  setWdwBoundaryCondition: (bc: WdwBoundaryCondition) => void
  setWdwInflatonMass: (m: number) => void
  setWdwCosmologicalConstant: (lambda: number) => void
  setWdwInflatonMassAsymmetry: (ratio: number) => void
  setWdwGridSize: (preset: WdwGridPreset) => void
  /** Set raw solver grid dimensions (URL round-trip). `Na ∈ [16, 1024]`,
   *  `Nphi ∈ [8, 128]`. Off-preset values supported so shared links
   *  preserve the sender's exact resolution. */
  setWdwGridDimensions: (gridNa: number, gridNphi: number) => void
  setWdwStreamlinesEnabled: (enabled: boolean) => void
  setWdwStreamlineDensity: (density: number) => void
  setWdwPhaseRotationEnabled: (enabled: boolean) => void
  setWdwPhaseRotationSpeed: (speed: number) => void
  setWdwWorldlineEnabled: (enabled: boolean) => void
  setWdwWorldlineSpeed: (speed: number) => void
  setWdwWorldlinePulseWidth: (w: number) => void
  setWdwRenderDynamicRange: (range: number) => void
  setWdwSrmtEnabled: (enabled: boolean) => void
  setWdwSrmtClock: (clock: WdwSrmtClock) => void
  setWdwSrmtCutNormalized: (cut: number) => void
  setWdwSrmtRankCap: (cap: number) => void
  setWdwSrmtHeatmapIntensity: (intensity: number) => void
  applyWheelerDeWittPreset: (
    presetId: string,
    options?: SchroedingerPresetApplyOptions
  ) => Promise<void>
  triggerWdwRecompute: () => void
}

/**
 * Build the Wheeler–DeWitt action bundle. All setters mutate
 * `schroedinger.wheelerDeWitt` and bump the schroedinger version counter.
 *
 * @param ctx - Shared setter context
 * @returns Map of action name → setter
 */
export function createWheelerDeWittSetters(ctx: SetterContext): WheelerDeWittSetters {
  const beginPresetRequest = createLatestPresetRequestGuard()
  // Render-only animation-effect setters: MUST NOT flip needsReset so the
  // solver does not re-run when the user toggles a visual overlay.
  const setPhaseRotationEnabled = nestedValueSetter(ctx, 'wheelerDeWitt', 'phaseRotationEnabled')
  const setPhaseRotationSpeed = nestedClampedSetter(
    ctx,
    'wheelerDeWitt',
    'phaseRotationSpeed',
    0,
    5
  )
  const setWorldlineEnabled = nestedValueSetter(ctx, 'wheelerDeWitt', 'worldlineEnabled')
  const setWorldlineSpeed = nestedClampedSetter(ctx, 'wheelerDeWitt', 'worldlineSpeed', 0.1, 3)
  const setWorldlinePulseWidth = nestedClampedSetter(
    ctx,
    'wheelerDeWitt',
    'worldlinePulseWidth',
    0.02,
    0.3
  )
  // Render-only: user-controllable R-channel headroom for Wheeler-DeWitt.
  // Clamp range matches `WDW_HEADROOM_MIN` / `WDW_HEADROOM_MAX` in
  // `lib/physics/wheelerDeWitt/densityGrid.ts` — keep the bounds in lockstep.
  const setRenderDynamicRange = nestedClampedSetter(
    ctx,
    'wheelerDeWitt',
    'renderDynamicRange',
    1,
    10_000
  )

  // SRMT diagnostic setters — all display-only: they do NOT flip needsReset
  // because toggling the modular-time diagnostic or its clock choice has no
  // effect on the Wheeler–DeWitt PDE solution. The diagnostic runs on the
  // cached solver output and writes into `useSrmtDiagnosticStore`; see
  // WheelerDeWittStrategy.executeFrame for the hash-based recompute gate.
  const setSrmtEnabled = nestedValueSetter(ctx, 'wheelerDeWitt', 'srmtEnabled')
  const setSrmtClock = nestedValueSetter(ctx, 'wheelerDeWitt', 'srmtClock')
  const setSrmtCutNormalized = nestedClampedSetter(
    ctx,
    'wheelerDeWitt',
    'srmtCutNormalized',
    0.1,
    0.9
  )
  const setSrmtRankCap = nestedIntSetter(ctx, 'wheelerDeWitt', 'srmtRankCap', 8, 256)
  const setSrmtHeatmapIntensity = nestedClampedSetter(
    ctx,
    'wheelerDeWitt',
    'srmtHeatmapIntensity',
    0,
    1
  )

  // Display-only streamline setters. These fields drive WKB trajectory
  // integration on the cached solver output — they MUST NOT flip needsReset
  // or the strategy would re-run the full ~10-15 ms Wheeler–DeWitt solve on a
  // pure overlay toggle. Trajectory rebuild is triggered separately via
  // `computeWdwTrajectoryHash` inside WheelerDeWittStrategy.
  const setStreamlinesEnabled = nestedValueSetter(ctx, 'wheelerDeWitt', 'streamlinesEnabled')

  /**
   * Physics setters: update the field AND flip `needsReset` in a single
   * setWithVersion call. Calling a nested*Setter first and then a second
   * setWithVersion for `needsReset` would cause two React state updates
   * (two version bumps, two re-renders) per physics mutation.
   */
  const applyWithReset = <V>(field: string, value: V): void => {
    ctx.setWithVersion((state) => ({
      schroedinger: {
        ...state.schroedinger,
        wheelerDeWitt: {
          ...state.schroedinger.wheelerDeWitt,
          [field]: value,
          needsReset: true,
        },
      },
    }))
  }
  const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

  return {
    setWdwMinisuperspaceDimension: (dimension) => {
      if (dimension !== 3 && dimension !== 4) return
      ctx.setWithVersion((state) => {
        const prev = state.schroedinger.wheelerDeWitt
        const next =
          dimension === 4
            ? {
                ...prev,
                minisuperspaceDimension: 4 as const,
                gridNa: WDW_GRID_PRESETS_4D.low.gridNa,
                gridNphi: WDW_GRID_PRESETS_4D.low.gridNphi,
                phi3SliceNormalized: 0.5,
                streamlinesEnabled: false,
                worldlineEnabled: false,
                srmtEnabled: false,
                needsReset: true,
              }
            : {
                ...prev,
                minisuperspaceDimension: 3 as const,
                gridNa: WDW_GRID_PRESETS.medium.gridNa,
                gridNphi: WDW_GRID_PRESETS.medium.gridNphi,
                needsReset: true,
              }
        return {
          schroedinger: {
            ...state.schroedinger,
            wheelerDeWitt: next,
          },
        }
      })
    },
    setWdwPhi3SliceNormalized: (slice) => {
      if (!ctx.isFinite(slice)) {
        ctx.warnNonFinite('wheelerDeWitt.phi3SliceNormalized', slice)
        return
      }
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          wheelerDeWitt: {
            ...state.schroedinger.wheelerDeWitt,
            phi3SliceNormalized: clamp(slice, 0, 1),
          },
        },
      }))
    },
    setWdwBoundaryCondition: (bc) => applyWithReset('boundaryCondition', bc),
    setWdwInflatonMass: (m) => {
      if (!ctx.isFinite(m)) {
        ctx.warnNonFinite('wheelerDeWitt.inflatonMass', m)
        return
      }
      applyWithReset(
        'inflatonMass',
        clamp(m, WDW_SOLVER_MIN_INFLATON_MASS, WDW_SOLVER_MAX_INFLATON_MASS)
      )
    },
    setWdwCosmologicalConstant: (lambda) => {
      if (!ctx.isFinite(lambda)) {
        ctx.warnNonFinite('wheelerDeWitt.cosmologicalConstant', lambda)
        return
      }
      applyWithReset(
        'cosmologicalConstant',
        clamp(lambda, WDW_SOLVER_MIN_COSMOLOGICAL_CONSTANT, WDW_SOLVER_MAX_COSMOLOGICAL_CONSTANT)
      )
    },
    setWdwInflatonMassAsymmetry: (ratio) => {
      if (!ctx.isFinite(ratio)) {
        ctx.warnNonFinite('wheelerDeWitt.inflatonMassAsymmetry', ratio)
        return
      }
      applyWithReset(
        'inflatonMassAsymmetry',
        clamp(ratio, WDW_SOLVER_MIN_INFLATON_MASS_ASYMMETRY, WDW_SOLVER_MAX_INFLATON_MASS_ASYMMETRY)
      )
    },
    setWdwGridSize: (preset) => {
      // Physics mutation: write both fields + needsReset in one transaction so
      // the strategy re-solves exactly once.
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          wheelerDeWitt: {
            ...state.schroedinger.wheelerDeWitt,
            ...(state.schroedinger.wheelerDeWitt.minisuperspaceDimension === 4
              ? WDW_GRID_PRESETS_4D[(preset as WdwGridPreset4D) in WDW_GRID_PRESETS_4D ? (preset as WdwGridPreset4D) : 'low']
              : WDW_GRID_PRESETS[preset]),
            needsReset: true,
          },
        },
      }))
    },
    setWdwGridDimensions: (gridNa: number, gridNphi: number) => {
      if (!ctx.isFinite(gridNa)) {
        ctx.warnNonFinite('wheelerDeWitt.gridNa', gridNa)
        return
      }
      if (!ctx.isFinite(gridNphi)) {
        ctx.warnNonFinite('wheelerDeWitt.gridNphi', gridNphi)
        return
      }
      const currentDim = ctx.get().schroedinger.wheelerDeWitt.minisuperspaceDimension ?? 3
      const maxNa = currentDim === 4 ? WDW_SOLVER_4D_MAX_GRID_NA : WDW_SOLVER_MAX_GRID_NA
      const maxNphi = currentDim === 4 ? WDW_SOLVER_4D_MAX_GRID_NPHI : WDW_SOLVER_MAX_GRID_NPHI
      const clampedNa = clamp(Math.round(gridNa), 16, maxNa)
      const clampedNphi = clamp(Math.round(gridNphi), 8, maxNphi)
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          wheelerDeWitt: {
            ...state.schroedinger.wheelerDeWitt,
            gridNa: clampedNa,
            gridNphi: clampedNphi,
            needsReset: true,
          },
        },
      }))
    },
    // Display-only: no applyWithReset — solver output is unaffected, only the
    // WKB trajectory overlay is rebuilt on the next frame.
    setWdwStreamlinesEnabled: (enabled) => {
      const current = ctx.get().schroedinger.wheelerDeWitt
      setStreamlinesEnabled(current.minisuperspaceDimension === 4 ? false : enabled)
    },
    setWdwStreamlineDensity: (density) => {
      if (!ctx.isFinite(density)) {
        ctx.warnNonFinite('wheelerDeWitt.streamlineDensity', density)
        return
      }
      const clamped = clamp(Math.round(density), 2, 16)
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          wheelerDeWitt: {
            ...state.schroedinger.wheelerDeWitt,
            streamlineDensity: clamped,
          },
        },
      }))
    },
    // Render-only: no withReset — solver output is not affected.
    setWdwPhaseRotationEnabled: setPhaseRotationEnabled,
    setWdwPhaseRotationSpeed: setPhaseRotationSpeed,
    setWdwWorldlineEnabled: (enabled) => {
      const current = ctx.get().schroedinger.wheelerDeWitt
      setWorldlineEnabled(current.minisuperspaceDimension === 4 ? false : enabled)
    },
    setWdwWorldlineSpeed: setWorldlineSpeed,
    setWdwWorldlinePulseWidth: setWorldlinePulseWidth,
    setWdwRenderDynamicRange: setRenderDynamicRange,
    // SRMT diagnostic — display-only, no solver re-run.
    setWdwSrmtEnabled: (enabled) => {
      const current = ctx.get().schroedinger.wheelerDeWitt
      setSrmtEnabled(current.minisuperspaceDimension === 4 ? false : enabled)
    },
    setWdwSrmtClock: setSrmtClock,
    setWdwSrmtCutNormalized: setSrmtCutNormalized,
    setWdwSrmtRankCap: setSrmtRankCap,
    setWdwSrmtHeatmapIntensity: setSrmtHeatmapIntensity,
    applyWheelerDeWittPreset: (presetId, options) => {
      const isLatestRequest = beginPresetRequest()
      return loadPresetModule(
        () => import('@/lib/physics/wheelerDeWitt/presets'),
        'wheelerDeWittSetters',
        `Wheeler–DeWitt presets for '${presetId}'`,
        ({ getWdwPreset, WDW_PRESET_PHYSICS_FIELDS }) => {
          if (!canApplyPresetRequest(isLatestRequest, ctx.get().schroedinger.quantumMode, options))
            return
          const preset = getWdwPreset(presetId)
          if (!preset) return
          const presetDimension = preset.overrides.minisuperspaceDimension ?? 3
          const activeDimension = resolveWdwDimensionFromGeometry(useGeometryStore.getState().dimension)
          if (presetDimension !== activeDimension) return
          ctx.setWithVersion((state) => {
            const prev = state.schroedinger.wheelerDeWitt
            // Scope to physics fields only. Render-only overlay toggles
            // (streamlines, phase rotation, worldline pulse) and grid/CFL
            // parameters stay at whatever the user already has.
            const physics: Partial<typeof prev> = {}
            for (const field of WDW_PRESET_PHYSICS_FIELDS) {
              const value = preset.overrides[field]
              if (value !== undefined) {
                ;(physics as Record<string, unknown>)[field] = value
              }
            }
            const targetDimension =
              physics.minisuperspaceDimension ?? prev.minisuperspaceDimension ?? 3
            if (targetDimension === 4) {
              physics.gridNa = physics.gridNa ?? WDW_GRID_PRESETS_4D.low.gridNa
              physics.gridNphi = physics.gridNphi ?? WDW_GRID_PRESETS_4D.low.gridNphi
              physics.phi3SliceNormalized = physics.phi3SliceNormalized ?? 0.5
              physics.streamlinesEnabled = false
              physics.worldlineEnabled = false
              physics.srmtEnabled = false
            } else if ((prev.minisuperspaceDimension ?? 3) === 4) {
              physics.gridNa = WDW_GRID_PRESETS.medium.gridNa
              physics.gridNphi = WDW_GRID_PRESETS.medium.gridNphi
            }
            return {
              schroedinger: {
                ...state.schroedinger,
                wheelerDeWitt: {
                  ...prev,
                  ...physics,
                  needsReset: true,
                },
              },
            }
          })
        }
      )
    },
    triggerWdwRecompute: () => {
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          wheelerDeWitt: { ...state.schroedinger.wheelerDeWitt, needsReset: true },
        },
      }))
    },
  }
}
