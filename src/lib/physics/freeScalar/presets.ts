/**
 * Curated scenario presets for the free Klein-Gordon scalar field.
 *
 * Each preset provides partial overrides to `FreeScalarConfig` that set up
 * physically interesting initial conditions and parameter regimes.
 *
 * @module lib/physics/freeScalar/presets
 */

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import type { ScenarioPreset } from '@/lib/physics/presetTypes'

/** Subset of FreeScalarConfig fields that a preset can override. */
export type FreeScalarPresetOverride = Partial<
  Omit<FreeScalarConfig, 'needsReset' | 'slicePositions' | 'kSpaceViz'>
>

/** Parent-level SchrodingerConfig rendering fields that a preset can override. */
export interface FreeScalarRenderingOverrides {
  densityGain?: number
  densityContrast?: number
}

/** A named free scalar field scenario preset with optional rendering hints. */
export interface FreeScalarScenarioPreset extends ScenarioPreset<FreeScalarPresetOverride> {
  /** Parent-level rendering overrides applied alongside FreeScalarConfig overrides. */
  renderingOverrides?: FreeScalarRenderingOverrides
}

export const FREE_SCALAR_PRESETS: FreeScalarScenarioPreset[] = [
  {
    id: 'gaussianPacket',
    name: 'Gaussian Wavepacket',
    description: 'Localized Gaussian packet propagating through the lattice',
    overrides: {
      initialCondition: 'gaussianPacket',
      packetCenter: [0, 0, 0],
      packetWidth: 0.3,
      packetAmplitude: 1.0,
      modeK: [3, 0, 0],
      mass: 1.0,
      dt: 0.01,
      stepsPerFrame: 4,
      selfInteractionEnabled: false,
      absorberEnabled: true,
      absorberWidth: 0.2,
      pmlTargetReflection: 1e-6,
      fieldView: 'phi',
      autoScale: false,
    },
    renderingOverrides: { densityGain: 5.0, densityContrast: 2.5 },
  },
  {
    id: 'vacuumFluctuations',
    name: 'Vacuum Fluctuations',
    description: 'Quantum vacuum noise — zero-point energy of each momentum mode',
    overrides: {
      initialCondition: 'vacuumNoise',
      mass: 1.0,
      dt: 0.005,
      stepsPerFrame: 4,
      selfInteractionEnabled: false,
      absorberEnabled: false,
      fieldView: 'energyDensity',
      autoScale: false,
    },
    renderingOverrides: { densityGain: 0.2, densityContrast: 1.0 },
  },
  {
    id: 'singleMode',
    name: 'Single Plane Wave',
    description: 'Single k-mode excitation — standing wave on the periodic lattice',
    overrides: {
      initialCondition: 'singleMode',
      modeK: [2, 0, 0],
      packetAmplitude: 1.0,
      mass: 1.0,
      dt: 0.01,
      stepsPerFrame: 4,
      selfInteractionEnabled: false,
      absorberEnabled: false,
      fieldView: 'phi',
      autoScale: false,
    },
    renderingOverrides: { densityGain: 0.2, densityContrast: 1.0 },
  },
  {
    id: 'mexicanHat',
    name: 'Mexican Hat (SSB)',
    description:
      'Spontaneous symmetry breaking — vacuum noise seeds domain formation in V = λ(φ²−v²)²',
    overrides: {
      initialCondition: 'vacuumNoise',
      vacuumSeed: 42,
      mass: 0.0,
      dt: 0.004,
      stepsPerFrame: 6,
      selfInteractionEnabled: true,
      selfInteractionLambda: 1.0,
      selfInteractionVev: 1.0,
      absorberEnabled: false,
      fieldView: 'phi',
      autoScale: false,
    },
    renderingOverrides: { densityGain: 0.1, densityContrast: 2.6 },
  },
  {
    id: 'domainWall',
    name: 'Domain Wall (Kink)',
    description:
      'Topological kink φ = v·tanh(x/w) interpolating between ±v vacua — stable soliton solution',
    overrides: {
      initialCondition: 'kinkProfile',
      packetCenter: [0, 0, 0],
      packetWidth: 0.4,
      mass: 0.0,
      dt: 0.005,
      stepsPerFrame: 4,
      selfInteractionEnabled: true,
      selfInteractionLambda: 0.5,
      selfInteractionVev: 1.0,
      absorberEnabled: true,
      absorberWidth: 0.15,
      pmlTargetReflection: 1e-6,
      fieldView: 'wallDensity',
      autoScale: false,
      diagnosticsEnabled: true,
      diagnosticsInterval: 5,
    },
    renderingOverrides: { densityGain: 0.1, densityContrast: 2.6 },
  },
  {
    id: 'falseVacuumBubble',
    name: 'False Vacuum Excitation',
    description:
      'Gaussian perturbation near φ=0 (unstable maximum) — field rolls toward ±v true vacua',
    overrides: {
      initialCondition: 'gaussianPacket',
      packetCenter: [0, 0, 0],
      packetWidth: 0.3,
      packetAmplitude: 0.3,
      modeK: [0, 0, 0],
      mass: 0.0,
      dt: 0.004,
      stepsPerFrame: 6,
      selfInteractionEnabled: true,
      selfInteractionLambda: 1.0,
      selfInteractionVev: 1.0,
      absorberEnabled: true,
      absorberWidth: 0.15,
      pmlTargetReflection: 1e-6,
      fieldView: 'phi',
      autoScale: false,
      diagnosticsEnabled: true,
      diagnosticsInterval: 5,
    },
    renderingOverrides: { densityGain: 5.0, densityContrast: 2.5 },
  },
  {
    id: 'masslessField',
    name: 'Massless Field',
    description: 'Massless Klein-Gordon field — light-cone propagation of a sharp pulse',
    overrides: {
      initialCondition: 'gaussianPacket',
      packetCenter: [0, 0, 0],
      packetWidth: 0.2,
      packetAmplitude: 1.0,
      modeK: [0, 0, 0],
      mass: 0.0,
      dt: 0.005,
      stepsPerFrame: 6,
      selfInteractionEnabled: false,
      absorberEnabled: true,
      absorberWidth: 0.2,
      pmlTargetReflection: 1e-6,
      fieldView: 'phi',
      autoScale: false,
    },
    renderingOverrides: { densityGain: 0.2, densityContrast: 1.0 },
  },
  {
    id: 'heavyField',
    name: 'Heavy Field',
    description: 'Large mass — rapid oscillation and slow spatial dispersion',
    overrides: {
      initialCondition: 'gaussianPacket',
      packetCenter: [0, 0, 0],
      packetWidth: 0.4,
      packetAmplitude: 1.0,
      modeK: [1, 0, 0],
      mass: 5.0,
      dt: 0.002,
      stepsPerFrame: 8,
      selfInteractionEnabled: false,
      absorberEnabled: true,
      absorberWidth: 0.2,
      pmlTargetReflection: 1e-6,
      fieldView: 'phi',
      autoScale: false,
    },
    renderingOverrides: { densityGain: 0.2, densityContrast: 1.0 },
  },
]
