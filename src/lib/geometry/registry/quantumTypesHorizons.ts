/**
 * Horizon-mode Quantum Type entries — Coherence Horizon, Riemann Zeta, and
 * Hilbert–Pólya Spectrum.
 *
 * All are analytic, uniform/LUT-driven modes sharing the same runtime shape
 * (dedicated volumetric main block, `mixed` default color algorithm). The
 * first two are Tangherlini-horizon modes (3D–11D with a (d−2)-exponent
 * horizon wall); Hilbert–Pólya is the 3D-only Evans-landscape filament
 * volume. Split from `quantumTypes.ts` to keep the main registry file within
 * the line budget; the entries are spread back into `QUANTUM_TYPE_REGISTRY`
 * at the exact position they previously occupied (after `antiDeSitter`,
 * before `pauliSpinor`) so map iteration order is unchanged.
 *
 * @module lib/geometry/registry/quantumTypesHorizons
 */

import type { WdwZetaModeKey } from '@/lib/geometry/extended/wdwZeta/shared'

import { QUALITY_PRESETS, SHARED_RENDERING } from './quantumTypeShared'
import type { QuantumTypeEntry, QuantumTypeKey } from './types'

/**
 * Build a registry entry for a WDW ⊗ ζ suite mode. All ten share the same
 * runtime shape (dedicated `wdwZetaVolume` strategy, `mixed` default color, 3D
 * only); only the identity, ids, and URL params differ. Returns a one-element
 * tuple array so it can be spread into the entries list.
 *
 * @param opts - Per-mode identity, unique shader/state ids, and URL params.
 * @returns A single `[key, entry]` tuple wrapped in an array.
 */
function makeWdwZetaEntry(opts: {
  key: WdwZetaModeKey
  name: string
  description: string
  shaderUniformId: number
  stateSaveId: number
  serializableParams: readonly string[]
}): readonly (readonly [QuantumTypeKey, QuantumTypeEntry])[] {
  return [
    [
      opts.key,
      {
        key: opts.key,
        name: opts.name,
        description: opts.description,
        category: 'analytic',
        runtime: {
          dataPath: 'analyticWavefunction',
          strategy: 'wdwZetaVolume',
          evolutionReset: 'schroedingerAnalytic',
          shaderUniformId: opts.shaderUniformId,
          stateSaveId: opts.stateSaveId,
          defaultColorAlgorithm: 'mixed',
          supportsOpenQuantum: false,
        },
        dimensions: {
          min: 3,
          max: 4,
          recommended: 3,
          recommendedReason:
            'A WDW ⊗ ζ suite constraint volume. 3D shows the canonical form; 4D lifts it into a genuine 4th axis — rotating an XW/YW/ZW plane sweeps the visible slice through the locked tesseract-class structure.',
        },
        rendering: SHARED_RENDERING,
        animation: { hasTypeSpecificAnimations: false, systems: {} },
        urlSerialization: {
          typeKey: opts.key,
          serializableParams: [...opts.serializableParams],
        },
        ui: {
          controlsComponentKey: 'SchroedingerControls',
          hasTimelineControls: true,
          qualityPresets: QUALITY_PRESETS,
        },
        internal: {
          objectType: 'schroedinger',
          quantumMode: opts.key,
          configStoreKey: 'schroedinger',
          configSubKey: opts.key,
        },
      },
    ],
  ]
}

