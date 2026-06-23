/**
 * LUT registry for the WDW ⊗ ζ suite.
 *
 * Maps each suite `quantumMode` to its `modeId` (packed as the `wzModeId`
 * uniform and branched on by the shared shader) and its model-space bounding
 * radius. The single `WdwZetaVolumeStrategy` dispatches through this table —
 * one strategy, one shader, one compiled pipeline for all ten modes; the only
 * per-mode data is the compact ζ-LUT (built by `buildWdwZetaLut`) and the
 * `wzModeId`. The shader synthesizes a live, lit, mode-distinct 3D form from the
 * LUT; there is no baked image.
 *
 * @module lib/physics/wdwZeta/registry
 */

import { DEFAULT_ADELIC_WAVEFUNCTION_CONFIG } from '@/lib/geometry/extended/wdwZeta/adelicWavefunction'
import { DEFAULT_CONSTRAINT_SEAM_CONFIG } from '@/lib/geometry/extended/wdwZeta/constraintSeam'
import { DEFAULT_DEWITT_CONE_CONFIG } from '@/lib/geometry/extended/wdwZeta/dewittCone'
import { DEFAULT_FIELD_ONE_ELEMENT_CONFIG } from '@/lib/geometry/extended/wdwZeta/fieldOneElement'
import { DEFAULT_FORCED_CELL_CONFIG } from '@/lib/geometry/extended/wdwZeta/forcedCell'
import { DEFAULT_FROBENIUS_WHEEL_CONFIG } from '@/lib/geometry/extended/wdwZeta/frobeniusWheel'
import { DEFAULT_MOEBIUS_NO_BOUNDARY_CONFIG } from '@/lib/geometry/extended/wdwZeta/moebiusNoBoundary'
import { DEFAULT_PRIMON_MULTIVERSE_CONFIG } from '@/lib/geometry/extended/wdwZeta/primonMultiverse'
import { DEFAULT_SELBERG_SPECTRUM_CONFIG } from '@/lib/geometry/extended/wdwZeta/selbergSpectrum'
import type { WdwZetaModeKey } from '@/lib/geometry/extended/wdwZeta/shared'
import { DEFAULT_TURNING_SURFACE_CONFIG } from '@/lib/geometry/extended/wdwZeta/turningSurface'
import { DEFAULT_WEIL_POSITIVITY_CONFIG } from '@/lib/geometry/extended/wdwZeta/weilPositivity'

import { buildWdwZetaLut, type WdwZetaConfigHostLut, wdwZetaLutHash } from './lut'

/** Host of all suite sub-configs (a structural slice of `SchroedingerConfig`). */
export type WdwZetaConfigHost = WdwZetaConfigHostLut

/** Render + LUT metadata for one suite mode. */
export interface WdwZetaModeSpec {
  /** Packed as the `wzModeId` uniform; selects the per-mode shader form. */
  modeId: number
  /** Model-space bounding radius framing the live form. */
  boundingRadius: number
  /** Build the compact ζ-LUT for this mode from a config host. */
  buildLut: (host: WdwZetaConfigHost) => Float32Array
  /** Re-upload hash; the strategy re-builds only when this string changes. */
  lutHash: (host: WdwZetaConfigHost) => string
}

/** Fill in defaults for the active mode's sub-config so builders never see undefined. */
function withDefaults(host: WdwZetaConfigHost): WdwZetaConfigHost {
  return {
    constraintSeam: host.constraintSeam ?? DEFAULT_CONSTRAINT_SEAM_CONFIG,
    moebiusNoBoundary: host.moebiusNoBoundary ?? DEFAULT_MOEBIUS_NO_BOUNDARY_CONFIG,
    forcedCell: host.forcedCell ?? DEFAULT_FORCED_CELL_CONFIG,
    turningSurface: host.turningSurface ?? DEFAULT_TURNING_SURFACE_CONFIG,
    primonMultiverse: host.primonMultiverse ?? DEFAULT_PRIMON_MULTIVERSE_CONFIG,
    frobeniusWheel: host.frobeniusWheel ?? DEFAULT_FROBENIUS_WHEEL_CONFIG,
    dewittCone: host.dewittCone ?? DEFAULT_DEWITT_CONE_CONFIG,
    selbergSpectrum: host.selbergSpectrum ?? DEFAULT_SELBERG_SPECTRUM_CONFIG,
    adelicWavefunction: host.adelicWavefunction ?? DEFAULT_ADELIC_WAVEFUNCTION_CONFIG,
    weilPositivity: host.weilPositivity ?? DEFAULT_WEIL_POSITIVITY_CONFIG,
    fieldOneElement: host.fieldOneElement ?? DEFAULT_FIELD_ONE_ELEMENT_CONFIG,
  }
}

/** Build a spec for a mode given its id + bounding radius. */
function spec(modeId: number, boundingRadius: number): WdwZetaModeSpec {
  return {
    modeId,
    boundingRadius,
    buildLut: (h) => buildWdwZetaLut(modeId, withDefaults(h)),
    lutHash: (h) => wdwZetaLutHash(modeId, withDefaults(h)),
  }
}

/**
 * The suite registry. `modeId` values are stable (the shader branches on them)
 * and unique. Bounding radii frame each mode's live form.
 */
export const WDW_ZETA_REGISTRY: Partial<Record<WdwZetaModeKey, WdwZetaModeSpec>> = {
  constraintSeam: spec(0, 1.45),
  moebiusNoBoundary: spec(1, 1.3),
  forcedCell: spec(2, 1.5),
  turningSurface: spec(3, 1.5),
  primonMultiverse: spec(4, 1.45),
  frobeniusWheel: spec(5, 1.55),
  dewittCone: spec(6, 1.6),
  selbergSpectrum: spec(7, 1.5),
  adelicWavefunction: spec(8, 1.5),
  weilPositivity: spec(9, 1.5),
  fieldOneElement: spec(10, 1.65),
}

/** Look up a suite mode's spec (undefined for non-suite modes). */
export function getWdwZetaSpec(mode: string | undefined): WdwZetaModeSpec | undefined {
  if (mode === undefined) return undefined
  return WDW_ZETA_REGISTRY[mode as WdwZetaModeKey]
}
