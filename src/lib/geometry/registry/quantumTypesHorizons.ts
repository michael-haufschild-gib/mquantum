/**
 * Horizon-mode Quantum Type entries — Coherence Horizon and Riemann Zeta.
 *
 * Both are analytic, uniform/LUT-driven Tangherlini-horizon modes sharing the
 * same runtime shape (dedicated volumetric main block, `mixed` default color
 * algorithm, 3D–11D with a (d−2)-exponent horizon wall). Split from
 * `quantumTypes.ts` to keep the main registry file within the line budget;
 * the entries are spread back into `QUANTUM_TYPE_REGISTRY` at the exact
 * position they previously occupied (after `antiDeSitter`, before
 * `pauliSpinor`) so map iteration order is unchanged.
 *
 * @module lib/geometry/registry/quantumTypesHorizons
 */

import { QUALITY_PRESETS, SHARED_RENDERING } from './quantumTypeShared'
import type { QuantumTypeEntry, QuantumTypeKey } from './types'

/** Registry entries for the two Tangherlini-horizon analytic modes. */
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
]
