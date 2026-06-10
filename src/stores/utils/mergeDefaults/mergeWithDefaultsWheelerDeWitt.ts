import {
  DEFAULT_WHEELER_DEWITT_CONFIG,
  type WdwSrmtClock,
} from '@/lib/geometry/extended/wheelerDeWitt'
import {
  isWdwBoundaryCondition,
  WDW_SOLVER_4D_MAX_GRID_NA,
  WDW_SOLVER_4D_MAX_GRID_NPHI,
  WDW_SOLVER_MAX_A_MAX,
  WDW_SOLVER_MAX_A_MIN,
  WDW_SOLVER_MAX_COSMOLOGICAL_CONSTANT,
  WDW_SOLVER_MAX_GRID_NA,
  WDW_SOLVER_MAX_GRID_NPHI,
  WDW_SOLVER_MAX_INFLATON_MASS,
  WDW_SOLVER_MAX_INFLATON_MASS_ASYMMETRY,
  WDW_SOLVER_MAX_PHI_EXTENT,
  WDW_SOLVER_MIN_A_MIN,
  WDW_SOLVER_MIN_A_SPAN,
  WDW_SOLVER_MIN_COSMOLOGICAL_CONSTANT,
  WDW_SOLVER_MIN_INFLATON_MASS,
  WDW_SOLVER_MIN_INFLATON_MASS_ASYMMETRY,
  WDW_SOLVER_MIN_PHI_EXTENT,
} from '@/lib/physics/wheelerDeWitt/solverInputValidation'

const WDW_SRMT_CLOCK_SET = new Set<WdwSrmtClock>(['a', 'phi1', 'phi2'])

function isWdwSrmtClock(value: unknown): value is WdwSrmtClock {
  return typeof value === 'string' && WDW_SRMT_CLOCK_SET.has(value as WdwSrmtClock)
}

function clampFiniteNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, value))
}

function clampFiniteInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(min, Math.min(max, Math.round(value)))
}

/**
 * Coerce a loaded boolean overlay toggle, forcing `false` when the feature
 * is unavailable (the 3D-only overlays — WKB streamlines, worldline pulse,
 * SRMT diagnostic — are forced off in 4D minisuperspace mode).
 */
function coerceGatedBoolean(value: unknown, fallback: boolean, forceOff: boolean): boolean {
  if (forceOff) return false
  return typeof value === 'boolean' ? value : fallback
}

/**
 * Clamp loaded Wheeler–DeWitt solver + overlay fields to the same finite
 * ranges enforced by the UI setters, and force the 3D-only overlay features
 * off when the loaded config selects 4D minisuperspace.
 *
 * @param normalized - Merged Schroedinger config record.
 * @returns Config with a sanitized nested `wheelerDeWitt` block.
 */
