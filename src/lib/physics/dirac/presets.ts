/**
 * Curated Dirac equation scenario presets.
 *
 * Each preset overrides specific DiracConfig fields to set up a
 * physically interesting initial configuration. Presets are
 * dimension-agnostic unless they declare a requiredDimension gate.
 * They do NOT set latticeDim or gridSize. The user controls dimensions separately.
 *
 * Spacing values are chosen to resolve the Compton wavelength
 * λ_C = ℏ/(mc) with at least 10 grid points, while keeping the
 * physical domain large enough for the 20% PML absorber.
 */

import type { SchroedingerConfig } from '@/lib/geometry/extended/schroedinger'
import type { DiracConfig } from '@/lib/geometry/extended/types'
import type { ScenarioPreset } from '@/lib/physics/presetTypes'

/** Parent-level SchroedingerConfig rendering fields that a Dirac preset can override. */
export type DiracRenderingOverrides = Partial<
  Pick<SchroedingerConfig, 'densityGain' | 'densityContrast' | 'autoScaleMaxGain'>
>

/** A curated Dirac equation scenario with optional exact-dimension visibility. */
export interface DiracScenarioPreset extends ScenarioPreset<Partial<DiracConfig>> {
  /** Exact global dimension required to show/select this preset. Undefined means dimension-agnostic. */
  requiredDimension?: number
  /** Parent-level rendering overrides applied alongside DiracConfig overrides. */
  renderingOverrides?: DiracRenderingOverrides
}

