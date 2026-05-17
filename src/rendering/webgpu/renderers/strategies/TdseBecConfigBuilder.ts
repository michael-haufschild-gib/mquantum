/**
 * BEC-to-TDSE configuration mapper.
 *
 * Extracted from TdseBecStrategy.ts to keep the strategy file under the
 * project's 600-line cap. Contains pure functions that map BEC store
 * parameters to the shared TDSE compute pass configuration format.
 *
 * @module rendering/webgpu/renderers/strategies/TdseBecConfigBuilder
 */

import { MAX_DIMENSION, MIN_DIMENSION } from '@/constants/dimension'
import type { BecConfig, BecFieldView, BecInitialCondition } from '@/lib/geometry/extended/bec'
import { DEFAULT_BEC_CONFIG } from '@/lib/geometry/extended/bec'
import {
  DEFAULT_TDSE_CONFIG,
  type TdseConfig,
  type TdseInitialCondition,
} from '@/lib/geometry/extended/tdse'
import { clampFinite, clampFiniteArray, clampFiniteInteger } from '@/lib/math/clamp'
import { reduceGridToFit } from '@/lib/math/ndArray'
import { thomasFermiMuND } from '@/lib/physics/bec/chemicalPotential'
import {
  computeWaterfallBackgroundDensity,
  resolveBecMass,
} from '@/lib/physics/bec/waterfallParams'

/** Subset of the schroedinger store needed for absorber + exposure wiring. */
interface BecSchoedingerOverrides {
  absorberEnabled?: boolean
  absorberWidth?: number
  pmlTargetReflection?: number
  autoScaleMaxGain?: number
}

const BEC_INITIAL_CONDITIONS = new Set<BecInitialCondition>([
  'thomasFermi',
  'gaussianPacket',
  'vortexImprint',
  'vortexLattice',
  'darkSoliton',
  'vortexReconnection',
  'blackHoleAnalog',
])

const BEC_FIELD_VIEWS = new Set<BecFieldView>([
  'density',
  'phase',
  'current',
  'potential',
  'superfluidVelocity',
  'healingLength',
  'machNumber',
  'hawkingFlux',
  'vorticity',
])
const BEC_TDSE_MAX_TOTAL_SITES = 262144

function sanitizeBecLatticeDim(value: number | undefined): number {
  return clampFiniteInteger(value, DEFAULT_BEC_CONFIG.latticeDim, MIN_DIMENSION, MAX_DIMENSION)
}

function sanitizeGridSizeArray(values: readonly number[] | undefined, latDim: number): number[] {
  const grid = Array.from({ length: latDim }, (_, i) => {
    const raw = values?.[i]
    const clamped = clampFinite(raw, 8, 2, 128)
    const snapped = 2 ** Math.round(Math.log2(clamped))
    return Math.max(2, Math.min(128, snapped))
  })
  return reduceGridToFit(grid, BEC_TDSE_MAX_TOTAL_SITES)
}

