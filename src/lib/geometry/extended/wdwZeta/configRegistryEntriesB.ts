/**
 * WDW ⊗ ζ suite UI registry — second half of the mode entries.
 *
 * Split out of {@link module:lib/geometry/extended/wdwZeta/configRegistry} purely
 * to keep each file under the 600-line ceiling; `configRegistry` spreads this
 * partial record into the single exported {@link WDW_ZETA_UI}. Adding a mode is
 * still one entry — pick whichever half has room.
 *
 * @module lib/geometry/extended/wdwZeta/configRegistryEntriesB
 */

import {
  ADELIC_WAVEFUNCTION_PRESETS,
  ADELIC_WAVEFUNCTION_RANGES,
  ADELIC_WAVEFUNCTION_SCENARIOS,
  DEFAULT_ADELIC_WAVEFUNCTION_CONFIG,
} from './adelicWavefunction'
import type { WdwZetaModeUi } from './configRegistry'
import {
  DEFAULT_FIELD_ONE_ELEMENT_CONFIG,
  FIELD_ONE_ELEMENT_PRESETS,
  FIELD_ONE_ELEMENT_RANGES,
  FIELD_ONE_ELEMENT_SCENARIOS,
} from './fieldOneElement'
import {
  DEFAULT_PRIMON_MULTIVERSE_CONFIG,
  PRIMON_MULTIVERSE_PRESETS,
  PRIMON_MULTIVERSE_RANGES,
  PRIMON_MULTIVERSE_SCENARIOS,
} from './primonMultiverse'
import {
  DEFAULT_SELBERG_SPECTRUM_CONFIG,
  SELBERG_SPECTRUM_PRESETS,
  SELBERG_SPECTRUM_RANGES,
  SELBERG_SPECTRUM_SCENARIOS,
} from './selbergSpectrum'
import type { WdwZetaModeKey } from './shared'
import {
  DEFAULT_WEIL_POSITIVITY_CONFIG,
  WEIL_POSITIVITY_PRESETS,
  WEIL_POSITIVITY_RANGES,
  WEIL_POSITIVITY_SCENARIOS,
} from './weilPositivity'

