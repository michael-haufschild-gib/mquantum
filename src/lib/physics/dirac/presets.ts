/**
 * Curated Dirac equation scenario presets.
 *
 * Each preset overrides specific DiracConfig fields to set up a
 * physically interesting initial configuration. Presets are
 * dimension-agnostic — they do NOT set latticeDim or gridSize.
 * The user controls dimensions separately.
 */

import type { DiracConfig } from '@/lib/geometry/extended/types'

/** A curated Dirac equation scenario with dimension-agnostic config overrides. */
export interface DiracScenarioPreset {
  id: string
  name: string
  description: string
  overrides: Partial<DiracConfig>
}

export const DIRAC_SCENARIO_PRESETS: DiracScenarioPreset[] = [
  {
    id: 'kleinParadox',
    name: 'Klein Paradox',
    description: 'Wavepacket hitting a supercritical step potential (V₀ > 2mc²) — pair creation at the barrier',
    overrides: {
      spacing: [0.05],
      mass: 1.0,
      speedOfLight: 1.0,
      potentialType: 'step',
      potentialStrength: 3.0,
      potentialCenter: 0.0,
      initialCondition: 'gaussianPacket',
      packetCenter: [-3.0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
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
      spacing: [0.05],
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
    id: 'diracBarrierTunneling',
    name: 'Barrier Tunneling',
    description: 'Relativistic tunneling through a potential barrier — compare transmission with Schrödinger',
    overrides: {
      spacing: [0.05],
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
    description: 'Harmonic trap for a relativistic particle — energy levels Eₙ = mc²√(1 + 2nℏω/mc²)',
    overrides: {
      spacing: [0.08],
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
]
