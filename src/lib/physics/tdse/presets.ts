/**
 * TDSE Scenario Presets — curated configurations for quantum tunneling demos
 *
 * Each preset provides a partial TdseConfig override that sets up a
 * physically interesting scenario. Only fields that differ from
 * DEFAULT_TDSE_CONFIG are specified; consumers merge with spread.
 *
 * @module lib/physics/tdse/presets
 */

import type { TdseConfig } from '@/lib/geometry/extended/types'
import type { ScenarioPreset } from '@/lib/physics/presetTypes'

import { DECOHERENCE_PRESETS } from './decoherencePresets'

/** Subset of TdseConfig fields that a scenario preset can override. */
export type TdsePresetOverride = Partial<Omit<TdseConfig, 'needsReset' | 'slicePositions'>>

/** Parent-level SchroedingerConfig rendering fields that a TDSE preset can override. */
export interface TdseRenderingOverrides {
  densityGain?: number
  densityContrast?: number
  autoScaleMaxGain?: number
}

/** Default rendering overrides applied to every TDSE preset unless explicitly overridden. */
const TDSE_DEFAULT_RENDERING: TdseRenderingOverrides = {
  densityGain: 2.0,
  densityContrast: 1.8,
  autoScaleMaxGain: 20,
}

/** A named TDSE scenario preset with config overrides applied on selection. */
export interface TdseScenarioPreset extends ScenarioPreset<TdsePresetOverride> {
  /** Parent-level rendering overrides applied alongside TdseConfig overrides. */
  renderingOverrides?: TdseRenderingOverrides
}

/**
 * Curated TDSE scenario presets.
 *
 * Each scenario is tuned for a 64^3 lattice with dx=0.1, producing
 * visually clear dynamics within a few seconds of simulation time.
 */