/** Second-half suite UI entries, spread into `WDW_ZETA_UI` by `configRegistry`. */
export const WDW_ZETA_UI_B: Partial<Record<WdwZetaModeKey, WdwZetaModeUi>> = {
  weilPositivity: {
    label: 'Ghost Sector',
    ranges: WEIL_POSITIVITY_RANGES,
    presets: WEIL_POSITIVITY_PRESETS,
    defaultConfig: DEFAULT_WEIL_POSITIVITY_CONFIG,
    scenarios: WEIL_POSITIVITY_SCENARIOS,
    fields: [
      {
        key: 'zeroCount',
        label: 'Zeros in form',
        tooltip: 'Number of ζ zeros entering the Weil explicit-formula quadratic form.',
        step: 1,
        integer: true,
        url: 'wp_nz',
      },
      {
        key: 'primeWeight',
        label: 'Prime term weight',
        tooltip: 'Weight of the prime side of the explicit formula in the positivity landscape.',
        step: 0.01,
        url: 'wp_pw',
      },
      {
        key: 'bowlCurve',
        label: 'Bowl curvature',
        tooltip: 'Steepness of the Weil quadratic-form basin.',
        step: 0.01,
        url: 'wp_bc',
      },
      {
        key: 'kahlerMix',
        label: 'Vacuum mound',
        tooltip: 'Blend a coherent-state Gaussian e^{−r²} (the |α=0⟩ vacuum) into the basin floor.',
        step: 0.01,
        url: 'wp_km',
      },
      {
        key: 'ringGain',
        label: 'Contour rings',
        tooltip: 'Brightness of the iso-positivity contour rings.',
        step: 0.01,
        url: 'wp_rg',
      },
      {
        key: 'offLineZero',
        label: 'Inject off-line zero',
        tooltip: 'Add an off-critical-line zero — carving a negative-norm ghost well (κ₋ > 0).',
        kind: 'switch',
        url: 'wp_ghost',
      },
      {
        key: 'offLineOffset',
        label: 'Off-line offset',
        tooltip: 'Distance of the injected zero from the critical line.',
        step: 0.01,
        showIf: 'offLineZero',
        url: 'wp_go',
      },
    ],
  },
  primonMultiverse: {
    label: 'Third-Quantized Multiverse',
    ranges: PRIMON_MULTIVERSE_RANGES,
    presets: PRIMON_MULTIVERSE_PRESETS,
    defaultConfig: DEFAULT_PRIMON_MULTIVERSE_CONFIG,
    scenarios: PRIMON_MULTIVERSE_SCENARIOS,
    fields: [
      {
        key: 'beta',
        label: 'Inverse temperature β',
        tooltip: 'Primon-gas β; occupations n_p = 1/(p^β − 1). β → 1⁺ is the Hagedorn ignition.',
        step: 0.01,
        url: 'pm_b',
      },
      {
        key: 'primeCount',
        label: 'Prime quanta',
        tooltip: 'Number of prime "universe-quanta" placed in the constellation.',
        step: 1,
        integer: true,
        url: 'pm_n',
      },
      {
        key: 'latticeMode',
        label: 'Lattice (spiral / AdS / k-shells)',
        tooltip:
          'Constellation geometry: 0 = log-spiral, 1 = AdS Poincaré-ball (primes crowd the boundary), 2 = free-scalar-field momentum k-shells.',
        step: 1,
        integer: true,
        url: 'pm_lat',
      },
      {
        key: 'occScale',
        label: 'Occupation scale',
        tooltip: 'Scale the prime-node radii by their Bose occupation n_p.',
        step: 0.01,
        url: 'pm_occ',
      },
      {
        key: 'pairLinks',
        label: 'Universe–antiuniverse links',
        tooltip: 'Draw faint tubes linking opposite-momentum nucleation pairs.',
        kind: 'switch',
        url: 'pm_pair',
      },
      {
        key: 'linkGain',
        label: 'Link brightness',
        tooltip: 'Brightness/extent of the universe–antiuniverse link tubes.',
        step: 0.01,
        showIf: 'pairLinks',
        url: 'pm_link',
      },
    ],
  },
  selbergSpectrum: {
    label: 'Selberg Length Spectrum',
    ranges: SELBERG_SPECTRUM_RANGES,
    presets: SELBERG_SPECTRUM_PRESETS,
    defaultConfig: DEFAULT_SELBERG_SPECTRUM_CONFIG,
    scenarios: SELBERG_SPECTRUM_SCENARIOS,
    fields: [
      {
        key: 'geodesicCount',
        label: 'Closed geodesics',
        tooltip:
          'Number of glowing closed-geodesic bands wrapping the surface (the length spectrum).',
        step: 1,
        integer: true,
        url: 'ss_n',
      },
      {
        key: 'lengthCutoff',
        label: 'Length cutoff',
        tooltip: 'Longest geodesic length ℓ_γ included in the trace-formula spectrum.',
        step: 1,
        integer: true,
        url: 'ss_lc',
      },
      {
        key: 'funnelMode',
        label: 'Surface (pseudo / AdS / pants)',
        tooltip:
          'Hyperbolic surface: 0 = pseudosphere funnel, 1 = AdS catenoid throat, 2 = pair-of-pants neck.',
        step: 1,
        integer: true,
        url: 'ss_fn',
      },
      {
        key: 'windingGain',
        label: 'Geodesic winding',
        tooltip: 'Density of the trace-formula oscillation winding the surface.',
        step: 0.01,
        url: 'ss_wg',
      },
      {
        key: 'surfaceOpacity',
        label: 'Funnel opacity',
        tooltip: 'Brightness of the translucent constant-negative-curvature scaffold.',
        step: 0.01,
        url: 'ss_op',
      },
    ],
  },
  adelicWavefunction: {
    label: 'Adelic Wavefunction',
    ranges: ADELIC_WAVEFUNCTION_RANGES,
    presets: ADELIC_WAVEFUNCTION_PRESETS,
    defaultConfig: DEFAULT_ADELIC_WAVEFUNCTION_CONFIG,
    scenarios: ADELIC_WAVEFUNCTION_SCENARIOS,
    fields: [
      {
        key: 'treeDepth',
        label: 'Tree depth',
        tooltip: 'Levels of each (p+1)-regular Bruhat–Tits tree (p-adic geometry).',
        step: 1,
        integer: true,
        url: 'aw_d',
      },
      {
        key: 'primeCount',
        label: 'Prime places',
        tooltip: 'Number of prime trees in the adelic product ψ = ψ_∞ Π_p ψ_p.',
        step: 1,
        integer: true,
        url: 'aw_n',
      },
      {
        key: 'branchSpread',
        label: 'Branch spread',
        tooltip: 'Angular spread of each tree’s branches radiating from the Archimedean core.',
        step: 0.01,
        url: 'aw_s',
      },
      {
        key: 'foldExponent',
        label: 'Branching ratio',
        tooltip:
          'IFS fold exponent — the p-adic branching ratio that tightens or loosens the self-similar forest.',
        step: 0.01,
        url: 'aw_fe',
      },
      {
        key: 'archCore',
        label: 'Archimedean core',
        tooltip: 'Size/brightness of the real-place factor ψ_∞ = e^{−πx²} blooming at the centre.',
        step: 0.01,
        url: 'aw_arc',
      },
    ],
  },
  fieldOneElement: {
    label: 'Field With One Element 𝔽₁',
    ranges: FIELD_ONE_ELEMENT_RANGES,
    presets: FIELD_ONE_ELEMENT_PRESETS,
    defaultConfig: DEFAULT_FIELD_ONE_ELEMENT_CONFIG,
    scenarios: FIELD_ONE_ELEMENT_SCENARIOS,
    fields: [
      {
        key: 'maxOrder',
        label: 'Cyclotomic orders N',
        tooltip:
          'Highest ring order N: the spire stacks the regular n-gons (n-th roots of unity μ_n) for n = 1..N.',
        step: 1,
        integer: true,
        url: 'f1_n',
      },
      {
        key: 'qDeform',
        label: 'q → 1 deformation',
        tooltip:
          'q-integer deformation: q = 1 is pure 𝔽₁ (sharp n-gons), q > 1 rounds them toward the 𝔽_q Frobenius circles.',
        step: 0.01,
        url: 'f1_q',
      },
      {
        key: 'towerTwist',
        label: 'Tower twist',
        tooltip:
          'Golden-angle twist per ring — 0 = a straight stack, larger = a spiralling cyclotomic tower.',
        step: 0.01,
        url: 'f1_tw',
      },
      {
        key: 'primeGlow',
        label: 'Prime-ring glow',
        tooltip:
          'Emphasis on the prime-order rings (the closed points of Spec ℤ) and the archimedean apex.',
        step: 0.01,
        url: 'f1_pg',
      },
      {
        key: 'vertexSize',
        label: 'Root-of-unity beads',
        tooltip: 'Radius of the glowing n-th-root-of-unity vertex beads.',
        step: 0.001,
        url: 'f1_v',
      },
    ],
  },
}
