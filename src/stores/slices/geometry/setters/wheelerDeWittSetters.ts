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

import type { WdwBoundaryCondition, WdwSrmtClock } from '@/lib/geometry/extended/wheelerDeWitt'
import { loadPresetModule } from '@/stores/utils/dynamicPresetImport'

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

/** Actions exposed by the Wheeler–DeWitt setter bundle. */
export interface WheelerDeWittSetters {
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
  applyWheelerDeWittPreset: (presetId: string) => Promise<void>
  triggerWdwRecompute: () => void
  clearWdwNeedsReset: () => void
}

/**
 * Build the Wheeler–DeWitt action bundle. All setters mutate
 * `schroedinger.wheelerDeWitt` and bump the schroedinger version counter.
 *
 * @param ctx - Shared setter context
 * @returns Map of action name → setter
 */
export function createWheelerDeWittSetters(ctx: SetterContext): WheelerDeWittSetters {
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
    setWdwBoundaryCondition: (bc) => applyWithReset('boundaryCondition', bc),
    setWdwInflatonMass: (m) => {
      if (!ctx.isFinite(m)) {
        ctx.warnNonFinite('wheelerDeWitt.inflatonMass', m)
        return
      }
      applyWithReset('inflatonMass', clamp(m, 0, 2))
    },
    setWdwCosmologicalConstant: (lambda) => {
      if (!ctx.isFinite(lambda)) {
        ctx.warnNonFinite('wheelerDeWitt.cosmologicalConstant', lambda)
        return
      }
      applyWithReset('cosmologicalConstant', clamp(lambda, -1, 1))
    },
    setWdwInflatonMassAsymmetry: (ratio) => {
      if (!ctx.isFinite(ratio)) {
        ctx.warnNonFinite('wheelerDeWitt.inflatonMassAsymmetry', ratio)
        return
      }
      applyWithReset('inflatonMassAsymmetry', clamp(ratio, 0.1, 10))
    },
    setWdwGridSize: (preset) => {
      const { gridNa, gridNphi } = WDW_GRID_PRESETS[preset]
      // Physics mutation: write both fields + needsReset in one transaction so
      // the strategy re-solves exactly once.
      ctx.setWithVersion((state) => ({
        schroedinger: {
          ...state.schroedinger,
          wheelerDeWitt: {
            ...state.schroedinger.wheelerDeWitt,
            gridNa,
            gridNphi,
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
      const clampedNa = clamp(Math.round(gridNa), 16, 1024)
      const clampedNphi = clamp(Math.round(gridNphi), 8, 128)
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
    setWdwStreamlinesEnabled: setStreamlinesEnabled,
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
    setWdwWorldlineEnabled: setWorldlineEnabled,
    setWdwWorldlineSpeed: setWorldlineSpeed,
    setWdwWorldlinePulseWidth: setWorldlinePulseWidth,
    setWdwRenderDynamicRange: setRenderDynamicRange,
    // SRMT diagnostic — display-only, no solver re-run.
    setWdwSrmtEnabled: setSrmtEnabled,
    setWdwSrmtClock: setSrmtClock,
    setWdwSrmtCutNormalized: setSrmtCutNormalized,
    setWdwSrmtRankCap: setSrmtRankCap,
    setWdwSrmtHeatmapIntensity: setSrmtHeatmapIntensity,
    applyWheelerDeWittPreset: (presetId) => {
      return loadPresetModule(
        () => import('@/lib/physics/wheelerDeWitt/presets'),
        'wheelerDeWittSetters',
        `Wheeler–DeWitt presets for '${presetId}'`,
        ({ getWdwPreset, WDW_PRESET_PHYSICS_FIELDS }) => {
          const preset = getWdwPreset(presetId)
          if (!preset) return
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
    clearWdwNeedsReset: () => {
      ctx.set((state) => ({
        schroedinger: {
          ...state.schroedinger,
          wheelerDeWitt: { ...state.schroedinger.wheelerDeWitt, needsReset: false },
        },
      }))
    },
  }
}