export const TDSE_SCENARIO_PRESETS: TdseScenarioPreset[] = [
  {
    id: 'classicTunneling',
    name: 'Classic Tunneling',
    description: 'Gaussian packet hitting a thin barrier — partial transmission and reflection',
    overrides: {
      latticeDim: 3,
      gridSize: [64, 64, 64],
      spacing: [0.1, 0.1, 0.1],
      dt: 0.005,
      stepsPerFrame: 4,
      initialCondition: 'gaussianPacket',
      packetCenter: [-1.5, 0, 0],
      packetWidth: 0.4,
      packetAmplitude: 1.0,
      packetMomentum: [6.0, 0, 0],
      potentialType: 'barrier',
      barrierHeight: 12.0,
      barrierWidth: 0.2,
      barrierCenter: 0.5,
      absorberEnabled: true,
      absorberWidth: 0.2,
      pmlTargetReflection: 1e-6,
      diagnosticsEnabled: true,
      diagnosticsInterval: 5,
      fieldView: 'density',
      autoScale: false,
      autoLoop: false,
    },
  },
  {
    id: 'thickBarrier',
    name: 'Thick Barrier',
    description:
      'Wide barrier with low height — exponential decay through the classically forbidden region',
    overrides: {
      latticeDim: 3,
      gridSize: [64, 64, 64],
      spacing: [0.1, 0.1, 0.1],
      dt: 0.005,
      stepsPerFrame: 4,
      initialCondition: 'gaussianPacket',
      packetCenter: [-1.5, 0, 0],
      packetWidth: 0.35,
      packetAmplitude: 1.0,
      packetMomentum: [5.0, 0, 0],
      potentialType: 'barrier',
      barrierHeight: 6.0,
      barrierWidth: 1.0,
      barrierCenter: 0.5,
      absorberEnabled: true,
      absorberWidth: 0.2,
      pmlTargetReflection: 1e-6,
      diagnosticsEnabled: true,
      diagnosticsInterval: 5,
      fieldView: 'density',
      autoScale: false,
      autoLoop: false,
    },
  },
  {
    id: 'doubleSlit',
    name: 'Double Slit',
    description:
      'Wavepacket through two slits — watch the interference fringes build on the far side',
    overrides: {
      latticeDim: 3,
      gridSize: [64, 64, 64],
      spacing: [0.15, 0.15, 0.15],
      dt: 0.003,
      stepsPerFrame: 8,
      initialCondition: 'gaussianPacket',
      packetCenter: [-2.0, 0, 0],
      packetWidth: 0.6,
      packetAmplitude: 1.0,
      packetMomentum: [8.0, 0, 0],
      potentialType: 'doubleSlit',
      barrierCenter: -0.5,
      slitSeparation: 1.6,
      slitWidth: 0.4,
      wallThickness: 0.3,
      wallHeight: 100.0,
      absorberEnabled: true,
      absorberWidth: 0.2,
      pmlTargetReflection: 1e-6,
      diagnosticsEnabled: true,
      diagnosticsInterval: 5,
      fieldView: 'density',
      autoScale: false,
      autoLoop: true,
    },
  },
  {
    id: 'stepPotential',
    name: 'Step Potential',
    description:
      'Packet encounters an abrupt potential step — above-barrier reflection demonstrates wave nature',
    overrides: {
      latticeDim: 3,
      gridSize: [64, 64, 64],
      spacing: [0.1, 0.1, 0.1],
      dt: 0.005,
      stepsPerFrame: 4,
      initialCondition: 'gaussianPacket',
      packetCenter: [-1.5, 0, 0],
      packetWidth: 0.4,
      packetAmplitude: 1.0,
      packetMomentum: [5.0, 0, 0],
      potentialType: 'step',
      stepHeight: 8.0,
      absorberEnabled: true,
      absorberWidth: 0.2,
      pmlTargetReflection: 1e-6,
      diagnosticsEnabled: true,
      diagnosticsInterval: 5,
      fieldView: 'density',
      autoScale: false,
      autoLoop: false,
    },
  },
  {
    id: 'periodicLattice',
    name: 'Periodic Lattice',
    description: 'Cosine lattice potential — Bloch-wave dynamics and Bragg reflection',
    overrides: {
      latticeDim: 3,
      gridSize: [64, 64, 64],
      spacing: [0.1, 0.1, 0.1],
      dt: 0.004,
      stepsPerFrame: 4,
      initialCondition: 'gaussianPacket',
      packetCenter: [-1.5, 0, 0],
      packetWidth: 0.5,
      packetAmplitude: 1.0,
      packetMomentum: [4.0, 0, 0],
      potentialType: 'periodicLattice',
      latticeDepth: 8.0,
      latticePeriod: 0.8,
      absorberEnabled: true,
      absorberWidth: 0.2,
      pmlTargetReflection: 1e-6,
      diagnosticsEnabled: true,
      diagnosticsInterval: 5,
      fieldView: 'density',
      autoScale: false,
      autoLoop: false,
    },
  },
  {
    id: 'boundState',
    name: 'Bound State',
    description: 'Packet trapped in a finite well — oscillates between walls, leaks via tunneling',
    overrides: {
      latticeDim: 3,
      gridSize: [64, 64, 64],
      spacing: [0.1, 0.1, 0.1],
      dt: 0.005,
      stepsPerFrame: 4,
      initialCondition: 'gaussianPacket',
      packetCenter: [0, 0, 0],
      packetWidth: 0.3,
      packetAmplitude: 1.0,
      packetMomentum: [3.0, 0, 0],
      potentialType: 'finiteWell',
      wellDepth: 15.0,
      wellWidth: 2.0,
      absorberEnabled: true,
      absorberWidth: 0.2,
      pmlTargetReflection: 1e-6,
      diagnosticsEnabled: true,
      diagnosticsInterval: 5,
      fieldView: 'density',
      autoScale: false,
      autoLoop: false,
    },
  },
  {
    id: 'falseVacuumDecay',
    name: 'False Vacuum Decay',
    description:
      'Packet in a metastable radial well — tunnels through the barrier as an expanding bubble',
    overrides: {
      latticeDim: 3,
      gridSize: [64, 64, 64],
      spacing: [0.1, 0.1, 0.1],
      dt: 0.003,
      stepsPerFrame: 6,
      initialCondition: 'gaussianPacket',
      packetCenter: [-1.0, 0, 0],
      packetWidth: 0.35,
      packetAmplitude: 1.0,
      packetMomentum: [1.0, 0, 0],
      potentialType: 'doubleWell',
      doubleWellLambda: 5.0,
      doubleWellSeparation: 1.0,
      doubleWellAsymmetry: 1.5,
      absorberEnabled: true,
      absorberWidth: 0.2,
      pmlTargetReflection: 1e-6,
      diagnosticsEnabled: true,
      diagnosticsInterval: 5,
      fieldView: 'density',
      autoScale: false,
      autoLoop: false,
      showPotential: true,
    },
  },
  {
    id: 'bubbleNucleation',
    name: 'Bubble Nucleation',
    description:
      'Radial double well — wavefunction tunnels from inner to outer minimum as an expanding bubble',
    overrides: {
      latticeDim: 3,
      gridSize: [64, 64, 64],
      spacing: [0.1, 0.1, 0.1],
      dt: 0.003,
      stepsPerFrame: 6,
      initialCondition: 'gaussianPacket',
      packetCenter: [0, 0, 0],
      packetWidth: 0.4,
      packetAmplitude: 1.0,
      packetMomentum: [0, 0, 0],
      potentialType: 'radialDoubleWell',
      radialWellInner: 0.6,
      radialWellOuter: 1.8,
      radialWellDepth: 50.0,
      radialWellTilt: 0.5,
      absorberEnabled: true,
      absorberWidth: 0.2,
      pmlTargetReflection: 1e-6,
      diagnosticsEnabled: true,
      diagnosticsInterval: 5,
      fieldView: 'density',
      autoScale: false,
      autoLoop: false,
      showPotential: true,
    },
  },
  // ── Anderson Localization Presets ──────────────────────────────────────────
  // Disorder strength W is in tight-binding units (W/t where t = ℏ²/(2m·dx²)).
  // The upload code scales W by t automatically, so presets work at any spacing.
  // 3D critical value: Wc/t ≈ 16.5.
  {
    id: 'andersonLocalized3D',
    name: 'Anderson: Localized (3D)',
    description:
      'Strong disorder W/t=25 — well above Wc/t≈16.5. Wavepacket remains exponentially localized.',
    overrides: {
      latticeDim: 3,
      gridSize: [64, 64, 64],
      spacing: [0.1, 0.1, 0.1],
      dt: 0.002,
      stepsPerFrame: 10,
      initialCondition: 'gaussianPacket',
      packetCenter: [0, 0, 0],
      packetWidth: 0.3,
      packetAmplitude: 1.0,
      packetMomentum: [0, 0, 0],
      potentialType: 'andersonDisorder',
      disorderStrength: 25.0,
      disorderSeed: 42,
      disorderDistribution: 'uniform',
      absorberEnabled: false,
      diagnosticsEnabled: true,
      diagnosticsInterval: 5,
      observablesEnabled: true,
      fieldView: 'density',
      autoScale: false,
    },
  },
  {
    id: 'andersonExtended3D',
    name: 'Anderson: Extended (3D)',
    description:
      'Weak disorder W/t=5 — below Wc/t≈16.5. Wavepacket spreads diffusively across the lattice.',
    overrides: {
      latticeDim: 3,
      gridSize: [64, 64, 64],
      spacing: [0.1, 0.1, 0.1],
      dt: 0.002,
      stepsPerFrame: 10,
      initialCondition: 'gaussianPacket',
      packetCenter: [0, 0, 0],
      packetWidth: 0.3,
      packetAmplitude: 1.0,
      packetMomentum: [0, 0, 0],
      potentialType: 'andersonDisorder',
      disorderStrength: 5.0,
      disorderSeed: 42,
      disorderDistribution: 'uniform',
      absorberEnabled: false,
      diagnosticsEnabled: true,
      diagnosticsInterval: 5,
      observablesEnabled: true,
      fieldView: 'density',
      autoScale: false,
    },
  },
  {
    id: 'andersonTransition4D',
    name: 'Anderson: 4D Transition',
    description:
      'Moderate disorder W/t=15 in 4D. Probes transport at the Anderson transition in higher dimensions.',
    overrides: {
      latticeDim: 4,
      gridSize: [32, 32, 32, 32],
      spacing: [0.1, 0.1, 0.1, 0.1],
      dt: 0.002,
      stepsPerFrame: 10,
      initialCondition: 'gaussianPacket',
      packetCenter: [0, 0, 0, 0],
      packetWidth: 0.25,
      packetAmplitude: 1.0,
      packetMomentum: [0, 0, 0, 0],
      potentialType: 'andersonDisorder',
      disorderStrength: 15.0,
      disorderSeed: 42,
      disorderDistribution: 'uniform',
      absorberEnabled: false,
      diagnosticsEnabled: true,
      diagnosticsInterval: 5,
      observablesEnabled: true,
      fieldView: 'density',
      autoScale: false,
    },
  },
  {
    id: 'andersonTransition5D',
    name: 'Anderson: 5D Transport',
    description:
      'Disorder W/t=15 in 5D. Probes localization in dimensions where exact diagonalization is infeasible.',
    overrides: {
      latticeDim: 5,
      gridSize: [16, 16, 16, 16, 16],
      spacing: [0.1, 0.1, 0.1, 0.1, 0.1],
      dt: 0.002,
      stepsPerFrame: 10,
      initialCondition: 'gaussianPacket',
      packetCenter: [0, 0, 0, 0, 0],
      packetWidth: 0.2,
      packetAmplitude: 1.0,
      packetMomentum: [0, 0, 0, 0, 0],
      potentialType: 'andersonDisorder',
      disorderStrength: 15.0,
      disorderSeed: 42,
      disorderDistribution: 'uniform',
      absorberEnabled: false,
      diagnosticsEnabled: true,
      diagnosticsInterval: 5,
      observablesEnabled: true,
      fieldView: 'density',
      autoScale: false,
    },
  },
  ...DECOHERENCE_PRESETS,
]

/** Lookup a preset by its id, merging default rendering overrides. */
export function getTdsePreset(id: string): TdseScenarioPreset | undefined {
  const preset = TDSE_SCENARIO_PRESETS.find((p) => p.id === id)
  if (!preset) return undefined
  return {
    ...preset,
    renderingOverrides: { ...TDSE_DEFAULT_RENDERING, ...preset.renderingOverrides },
  }
}
