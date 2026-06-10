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

import { QUALITY_PRESETS, SHARED_RENDERING } from './quantumTypeShared'
import type { QuantumTypeEntry, QuantumTypeKey } from './types'

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
        max: 3,
        recommended: 3,
        recommendedReason:
          'The Evans landscape is intrinsically a 3D box volume (Re z, Im z, θ) — there is no higher-dimensional extension',
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
]
