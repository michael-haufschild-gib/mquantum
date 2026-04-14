/**
 * BEC-to-TDSE configuration mapper.
 *
 * Extracted from TdseBecStrategy.ts to keep the strategy file under the
 * project's 600-line cap. Contains pure functions that map BEC store
 * parameters to the shared TDSE compute pass configuration format.
 *
 * @module rendering/webgpu/renderers/strategies/TdseBecConfigBuilder
 */

import type { BecConfig } from '@/lib/geometry/extended/bec'
import {
  DEFAULT_TDSE_CONFIG,
  type TdseConfig,
  type TdseInitialCondition,
} from '@/lib/geometry/extended/tdse'
import { thomasFermiMuND } from '@/lib/physics/bec/chemicalPotential'

/**
 * Background condensate density n₀ used by the waterfall (blackHoleAnalog)
 * initial condition. Mirrors the μ override inside `buildBecConfig`:
 *
 *   μ_wf  = max(g · 0.01, 1.0)
 *   n₀    = μ_wf / g   (for g > 0)
 *
 * Exposed as a pure helper so CPU-side analysis (e.g. the HUD's analytic κ,
 * T_H readout) can compute the same reference density the GPU simulator
 * uses — avoiding silent mismatches when the PRD window changes.
 *
 * @param config - minimal shape carrying `interactionStrength` (g).
 * @returns background density n₀; returns 1.0 for non-positive g as a safe fallback.
 */
export function computeWaterfallBackgroundDensity(config: { interactionStrength: number }): number {
  const g = config.interactionStrength
  if (!(g > 0)) return 1.0
  const muWaterfall = Math.max(g * 0.01, 1.0)
  return muWaterfall / g
}

/**
 * Resolve the effective particle mass used by the BEC simulator.
 *
 * Single canonical source of truth for `mass` in the BEC pipeline. Mirrors
 * the fallback used inside `buildBecConfig` so CPU-side analysis (HUD
 * readout, analytic κ / T_H, trap-profile plot) can compute the same
 * value the GPU simulator uses — preventing silent divergence if the
 * pipeline ever nulls `bec.mass` upstream.
 *
 * @param config - minimal shape carrying an optional `mass` field.
 * @returns `config.mass` when finite and positive, otherwise the TDSE default.
 */
export function resolveBecMass(config: { mass?: number | null }): number {
  const m = config.mass
  if (typeof m === 'number' && Number.isFinite(m) && m > 0) return m
  return DEFAULT_TDSE_CONFIG.mass
}

/** Subset of the schroedinger store needed for absorber + exposure wiring. */
interface BecSchoedingerOverrides {
  absorberEnabled?: boolean
  absorberWidth?: number
  pmlTargetReflection?: number
  autoScaleMaxGain?: number
}

/** Validate BEC initial condition and compute mapped init type + momentum params. */
function prepareBecInitCondition(bec: BecConfig, g: number, latDim: number) {
  let initCond = bec.initialCondition ?? 'thomasFermi'

  // Attractive BEC (g < 0): Thomas-Fermi doesn't apply → force Gaussian.
  // blackHoleAnalog also needs g > 0 because its background density comes from
  // μ/g; fall back to a Gaussian wavepacket to avoid a divide-by-negative.
  if (
    g < 0 &&
    (initCond === 'thomasFermi' ||
      initCond === 'vortexImprint' ||
      initCond === 'vortexLattice' ||
      initCond === 'darkSoliton' ||
      initCond === 'vortexReconnection' ||
      initCond === 'blackHoleAnalog')
  ) {
    initCond = 'gaussianPacket'
  }

  // Map BEC init conditions to TDSE shader init condition strings:
  // vortexLattice → vortexImprint (same shader, different count)
  // vortexReconnection → ndVortexPair (new shader branch for configurable-plane vortices)
  // blackHoleAnalog → blackHoleAnalog (new waterfall-horizon branch, index 7)
  let mappedInit: string = initCond
  if (initCond === 'vortexLattice') mappedInit = 'vortexImprint'
  else if (initCond === 'vortexReconnection') mappedInit = 'ndVortexPair'

  // Build momentum vector — encode BEC-specific params
  const mom = new Array(Math.max(latDim, 5)).fill(0) as number[]
  if (initCond === 'vortexImprint' || initCond === 'vortexLattice') {
    mom[0] = bec.vortexCharge ?? 1
    if (initCond === 'vortexLattice') {
      mom[3] = bec.vortexLatticeCount ?? 4
      mom[4] = bec.vortexAlternateCharge ? 1.0 : 0.0
    }
  }
  if (initCond === 'vortexReconnection') {
    mom[0] = bec.vortexCharge ?? 1
  }
  if (initCond === 'darkSoliton') {
    mom[1] = bec.solitonDepth ?? 1.0
    mom[2] = bec.solitonVelocity ?? 0.0
  }
  return { mappedInit, mom }
}

