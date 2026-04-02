/**
 * Quantum Type Registry — Flat, User-Facing Model
 *
 * Every user-visible quantum type gets one entry with identical schema.
 * No hierarchy — Harmonic Oscillator and Pauli Spinor are peers.
 *
 * Internal plumbing (ObjectType + SchroedingerQuantumMode) is bridged
 * via the `internal` field on each entry.
 */

import type { QuantumTypeEntry, QuantumTypeKey, QuantumTypeRegistry } from './types'

/**
 * Shared rendering capabilities for all types (all use the same WebGPU
 * raymarching pipeline — the differences are in compute passes, not rendering).
 */
const SHARED_RENDERING = {
  supportsFaces: true,
  supportsEdges: true,
  supportsPoints: false,
  renderMethod: 'raymarch' as const,
  faceDetection: 'none' as const,
  requiresRaymarching: true,
  supportsEmission: true,
}

/**
 * Shared slice animation definition (4D+ only), used by most types.
 */
const SLICE_ANIMATION = {
  name: 'Slice Animation',
  description: 'Animate through higher-dimensional slices (4D+ only)',
  enabledByDefault: false,
  minDimension: 4,
  enabledKey: 'sliceAnimationEnabled',
  params: {
    sliceSpeed: {
      min: 0.01,
      max: 0.1,
      default: 0.02,
      step: 0.01,
      label: 'Speed',
      description: 'Speed of slice movement',
    },
    sliceAmplitude: {
      min: 0.1,
      max: 1.0,
      default: 0.3,
      step: 0.05,
      label: 'Amplitude',
      description: 'How far the slice moves in each extra dimension',
    },
  },
}

const QUALITY_PRESETS = ['draft', 'standard', 'high', 'ultra']

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
        dimensions: {
          min: 1,
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

    // ─── Pauli Spinor ──────────────────────────────────────────────────────────

    [
      'pauliSpinor',
      {
        key: 'pauliSpinor',
        name: 'Pauli Spinor',
        description:
          'Two-component spinor in a magnetic field: spin precession, Stern-Gerlach splitting.',
        category: 'compute',
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
  ]
)