function sanitizeBooleanArray(values: readonly boolean[] | undefined, latDim: number): boolean[] {
  return Array.from({ length: latDim }, (_, i) => values?.[i] === true)
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function sanitizeInitialCondition(value: BecConfig['initialCondition']): BecInitialCondition {
  return BEC_INITIAL_CONDITIONS.has(value) ? value : DEFAULT_BEC_CONFIG.initialCondition
}

function sanitizeFieldView(
  value: BecConfig['fieldView'],
  effectiveInitCondition: BecInitialCondition
): BecFieldView {
  if (!BEC_FIELD_VIEWS.has(value)) return DEFAULT_BEC_CONFIG.fieldView
  return value === 'hawkingFlux' && effectiveInitCondition !== 'blackHoleAnalog'
    ? DEFAULT_BEC_CONFIG.fieldView
    : value
}

function sanitizeVortexPlane(
  value: readonly number[] | undefined,
  fallback: readonly [number, number],
  latDim: number
): [number, number] {
  const a = clampFiniteInteger(value?.[0], fallback[0], 0, latDim - 1)
  const b = clampFiniteInteger(value?.[1], fallback[1], 0, latDim - 1)
  return a === b ? [0, Math.min(1, latDim - 1)] : [a, b]
}

/** Validate BEC initial condition and compute mapped init type + momentum params. */
function prepareBecInitCondition(bec: BecConfig, g: number, latDim: number) {
  let initCond = sanitizeInitialCondition(bec.initialCondition)

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
  // Typed narrowly — every branch below must land on a valid
  // `TdseInitialCondition` so the caller's `initialCondition: mappedInit`
  // assignment doesn't need a cast.
  let mappedInit: TdseInitialCondition = initCond as TdseInitialCondition
  if (initCond === 'vortexLattice') mappedInit = 'vortexImprint'
  else if (initCond === 'vortexReconnection') mappedInit = 'ndVortexPair'

  // Build momentum vector — encode BEC-specific params
  const mom = new Array(Math.max(latDim, 5)).fill(0) as number[]
  if (initCond === 'vortexImprint' || initCond === 'vortexLattice') {
    mom[0] = clampFiniteInteger(bec.vortexCharge, DEFAULT_BEC_CONFIG.vortexCharge, -4, 4)
    if (initCond === 'vortexLattice') {
      mom[3] = clampFiniteInteger(
        bec.vortexLatticeCount,
        DEFAULT_BEC_CONFIG.vortexLatticeCount,
        1,
        16
      )
      mom[4] = booleanOr(bec.vortexAlternateCharge, DEFAULT_BEC_CONFIG.vortexAlternateCharge)
        ? 1.0
        : 0.0
    }
  }
  if (initCond === 'vortexReconnection') {
    mom[0] = clampFiniteInteger(bec.vortexCharge, DEFAULT_BEC_CONFIG.vortexCharge, -4, 4)
  }
  if (initCond === 'darkSoliton') {
    mom[1] = clampFinite(bec.solitonDepth, DEFAULT_BEC_CONFIG.solitonDepth, 0, 1)
    mom[2] = clampFinite(bec.solitonVelocity, DEFAULT_BEC_CONFIG.solitonVelocity, -1, 1)
  }
  return { initCond, mappedInit, mom }
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
  const latDim = sanitizeBecLatticeDim(bec.latticeDim)
  const gridSize = sanitizeGridSizeArray(bec.gridSize, latDim)
  const spacing = clampFiniteArray(bec.spacing, latDim, 0.15, 0.01, 1)
  const g = clampFinite(
    bec.interactionStrength,
    DEFAULT_BEC_CONFIG.interactionStrength,
    -1000,
    10000
  )
  const omega = clampFinite(bec.trapOmega, DEFAULT_BEC_CONFIG.trapOmega, 0.01, 10)
  const initOmega = clampFinite(bec.initTrapOmega, omega, 0.01, 10)
  const anisotropy = clampFiniteArray(bec.trapAnisotropy, latDim, 1, 0.1, 10)
  const hbar = clampFinite(bec.hbar, DEFAULT_TDSE_CONFIG.hbar, 0.1, 10)
  const dt = clampFinite(bec.dt, DEFAULT_BEC_CONFIG.dt, 0.0001, 0.05)
  const stepsPerFrame = clampFiniteInteger(
    bec.stepsPerFrame,
    DEFAULT_BEC_CONFIG.stepsPerFrame,
    1,
    16
  )
  const diagnosticsInterval = clampFiniteInteger(
    bec.diagnosticsInterval,
    DEFAULT_BEC_CONFIG.diagnosticsInterval,
    1,
    60
  )

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

  const { initCond, mappedInit, mom } = prepareBecInitCondition(
    { ...bec, initialCondition: sanitizeInitialCondition(bec.initialCondition) },
    g,
    latDim
  )

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
      gridSize,
      spacing,
      mass: resolveBecMass(bec),
      hbar,
      dt,
      stepsPerFrame,
      initialCondition: mappedInit,
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
      // Disorder overlay: forward the BEC-side configuration so the shared
      // TDSE compute pipeline adds on-site disorder to the trap potential.
      // `disorderStrength === 0` is the fast-path no-op in the dispatcher;
      // BEC defaults to 0, matching the pre-existing behavior for presets
      // that don't set it. Re-using the existing TDSE field names keeps
      // the schema flat — no BEC-only branch in the compute pass.
      disorderStrength: clampFinite(bec.disorderStrength, 0, 0, 100),
      disorderSeed: clampFiniteInteger(
        bec.disorderSeed,
        DEFAULT_TDSE_CONFIG.disorderSeed,
        0,
        0xffffffff
      ),
      disorderDistribution:
        bec.disorderDistribution === 'gaussian' || bec.disorderDistribution === 'uniform'
          ? bec.disorderDistribution
          : DEFAULT_TDSE_CONFIG.disorderDistribution,
      driveEnabled: false,
      driveFrequency: 0,
      driveAmplitude: 0,
      // Do NOT override bhMass / bhMultipoleL / bhSpin — BEC mode never
      // activates `blackHoleRingdown` and the canonical TDSE defaults
      // already provide a physically-valid (ℓ ≥ s) triple. Duplicating
      // them here would invite silent drift on schema changes.
      trapAnisotropy: anisotropy,
      absorberEnabled: booleanOr(schroedinger?.absorberEnabled, false),
      absorberWidth: clampFinite(schroedinger?.absorberWidth, 0.2, 0.05, 0.5),
      pmlTargetReflection: clampFinite(schroedinger?.pmlTargetReflection, 1e-6, 1e-12, 0.999),
      fieldView: sanitizeFieldView(bec.fieldView, initCond),
      autoScale: booleanOr(bec.autoScale, true),
      autoScaleMaxGain: clampFinite(schroedinger?.autoScaleMaxGain, 20, 1, 100),
      showPotential: false,
      autoLoop: false,
      diagnosticsEnabled: booleanOr(bec.diagnosticsEnabled, true),
      diagnosticsInterval,
      needsReset: booleanOr(bec.needsReset, false),
      slicePositions: clampFiniteArray(bec.slicePositions, Math.max(0, latDim - 3), 0, -1, 1),
      interactionStrength: g,
      customPotentialExpression: '',
      observablesEnabled: booleanOr(bec.observablesEnabled, false),
      imaginaryTimeEnabled: false,
      // N-D vortex reconnection plane configuration
      vortexPlane1: sanitizeVortexPlane(bec.vortexPlane1, [0, 1], latDim),
      vortexPlane2: sanitizeVortexPlane(bec.vortexPlane2, [0, 1], latDim),
      vortexSeparation: clampFinite(bec.vortexSeparation, 0, 0, 5),
      vortexPairCount: clampFiniteInteger(bec.vortexPairCount, 2, 1, 2),
      // Kaluza-Klein compactification (pass through from BEC config)
      compactDims: sanitizeBooleanArray(bec.compactDims, latDim),
      compactRadii: clampFiniteArray(bec.compactRadii, latDim, 0.15, 0.01, 10),
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
      hawkingVmax: clampFinite(bec.hawkingVmax, DEFAULT_BEC_CONFIG.hawkingVmax, 0.5, 5),
      hawkingLh: clampFinite(bec.hawkingLh, DEFAULT_BEC_CONFIG.hawkingLh, 0.1, 1.5),
      hawkingDeltaN: clampFinite(bec.hawkingDeltaN, DEFAULT_BEC_CONFIG.hawkingDeltaN, 0, 0.6),
      hawkingPairInjection: booleanOr(bec.hawkingPairInjection, false),
      hawkingInjectRate: clampFinite(
        bec.hawkingInjectRate,
        DEFAULT_BEC_CONFIG.hawkingInjectRate,
        0,
        0.5
      ),
      hawkingSeed: clampFiniteInteger(
        bec.hawkingSeed,
        DEFAULT_BEC_CONFIG.hawkingSeed,
        0,
        0xffffffff
      ),
    },
  }
}