/**
 * Map BEC store config to TDSE config format.
 *
 * BEC is physically a nonlinear Schrodinger equation solved via the same
 * split-operator TDSE pipeline, with mode-specific initial conditions
 * (Thomas-Fermi, vortex imprint, dark soliton) and an anisotropic trap.
 */
export function buildBecConfig(
  bec: BecConfig,
  schroedinger: BecSchoedingerOverrides | undefined
): { config: TdseConfig } {
  const g = bec.interactionStrength ?? 500
  const omega = bec.trapOmega ?? 1.0
  const latDim = bec.latticeDim ?? 3
  const initOmega = bec.initTrapOmega ?? omega
  const anisotropy = bec.trapAnisotropy ?? (new Array(latDim).fill(1.0) as number[])

  // Chemical potential for init shader
  let effectiveInitOmega = initOmega
  if (g > 0 && anisotropy.length > 0) {
    let anisotropyProduct = 1.0
    for (let d = 0; d < latDim; d++) {
      anisotropyProduct *= anisotropy[d] ?? 1.0
    }
    effectiveInitOmega = initOmega * Math.pow(anisotropyProduct, 1 / latDim)
  }
  let mu =
    g > 0 ? thomasFermiMuND(latDim, g, effectiveInitOmega) : Math.pow(1 / (2 * Math.PI), latDim / 4)

  const { mappedInit, mom } = prepareBecInitCondition(bec, g, latDim)

  // Analog Hawking (waterfall) uses a uniform background density set by μ/g,
  // not a trap profile. A near-zero trap (ω → 0) drives the TF μ to near zero
  // and empties the volume — the GPU init shader then writes ψ ≈ 0 everywhere
  // and the horizon is invisible. Override μ with a fixed value that yields a
  // visible O(0.01) background density for g > 0. Irrelevant to the Mach
  // field (M = |v_s|/c_s is ratio-invariant) but keeps autoScale happy.
  if (mappedInit === 'blackHoleAnalog' && g > 0) {
    // Derived via the shared helper so the HUD's analytic readout sees the
    // exact same n₀ = μ/g the compute init shader seeds.
    mu = computeWaterfallBackgroundDensity({ interactionStrength: g }) * g
  }

  // Seed every field from the canonical TDSE defaults so BEC inherits any
  // future additions to TdseConfig (including the BH Regge–Wheeler block,
  // drive parameters, stochastic decoherence knobs, etc.) without every
  // strategy having to track the schema. Then override only what BEC
  // actually needs to differ on (`potentialType = 'becTrap'`, the BEC
  // initial-condition mapping, absorber wiring from the store, autoScale
  // and diagnostics). Any field not explicitly overridden below is the
  // TDSE default — centralized in DEFAULT_TDSE_CONFIG.
  return {
    config: {
      ...DEFAULT_TDSE_CONFIG,
      latticeDim: latDim,
      gridSize: bec.gridSize ?? new Array(latDim).fill(8),
      spacing: bec.spacing ?? new Array(latDim).fill(0.15),
      mass: resolveBecMass(bec),
      hbar: bec.hbar ?? DEFAULT_TDSE_CONFIG.hbar,
      dt: bec.dt ?? 0.002,
      stepsPerFrame: bec.stepsPerFrame ?? DEFAULT_TDSE_CONFIG.stepsPerFrame,
      initialCondition: mappedInit as TdseInitialCondition,
      packetCenter: new Array(latDim).fill(0),
      packetWidth: 1.0,
      packetAmplitude: mu,
      packetMomentum: mom,
      potentialType: 'becTrap',
      // Zero out every potential term — BEC uses its own trap exclusively.
      barrierHeight: 0,
      barrierWidth: 0,
      barrierCenter: 0,
      wellDepth: 0,
      wellWidth: 0,
      stepHeight: 0,
      // blackHoleAnalog forces a flat trap so the init shader's TF envelope
      // collapses to n = μ/g everywhere — the uniform background required
      // by Unruh's analog-horizon construction. We still let resizeBecArrays
      // use the raw trapOmega for grid-spacing selection (it needs a finite
      // TF radius to pick sane spacing), but zero out the evolution trap so
      // the waterfall flow isn't confined to a TF ball.
      harmonicOmega: mappedInit === 'blackHoleAnalog' ? 0 : omega,
      harmonicOmegaInit:
        mappedInit === 'blackHoleAnalog' ? undefined : initOmega !== omega ? initOmega : undefined,
      slitSeparation: 0,
      slitWidth: 0,
      wallThickness: 0,
      wallHeight: 0,
      latticeDepth: 0,
      latticePeriod: 1,
      doubleWellLambda: 0,
      doubleWellSeparation: 1,
      doubleWellAsymmetry: 0,
      anharmonicLambda: 0,
      disorderStrength: 0,
      driveEnabled: false,
      driveFrequency: 0,
      driveAmplitude: 0,
      // Do NOT override bhMass / bhMultipoleL / bhSpin — BEC mode never
      // activates `blackHoleRingdown` and the canonical TDSE defaults
      // already provide a physically-valid (ℓ ≥ s) triple. Duplicating
      // them here would invite silent drift on schema changes.
      trapAnisotropy: anisotropy,
      absorberEnabled: schroedinger?.absorberEnabled ?? false,
      absorberWidth: schroedinger?.absorberWidth ?? 0.2,
      pmlTargetReflection: schroedinger?.pmlTargetReflection ?? 1e-6,
      fieldView: bec.fieldView ?? 'density',
      autoScale: bec.autoScale ?? true,
      autoScaleMaxGain: schroedinger?.autoScaleMaxGain ?? 20,
      showPotential: false,
      autoLoop: false,
      diagnosticsEnabled: bec.diagnosticsEnabled ?? true,
      diagnosticsInterval: bec.diagnosticsInterval ?? 5,
      needsReset: bec.needsReset ?? false,
      slicePositions: bec.slicePositions ?? [],
      interactionStrength: g,
      customPotentialExpression: '',
      observablesEnabled: bec.observablesEnabled ?? false,
      imaginaryTimeEnabled: false,
      // N-D vortex reconnection plane configuration
      vortexPlane1: bec.vortexPlane1 ?? [0, 1],
      vortexPlane2: bec.vortexPlane2 ?? [2, 3],
      vortexSeparation: bec.vortexSeparation ?? 0.0,
      vortexPairCount: bec.vortexPairCount ?? 2,
      // Kaluza-Klein compactification (pass through from BEC config)
      compactDims: bec.compactDims ?? (new Array(latDim).fill(false) as boolean[]),
      compactRadii: bec.compactRadii ?? (new Array(latDim).fill(1.0) as number[]),
      // Stochastic decoherence: disabled for BEC mode
      stochasticEnabled: false,
      stochasticGamma: 0,
      stochasticSigma: 2.0,
      stochasticNumSites: 4,
      stochasticSeed: 42,
      branchingEnabled: false,
      branchPlanePosition: 0.0,
      branchColorA: [0, 1, 1] as [number, number, number],
      branchColorB: [1, 0, 1] as [number, number, number],
      // Analog Hawking (waterfall) — only consulted by the init kernel when
      // mappedInit === 'blackHoleAnalog' and by the pair-injection kernel
      // when hawkingPairInjection is true. Passed through verbatim; the
      // TdseConfig treats them as optional scalars.
      hawkingVmax: bec.hawkingVmax,
      hawkingLh: bec.hawkingLh,
      hawkingDeltaN: bec.hawkingDeltaN,
      hawkingPairInjection: bec.hawkingPairInjection,
      hawkingInjectRate: bec.hawkingInjectRate,
      hawkingSeed: bec.hawkingSeed,
    },
  }
}
