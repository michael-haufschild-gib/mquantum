/**
 * Single source of truth for the WDW ⊗ ζ suite's data-driven UI, setters, and
 * URL serialization. Each mode contributes one entry here referencing its own
 * config exports (RANGES / PRESETS / DEFAULT / SCENARIOS) plus the UI metadata
 * (field labels/tooltips/steps) and the short URL keys. The generic controls
 * renderer, the generic `setWdwZetaField` store action, the `wdwZetaSerializer`,
 * and the ScenarioSelector all read from this — so adding a mode is one entry,
 * not a fan-out of bespoke components.
 *
 * @module lib/geometry/extended/wdwZeta/configRegistry
 */

import { WDW_ZETA_UI_B } from './configRegistryEntriesB'
import {
  CONSTRAINT_SEAM_PRESETS,
  CONSTRAINT_SEAM_RANGES,
  CONSTRAINT_SEAM_SCENARIOS,
  DEFAULT_CONSTRAINT_SEAM_CONFIG,
} from './constraintSeam'
import {
  DEFAULT_DEWITT_CONE_CONFIG,
  DEWITT_CONE_PRESETS,
  DEWITT_CONE_RANGES,
  DEWITT_CONE_SCENARIOS,
} from './dewittCone'
import {
  DEFAULT_FORCED_CELL_CONFIG,
  FORCED_CELL_PRESETS,
  FORCED_CELL_RANGES,
  FORCED_CELL_SCENARIOS,
} from './forcedCell'
import {
  DEFAULT_FROBENIUS_WHEEL_CONFIG,
  FROBENIUS_WHEEL_PRESETS,
  FROBENIUS_WHEEL_RANGES,
  FROBENIUS_WHEEL_SCENARIOS,
} from './frobeniusWheel'
import {
  DEFAULT_MOEBIUS_NO_BOUNDARY_CONFIG,
  MOEBIUS_NO_BOUNDARY_PRESETS,
  MOEBIUS_NO_BOUNDARY_RANGES,
  MOEBIUS_NO_BOUNDARY_SCENARIOS,
} from './moebiusNoBoundary'
import type { WdwZetaModeKey, WdwZetaScenario } from './shared'
import {
  DEFAULT_TURNING_SURFACE_CONFIG,
  TURNING_SURFACE_PRESETS,
  TURNING_SURFACE_RANGES,
  TURNING_SURFACE_SCENARIOS,
} from './turningSurface'

/** A single editable config field, rendered as a slider or switch. */
export interface WdwZetaFieldDesc {
  /** Config field key. */
  key: string
  /** UI label. */
  label: string
  /** Hover tooltip. */
  tooltip: string
  /** Slider step (ignored for switches). */
  step?: number
  /** Round to integer on set. */
  integer?: boolean
  /** `slider` (default) or `switch` (boolean). */
  kind?: 'slider' | 'switch'
  /** Only show this field when the named boolean field is true. */
  showIf?: string
  /** Short URL key (must be globally disjoint). */
  url: string
}

/** A numeric clamp range. */
interface Range {
  min: number
  max: number
}

/** Everything the generic suite UI / setters / serializer need for one mode. */
export interface WdwZetaModeUi {
  /** Display name. */
  label: string
  /** Clamp ranges by numeric field (from the mode's config). */
  ranges: Readonly<Record<string, Range>>
  /** Named presets (field → value maps) from the mode's config. */
  presets: Readonly<Record<string, Readonly<Record<string, number | boolean>>>>
  /** Default config (for setter fallback). Read via a `Record<string, unknown>` cast. */
  defaultConfig: object
  /** Ordered editable fields (controls + URL). */
  fields: readonly WdwZetaFieldDesc[]
  /** Scenario list for the ScenarioSelector. */
  scenarios: readonly WdwZetaScenario[]
}

