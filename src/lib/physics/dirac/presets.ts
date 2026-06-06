/**
 * Curated Dirac equation scenario presets.
 *
 * Each preset overrides specific DiracConfig fields to set up a
 * physically interesting initial configuration. Presets are
 * dimension-agnostic — they do NOT set latticeDim or gridSize.
 * The user controls dimensions separately.
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

/** A curated Dirac equation scenario with dimension-agnostic config overrides. */
export interface DiracScenarioPreset extends ScenarioPreset<Partial<DiracConfig>> {
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