export const DIRAC_SCENARIO_PRESETS: DiracScenarioPreset[] = [
  {
    id: 'kleinParadox',
    name: 'Klein Paradox',
    description:
      'Wavepacket hitting a supercritical step potential (V₀ > 2mc²) — pair creation at the barrier',
    overrides: {
      spacing: [0.1],
      mass: 1.0,
      speedOfLight: 1.0,
      potentialType: 'step',
      potentialStrength: 3.0,
      potentialCenter: 0.0,
      initialCondition: 'gaussianPacket',
      packetCenter: [-1.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      packetWidth: 0.5,
      packetMomentum: [5.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      positiveEnergyFraction: 1.0,
      fieldView: 'particleAntiparticleSplit',
      dt: 0.005,
      stepsPerFrame: 4,
    },
  },
  {
    id: 'zitterbewegung',
    name: 'Zitterbewegung',
    description: 'Trembling motion from positive/negative energy interference at frequency 2mc²/ℏ',
    overrides: {
      spacing: [0.1],
      mass: 1.0,
      speedOfLight: 0.5,
      potentialType: 'none',
      initialCondition: 'zitterbewegung',
      positiveEnergyFraction: 0.5,
      fieldView: 'particleAntiparticleSplit',
      dt: 0.002,
      stepsPerFrame: 8,
    },
  },
  {
    id: 'cliffordBloomResonator',
    name: 'Clifford Bloom Resonator',
    description:
      'Upper/lower spinor sectors phase-lock into volumetric Clifford petals — a resonant view of relativistic sector mixing',
    overrides: {
      spacing: [0.1],
      mass: 1.0,
      speedOfLight: 0.55,
      potentialType: 'none',
      initialCondition: 'zitterbewegung',
      packetWidth: 0.72,
      packetMomentum: [3.2, 1.8, 0.9, 0, 0, 0, 0, 0, 0, 0, 0],
      spinDirection: [Math.PI / 3, Math.PI / 5],
      positiveEnergyFraction: 0.5,
      fieldView: 'cliffordBloom',
      autoScale: true,
      dt: 0.002,
      stepsPerFrame: 8,
    },
    renderingOverrides: {
      densityGain: 2.8,
      densityContrast: 2.7,
      autoScaleMaxGain: 30,
    },
  },
  {
    id: 'diracBarrierTunneling',
    name: 'Barrier Tunneling',
    description:
      'Relativistic tunneling through a potential barrier — compare transmission with Schrödinger',
    overrides: {
      spacing: [0.1],
      potentialType: 'barrier',
      potentialStrength: 1.5,
      potentialWidth: 1.0,
      initialCondition: 'gaussianPacket',
      packetMomentum: [4.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      positiveEnergyFraction: 1.0,
      fieldView: 'totalDensity',
    },
  },
  {
    id: 'hubbleLaceCollider3D',
    name: 'Hubble Lace Collider 3D',
    description:
      'Balanced particle/antiparticle spinor packets reveal braided helicity apertures on expanding Hubble-like lace shells',
    requiredDimension: 3,
    overrides: {
      spacing: [0.095],
      mass: 0.85,
      speedOfLight: 0.72,
      potentialType: 'none',
      initialCondition: 'zitterbewegung',
      packetWidth: 0.68,
      packetMomentum: [3.6, -2.4, 1.7, 0, 0, 0, 0, 0, 0, 0, 0],
      spinDirection: [Math.PI / 3.4, Math.PI / 2.7],
      positiveEnergyFraction: 0.5,
      fieldView: 'hubbleLace',
      autoScale: true,
      dt: 0.002,
      stepsPerFrame: 2,
    },
    renderingOverrides: {
      densityGain: 4.4,
      densityContrast: 3.4,
      autoScaleMaxGain: 46,
    },
  },
  {
    id: 'hubbleLaceBulk4D',
    name: 'Hubble Lace Bulk 4D',
    description:
      'A fourth-coordinate slice phase modulates the same spin-current lace, exposing a distinct bulk aperture through 4D projection',
    requiredDimension: 4,
    overrides: {
      spacing: [0.11],
      mass: 0.78,
      speedOfLight: 0.68,
      potentialType: 'none',
      initialCondition: 'zitterbewegung',
      packetWidth: 0.62,
      packetMomentum: [2.9, 1.9, -2.2, 1.6, 0, 0, 0, 0, 0, 0, 0],
      spinDirection: [Math.PI / 2.8, Math.PI / 4.5],
      positiveEnergyFraction: 0.5,
      fieldView: 'hubbleLace',
      autoScale: true,
      dt: 0.002,
      stepsPerFrame: 2,
      slicePositions: [0.23],
    },
    renderingOverrides: {
      densityGain: 5.0,
      densityContrast: 3.8,
      autoScaleMaxGain: 54,
    },
  },
  {
    id: 'relativisticHydrogen',
    name: 'Relativistic Hydrogen',
    description: 'Dirac particle in a Coulomb potential — fine structure from spin-orbit coupling',
    overrides: {
      spacing: [0.1],
      potentialType: 'coulomb',
      coulombZ: 1.0,
      initialCondition: 'gaussianPacket',
      packetWidth: 1.0,
      packetMomentum: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      fieldView: 'totalDensity',
      dt: 0.005,
    },
  },
  {
    id: 'diracOscillator',
    name: 'Dirac Oscillator',
    description:
      'Harmonic trap for a relativistic particle — energy levels Eₙ = mc²√(1 + 2nℏω/mc²)',
    overrides: {
      spacing: [0.1],
      potentialType: 'harmonicTrap',
      harmonicOmega: 1.0,
      initialCondition: 'gaussianPacket',
      packetWidth: 0.8,
      packetMomentum: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      fieldView: 'totalDensity',
    },
  },
  {
    id: 'spinPrecession',
    name: 'Spin Precession',
    description: 'Spin-polarized wavepacket — watch the spin rotate in an inhomogeneous potential',
    overrides: {
      spacing: [0.12],
      potentialType: 'harmonicTrap',
      harmonicOmega: 0.5,
      initialCondition: 'gaussianPacket',
      spinDirection: [Math.PI / 4, 0],
      positiveEnergyFraction: 1.0,
      fieldView: 'spinDensity',
    },
  },
  {
    id: 'axialChargeKlein',
    name: 'Axial Charge (Klein Regime)',
    description:
      'Supercritical step-potential Klein scenario opened in the |ψ†γ5ψ| axial-charge view — bright regions reveal local left/right (chiral) imbalance accompanying pair creation',
    overrides: {
      spacing: [0.1],
      mass: 1.0,
      speedOfLight: 1.0,
      potentialType: 'step',
      potentialStrength: 3.0,
      potentialCenter: 0.0,
      initialCondition: 'gaussianPacket',
      packetCenter: [-1.5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      packetWidth: 0.5,
      packetMomentum: [5.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      positiveEnergyFraction: 0.7,
      fieldView: 'axialCharge',
      dt: 0.005,
      stepsPerFrame: 4,
    },
  },
]

/** Look up a Dirac scenario preset by id. */
export function getDiracPreset(id: string): DiracScenarioPreset | undefined {
  return DIRAC_SCENARIO_PRESETS.find((preset) => preset.id === id)
}

/** True when a Dirac preset is selectable for the active global dimension. */
export function isDiracPresetCompatibleWithDimension(
  preset: DiracScenarioPreset,
  dimension: number
): boolean {
  return preset.requiredDimension === undefined || preset.requiredDimension === dimension
}

/** Dirac presets visible/selectable for the active global dimension. */
export function getDiracPresetsForDimension(dimension: number): DiracScenarioPreset[] {
  return DIRAC_SCENARIO_PRESETS.filter((preset) =>
    isDiracPresetCompatibleWithDimension(preset, dimension)
  )
}
