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

/** Parent-level SchroedingerConfig rendering fields that a preset can override. */
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
      autoScale: true,
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
      autoScale: true,
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
      autoScale: true,
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
      autoScale: true,
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
      autoScale: true,
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
      autoScale: true,
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
      autoScale: true,
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
      autoScale: true,
    },
    renderingOverrides: { densityGain: 0.2, densityContrast: 1.0 },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Cosmology scenarios (Mukhanov-Sasaki bridge)
  //
  // Each preset enables the cosmological background sub-config so the free
  // Klein-Gordon field is reinterpreted as a quantum perturbation `δφ` on a
  // prescribed classical FLRW spacetime, evolved in the Mukhanov-Sasaki
  // variable `v = a^((n−2)/2)·δφ`. All are linear and free (v1 mutex with
  // self-interaction) so the Bunch-Davies adiabatic vacuum is exact.
  //
  // Naming is deliberately conservative: we simulate the quantum
  // perturbation on a fixed classical background, not the full inflationary
  // or big-bang phenomenology. Titles reflect the background geometry, not
  // the cosmology it is meant to evoke.
  //
  // Visualization uses the same `energyDensity` / densityGain 0.2 setup as
  // the baseline `vacuumFluctuations` preset — the same view is known to
  // render cleanly on the default 32³ lattice.
  // ─────────────────────────────────────────────────────────────────────────

  {
    id: 'deSitterVacuum',
    name: 'de Sitter — Bunch–Davies Vacuum',
    description:
      'Free scalar vacuum on de Sitter background (a(η) = −1/(Hη)). Adiabatic Bunch–Davies state; the tachyonic z″/z term squeezes super-horizon modes.',
    overrides: {
      initialCondition: 'vacuumNoise',
      vacuumSeed: 2026,
      mass: 1.0,
      dt: 0.005,
      stepsPerFrame: 4,
      selfInteractionEnabled: false,
      absorberEnabled: false,
      fieldView: 'energyDensity',
      autoScale: true,
      diagnosticsEnabled: true,
      diagnosticsInterval: 10,
      cosmology: {
        enabled: true,
        preset: 'deSitter',
        steepness: 5,
        hubble: 1.0,
        eta0: -10,
      },
    },
    renderingOverrides: { densityGain: 0.2, densityContrast: 1.0 },
  },

  {
    id: 'deSitterPlaneWave',
    name: 'de Sitter — Plane-Wave Mode',
    description:
      'Single lattice mode k=(3,0,0) on de Sitter. Pedagogical view of one perturbation as its effective dispersion ω² = k² + M²_eff(η) evolves.',
    overrides: {
      initialCondition: 'singleMode',
      modeK: [3, 0, 0],
      packetAmplitude: 1.0,
      mass: 1.0,
      dt: 0.005,
      stepsPerFrame: 4,
      selfInteractionEnabled: false,
      absorberEnabled: false,
      fieldView: 'energyDensity',
      autoScale: true,
      cosmology: {
        enabled: true,
        preset: 'deSitter',
        steepness: 5,
        hubble: 2.0,
        eta0: -8,
      },
    },
    renderingOverrides: { densityGain: 0.2, densityContrast: 1.0 },
  },

  {
    id: 'ekpyroticBackground',
    name: 'Ekpyrotic Background (stiff fluid)',
    description:
      'Contracting FLRW with w > 1 — Beyer–Garfinkle–Isenberg–Oliynyk (2026) ekpyrotic regime at s ≈ 2·s_c(4). Quantum perturbations on a prescribed stiff-fluid background.',
    overrides: {
      initialCondition: 'vacuumNoise',
      vacuumSeed: 131,
      mass: 1.0,
      dt: 0.005,
      stepsPerFrame: 4,
      selfInteractionEnabled: false,
      absorberEnabled: false,
      fieldView: 'energyDensity',
      autoScale: true,
      diagnosticsEnabled: true,
      diagnosticsInterval: 10,
      cosmology: {
        enabled: true,
        preset: 'ekpyrotic',
        // s ≈ 2·s_c(n=4) ≈ 6.93 — squarely in the paper's ekpyrotic basin
        // (x₁ = s/s_c ≈ 2 > 1), non-degenerate, stiff-fluid regime.
        steepness: 7,
        hubble: 1.0,
        eta0: -10,
      },
    },
    renderingOverrides: { densityGain: 0.2, densityContrast: 1.0 },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // Post-Inflation Preheating (Parametric Resonance)
  //
  // A time-periodic modulation of the effective Klein-Gordon mass turns
  // each lattice mode's evolution into the Mathieu equation and enables
  // exponential parametric amplification inside the Floquet instability
  // tongues. The canonical first tongue sits at `Ω = 2·√(k² + m²)` with
  // growth exponent μ ≈ A·m²/(4·ω). This is the mechanism by which an
  // inflaton condensate dumps its energy into light matter fields at the
  // end of inflation — a direct quantum-to-cosmology bridge, realised on
  // the same 3D lattice that renders the free scalar vacuum.
  // ─────────────────────────────────────────────────────────────────────────

  {
    id: 'preheatingFirstTongue',
    name: 'Preheating: First Tongue (k=0)',
    description:
      'Post-inflation parametric resonance: effective mass m²(η) = m²·(1 + 0.3·sin(2η)) drives the Mathieu first tongue at Ω = 2·m. Vacuum noise on Minkowski background — the k=0 mode amplifies exponentially over a few seconds, visible as a bright central shell in k-space.',
    overrides: {
      initialCondition: 'vacuumNoise',
      vacuumSeed: 17,
      mass: 1.0,
      dt: 0.01,
      stepsPerFrame: 4,
      selfInteractionEnabled: false,
      absorberEnabled: false,
      fieldView: 'energyDensity',
      autoScale: true,
      diagnosticsEnabled: true,
      diagnosticsInterval: 10,
      preheating: {
        enabled: true,
        amplitude: 0.3,
        frequency: 2.0,
      },
    },
    renderingOverrides: { densityGain: 0.2, densityContrast: 1.0 },
  },

  {
    id: 'kasnerBackground',
    name: 'Kasner Background (w = 1)',
    description:
      'Isotropic Kasner FLRW (a(η) = |η|^(1/(n−2)), stiff-fluid limit). Quantum fluctuations on a rigid power-law contraction; the runtime η-floor prevents singularity crossing.',
    overrides: {
      initialCondition: 'vacuumNoise',
      vacuumSeed: 7,
      mass: 1.0,
      dt: 0.005,
      stepsPerFrame: 4,
      selfInteractionEnabled: false,
      absorberEnabled: false,
      fieldView: 'energyDensity',
      autoScale: true,
      diagnosticsEnabled: true,
      diagnosticsInterval: 10,
      cosmology: {
        enabled: true,
        preset: 'kasner',
        steepness: 5,
        hubble: 1.0,
        eta0: -10,
      },
    },
    renderingOverrides: { densityGain: 0.2, densityContrast: 1.0 },
  },
]
