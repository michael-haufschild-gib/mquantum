/**
 * Curated BEC scenario presets for the Gross-Pitaevskii solver.
 *
 * Each preset provides partial overrides to `BecConfig` that configure
 * physically meaningful initial conditions and parameter regimes.
 *
 * @module
 */

import type { BecConfig } from '@/lib/geometry/extended/types'

/**
 * A named BEC scenario preset.
 */
export interface BecScenarioPreset {
  id: string
  name: string
  description: string
  overrides: Partial<BecConfig>
}

/**
 * Built-in BEC scenario presets.
 */
export const BEC_SCENARIO_PRESETS: BecScenarioPreset[] = [
  {
    id: 'groundState',
    name: 'Ground State',
    description: 'Thomas-Fermi ground state in a harmonic trap — stationary condensate',
    overrides: {
      interactionStrength: 500,
      trapOmega: 1.0,
      initialCondition: 'thomasFermi',
      fieldView: 'density',
    },
  },
  {
    id: 'singleVortex',
    name: 'Single Vortex',
    description: 'Condensate with a single quantized vortex (charge +1) — watch it precess',
    overrides: {
      interactionStrength: 500,
      trapOmega: 1.0,
      initialCondition: 'vortexImprint',
      vortexCharge: 1,
      fieldView: 'phase',
    },
  },
  {
    id: 'vortexDipole',
    name: 'Vortex-Antivortex Pair',
    description: 'Opposite-charge vortex pair — they orbit each other or annihilate',
    overrides: {
      latticeDim: 2,
      gridSize: [128, 128],
      spacing: [0.1, 0.1],
      interactionStrength: 500,
      trapOmega: 0.5,
      initialCondition: 'vortexLattice',
      vortexLatticeCount: 2,
      fieldView: 'phase',
    },
  },
  {
    id: 'darkSoliton',
    name: 'Dark Soliton',
    description: 'Density dip propagating through the condensate — nonlinearity prevents spreading',
    overrides: {
      interactionStrength: 500,
      trapOmega: 0.3,
      initialCondition: 'darkSoliton',
      solitonDepth: 1.0,
      solitonVelocity: 0.0,
      fieldView: 'density',
    },
  },
  {
    id: 'quantumTurbulence',
    name: 'Quantum Turbulence',
    description: 'Chaotic vortex tangle from many imprinted vortices — turbulence in a superfluid',
    overrides: {
      interactionStrength: 1000,
      trapOmega: 0.5,
      initialCondition: 'vortexLattice',
      vortexLatticeCount: 8,
      fieldView: 'phase',
      dt: 0.001,
      stepsPerFrame: 8,
    },
  },
  {
    id: 'breathingMode',
    name: 'Breathing Mode',
    description: 'Condensate oscillates radially — collective excitation at 2ω (2D) or √5 ω (3D)',
    overrides: {
      interactionStrength: 500,
      // Quench the trap frequency to trigger radial breathing:
      // start with TF ground state for ω=1, then evolve under ω=0.7
      // → condensate is wider than new equilibrium → oscillates
      trapOmega: 0.7,
      initialCondition: 'thomasFermi',
      fieldView: 'density',
    },
  },
  {
    id: 'attractiveBec',
    name: 'Attractive BEC (Collapse)',
    description: 'Negative g — condensate collapses when N exceeds critical value',
    overrides: {
      interactionStrength: -200,
      trapOmega: 1.0,
      initialCondition: 'thomasFermi',
      fieldView: 'density',
    },
  },
]
