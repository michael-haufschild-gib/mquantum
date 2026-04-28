/**
 * TDSE Scenario Presets — curated configurations for quantum tunneling demos
 *
 * Each preset provides a partial TdseConfig override that sets up a
 * physically interesting scenario. Only fields that differ from
 * DEFAULT_TDSE_CONFIG are specified; consumers merge with spread.
 *
 * @module lib/physics/tdse/presets
 */

import { CURVED_METRIC_TDSE_PRESETS } from './curvedMetricPresets'
import { DECOHERENCE_PRESETS } from './decoherencePresets'
import type {
  TdsePresetOverride,
  TdseRenderingOverrides,
  TdseScenarioPreset,
} from './tdsePresetTypes'

export type { TdsePresetOverride, TdseRenderingOverrides, TdseScenarioPreset }

/** Default rendering overrides applied to every TDSE preset unless explicitly overridden. */
const TDSE_DEFAULT_RENDERING: TdseRenderingOverrides = {
  densityGain: 2.0,
  densityContrast: 1.8,
  autoScaleMaxGain: 20,
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
      packetMomentum: [3.0, 0, 0],
      potentialType: 'barrier',
      barrierHeight: 8.0,
      barrierWidth: 0.4,
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
    renderingOverrides: { densityGain: 5.0, densityContrast: 4.0 },
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
      packetMomentum: [2.0, 0, 0],
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
    renderingOverrides: { densityGain: 5.0, densityContrast: 4.0 },
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
      'Packet in the higher (metastable) minimum of a tilted 1D quartic double well — tunnels through the intervening barrier into the true (lower) minimum. Tunneling is along axis 0 only; this preset uses the directional `doubleWell` potential, not the radial one. For the radial bubble-nucleation analog see the `bubbleNucleation` preset.',
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
      doubleWellLambda: 3.0,
      doubleWellSeparation: 1.0,
      doubleWellAsymmetry: 1.5,
      absorberEnabled: true,
      absorberWidth: 0.2,
      pmlTargetReflection: 1e-6,
      diagnosticsEnabled: true,
      diagnosticsInterval: 5,
      fieldView: 'density',
      autoScale: true,
      autoLoop: false,
      showPotential: true,
    },
    renderingOverrides: { densityGain: 3.0, densityContrast: 2.5, autoScaleMaxGain: 2 },
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
    name: 'Anderson: 4D Transport',
    description:
      'Disorder W/t=15 on a 4D cube. Because the Anderson transition in 4D sits around Wc/t ≈ 34, W/t=15 lies well inside the extended (diffusive) phase; this preset probes weak-disorder transport in one dimension above 3D rather than sitting on the mobility edge.',
    // Post-`resizeTdseArrays` form: the 262k-site budget yields
    // `defaultTdseGridPerDim(4) = 16` per axis (16⁴ = 65k sites). A
    // pre-resize [32]⁴ literal would be silently collapsed here with
    // spacing doubled 0.1→0.2 — write the runtime geometry directly so
    // the literal values match what the simulation actually runs.
    overrides: {
      latticeDim: 4,
      gridSize: [16, 16, 16, 16],
      // Extent 3.2 per axis (same as pre-resize extent 32·0.1=3.2).
      spacing: [0.2, 0.2, 0.2, 0.2],
      dt: 0.002,
      stepsPerFrame: 10,
      initialCondition: 'gaussianPacket',
      packetCenter: [0, 0, 0, 0],
      packetWidth: 0.25,
      packetAmplitude: 1.0,
      packetMomentum: [0, 0, 0, 0],
      potentialType: 'andersonDisorder',
      // W/t is spacing-independent: `uploadAndersonDisorderBuffer` scales
      // the user-facing W by the current t_eff = ℏ²/(2m·dx²), so the
      // localization physics is invariant under the dx=0.1→0.2 resize.
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
      'Disorder W/t=15 on a 5D cube. Higher-dimensional Anderson critical points are much larger than 3D (Wc/t increases roughly linearly with d), so this preset sits in the extended phase. Lets the user see how transport compares against the 3D and 4D presets in a regime where exact diagonalization is infeasible.',
    // Post-`resizeTdseArrays` form: 262k-site budget yields
    // `defaultTdseGridPerDim(5) = 8` per axis (8⁵ = 32k sites). A pre-
    // resize [16]⁵ literal would be silently collapsed with spacing
    // doubled 0.1→0.2.
    overrides: {
      latticeDim: 5,
      gridSize: [8, 8, 8, 8, 8],
      // Extent 1.6 per axis (same as pre-resize extent 16·0.1=1.6).
      spacing: [0.2, 0.2, 0.2, 0.2, 0.2],
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
  {
    id: 'blackHoleRingdown',
    name: 'Black Hole Ringdown (s=2, ℓ=2, M=1)',
    description:
      'Regge–Wheeler barrier for gravitational perturbations of Schwarzschild. A Gaussian wavepacket incoming from the left scatters off the ringdown potential and rings at the QNM frequency.',
    // Preset geometry is written in post-`resizeTdseArrays` form so the
    // literal values in this file match what the simulation actually runs.
    // `applyTdsePreset` reshapes any preset whose gridSize/spacing don't line
    // up with `defaultTdseGridPerDim(globalDim) = 64` (for 3D); writing the
    // final 64³ grid directly means the resize is a no-op.
    //
    // Physical layout on axis 0 (the tortoise r* axis):
    //   gridSize[0] · spacing[0] = 64 · 0.8 = 51.2   (full axis)
    //   half_extent[0]           = 25.6             (centered at 0)
    //   PML width                = 0.10 · 64 · 0.8 = 5.12 per side
    //   non-PML half             = 20.48
    //   packet center            = −15  (3σ tail at −19.5, ≈1 M inside PML edge)
    //   Regge–Wheeler peak       = +3.28  (s=2, ℓ=2, M=1)
    // Transverse axes 1–2 are soft-wall confined; 0.3 spacing keeps the
    // Gaussian packet's transverse width well-resolved.
    overrides: {
      latticeDim: 3,
      gridSize: [64, 64, 64],
      spacing: [0.8, 0.3, 0.3],
      mass: 1.0,
      dt: 0.01,
      stepsPerFrame: 4,
      potentialType: 'blackHoleRingdown',
      bhMass: 1.0,
      bhMultipoleL: 2,
      bhSpin: 2,
      initialCondition: 'gaussianPacket',
      packetCenter: [-15, 0, 0],
      // k₀ = 0.5 gives kinetic energy E = k²/(2m) ≈ 0.125, which is below
      // V_peak ≈ 0.154/M². A sub-barrier packet produces clear partial
      // reflection / partial tunneling + quasinormal-mode ringing in the
      // scattered density. Higher k (> √(2·V_peak) ≈ 0.55) would let the
      // packet stream over the barrier and wash out the QNM signal.
      packetMomentum: [0.5, 0, 0],
      packetWidth: 1.5,
      packetAmplitude: 1.0,
      absorberEnabled: true,
      absorberWidth: 0.1,
      pmlTargetReflection: 1e-6,
      diagnosticsEnabled: true,
      diagnosticsInterval: 5,
      fieldView: 'density',
      autoScale: false,
      autoLoop: false,
      showPotential: true,
    },
    // Scattered density in the Regge-Wheeler barrier is spatially dilute
    // (most of the packet tunnels or reflects and the ringing tail is a
    // few percent of the incident amplitude). The defaults (2.0 / 1.8)
    // leave the ringdown oscillations almost invisible — the stronger
    // gain + contrast here surfaces the QNM pattern against the dim
    // backdrop without saturating the barrier region.
    renderingOverrides: { densityGain: 5.0, densityContrast: 4.0 },
  },
  {
    id: 'erEprWormhole',
    name: 'Mirror-Coupled Rabi Oscillation (ER=EPR boundary dual)',
    description:
      'Quantum / boundary-side dual of a traversable wormhole. A stationary Gaussian sits in the left well of a symmetric double well, and the nonlocal mirror term Ĥ_int = g·P_M drives clean Rabi oscillation between L and R at period π/g ≈ 1.6s. The bridge itself is NOT visualized — in the quantum picture of ER=EPR there is no geometric path between the two sides, only this nonlocal coupling operator. What you see is the consequence (density vanishing on one side and reappearing on the other), not a signal traversing a tube. The geometric bridge exists only in the dual GR description, which this simulator does not compute. Kinetic tunneling through the physical barrier is negligible; all probability transfer comes from the mirror coupling.',
    overrides: {
      latticeDim: 3,
      gridSize: [64, 64, 64],
      spacing: [0.1, 0.1, 0.1],
      mass: 1.0,
      dt: 0.005,
      stepsPerFrame: 4,
      initialCondition: 'gaussianPacket',
      packetCenter: [-1.2, 0, 0],
      // σ = √(ℏ/mω_well) with ω_well = √(8λa²/m) ≈ 9.6 → 0.32. Matching
      // the well ground-state width keeps breathing-mode mixing low so
      // transverse spreading stays slow across many Rabi cycles.
      packetWidth: 0.32,
      packetAmplitude: 1.0,
      packetMomentum: [0, 0, 0],
      potentialType: 'doubleWell',
      doubleWellLambda: 8.0,
      doubleWellSeparation: 1.2,
      doubleWellAsymmetry: 0.0,
      absorberEnabled: true,
      absorberWidth: 0.2,
      pmlTargetReflection: 1e-6,
      diagnosticsEnabled: true,
      diagnosticsInterval: 5,
      fieldView: 'density',
      // autoScale compensates for the slow transverse spread in y/z —
      // the doubleWell potential only confines axis 0, and the soft
      // quartic transverse walls only activate in the outer 25%, so the
      // packet eventually delocalizes in y/z without this.
      autoScale: true,
      autoLoop: false,
      showPotential: false,
      wormholeCouplingEnabled: true,
      wormholeCouplingG: 2.0,
      wormholeMirrorAxis: 0,
      // HUD intentionally off: I(L:R) = |⟨ψ|P_M|ψ⟩|² vanishes for a pure
      // |L⟩ → Rabi-rotated state (Re(α*β) = 0 throughout the oscillation),
      // so the trace would flatline at 0 while the density visibly hops.
      // User can enable the HUD manually to inspect mirror symmetry if
      // starting from a non-pure superposition.
      wormholeCoherenceHudEnabled: false,
    },
    // The packet splits amplitude between the two wells during the
    // crossover (both lobes at half density near t = π/(4g)). Without
    // boosted gain the mid-oscillation frame looks empty.
    renderingOverrides: { densityGain: 3.0, densityContrast: 2.0, autoScaleMaxGain: 20 },
  },
  {
    id: 'wormholeWavepacket',
    name: 'Wavepacket on a Wormhole Metric',
    description:
      'Gaussian wave packet propagating along the proper-distance axis of a Morris–Thorne throat. The kinetic operator is the Laplace–Beltrami operator on the curved spatial slice — not a potential. Shows partial reflection off the geometric bottleneck, curvature-induced dispersion, and transmitted amplitude that continues toward the far asymptotic region. No teleportation, no traversal between disconnected regions — just a single ψ on a single curved 3-slice.',
    // Grid is written in post-`resizeTdseArrays` form (same convention as
    // blackHoleRingdown). The 262k-site TDSE budget caps a 3D lattice at
    // 64³; a [128,64,64] preset would otherwise be silently collapsed to
    // 64³ with spacing [0.2, 0.1, 0.1], halving axis-0 resolution without
    // surfacing the change to the user. Writing the post-resize geometry
    // directly keeps preset intent and runtime physics in lockstep.
    overrides: {
      latticeDim: 3,
      gridSize: [64, 64, 64],
      // Extent: 12.8 × 6.4 × 6.4 (elongated along the wormhole axis).
      spacing: [0.2, 0.1, 0.1],
      // CFL bound for RK4 on the curved FD Laplace–Beltrami at b₀=0.5.
      // At dx₀=0.2 the bound dt ≲ 2√2 / ‖T‖ ≈ 0.0064; dt=0.001 keeps the
      // integrator comfortably stable and stepsPerFrame=8 preserves the
      // same simulation-time-per-frame pace as the rest of the TDSE
      // presets.
      dt: 0.001,
      stepsPerFrame: 8,
      initialCondition: 'gaussianPacket',
      packetCenter: [-3.0, 0, 0],
      packetWidth: 0.5,
      packetAmplitude: 1.0,
      packetMomentum: [3.0, 0, 0],
      // No external potential — the curvature of the spatial slice alone
      // produces reflection and dispersion via the Laplace–Beltrami kinetic
      // operator. `potentialType: 'free'` is the enum value for the flat
      // "no potential" case (the plan's `'none'` does not exist).
      potentialType: 'free',
      metric: { kind: 'morrisThorne', throatRadius: 0.5 },
      absorberEnabled: true,
      absorberWidth: 0.15,
      diagnosticsEnabled: true,
      fieldView: 'density',
      autoScale: true,
    },
    renderingOverrides: { densityGain: 3.0, densityContrast: 2.5 },
  },
  // ── Curved-space TDSE v2 presets (Wave 5) — see curvedMetricPresets.ts
  ...CURVED_METRIC_TDSE_PRESETS,
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
