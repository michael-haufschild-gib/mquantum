/**
 * Curated BEC scenario presets for the Gross-Pitaevskii solver.
 *
 * Each preset provides partial overrides to `BecConfig` that configure
 * physically meaningful initial conditions and parameter regimes.
 *
 * @module
 */

import type { BecConfig } from '@/lib/geometry/extended/types'
import type { ScenarioPreset } from '@/lib/physics/presetTypes'

/** Parent-level SchroedingerConfig rendering fields that a BEC preset can override. */
export interface BecRenderingOverrides {
  densityGain?: number
  densityContrast?: number
  autoScaleMaxGain?: number
}

/**
 * Default rendering overrides applied to every BEC preset via `getBecPreset`.
 * Ensures preset switches fully reset the parent SchroedingerConfig rendering state
 * instead of inheriting stale values (e.g. `autoScaleMaxGain`) from a prior preset.
 */
const BEC_DEFAULT_RENDERING: Required<BecRenderingOverrides> = {
  densityGain: 0.2,
  densityContrast: 2.0,
  autoScaleMaxGain: 20,
}

/** A named BEC scenario preset. */
export interface BecScenarioPreset extends ScenarioPreset<Partial<BecConfig>> {
  /** Minimum spatial dimension required for this preset (default: 2). */
  minDim?: number
  /** Parent-level rendering overrides applied alongside BecConfig overrides. */
  renderingOverrides?: BecRenderingOverrides
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
      autoScale: true,
    },
    renderingOverrides: { densityGain: 0.1, densityContrast: 1.0, autoScaleMaxGain: 15 },
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
    renderingOverrides: { densityGain: 0.2, densityContrast: 2.6 },
  },
  {
    id: 'vortexDipole',
    name: 'Vortex-Antivortex Pair',
    description: 'Opposite-charge vortex pair — they orbit each other or annihilate',
    overrides: {
      interactionStrength: 500,
      trapOmega: 0.5,
      initialCondition: 'vortexLattice',
      vortexCharge: 1,
      vortexLatticeCount: 2,
      vortexAlternateCharge: true,
      fieldView: 'phase',
      autoScale: true,
    },
    renderingOverrides: { densityGain: 0.2, densityContrast: 1.0, autoScaleMaxGain: 20 },
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
      autoScale: true,
    },
    renderingOverrides: { densityGain: 0.1, densityContrast: 1.0, autoScaleMaxGain: 10 },
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
      autoScale: true,
    },
    renderingOverrides: { densityGain: 0.2, densityContrast: 1.0, autoScaleMaxGain: 20 },
  },
  {
    id: 'breathingMode',
    name: 'Breathing Mode',
    description: 'Condensate oscillates radially — collective excitation at 2ω (2D) or √5 ω (3D)',
    overrides: {
      interactionStrength: 500,
      // Quench: initialize TF ground state for ω=1, then evolve under ω=0.7.
      // The condensate is narrower than the new equilibrium → expands → oscillates.
      trapOmega: 0.7,
      initTrapOmega: 1.0,
      initialCondition: 'thomasFermi',
      fieldView: 'density',
      autoScale: true,
    },
    renderingOverrides: { densityGain: 0.1, densityContrast: 1.0, autoScaleMaxGain: 10 },
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
    renderingOverrides: { densityGain: 5.0, densityContrast: 4.0 },
  },
  // === Higher-Dimensional Vortex Topology (D ≥ 4) ===
  {
    id: 'vortex4DReconnection',
    name: '4D Vortex Reconnection',
    description:
      'Two vortex surfaces in orthogonal planes (x₀x₁ and x₂x₃) — first interactive 4D reconnection',
    minDim: 4,
    overrides: {
      interactionStrength: 500,
      trapOmega: 0.5,
      initialCondition: 'vortexReconnection',
      vortexCharge: 1,
      vortexPlane1: [0, 1],
      vortexPlane2: [2, 3],
      vortexSeparation: 0.5,
      vortexPairCount: 2,
      fieldView: 'phase',
      dt: 0.001,
      stepsPerFrame: 4,
    },
    renderingOverrides: { densityGain: 5.0, densityContrast: 4.0 },
  },
  {
    id: 'vortex4DParallel',
    name: '4D Parallel Vortices',
    description: 'Two vortex surfaces in the same plane (both x₀x₁) — no reconnection control case',
    minDim: 4,
    overrides: {
      interactionStrength: 500,
      trapOmega: 0.5,
      initialCondition: 'vortexReconnection',
      vortexCharge: 1,
      vortexPlane1: [0, 1],
      vortexPlane2: [0, 1],
      vortexSeparation: 1.0,
      vortexPairCount: 2,
      fieldView: 'phase',
      dt: 0.001,
      stepsPerFrame: 4,
    },
    renderingOverrides: { densityGain: 5.0, densityContrast: 4.0 },
  },
  {
    id: 'vortex5DReconnection',
    name: '5D Vortex Reconnection',
    description: 'Two vortex 3-volumes in orthogonal planes — first-ever D=5 GPE vortex simulation',
    minDim: 5,
    overrides: {
      interactionStrength: 500,
      trapOmega: 0.5,
      initialCondition: 'vortexReconnection',
      vortexCharge: 1,
      vortexPlane1: [0, 1],
      vortexPlane2: [2, 3],
      vortexSeparation: 0.5,
      vortexPairCount: 2,
      fieldView: 'density',
      dt: 0.0005,
      stepsPerFrame: 8,
    },
    renderingOverrides: { densityGain: 5.0, densityContrast: 4.0 },
  },
  {
    id: 'vortex4DSingle',
    name: '4D Single Vortex Surface',
    description:
      'One vortex surface in the x₂x₃ plane — rotate through 4D to see the 2-surface cross-sections',
    minDim: 4,
    overrides: {
      interactionStrength: 500,
      trapOmega: 0.8,
      initialCondition: 'vortexReconnection',
      vortexCharge: 1,
      vortexPlane1: [2, 3],
      vortexPlane2: [0, 1],
      vortexSeparation: 0.0,
      vortexPairCount: 1,
      fieldView: 'phase',
    },
    renderingOverrides: { densityGain: 5.0, densityContrast: 4.0 },
  },
]

/**
 * Lookup a BEC preset by id, merging default rendering overrides so preset
 * switches reset ALL parent-level rendering fields (not just the ones the
 * preset explicitly sets). Without this merge, switching between presets with
 * heterogeneous override keys — e.g. one sets `autoScaleMaxGain`, another
 * doesn't — leaks stale values from the prior preset onto the schroedinger state.
 */
export function getBecPreset(id: string): BecScenarioPreset | undefined {
  const preset = BEC_SCENARIO_PRESETS.find((p) => p.id === id)
  if (!preset) return undefined
  return {
    ...preset,
    renderingOverrides: { ...BEC_DEFAULT_RENDERING, ...preset.renderingOverrides },
  }
}