/** Registry entries for the horizon-family analytic modes. */
export const HORIZON_QUANTUM_TYPE_ENTRIES: readonly (readonly [
  QuantumTypeKey,
  QuantumTypeEntry,
])[] = [
  [
    'coherenceHorizon',
    {
      key: 'coherenceHorizon',
      name: 'Coherence Horizon',
      description:
        'Coherence-sourced gravity: a cat-state superposition whose quantum coherence sources a Tangherlini black hole — null-geodesic lensing, photon ring, and a horizon that evaporates under decoherence.',
      category: 'analytic',
      runtime: {
        dataPath: 'analyticWavefunction',
        strategy: 'coherenceHorizon',
        evolutionReset: 'schroedingerAnalytic',
        shaderUniformId: 10,
        stateSaveId: 12,
        // The geodesic main block implements only mixed/phase/blackbody/
        // viridis/densityContours; the analytic default is not among them.
        defaultColorAlgorithm: 'mixed',
        supportsOpenQuantum: false,
      },
      dimensions: {
        min: 3,
        max: 11,
        recommended: 3,
        recommendedReason:
          '3D shows the classic shadow + photon ring; higher dimensions sharpen the lensing wall via the (d−2) Tangherlini exponent',
      },
      rendering: SHARED_RENDERING,
      animation: {
        hasTypeSpecificAnimations: false,
        systems: {},
      },
      urlSerialization: {
        typeKey: 'coherenceHorizon',
        serializableParams: ['ch_dec', 'ch_sep', 'ch_w', 'ch_k', 'ch_hs', 'ch_rg', 'ch_glow'],
      },
      ui: {
        controlsComponentKey: 'SchroedingerControls',
        hasTimelineControls: true,
        qualityPresets: QUALITY_PRESETS,
      },
      internal: {
        objectType: 'schroedinger',
        quantumMode: 'coherenceHorizon',
        configStoreKey: 'schroedinger',
        configSubKey: 'coherenceHorizon',
      },
    },
  ],

  [
    'riemannZeta',
    {
      key: 'riemannZeta',
      name: 'Arithmetic Horizon',
      description:
        'Riemann ζ-zero spectral synthesis: prime-number shells reconstructed from the non-trivial zeros (Hilbert–Pólya / explicit formula), with a Hagedorn-temperature ignition and a Berry–Keating dilation horizon.',
      category: 'analytic',
      runtime: {
        dataPath: 'analyticWavefunction',
        strategy: 'riemannZeta',
        evolutionReset: 'schroedingerAnalytic',
        shaderUniformId: 11,
        stateSaveId: 13,
        // The dedicated volumetric main block implements only mixed/phase/
        // blackbody/viridis/densityContours; the analytic default is not among them.
        defaultColorAlgorithm: 'mixed',
        supportsOpenQuantum: false,
      },
      dimensions: {
        min: 3,
        max: 11,
        recommended: 3,
        recommendedReason:
          '3D shows the concentric prime shells; higher dimensions sharpen the Berry–Keating redshift wall via the (d−2) Tangherlini exponent',
      },
      rendering: SHARED_RENDERING,
      animation: {
        hasTypeSpecificAnimations: false,
        systems: {},
      },
      urlSerialization: {
        typeKey: 'riemannZeta',
        serializableParams: [
          'rz_src',
          'rz_nz',
          'rz_beta',
          'rz_rh',
          'rz_l',
          'rz_m',
          'rz_flow',
          'rz_glow',
          'rz_cut',
        ],
      },
      ui: {
        controlsComponentKey: 'SchroedingerControls',
        hasTimelineControls: true,
        qualityPresets: QUALITY_PRESETS,
      },
      internal: {
        objectType: 'schroedinger',
        quantumMode: 'riemannZeta',
        configStoreKey: 'schroedinger',
        configSubKey: 'riemannZeta',
      },
    },
  ],

  [
    'hilbertPolya',
    {
      key: 'hilbertPolya',
      name: 'Hilbert–Pólya Spectrum',
      description:
        'Spectral filaments of the Riemann operator: every zero pinned to the critical plane Im z = 0, with the Matsubara cancellation veil lifting along the θ contour-rotation axis.',
      category: 'analytic',
      runtime: {
        dataPath: 'analyticWavefunction',
        strategy: 'hilbertPolya',
        evolutionReset: 'schroedingerAnalytic',
        shaderUniformId: 12,
        stateSaveId: 14,
        // The dedicated volumetric main block implements only mixed/phase/
        // blackbody/viridis/densityContours; the analytic default is not among them.
        defaultColorAlgorithm: 'mixed',
        supportsOpenQuantum: false,
      },
      dimensions: {
        min: 3,
        max: 4,
        recommended: 3,
        recommendedReason:
          'The Evans landscape is a 3D box (Re z, Im z, θ); in 4D a 4th Matsubara-frequency axis ω lifts the spectral filaments into a stacked sheaf, swept by rotating the W plane',
      },
      rendering: SHARED_RENDERING,
      animation: {
        hasTypeSpecificAnimations: false,
        systems: {},
      },
      urlSerialization: {
        typeKey: 'hilbertPolya',
        serializableParams: [
          'hp_zmax',
          'hp_y',
          'hp_fw',
          'hp_glow',
          'hp_fog',
          'hp_plane',
          'hp_preset',
        ],
      },
      ui: {
        controlsComponentKey: 'SchroedingerControls',
        hasTimelineControls: true,
        qualityPresets: QUALITY_PRESETS,
      },
      internal: {
        objectType: 'schroedinger',
        quantumMode: 'hilbertPolya',
        configStoreKey: 'schroedinger',
        configSubKey: 'hilbertPolya',
      },
    },
  ],

  [
    'bifurcationHorizon',
    {
      key: 'bifurcationHorizon',
      name: 'Bifurcation Horizon',
      description:
        'The Riemann critical strip as the maximally-extended (Kruskal) eternal black hole: the critical line Re s = ½ is the Einstein–Rosen-bridge throat, the functional-equation involution s ↦ 1 − s̄ is the Tomita modular conjugation J (the wedge reflection), and the ζ-zeros are GUE-spaced rings pinned to the throat.',
      category: 'analytic',
      runtime: {
        dataPath: 'analyticWavefunction',
        strategy: 'bifurcationHorizon',
        evolutionReset: 'schroedingerAnalytic',
        shaderUniformId: 13,
        stateSaveId: 15,
        // The dedicated volumetric main block implements only mixed/phase/
        // blackbody/viridis/densityContours; the analytic default is not among them.
        defaultColorAlgorithm: 'mixed',
        supportsOpenQuantum: false,
      },
      dimensions: {
        min: 3,
        max: 11,
        recommended: 3,
        recommendedReason:
          '3D shows the vertical throat with stacked zero-rings and two flaring wedges; higher dimensions fold into the perpendicular radius and sharpen the extremal redshift wall via the (d−2) Tangherlini exponent',
      },
      rendering: SHARED_RENDERING,
      animation: {
        hasTypeSpecificAnimations: false,
        systems: {},
      },
      urlSerialization: {
        typeKey: 'bifurcationHorizon',
        serializableParams: [
          'bh_neck',
          'bh_throat',
          'bh_glow',
          'bh_flow',
          'bh_swirl',
          'bh_rs',
          'bh_off',
          'bh_wind',
          'bh_therm',
          'bh_dyn',
          'bh_dynA',
          'bh_dynR',
          'bh_stiff',
        ],
      },
      ui: {
        controlsComponentKey: 'SchroedingerControls',
        hasTimelineControls: true,
        qualityPresets: QUALITY_PRESETS,
      },
      internal: {
        objectType: 'schroedinger',
        quantumMode: 'bifurcationHorizon',
        configStoreKey: 'schroedinger',
        configSubKey: 'bifurcationHorizon',
      },
    },
  ],

  [
    'modularKnot',
    {
      key: 'modularKnot',
      name: 'Modular Knot',
      description:
        'Modular geodesics knotted around the trefoil: the unit tangent bundle of the modular surface SL₂(ℝ)/SL₂(ℤ) is the trefoil complement in S³ (Ghys), so every closed geodesic lifts to a modular knot whose linking number with the trefoil core equals its Rademacher invariant Φ — the global topological winding that S(T) = arg ζ(½ + iT) realizes. RH confinement rendered as a winding number, not a potential well.',
      category: 'analytic',
      runtime: {
        dataPath: 'analyticWavefunction',
        strategy: 'modularKnot',
        evolutionReset: 'schroedingerAnalytic',
        shaderUniformId: 14,
        stateSaveId: 16,
        // The dedicated 3D-texture volumetric main block implements only mixed/
        // phase/blackbody/viridis/densityContours; the analytic default is not
        // among them.
        defaultColorAlgorithm: 'mixed',
        supportsOpenQuantum: false,
      },
      dimensions: {
        min: 3,
        max: 4,
        recommended: 3,
        recommendedReason:
          'The trefoil complement lives in the projected S³; in 4D the knot is lifted off the projection into a genuine 4th axis, so rotating the W plane unfolds the self-crossings into clean linked loops',
      },
      rendering: SHARED_RENDERING,
      animation: {
        hasTypeSpecificAnimations: false,
        systems: {},
      },
      urlSerialization: {
        typeKey: 'modularKnot',
        serializableParams: ['mk_glow', 'mk_flow', 'mk_len', 'mk_n', 'mk_tube'],
      },
      ui: {
        controlsComponentKey: 'SchroedingerControls',
        hasTimelineControls: true,
        qualityPresets: QUALITY_PRESETS,
      },
      internal: {
        objectType: 'schroedinger',
        quantumMode: 'modularKnot',
        configStoreKey: 'schroedinger',
        configSubKey: 'modularKnot',
      },
    },
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // WDW ⊗ ζ suite — "The Wavefunction of the Arithmetic Universe". Ten analytic
  // modes that merge Wheeler–DeWitt superspace with the Riemann zeta function,
  // all rendered by the shared WdwZetaVolumeStrategy / mainWdwZetaVolume block.
  // ═══════════════════════════════════════════════════════════════════════════

  [
    'constraintSeam',
    {
      key: 'constraintSeam',
      name: 'Constraint Seam',
      description:
        'The completed ξ(s) = ½ s(s−1) π^(−s/2) Γ(s/2) ζ(s) over the critical strip, folded into a luminous relief that is mirror-symmetric about the seam Re s = ½ because ξ(s) = ξ(1−s) — the functional equation is the Wheeler–DeWitt constraint made literal. The non-trivial zeros are pinned to the seam (the phase arg ξ winds once around each); a ghost-sector toggle injects a Davenport–Heilbronn off-seam zero pair, the forbidden κ₋ > 0 configuration RH says cannot exist.',
      category: 'analytic',
      runtime: {
        dataPath: 'analyticWavefunction',
        strategy: 'wdwZetaVolume',
        evolutionReset: 'schroedingerAnalytic',
        shaderUniformId: 15,
        stateSaveId: 17,
        defaultColorAlgorithm: 'mixed',
        supportsOpenQuantum: false,
      },
      dimensions: {
        min: 3,
        max: 4,
        recommended: 3,
        recommendedReason:
          'The (σ, t) critical strip lifted into a 3D relief; in 4D the seam canyon becomes a 4th-axis mirror sheet, the functional-equation involution σ ↔ 1−σ doubled into the W direction.',
      },
      rendering: SHARED_RENDERING,
      animation: {
        hasTypeSpecificAnimations: false,
        systems: {},
      },
      urlSerialization: {
        typeKey: 'constraintSeam',
        serializableParams: ['cs_t', 'cs_h', 'cs_ghost', 'cs_go'],
      },
      ui: {
        controlsComponentKey: 'SchroedingerControls',
        hasTimelineControls: true,
        qualityPresets: QUALITY_PRESETS,
      },
      internal: {
        objectType: 'schroedinger',
        quantumMode: 'constraintSeam',
        configStoreKey: 'schroedinger',
        configSubKey: 'constraintSeam',
      },
    },
  ],

  ...makeWdwZetaEntry({
    key: 'moebiusNoBoundary',
    name: 'Möbius No-Boundary Sum',
    description:
      'The Hartle–Hawking no-boundary wavefunction as a Möbius-weighted Poincaré sum over modular images (Godet 2025): ψ_HH ∝ Σ_n (μ(n)/n) Z(τ_n). The Poincaré disk is tiled by SL(2,ℤ); each fundamental-domain image is coloured by the Möbius function μ(n) ∈ {−1, 0, +1} — and the squarefree μ = 0 voids open a dark lacework. The unique modular tessellation: the universe has no other way to be tiled.',
    shaderUniformId: 16,
    stateSaveId: 18,
    serializableParams: ['mb_depth', 'mb_cut', 'mb_dome', 'mb_p'],
  }),
  ...makeWdwZetaEntry({
    key: 'forcedCell',
    name: 'Forced Cell',
    description:
      'Berry–Keating made rigid. The dilation Hamiltonian H = ½(xp + px) generates the hyperbolae x·p = E_n; Weyl quantization tiles phase space into Planck cells of area 2πℏ — the only permitted tiling. A vertical loom stacks the quantized levels E_n = the ζ-zero ordinates as glowing hyperbolic arcs over the forced cell lattice. It is a constraint, not a flow: the spectrum has no spacing freedom.',
    shaderUniformId: 17,
    stateSaveId: 19,
    serializableParams: ['fc_lvl', 'fc_cell', 'fc_x', 'fc_p'],
  }),
  ...makeWdwZetaEntry({
    key: 'turningSurface',
    name: 'Turning Surface',
    description:
      'The Wheeler–DeWitt minisuperspace turning surface U(a, φ) = 0 rendered as an Airy fold caustic: oscillatory WKB fringes on the classically-allowed side, exponential decay on the forbidden side, the caustic ridge ablaze. The explicit formula scores prime-power ridges across the allowed face — the boundary of classical existence, where motion is forbidden beyond.',
    shaderUniformId: 18,
    stateSaveId: 20,
    serializableParams: ['ts_m', 'ts_lam', 'ts_fr', 'ts_tc', 'ts_p'],
  }),
  ...makeWdwZetaEntry({
    key: 'primonMultiverse',
    name: 'Third-Quantized Multiverse',
    description:
      'Third quantization as a Fock gas of universe-quanta indexed by the primes: energy E_p = ln p, Bose occupation n_p = 1/(p^β − 1), partition function ζ(β). As β → 1⁺ the low primes blaze — the Hagedorn ignition. A sparse prime constellation whose occupations are forced by ζ at each temperature: the unique equilibrium, not an animation.',
    shaderUniformId: 19,
    stateSaveId: 21,
    serializableParams: ['pm_b', 'pm_n', 'pm_pair', 'pm_p'],
  }),
  ...makeWdwZetaEntry({
    key: 'frobeniusWheel',
    name: 'Frobenius Wheel',
    description:
      'Deligne purity — the cleanest "no other option" in mathematics. For a curve over 𝔽_q the Frobenius eigenvalues on weight-w cohomology are forced onto the circle |α| = q^{w/2} (the proven Riemann Hypothesis over finite fields). Nested luminous weight-rings, lifted into shells by the weight filtration of superspace, carry eigenvalue points pinned exactly to each circle.',
    shaderUniformId: 20,
    stateSaveId: 22,
    serializableParams: ['fw_q', 'fw_w', 'fw_g', 'fw_p'],
  }),
  ...makeWdwZetaEntry({
    key: 'dewittCone',
    name: 'DeWitt Null Cone',
    description:
      'The indefinite (Lorentzian) DeWitt supermetric’s light cone — a cone, not an arrow. The conformal/dilation mode is the single timelike axis; Ĥψ = 0 is a mass-shell constraint. A double cone flares outward along the timelike axis, the expanding and contracting WDW branches tinted warm and cool, ringed by ζ-zero-spaced standing-wave latitudes.',
    shaderUniformId: 21,
    stateSaveId: 23,
    serializableParams: ['dc_slope', 'dc_rings', 'dc_tint', 'dc_p'],
  }),
  ...makeWdwZetaEntry({
    key: 'selbergSpectrum',
    name: 'Selberg Length Spectrum',
    description:
      'The Wheeler–DeWitt Laplacian on a hyperbolic minisuperspace ℍ/Γ. The Selberg trace formula binds the lengths of closed geodesics to the Laplace eigenvalues — a genuine Hilbert–Pólya realization where self-adjointness forces a real spectrum. Glowing closed geodesics spiral a constant-negative-curvature pseudosphere, their windings set by the length spectrum.',
    shaderUniformId: 22,
    stateSaveId: 24,
    serializableParams: ['ss_n', 'ss_lc', 'ss_op', 'ss_p'],
  }),
  ...makeWdwZetaEntry({
    key: 'adelicWavefunction',
    name: 'Adelic Wavefunction',
    description:
      'Adelic quantum cosmology: the wavefunction factorizes over all places, ψ = ψ_∞ · Π_p ψ_p. Each prime contributes its (p+1)-regular Bruhat–Tits tree — the unique p-adic geometry — and the trees radiate as a luminous fractal forest from a bright Archimedean core. The Euler product made architecture: a forced branching, not a flow.',
    shaderUniformId: 23,
    stateSaveId: 25,
    serializableParams: ['aw_d', 'aw_n', 'aw_s', 'aw_p'],
  }),
  ...makeWdwZetaEntry({
    key: 'weilPositivity',
    name: 'Ghost Sector',
    description:
      'The norm of the no-boundary state, made visible. The Weil explicit-formula quadratic form Q_W is a luminous positivity landscape — a golden bowl rippled by the ζ zeros — and RH ⟺ Q_W ⪰ 0: no negative-norm ghost sectors (κ₋ = 0). Injecting an off-line zero carves a violet ghost well where positivity fails: the configuration the constraint forbids.',
    shaderUniformId: 24,
    stateSaveId: 26,
    serializableParams: ['wp_nz', 'wp_pw', 'wp_ghost', 'wp_go', 'wp_p'],
  }),
  ...makeWdwZetaEntry({
    key: 'fieldOneElement',
    name: 'Field With One Element 𝔽₁',
    description:
      'The dream counterpart to the Frobenius Wheel. Over 𝔽_q the Riemann Hypothesis is a theorem; over the "field with one element" 𝔽₁ it is the hope — ℤ as a curve over 𝔽₁, a Weil-style proof yielding classical RH. Linear algebra collapses to combinatorics (GL_n(𝔽₁) = S_n) and 𝔽̄₁ = μ_∞, the roots of unity. A cyclotomic spire of regular n-gons stacks the n-th roots of unity by order — point, segment, triangle, … → a circle at the archimedean apex ∞ — the prime-order rings ablaze as the points of Spec ℤ, dialled toward the 𝔽_q circles by the q → 1 degeneration.',
    shaderUniformId: 25,
    stateSaveId: 27,
    serializableParams: ['f1_n', 'f1_q', 'f1_tw', 'f1_pg', 'f1_v', 'f1_p'],
  }),
]
