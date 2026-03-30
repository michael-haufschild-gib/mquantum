/**
 * Curated scenario presets for discrete-time quantum walk.
 *
 * Each preset configures coin type, grid, and initial conditions
 * to demonstrate different quantum walk phenomena.
 *
 * @module lib/physics/quantumWalk/presets
 */

import type { QuantumWalkConfig } from '@/lib/geometry/extended/quantumWalk'

/** Subset of QuantumWalkConfig fields that a preset can override. */
export type QuantumWalkPresetOverride = Partial<
  Omit<QuantumWalkConfig, 'needsReset' | 'steps' | 'latticeDim'>
>

/** A named quantum walk scenario preset. */
export interface QuantumWalkScenarioPreset {
  id: string
  name: string
  description: string
  overrides: QuantumWalkPresetOverride
}

export const QUANTUM_WALK_PRESETS: QuantumWalkScenarioPreset[] = [
  {
    id: 'groverSearch',
    name: 'Grover Diffusion',
    description:
      'Grover coin produces a symmetric diamond-shaped spread — quantum speedup signature',
    overrides: {
      coinType: 'grover',
      coinBias: 0.5,
      stepsPerFrame: 1,
      fieldView: 'probability',
      autoScale: true,
      absorberEnabled: false,
    },
  },
  {
    id: 'hadamardWalk',
    name: 'Hadamard Walk',
    description: 'Hadamard coin — asymmetric ballistic spreading with left-right bias',
    overrides: {
      coinType: 'hadamard',
      coinBias: 0.5,
      stepsPerFrame: 1,
      fieldView: 'probability',
      autoScale: true,
      absorberEnabled: false,
    },
  },
  {
    id: 'dftWalk',
    name: 'DFT Walk',
    description: 'Discrete Fourier Transform coin — uniform phase distribution across directions',
    overrides: {
      coinType: 'dft',
      coinBias: 0.5,
      stepsPerFrame: 1,
      fieldView: 'probability',
      autoScale: true,
      absorberEnabled: false,
    },
  },
  {
    id: 'phasePattern',
    name: 'Phase Interference',
    description: 'Grover coin visualized in phase space — reveals interference fringes',
    overrides: {
      coinType: 'grover',
      coinBias: 0.5,
      stepsPerFrame: 1,
      fieldView: 'phase',
      autoScale: true,
      absorberEnabled: false,
    },
  },
  {
    id: 'biasedCoin',
    name: 'Biased Coin',
    description: 'Grover coin with strong bias — transition from quantum to classical walk',
    overrides: {
      coinType: 'grover',
      coinBias: 0.9,
      stepsPerFrame: 1,
      fieldView: 'probability',
      autoScale: true,
      absorberEnabled: false,
    },
  },
  {
    id: 'absorbingBoundary',
    name: 'Absorbing Boundary',
    description: 'Grover walk with absorbing edges — models open quantum system',
    overrides: {
      coinType: 'grover',
      coinBias: 0.5,
      stepsPerFrame: 1,
      fieldView: 'probability',
      autoScale: true,
      absorberEnabled: true,
      absorberWidth: 0.15,
      pmlTargetReflection: 1e-4,
    },
  },
]