/** The suite UI registry. Modes are added here as they land. */
export const WDW_ZETA_UI: Partial<Record<WdwZetaModeKey, WdwZetaModeUi>> = {
  constraintSeam: {
    label: 'Constraint Seam',
    ranges: CONSTRAINT_SEAM_RANGES,
    presets: CONSTRAINT_SEAM_PRESETS,
    defaultConfig: DEFAULT_CONSTRAINT_SEAM_CONFIG,
    scenarios: CONSTRAINT_SEAM_SCENARIOS,
    fields: [
      {
        key: 'heightWindow',
        label: 'Height window (T)',
        tooltip: 'Upper ordinate of the rendered critical strip; climbs the seam past more zeros.',
        step: 1,
        integer: true,
        url: 'cs_t',
      },
      {
        key: 'reliefHeight',
        label: 'Relief height',
        tooltip: 'Depth bulge of the |ξ| relief (the mirror-canyon amplitude).',
        step: 0.01,
        url: 'cs_h',
      },
      {
        key: 'stripBand',
        label: 'σ-band width',
        tooltip:
          'Half-width of the rendered σ-window around the seam: narrow = a tight seam canyon, wide = the explosive off-line |ξ| walls.',
        step: 0.01,
        url: 'cs_band',
      },
      {
        key: 'carpetGain',
        label: 'Quantum carpet',
        tooltip:
          'Intensity of the TDSE Talbot quantum-carpet overlay — a free-eigenstate superposition Σₙ e^{i(nx−n²τ+γₙ)} phased by the ζ ordinates.',
        step: 0.01,
        url: 'cs_cp',
      },
      {
        key: 'domainShade',
        label: 'Phase portrait',
        tooltip:
          'Colour the relief by arg ξ (the analytic phase portrait) instead of a height-luminance ramp.',
        kind: 'switch',
        url: 'cs_dom',
      },
      {
        key: 'ghostSector',
        label: 'Inject off-seam zeros',
        tooltip:
          'Add a Davenport–Heilbronn ghost zero pair off the critical line — the forbidden κ₋ > 0 sector.',
        kind: 'switch',
        url: 'cs_ghost',
      },
      {
        key: 'ghostOffset',
        label: 'Ghost offset (σ−½)',
        tooltip: 'How far off the seam the ghost zeros sit.',
        step: 0.01,
        showIf: 'ghostSector',
        url: 'cs_go',
      },
    ],
  },
  moebiusNoBoundary: {
    label: 'Möbius No-Boundary Sum',
    ranges: MOEBIUS_NO_BOUNDARY_RANGES,
    presets: MOEBIUS_NO_BOUNDARY_PRESETS,
    defaultConfig: DEFAULT_MOEBIUS_NO_BOUNDARY_CONFIG,
    scenarios: MOEBIUS_NO_BOUNDARY_SCENARIOS,
    fields: [
      {
        key: 'maxDepth',
        label: 'Reduction depth',
        tooltip:
          'Max SL(2,ℤ) fundamental-domain reduction steps — how deep the modular tessellation resolves.',
        step: 1,
        integer: true,
        url: 'mb_depth',
      },
      {
        key: 'moebiusCutoff',
        label: 'Möbius cutoff N',
        tooltip:
          'Largest index n contributing a Möbius weight μ(n) to the no-boundary sum; also the lacework fineness.',
        step: 1,
        integer: true,
        url: 'mb_cut',
      },
      {
        key: 'domeHeight',
        label: 'Dome height',
        tooltip: 'Lift of the no-boundary amplitude into a shallow dome over the Poincaré disk.',
        step: 0.01,
        url: 'mb_dome',
      },
      {
        key: 'curvature',
        label: 'Hyperbolic curvature',
        tooltip:
          'Exponent scaling the tessellation ring density — how fast the modular tiles compress toward the ideal boundary.',
        step: 0.01,
        url: 'mb_k',
      },
      {
        key: 'tunnelMix',
        label: 'No-boundary ↔ tunneling',
        tooltip:
          'Morph the WDW boundary condition: 0 = Hartle–Hawking no-boundary cap, 1 = Vilenkin tunneling spike.',
        step: 0.01,
        url: 'mb_tun',
      },
    ],
  },
  forcedCell: {
    label: 'Forced Cell',
    ranges: FORCED_CELL_RANGES,
    presets: FORCED_CELL_PRESETS,
    defaultConfig: DEFAULT_FORCED_CELL_CONFIG,
    scenarios: FORCED_CELL_SCENARIOS,
    fields: [
      {
        key: 'levelCount',
        label: 'Quantized levels',
        tooltip: 'Number of stacked hyperbolae x·p = E_n (E_n = ζ-zero ordinates).',
        step: 1,
        integer: true,
        url: 'fc_lvl',
      },
      {
        key: 'cellDensity',
        label: 'Planck-cell fineness',
        tooltip: 'Cells per axis of the rigid 2πℏ phase-space lattice (floor grid + wall spacing).',
        step: 1,
        integer: true,
        url: 'fc_cell',
      },
      {
        key: 'xExtent',
        label: 'Phase-window extent',
        tooltip: 'Half-extent of the (x, p) window in log units; spreads the hyperbola arcs.',
        step: 0.01,
        url: 'fc_x',
      },
      {
        key: 'squeeze',
        label: 'Squeeze r',
        tooltip:
          'TDSE symplectic squeeze (x,p)→(x·e^{−r}, p·e^{r}): tilts/elongates the hyperbola tubes while preserving the Planck-cell area.',
        step: 0.01,
        url: 'fc_sq',
      },
      {
        key: 'wallHeight',
        label: 'Cell wall height',
        tooltip: 'Raise the forced Planck cells into a 3D wall lattice (0 = flat floor).',
        step: 0.01,
        url: 'fc_wall',
      },
    ],
  },
  turningSurface: {
    label: 'Turning Surface',
    ranges: TURNING_SURFACE_RANGES,
    presets: TURNING_SURFACE_PRESETS,
    defaultConfig: DEFAULT_TURNING_SURFACE_CONFIG,
    scenarios: TURNING_SURFACE_SCENARIOS,
    fields: [
      {
        key: 'inflatonMass',
        label: 'Inflaton mass m',
        tooltip:
          'Mass in the minisuperspace potential V = ½ m² φ²; shapes the turning surface U=0.',
        step: 0.01,
        url: 'ts_m',
      },
      {
        key: 'lambda',
        label: 'Cosmological Λ',
        tooltip: 'Cosmological constant in U = a²(1 − Λa²/3) − a⁴V; bends the caustic fold.',
        step: 0.01,
        url: 'ts_lam',
      },
      {
        key: 'fringeCount',
        label: 'Airy fringes',
        tooltip: 'WKB interference-fringe density on the classically-allowed side.',
        step: 1,
        integer: true,
        url: 'ts_fr',
      },
      {
        key: 'termCount',
        label: 'Prime ridges',
        tooltip:
          'Number of explicit-formula prime-power ridges scoring the allowed side (0 = off).',
        step: 1,
        integer: true,
        url: 'ts_tc',
      },
      {
        key: 'asymmetry',
        label: 'φ-mass asymmetry',
        tooltip:
          'Anisotropic minisuperspace: the +φ half carries inflaton mass m·asym, the −φ half mass m — bends the caustic fold.',
        step: 0.01,
        url: 'ts_asym',
      },
      {
        key: 'vacuumGain',
        label: 'Vacuum foam',
        tooltip:
          'Free-scalar-field vacuum mode-sum Σ_{k∈primes} cos(k·a)/√(k²+m²) speckling the allowed lens.',
        step: 0.01,
        url: 'ts_vac',
      },
    ],
  },
  frobeniusWheel: {
    label: 'Frobenius Wheel',
    ranges: FROBENIUS_WHEEL_RANGES,
    presets: FROBENIUS_WHEEL_PRESETS,
    defaultConfig: DEFAULT_FROBENIUS_WHEEL_CONFIG,
    scenarios: FROBENIUS_WHEEL_SCENARIOS,
    fields: [
      {
        key: 'baseQ',
        label: 'Base q',
        tooltip:
          'Prime power q of the finite field 𝔽_q; eigenvalues are forced onto |α| = q^{w/2}.',
        step: 1,
        integer: true,
        url: 'fw_q',
      },
      {
        key: 'maxWeight',
        label: 'Max weight w',
        tooltip: 'Highest cohomological weight (purity shell) rendered.',
        step: 1,
        integer: true,
        url: 'fw_w',
      },
      {
        key: 'genus',
        label: 'Curve genus g',
        tooltip: 'Genus of the model curve; H¹ carries 2g Frobenius eigenvalues.',
        step: 1,
        integer: true,
        url: 'fw_g',
      },
      {
        key: 'spread',
        label: 'Eigenvalue spread',
        tooltip:
          'Frobenius-conjugacy angular scatter jittering the pinned eigenvalue dots around their forced ring.',
        step: 0.01,
        url: 'fw_sp',
      },
      {
        key: 'coneSpindle',
        label: 'Spindle form',
        tooltip:
          'Wind the weight filtration into a vertical spindle (central rod) instead of a flat gyroscope of rings.',
        kind: 'switch',
        url: 'fw_cone',
      },
      {
        key: 'zetaTint',
        label: 'ζ-zero tint',
        tooltip:
          'Tint the purity rings by the Riemann zero density — the analytic zeros bleeding into the finite-field tower.',
        step: 0.01,
        url: 'fw_zt',
      },
    ],
  },
  dewittCone: {
    label: 'DeWitt Null Cone',
    ranges: DEWITT_CONE_RANGES,
    presets: DEWITT_CONE_PRESETS,
    defaultConfig: DEFAULT_DEWITT_CONE_CONFIG,
    scenarios: DEWITT_CONE_SCENARIOS,
    fields: [
      {
        key: 'coneSlope',
        label: 'Cone opening',
        tooltip: 'Slope of the null cone r = slope·|y| (the supermetric light-cone aperture).',
        step: 0.01,
        url: 'dc_slope',
      },
      {
        key: 'ringCount',
        label: 'Spectral rings',
        tooltip: 'Number of ζ-spaced standing-wave latitude rings on the cone.',
        step: 1,
        integer: true,
        url: 'dc_rings',
      },
      {
        key: 'branchTint',
        label: 'Branch tint',
        tooltip:
          'Warm/cool split between the expanding (upper) and contracting (lower) WDW branches.',
        step: 0.01,
        url: 'dc_tint',
      },
      {
        key: 'horizon',
        label: 'BTZ throat horizon',
        tooltip: 'An AdS/BTZ event-horizon disc at the cone apex (0 = none).',
        step: 0.01,
        url: 'dc_hz',
      },
      {
        key: 'fanCount',
        label: 'Light-cone fan',
        tooltip: 'Number of nested null cones — WDW branches of increasing aperture.',
        step: 1,
        integer: true,
        url: 'dc_fan',
      },
      {
        key: 'warp',
        label: 'Helical warp',
        tooltip: 'Twist the ζ-zero latitude rings into standing helices.',
        step: 0.01,
        url: 'dc_warp',
      },
    ],
  },
  ...WDW_ZETA_UI_B,
}

/** Look up a suite mode's UI descriptor. */
export function getWdwZetaUi(mode: string | undefined): WdwZetaModeUi | undefined {
  if (mode === undefined) return undefined
  return WDW_ZETA_UI[mode as WdwZetaModeKey]
}