export function normalizeWheelerDeWittConfig(
  normalized: Record<string, unknown>
): Record<string, unknown> {
  const wdw = normalized.wheelerDeWitt
  if (!wdw || typeof wdw !== 'object' || Array.isArray(wdw)) return normalized

  const current = wdw as Record<string, unknown>
  const defaults = DEFAULT_WHEELER_DEWITT_CONFIG
  const minisuperspaceDimension = current.minisuperspaceDimension === 4 ? 4 : 3
  const is4d = minisuperspaceDimension === 4
  const maxGridNa = is4d ? WDW_SOLVER_4D_MAX_GRID_NA : WDW_SOLVER_MAX_GRID_NA
  const maxGridNphi = is4d ? WDW_SOLVER_4D_MAX_GRID_NPHI : WDW_SOLVER_MAX_GRID_NPHI
  let aMin = clampFiniteNumber(
    current.aMin,
    defaults.aMin,
    WDW_SOLVER_MIN_A_MIN,
    WDW_SOLVER_MAX_A_MIN
  )
  let aMax = clampFiniteNumber(
    current.aMax,
    defaults.aMax,
    WDW_SOLVER_MIN_A_MIN + WDW_SOLVER_MIN_A_SPAN,
    WDW_SOLVER_MAX_A_MAX
  )
  if (!(aMax > aMin)) {
    aMin = defaults.aMin
    aMax = defaults.aMax
  }

  return {
    ...normalized,
    wheelerDeWitt: {
      ...current,
      minisuperspaceDimension,
      boundaryCondition: isWdwBoundaryCondition(current.boundaryCondition)
        ? current.boundaryCondition
        : defaults.boundaryCondition,
      inflatonMass: clampFiniteNumber(
        current.inflatonMass,
        defaults.inflatonMass,
        WDW_SOLVER_MIN_INFLATON_MASS,
        WDW_SOLVER_MAX_INFLATON_MASS
      ),
      inflatonMassAsymmetry: clampFiniteNumber(
        current.inflatonMassAsymmetry,
        defaults.inflatonMassAsymmetry,
        WDW_SOLVER_MIN_INFLATON_MASS_ASYMMETRY,
        WDW_SOLVER_MAX_INFLATON_MASS_ASYMMETRY
      ),
      cosmologicalConstant: clampFiniteNumber(
        current.cosmologicalConstant,
        defaults.cosmologicalConstant,
        WDW_SOLVER_MIN_COSMOLOGICAL_CONSTANT,
        WDW_SOLVER_MAX_COSMOLOGICAL_CONSTANT
      ),
      aMin,
      aMax,
      gridNa: clampFiniteInteger(current.gridNa, defaults.gridNa, 16, maxGridNa),
      gridNphi: clampFiniteInteger(current.gridNphi, defaults.gridNphi, 8, maxGridNphi),
      phiExtent: clampFiniteNumber(
        current.phiExtent,
        defaults.phiExtent,
        WDW_SOLVER_MIN_PHI_EXTENT,
        WDW_SOLVER_MAX_PHI_EXTENT
      ),
      phi3SliceNormalized: clampFiniteNumber(
        current.phi3SliceNormalized,
        defaults.phi3SliceNormalized,
        0,
        1
      ),
      streamlinesEnabled: coerceGatedBoolean(
        current.streamlinesEnabled,
        defaults.streamlinesEnabled,
        is4d
      ),
      streamlineDensity: clampFiniteInteger(
        current.streamlineDensity,
        defaults.streamlineDensity,
        2,
        16
      ),
      phaseRotationSpeed: clampFiniteNumber(
        current.phaseRotationSpeed,
        defaults.phaseRotationSpeed,
        0,
        5
      ),
      worldlineSpeed: clampFiniteNumber(current.worldlineSpeed, defaults.worldlineSpeed, 0.1, 3),
      worldlinePulseWidth: clampFiniteNumber(
        current.worldlinePulseWidth,
        defaults.worldlinePulseWidth,
        0.02,
        0.3
      ),
      worldlineEnabled: coerceGatedBoolean(
        current.worldlineEnabled,
        defaults.worldlineEnabled,
        is4d
      ),
      renderDynamicRange: clampFiniteNumber(
        current.renderDynamicRange,
        defaults.renderDynamicRange,
        1,
        10_000
      ),
      srmtClock: isWdwSrmtClock(current.srmtClock) ? current.srmtClock : defaults.srmtClock,
      srmtEnabled: coerceGatedBoolean(current.srmtEnabled, defaults.srmtEnabled, is4d),
      srmtCutNormalized: clampFiniteNumber(
        current.srmtCutNormalized,
        defaults.srmtCutNormalized,
        0.1,
        0.9
      ),
      srmtRankCap: clampFiniteInteger(current.srmtRankCap, defaults.srmtRankCap, 8, 256),
      srmtHeatmapIntensity: clampFiniteNumber(
        current.srmtHeatmapIntensity,
        defaults.srmtHeatmapIntensity,
        0,
        1
      ),
    },
  }
}
