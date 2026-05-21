/**
 * Quantum Type Registry — Flat, User-Facing Model
 *
 * Every user-visible quantum type gets one entry with identical schema.
 * No hierarchy — Harmonic Oscillator and Pauli Spinor are peers.
 *
 * Internal plumbing (ObjectType + SchroedingerQuantumMode) is bridged
 * via the `internal` field on each entry.
 */

import {
  BELL_SERIALIZABLE_PARAMS,
  DEFAULT_ANALYTIC_COLOR_ALGORITHM,
  DEFAULT_COMPUTE_COLOR_ALGORITHM,
  QUALITY_PRESETS,
  SHARED_RENDERING,
  SLICE_ANIMATION,
} from './quantumTypeShared'
import { QUANTUM_TYPE_VALIDATION } from './quantumValidation'
import type { QuantumTypeEntry, QuantumTypeKey, QuantumTypeRegistry } from './types'

/** The flat Quantum Type Registry — single source of truth for all type metadata. */
export const QUANTUM_TYPE_REGISTRY: QuantumTypeRegistry = new Map<QuantumTypeKey, QuantumTypeEntry>(
  [
    // ─── Analytic Modes ────────────────────────────────────────────────────────

    [
      'harmonicOscillator',
      {
        key: 'harmonicOscillator',
        name: 'Harmonic Oscillator',
        description: 'N-dimensional quantum superposition states.',
        category: 'analytic',
        runtime: {
          dataPath: 'analyticWavefunction',
          strategy: 'analytic',
          evolutionReset: 'schroedingerAnalytic',
          shaderUniformId: 0,
          stateSaveId: 0,
          defaultColorAlgorithm: DEFAULT_ANALYTIC_COLOR_ALGORITHM,
          analyticFamily: 'harmonicOscillator',
          supportsOpenQuantum: true,
        },
        validation: QUANTUM_TYPE_VALIDATION.harmonicOscillator,
        dimensions: {
          min: 2,
          max: 11,
          recommended: 4,
          recommendedReason: '4D provides rich quantum interference patterns with good performance',
        },
        rendering: SHARED_RENDERING,
        animation: {
          hasTypeSpecificAnimations: true,
          systems: { sliceAnimation: SLICE_ANIMATION },
        },
        urlSerialization: {
          typeKey: 'harmonicOscillator',
          serializableParams: ['presetName', 'seed', 'termCount', 'timeScale', 'sampleCount'],
        },
        ui: {
          controlsComponentKey: 'SchroedingerControls',
          hasTimelineControls: true,
          qualityPresets: QUALITY_PRESETS,
        },
        internal: {
          objectType: 'schroedinger',
          quantumMode: 'harmonicOscillator',
          configStoreKey: 'schroedinger',
        },
      },
    ],

    [
      'hydrogenND',
      {
        key: 'hydrogenND',
        name: 'Hydrogen Orbitals',
        description: 'N-dimensional hydrogen atom in 3D space.',
        category: 'analytic',
        runtime: {
          dataPath: 'analyticWavefunction',
          strategy: 'analytic',
          evolutionReset: 'schroedingerAnalytic',
          shaderUniformId: 1,
          stateSaveId: 1,
          defaultColorAlgorithm: DEFAULT_ANALYTIC_COLOR_ALGORITHM,
          analyticFamily: 'hydrogen',
          supportsOpenQuantum: true,
        },
        validation: QUANTUM_TYPE_VALIDATION.hydrogenND,
        dimensions: {
          min: 2,
          max: 11,
          recommended: 3,
          recommendedReason: 'Hydrogen atom lives in 3D physical space',
        },
        rendering: SHARED_RENDERING,
        animation: {
          hasTypeSpecificAnimations: true,
          systems: { sliceAnimation: SLICE_ANIMATION },
        },
        urlSerialization: {
          typeKey: 'hydrogenND',
          serializableParams: ['hyd_n', 'hyd_l', 'hyd_m'],
        },
        ui: {
          controlsComponentKey: 'SchroedingerControls',
          hasTimelineControls: true,
          qualityPresets: QUALITY_PRESETS,
        },
        internal: {
          objectType: 'schroedinger',
          quantumMode: 'hydrogenND',
          configStoreKey: 'schroedinger',
        },
      },
    ],

    [
      'hydrogenNDCoupled',
      {
        key: 'hydrogenNDCoupled',
        name: 'Hydrogen ND (Coupled)',
        description: 'True D-dimensional Coulomb problem with hyperspherical harmonics.',
        category: 'analytic',
        runtime: {
          dataPath: 'analyticWavefunction',
          strategy: 'analytic',
          evolutionReset: 'schroedingerAnalytic',
          shaderUniformId: 7,
          stateSaveId: 8,
          defaultColorAlgorithm: DEFAULT_ANALYTIC_COLOR_ALGORITHM,
          analyticFamily: 'hydrogen',
          supportsOpenQuantum: true,
        },
        validation: QUANTUM_TYPE_VALIDATION.hydrogenNDCoupled,
        dimensions: {
          min: 2,
          max: 11,
          recommended: 4,
          recommendedReason: '4D Coulomb problem shows novel orbital structure',
        },
        rendering: SHARED_RENDERING,
        animation: {
          hasTypeSpecificAnimations: true,
          systems: { sliceAnimation: SLICE_ANIMATION },
        },
        urlSerialization: {
          typeKey: 'hydrogenNDCoupled',
          serializableParams: [],
        },
        ui: {
          controlsComponentKey: 'SchroedingerControls',
          hasTimelineControls: true,
          qualityPresets: QUALITY_PRESETS,
        },
        internal: {
          objectType: 'schroedinger',
          quantumMode: 'hydrogenNDCoupled',
          configStoreKey: 'schroedinger',
        },
      },
    ],

    // ─── Compute Modes ─────────────────────────────────────────────────────────

    [
      'freeScalarField',
      {
        key: 'freeScalarField',
        name: 'Free Scalar Field',
        description: 'Klein-Gordon field on a lattice with real-time evolution.',
        category: 'compute',
        runtime: {
          dataPath: 'densityGrid',
          strategy: 'freeScalarField',
          evolutionReset: 'freeScalarField',
          shaderUniformId: 2,
          stateSaveId: 2,
          uniformComputeGrid: true,
          defaultColorAlgorithm: DEFAULT_COMPUTE_COLOR_ALGORITHM,
          compileContextFields: ['freeScalarInitialCondition'],
          hasPrecomputedNormals: true,
        },
        validation: QUANTUM_TYPE_VALIDATION.freeScalarField,
        dimensions: {
          min: 3,
          max: 6,
          recommended: 3,
          recommendedReason: '3D lattice for full spatial dynamics',
        },
        rendering: SHARED_RENDERING,
        animation: {
          hasTypeSpecificAnimations: false,
          systems: {},
        },
        urlSerialization: {
          typeKey: 'freeScalarField',
          serializableParams: [],
        },
        ui: {
          controlsComponentKey: 'SchroedingerControls',
          hasTimelineControls: true,
          qualityPresets: QUALITY_PRESETS,
        },
        internal: {
          objectType: 'schroedinger',
          quantumMode: 'freeScalarField',
          configStoreKey: 'schroedinger',
          configSubKey: 'freeScalar',
        },
      },
    ],

    [
      'tdseDynamics',
      {
        key: 'tdseDynamics',
        name: 'TDSE Dynamics',
        description: 'Time-dependent Schroedinger equation: wavepackets, tunneling, scattering.',
        category: 'compute',
        runtime: {
          dataPath: 'densityGrid',
          strategy: 'tdseBec',
          evolutionReset: 'tdse',
          shaderUniformId: 3,
          stateSaveId: 3,
          uniformComputeGrid: true,
          defaultColorAlgorithm: DEFAULT_COMPUTE_COLOR_ALGORITHM,
        },
        validation: QUANTUM_TYPE_VALIDATION.tdseDynamics,
        dimensions: {
          min: 3,
          max: 6,
          recommended: 3,
          recommendedReason: '3D for full spatial scattering dynamics',
        },
        rendering: SHARED_RENDERING,
        animation: {
          hasTypeSpecificAnimations: false,
          systems: {},
        },
        urlSerialization: {
          typeKey: 'tdseDynamics',
          serializableParams: ['pot', 'abs', 'diag', 'obs', 'it'],
        },
        ui: {
          controlsComponentKey: 'SchroedingerControls',
          hasTimelineControls: true,
          qualityPresets: QUALITY_PRESETS,
        },
        internal: {
          objectType: 'schroedinger',
          quantumMode: 'tdseDynamics',
          configStoreKey: 'schroedinger',
          configSubKey: 'tdse',
        },
      },
    ],

    [
      'becDynamics',
      {
        key: 'becDynamics',
        name: 'Bose-Einstein Condensate',
        description: 'Gross-Pitaevskii equation: superfluid dynamics, vortices, solitons.',
        category: 'compute',
        runtime: {
          dataPath: 'densityGrid',
          strategy: 'tdseBec',
          evolutionReset: 'bec',
          shaderUniformId: 4,
          stateSaveId: 4,
          uniformComputeGrid: true,
          defaultColorAlgorithm: DEFAULT_COMPUTE_COLOR_ALGORITHM,
        },
        validation: QUANTUM_TYPE_VALIDATION.becDynamics,
        dimensions: {
          min: 3,
          max: 6,
          recommended: 3,
          recommendedReason: '3D for vortex dynamics and superfluid behavior',
        },
        rendering: SHARED_RENDERING,
        animation: {
          hasTypeSpecificAnimations: false,
          systems: {},
        },
        urlSerialization: {
          typeKey: 'becDynamics',
          serializableParams: [],
        },
        ui: {
          controlsComponentKey: 'SchroedingerControls',
          hasTimelineControls: true,
          qualityPresets: QUALITY_PRESETS,
        },
        internal: {
          objectType: 'schroedinger',
          quantumMode: 'becDynamics',
          configStoreKey: 'schroedinger',
          configSubKey: 'bec',
        },
      },
    ],

    [
      'diracEquation',
      {
        key: 'diracEquation',
        name: 'Dirac Equation',
        description:
          'Relativistic Dirac equation: spinor dynamics, Zitterbewegung, Klein tunneling.',
        category: 'compute',
        runtime: {
          dataPath: 'densityGrid',
          strategy: 'dirac',
          evolutionReset: 'dirac',
          shaderUniformId: 5,
          stateSaveId: 5,
          uniformComputeGrid: true,
          defaultColorAlgorithm: DEFAULT_COMPUTE_COLOR_ALGORITHM,
          compileContextFields: ['diracFieldView'],
        },
        validation: QUANTUM_TYPE_VALIDATION.diracEquation,
        dimensions: {
          min: 3,
          max: 6,
          recommended: 3,
          recommendedReason: '3D for relativistic dynamics in physical space',
        },
        rendering: SHARED_RENDERING,
        animation: {
          hasTypeSpecificAnimations: false,
          systems: {},
        },
        urlSerialization: {
          typeKey: 'diracEquation',
          serializableParams: [],
        },
        ui: {
          controlsComponentKey: 'SchroedingerControls',
          hasTimelineControls: true,
          qualityPresets: QUALITY_PRESETS,
        },
        internal: {
          objectType: 'schroedinger',
          quantumMode: 'diracEquation',
          configStoreKey: 'schroedinger',
          configSubKey: 'dirac',
        },
      },
    ],

    [
      'quantumWalk',
      {
        key: 'quantumWalk',
        name: 'Quantum Walk',
        description:
          'Discrete-time quantum walk on N-D lattice: Grover search, interference topology.',
        category: 'compute',
        runtime: {
          dataPath: 'densityGrid',
          strategy: 'quantumWalk',
          evolutionReset: 'quantumWalk',
          shaderUniformId: 6,
          stateSaveId: 6,
          uniformComputeGrid: true,
          defaultColorAlgorithm: 'phaseCyclicUniform',
        },
        validation: QUANTUM_TYPE_VALIDATION.quantumWalk,
        dimensions: {
          min: 3,
          max: 7,
          recommended: 3,
          recommendedReason: '3D lattice for spatial walk dynamics',
        },
        rendering: SHARED_RENDERING,
        animation: {
          hasTypeSpecificAnimations: false,
          systems: {},
        },
        urlSerialization: {
          typeKey: 'quantumWalk',
          serializableParams: [],
        },
        ui: {
          controlsComponentKey: 'SchroedingerControls',
          hasTimelineControls: true,
          qualityPresets: QUALITY_PRESETS,
        },
        internal: {
          objectType: 'schroedinger',
          quantumMode: 'quantumWalk',
          configStoreKey: 'schroedinger',
          configSubKey: 'quantumWalk',
        },
      },
    ],

    [
      'wheelerDeWitt',
      {
        key: 'wheelerDeWitt',
        name: 'Wheeler–DeWitt',
        description:
          'Wavefunction of the universe in 3D minisuperspace: Hartle–Hawking vs Vilenkin vs DeWitt.',
        category: 'compute',
        runtime: {
          dataPath: 'densityGrid',
          strategy: 'wheelerDeWitt',
          evolutionReset: 'wheelerDeWitt',
          shaderUniformId: 9,
          stateSaveId: 9,
          defaultColorAlgorithm: DEFAULT_COMPUTE_COLOR_ALGORITHM,
        },
        validation: QUANTUM_TYPE_VALIDATION.wheelerDeWitt,
        dimensions: {
          min: 3,
          max: 3,
          recommended: 3,
          recommendedReason: 'Minisuperspace is (a, φ₁, φ₂) — 3D by construction',
        },
        rendering: SHARED_RENDERING,
        animation: {
          hasTypeSpecificAnimations: false,
          systems: {},
        },
        urlSerialization: {
          typeKey: 'wheelerDeWitt',
          serializableParams: [],
        },
        ui: {
          controlsComponentKey: 'SchroedingerControls',
          hasTimelineControls: true,
          qualityPresets: QUALITY_PRESETS,
        },
        internal: {
          objectType: 'schroedinger',
          quantumMode: 'wheelerDeWitt',
          configStoreKey: 'schroedinger',
          configSubKey: 'wheelerDeWitt',
        },
      },
    ],

    [
      'antiDeSitter',
      {
        key: 'antiDeSitter',
        name: 'Anti-de Sitter',
        description: 'Closed-form bulk scalar eigenstates on AdS_d (d=3..7) in the Poincaré ball.',
        category: 'compute',
        runtime: {
          dataPath: 'densityGrid',
          strategy: 'antiDeSitter',
          evolutionReset: 'antiDeSitter',
          shaderUniformId: 8,
          stateSaveId: 10,
          defaultColorAlgorithm: DEFAULT_COMPUTE_COLOR_ALGORITHM,
          sampleSpaceRotation: true,
        },
        validation: QUANTUM_TYPE_VALIDATION.antiDeSitter,
        dimensions: {
          min: 3,
          max: 7,
          recommended: 4,
          recommendedReason: 'AdS₄ hosts the classic Δ=3 massless scalar and the Δ=2 BF edge',
        },
        rendering: SHARED_RENDERING,
        animation: {
          hasTypeSpecificAnimations: false,
          systems: {},
        },
        urlSerialization: {
          typeKey: 'antiDeSitter',
          serializableParams: [],
        },
        ui: {
          controlsComponentKey: 'SchroedingerControls',
          hasTimelineControls: true,
          qualityPresets: QUALITY_PRESETS,
        },
        internal: {
          objectType: 'schroedinger',
          quantumMode: 'antiDeSitter',
          configStoreKey: 'schroedinger',
          configSubKey: 'antiDeSitter',
        },
      },
    ],

    // ─── Pauli Spinor ──────────────────────────────────────────────────────────

    [
      'pauliSpinor',
      {
        key: 'pauliSpinor',
        name: 'Pauli Spinor',
        description:
          'Two-component spinor in a magnetic field: spin precession, Stern-Gerlach splitting.',
        category: 'compute',
        runtime: {
          dataPath: 'spinorGrid',
          strategy: 'pauli',
          evolutionReset: 'pauli',
          stateSaveId: 7,
          defaultColorAlgorithm: 'pauliSpinDensity',
        },
        validation: QUANTUM_TYPE_VALIDATION.pauliSpinor,
        dimensions: {
          min: 3,
          max: 6,
          recommended: 3,
          recommendedReason:
            '3D provides intuitive spin dynamics with magnetic field in physical space',
        },
        rendering: SHARED_RENDERING,
        animation: {
          hasTypeSpecificAnimations: true,
          systems: {
            sliceAnimation: {
              ...SLICE_ANIMATION,
              enabledKey: 'pauliSliceAnimationEnabled',
            },
          },
        },
        urlSerialization: {
          typeKey: 'pauliSpinor',
          serializableParams: [],
        },
        ui: {
          controlsComponentKey: 'PauliSpinorControls',
          hasTimelineControls: true,
          qualityPresets: QUALITY_PRESETS,
        },
        internal: {
          objectType: 'pauliSpinor',
          configStoreKey: 'pauliSpinor',
        },
      },
    ],

    // ─── Bell Pair / CHSH Experiment ───────────────────────────────────────────

    [
      'bellTest',
      {
        key: 'bellTest',
        name: 'Bell Test',
        description:
          'Two-qubit Bell experiment with CHSH inequality: spin-entangled pair, four measurement angles, Tsirelson bound vs. classical bound (2 ↔ 2√2).',
        category: 'compute',
        runtime: {
          dataPath: 'spinorGrid',
          strategy: 'bellPair',
          evolutionReset: 'bellPair',
          stateSaveId: 11,
          defaultColorAlgorithm: 'pauliSpinDensity',
        },
        validation: QUANTUM_TYPE_VALIDATION.bellTest,
        dimensions: {
          // Bell physics lives in the spin sector. We expose 3D because the
          // existing rendering pipeline assumes ≥3 spatial axes for the
          // canvas; higher dimensions add nothing and are gated off.
          min: 3,
          max: 3,
          recommended: 3,
          recommendedReason: 'CHSH is a spin-sector experiment; the canvas only needs 3D.',
        },
        rendering: SHARED_RENDERING,
        animation: {
          // The trial loop animates the CHSH plot in the analysis panel,
          // not via the timeline drawer.
          hasTypeSpecificAnimations: false,
          systems: {},
        },
        urlSerialization: {
          typeKey: 'bellTest',
          serializableParams: BELL_SERIALIZABLE_PARAMS,
        },
        ui: {
          // M5 ships the BellExperimentSection in components/sections/Analysis.
          // Until then, the dynamic component loader falls back to a generic
          // placeholder when this key is unknown.
          controlsComponentKey: 'BellPairControls',
          hasTimelineControls: false,
          qualityPresets: QUALITY_PRESETS,
        },
        internal: {
          objectType: 'bellPair',
          configStoreKey: 'bellPair',
        },
      },
    ],
  ]
)
