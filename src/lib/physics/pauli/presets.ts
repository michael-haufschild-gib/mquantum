/**
 * Curated Pauli spinor scenario presets.
 *
 * Each preset overrides specific PauliConfig fields to set up a
 * physically interesting initial configuration. Presets are
 * dimension-agnostic — they do NOT set latticeDim or gridSize.
 */

import type { PauliConfig } from '@/lib/geometry/extended/types'

/** A curated Pauli spinor scenario with dimension-agnostic config overrides. */
export interface PauliScenarioPreset {
  id: string
  name: string
  description: string
  overrides: Partial<PauliConfig>
}

export const PAULI_SCENARIO_PRESETS: PauliScenarioPreset[] = [
  {
    id: 'larmorPrecession',
    name: 'Larmor Precession',
    description: 'Spin-½ particle precessing about a uniform magnetic field along z',
    overrides: {
      fieldType: 'uniform',
      fieldStrength: 3.0,
      fieldDirection: [0, 0],
      initialSpinDirection: [Math.PI / 2, 0],
      initialCondition: 'gaussianSuperposition',
      potentialType: 'none',
      fieldView: 'spinDensity',
      dt: 0.005,
      stepsPerFrame: 4,
    },
  },
  {
    id: 'sternGerlach',
    name: 'Stern-Gerlach',
    description: 'Wavepacket splitting in a magnetic field gradient — spin measurement',
    overrides: {
      fieldType: 'gradient',
      fieldStrength: 2.0,
      fieldDirection: [0, 0],
      gradientStrength: 3.0,
      initialSpinDirection: [Math.PI / 2, 0],
      initialCondition: 'gaussianSuperposition',
      potentialType: 'none',
      fieldView: 'spinDensity',
      dt: 0.005,
      stepsPerFrame: 4,
    },
  },
  {
    id: 'spinFlip',
    name: 'Spin Flip (Rabi)',
    description: 'Resonant rotating field driving spin transitions between ↑ and ↓',
    overrides: {
      fieldType: 'rotating',
      fieldStrength: 2.0,
      fieldDirection: [0, 0],
      rotatingFrequency: 2.0,
      initialSpinDirection: [0, 0],
      initialCondition: 'gaussianSpinUp',
      potentialType: 'none',
      fieldView: 'spinExpectation',
      dt: 0.005,
      stepsPerFrame: 4,
    },
  },
  {
    id: 'harmonicTrap',
    name: 'Harmonic Trap + B',
    description: 'Spin dynamics of a trapped particle in a uniform magnetic field',
    overrides: {
      fieldType: 'uniform',
      fieldStrength: 2.0,
      fieldDirection: [0, 0],
      initialSpinDirection: [Math.PI / 4, 0],
      initialCondition: 'gaussianSuperposition',
      potentialType: 'harmonicTrap',
      harmonicOmega: 2.0,
      fieldView: 'spinDensity',
      dt: 0.003,
      stepsPerFrame: 6,
    },
  },
  {
    id: 'spinCoherence',
    name: 'Coherence Dynamics',
    description: 'Off-diagonal spinor coherence evolution in a quadrupole field',
    overrides: {
      fieldType: 'quadrupole',
      fieldStrength: 2.0,
      fieldDirection: [0, 0],
      initialSpinDirection: [Math.PI / 2, Math.PI / 4],
      initialCondition: 'gaussianSuperposition',
      potentialType: 'none',
      fieldView: 'coherence',
      dt: 0.004,
      stepsPerFrame: 4,
    },
  },
  {
    id: 'freeSpinUp',
    name: 'Free Spin-Up',
    description: 'Pure spin-up Gaussian wavepacket — no field, spreading only',
    overrides: {
      fieldType: 'uniform',
      fieldStrength: 0,
      initialSpinDirection: [0, 0],
      initialCondition: 'gaussianSpinUp',
      potentialType: 'none',
      fieldView: 'totalDensity',
      dt: 0.005,
      stepsPerFrame: 4,
    },
  },
]
