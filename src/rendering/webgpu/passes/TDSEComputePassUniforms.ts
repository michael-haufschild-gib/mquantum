/**
 * TDSE Compute Pass — Uniform Writing & FFT Staging
 *
 * Pure data-writing functions extracted from TDSEComputePass.
 * No GPU pipeline or bind group logic — only buffer writes.
 */

import { normalizeTdseBlackHoleParams } from '@/lib/geometry/extended/tdse'
import type { TdseConfig } from '@/lib/geometry/extended/types'
import { clampFinite } from '@/lib/math/clamp'
import { buildCompactDimsMask } from '@/lib/physics/compactification'
import { sigmaMaxFromPmlConfig } from '@/lib/physics/pml/profile'
import { computeTdseEffectiveSpacing } from '@/lib/physics/tdse/effectiveSpacing'
import type { MetricKind } from '@/lib/physics/tdse/metrics/types'
import {
  MAX_ADS_RADIUS,
  MAX_DOUBLE_THROAT_SEPARATION,
  MAX_HUBBLE_RATE,
  MAX_SCHWARZSCHILD_MASS,
  MAX_SPHERE_RADIUS,
  MAX_THROAT_RADIUS,
  MAX_TORUS_PERIOD,
  metricPeriodicDimsMask,
  MIN_ADS_RADIUS,
  MIN_DOUBLE_THROAT_SEPARATION,
  MIN_HUBBLE_RATE,
  MIN_SCHWARZSCHILD_MASS,
  MIN_SPHERE_RADIUS,
  MIN_THROAT_RADIUS,
  MIN_TORUS_PERIOD,
  normalizeMetricForLattice,
} from '@/lib/physics/tdse/metrics/types'
import { normalizeMirrorAxisForLattice } from '@/lib/physics/tdse/wormholeCoupling'

import {
  MAX_DIM,
  packFFTAxisUniforms,
  packFFTStageUniforms,
  writeSlicePositionsToF32,
} from './computePassUtils'
import { TDSE_UNIFORMS_LAYOUT } from './tdseUniformsLayout'

/** Named float32/uint32 slot indices into the TDSEUniforms struct. */
const I = TDSE_UNIFORMS_LAYOUT.index

/** Parameters for writing TDSEUniforms to a GPU buffer. */
export interface TdseUniformParams {
  config: TdseConfig
  totalSites: number
  simTime: number
  maxDensity: number
  /** Initial peak density from first diagnostics readback, for gain cap */
  initialMaxDensity: number
  /** Maximum autoScale amplification factor (from store) */
  autoScaleMaxGain: number
  strides: number[]
  needsInit: boolean
  basisX?: Float32Array
  basisY?: Float32Array
  basisZ?: Float32Array
  boundingRadius?: number
  /** Max |V| for custom potential display normalization (set by uploadCustomPotentialBuffer) */
  customPotentialScale?: number
  /**
   * Frame counter for analog-Hawking pair-injection noise evolution. Increments
   * monotonically once per rendered frame so the deterministic noise
   * realization advances even with `simTime` held constant (e.g. when paused,
   * the counter stays fixed and noise is frozen — correct).
   */
  hawkingStepIndex?: number
}

/** Enum maps for TDSE initial conditions. */
const INIT_MAP: Record<string, number> = {
  gaussianPacket: 0,
  planeWave: 1,
  superposition: 2,
  thomasFermi: 3,
  vortexImprint: 4,
  vortexLattice: 4,
  darkSoliton: 5,
  ndVortexPair: 6,
  blackHoleAnalog: 7,
}

/** Enum maps for TDSE potential types. */
const POT_MAP: Record<string, number> = {
  free: 0,
  barrier: 1,
  step: 2,
  finiteWell: 3,
  harmonicTrap: 4,
  driven: 5,
  doubleSlit: 6,
  periodicLattice: 7,
  doubleWell: 8,
  becTrap: 9,
  radialDoubleWell: 10,
  custom: 11, // GPU potential shader skipped; buffer filled from JS
  andersonDisorder: 12, // GPU potential shader skipped; buffer filled from JS with random disorder
  coupledAnharmonic: 13,
  blackHoleRingdown: 14,
}

/** Enum maps for TDSE field view modes. */
const VIEW_MAP: Record<string, number> = {
  density: 0,
  phase: 1,
  current: 2,
  potential: 3,
  superfluidVelocity: 4,
  healingLength: 5,
  machNumber: 6,
  hawkingFlux: 7,
  quantumPressure: 8,
  vorticity: 9,
}

/** Enum maps for TDSE drive waveform types. */
const WAVEFORM_MAP: Record<string, number> = { sine: 0, pulse: 1, chirp: 2 }

/**
 * Metric kind → numeric code for the GPU uniform. Must match the codes
 * documented in `tdseUniforms.wgsl.ts` and consumed by `evalMetric` in
 * `tdseCurvedKinetic.wgsl.ts`.
 */
const METRIC_KIND_MAP: Record<MetricKind, number> = {
  flat: 0,
  morrisThorne: 1,
  schwarzschild: 2,
  deSitter: 3,
  antiDeSitter: 4,
  sphere2D: 5,
  torus: 6,
  doubleThroat: 7,
}

function finiteOrZero(v: number | undefined): number {
  return v === undefined || !Number.isFinite(v) ? 0 : v
}

/** Mutable holder for per-step TDSEUniforms staging. */
export interface TdseUniformStepStagingState {
  buffer: GPUBuffer | null
  size: number
}

/** Create an empty per-step uniform staging state. */
export function createTdseUniformStepStagingState(): TdseUniformStepStagingState {
  return { buffer: null, size: 0 }
}

/** Destroy per-step uniform staging resources. */
export function disposeTdseUniformStepStaging(state: TdseUniformStepStagingState): void {
  state.buffer?.destroy()
  state.buffer = null
  state.size = 0
}

function ensureTdseUniformStepStaging(
  state: TdseUniformStepStagingState,
  device: GPUDevice,
  byteSize: number
): GPUBuffer {
  if (state.buffer && state.size >= byteSize) return state.buffer
  state.buffer?.destroy()
  state.buffer = device.createBuffer({
    label: 'tdse-step-uniform-staging',
    size: byteSize,
    usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
  })
  state.size = byteSize
  return state.buffer
}

/**
 * Pack TDSE uniform data into a pre-allocated ArrayBuffer.
 *
 * @param uniformData - Pre-allocated ArrayBuffer (TDSE_UNIFORMS_LAYOUT.totalSize bytes)
 * @param uniformU32 - Uint32Array view of uniformData
 * @param uniformF32 - Float32Array view of uniformData
 * @param params - Current config and derived values
 */
export function packTdseUniformData(
  uniformData: ArrayBuffer,
  uniformU32: Uint32Array,
  uniformF32: Float32Array,
  params: TdseUniformParams
): void {
  const {
    config,
    totalSites,
    simTime,
    maxDensity,
    initialMaxDensity,
    autoScaleMaxGain,
    strides,
    needsInit,
    boundingRadius,
  } = params
  const u32 = uniformU32
  const f32 = uniformF32
  // Cheap layout-vs-buffer sanity check: every index used below is sourced
  // from `TDSE_UNIFORMS_LAYOUT.index`, so the only way the buffer can be
  // out of sync with the layout is if the caller allocated it from a stale
  // size constant. The check costs one int compare per frame.
  if (uniformData.byteLength !== TDSE_UNIFORMS_LAYOUT.totalSize) {
    throw new Error(
      `writeTdseUniforms: uniformData byteLength=${uniformData.byteLength} ` +
        `does not match TDSE_UNIFORMS_LAYOUT.totalSize=${TDSE_UNIFORMS_LAYOUT.totalSize}`
    )
  }
  u32.fill(0)

  // Pre-compute effective spacing (compactification and torus metric period).
  const effSpacing = computeTdseEffectiveSpacing(config)

  // Lattice params
  u32[I.latticeDim] = config.latticeDim
  u32[I.totalSites] = totalSites
  f32[I.dt] = config.dt
  f32[I.hbar] = config.hbar

  // Physics
  f32[I.mass] = config.mass
  u32[I.stepsPerFrame] = config.stepsPerFrame
  u32[I.initCondition] = INIT_MAP[config.initialCondition] ?? 0
  u32[I.potentialType] = POT_MAP[config.potentialType] ?? 0

  // gridSize (array<u32, 12>)
  for (let d = 0; d < config.latticeDim; d++) u32[I.gridSize + d] = config.gridSize[d]!
  // strides (array<u32, 12>)
  for (let d = 0; d < config.latticeDim; d++) u32[I.strides + d] = strides[d]!
  // spacing (array<f32, 12>) — uses effective spacing (compact dims overridden)
  for (let d = 0; d < config.latticeDim; d++) f32[I.spacing + d] = effSpacing[d]!
  // packetCenter (array<f32, 12>)
  // Write full array length: BEC encodes non-spatial params beyond latticeDim
  const centerLen = Math.min(config.packetCenter.length, MAX_DIM)
  for (let d = 0; d < centerLen; d++) {
    f32[I.packetCenter + d] = finiteOrZero(config.packetCenter[d])
  }
  // packetMomentum (array<f32, 12>)
  // Write full array length: BEC encodes vortex/soliton params beyond latticeDim
  // [0]=vortexCharge, [1]=solitonDepth, [2]=solitonVelocity,
  // [3]=vortexLatticeCount, [4]=vortexAlternateCharge
  const momLen = Math.min(config.packetMomentum.length, MAX_DIM)
  for (let d = 0; d < momLen; d++) {
    f32[I.packetMomentum + d] = finiteOrZero(config.packetMomentum[d])
  }

  // Packet scalars
  f32[I.packetWidth] = config.packetWidth
  f32[I.packetAmplitude] = config.packetAmplitude
  f32[I.boundingRadius] = boundingRadius ?? 2.0
  u32[I.fieldView] = VIEW_MAP[config.fieldView] ?? 0

  // Potential params
  f32[I.barrierHeight] = config.barrierHeight
  f32[I.barrierWidth] = config.barrierWidth
  f32[I.barrierCenter] = config.barrierCenter
  f32[I.wellDepth] = config.wellDepth
  f32[I.wellWidth] = config.wellWidth
  // Use init omega for the init pass when a quench is configured.
  // The evolution omega is restored via copyBufferToBuffer before potential fill.
  const hasOmegaQuench =
    config.harmonicOmegaInit !== undefined && config.harmonicOmegaInit !== config.harmonicOmega
  f32[I.harmonicOmega] =
    needsInit && hasOmegaQuench ? config.harmonicOmegaInit! : config.harmonicOmega
  f32[I.stepHeight] = config.stepHeight
  u32[I.absorberEnabled] = config.absorberEnabled ? 1 : 0

  // Absorber + drive
  // absorberWidth is PML fraction; absorberStrength is σ_max computed from PML target reflection
  f32[I.absorberWidth] = config.absorberWidth
  f32[I.absorberStrength] = sigmaMaxFromPmlConfig(config)
  u32[I.driveEnabled] = config.driveEnabled ? 1 : 0
  u32[I.driveWaveform] = WAVEFORM_MAP[config.driveWaveform] ?? 0
  f32[I.driveFrequency] = config.driveFrequency
  f32[I.driveAmplitude] = config.driveAmplitude
  f32[I.simTime] = simTime
  // AutoScale gain cap: never amplify beyond autoScaleMaxGain × initial peak density.
  // Without this, a 0.001-density residual gets amplified 1000× and looks like a full wavepacket.
  const densityFloor = initialMaxDensity / Math.max(autoScaleMaxGain, 1)
  f32[I.maxDensity] = config.autoScale ? Math.max(maxDensity, densityFloor) : 1.0

  // slicePositions (array<f32, 12>).
  writeSlicePositionsToF32(f32, I.slicePositions, config.slicePositions)

  // Basis vectors (array<f32, 12> ×3).
  const writeBasis = (offset: number, b?: Float32Array) => {
    if (b) {
      for (let d = 0; d < Math.min(b.length, MAX_DIM); d++) f32[offset + d] = b[d]!
    }
  }
  writeBasis(I.basisX, params.basisX)
  if (!params.basisX) f32[I.basisX] = 1.0
  writeBasis(I.basisY, params.basisY)
  if (!params.basisY) f32[I.basisY + 1] = 1.0
  writeBasis(I.basisZ, params.basisZ)
  if (!params.basisZ) f32[I.basisZ + 2] = 1.0

  // kGridScale (array<f32, 12>): 2*pi / (N * a_eff)
  for (let d = 0; d < config.latticeDim; d++) {
    const N = config.gridSize[d]!
    const a = effSpacing[d]!
    f32[I.kGridScale + d] = (2 * Math.PI) / (N * a)
  }

  // Double slit params
  f32[I.slitSeparation] = config.slitSeparation
  f32[I.slitWidth] = config.slitWidth
  f32[I.wallThickness] = config.wallThickness
  f32[I.wallHeight] = config.wallHeight

  // Periodic lattice params
  f32[I.latticeDepth] = config.latticeDepth
  f32[I.latticePeriod] = config.latticePeriod

  // Display overlay
  u32[I.showPotential] = config.showPotential ? 1 : 0

  // Double well params
  f32[I.doubleWellLambda] = config.doubleWellLambda
  f32[I.doubleWellSeparation] = config.doubleWellSeparation
  f32[I.doubleWellAsymmetry] = config.doubleWellAsymmetry

  // BEC interaction strength
  f32[I.interactionStrength] = config.interactionStrength ?? 0.0

  // BEC trap anisotropy ratios (array<f32, 12>)
  const anisotropy = config.trapAnisotropy
  for (let d = 0; d < MAX_DIM; d++) {
    f32[I.trapAnisotropy + d] = anisotropy?.[d] ?? 1.0
  }

  // Radial double well params
  f32[I.radialWellInner] = config.radialWellInner
  f32[I.radialWellOuter] = config.radialWellOuter
  f32[I.radialWellDepth] = config.radialWellDepth
  f32[I.radialWellTilt] = config.radialWellTilt

  // Imaginary-time mode flag
  u32[I.imaginaryTime] = config.imaginaryTimeEnabled ? 1 : 0

  // Custom potential display scale
  f32[I.customPotentialScale] = params.customPotentialScale ?? 1.0

  // N-D vortex reconnection parameters
  const vp1 = config.vortexPlane1 ?? [0, 1]
  const vp2 = config.vortexPlane2 ?? [2, 3]
  u32[I.vortexPlane1Axis0] = vp1[0]
  u32[I.vortexPlane1Axis1] = vp1[1]
  u32[I.vortexPlane2Axis0] = vp2[0]
  u32[I.vortexPlane2Axis1] = vp2[1]
  f32[I.vortexSeparation] = config.vortexSeparation ?? 0.0
  u32[I.vortexCount] = config.vortexPairCount ?? 2

  // Coupled anharmonic coupling
  f32[I.anharmonicLambda] = config.anharmonicLambda ?? 1.0

  // Periodic-dimension bitmask. User-selected KK compact dimensions and
  // metric-imposed compact axes both skip PML damping. Example: sphere2D
  // wraps φ (axis 2) even when the user did not toggle a generic
  // Kaluza-Klein compactification flag.
  const userCompactMask = buildCompactDimsMask(config.compactDims, config.latticeDim)
  const metric = normalizeMetricForLattice(config.metric, config.latticeDim)
  const metricCompactMask = metricPeriodicDimsMask(metric.kind, config.latticeDim)
  u32[I.compactDimsMask] = userCompactMask | metricCompactMask

  // Stochastic decoherence branching.
  // branchingEnabled is always written as 0 in the TDSE compute uniform.
  // Branch fraction encoding in the density texture alpha channel triggered a
  // Metal shader compiler bug on Apple Silicon — the runtime if-branch in the
  // writeGrid WGSL corrupted texture sampling in the fragment shader's raymarching
  // loop. Branch visualization is now computed directly in the fragment shader
  // from ray position using branchPlaneThreshold/branchTransitionWidth in
  // SchroedingerUniforms.
  u32[I.branchingEnabled] = 0
  f32[I.branchPlanePosition] = config.branchPlanePosition ?? 0.0

  // Black-hole Regge–Wheeler ringdown parameters
  const bh = normalizeTdseBlackHoleParams(config)
  f32[I.bhMass] = bh.bhMass
  f32[I.bhMultipoleL] = bh.bhMultipoleL
  f32[I.bhSpin] = bh.bhSpin

  // Analog Hawking (waterfall sonic horizon) parameters.
  // The `_padHawk0` slot stays zeroed from `u32.fill(0)` above.
  f32[I.hawkingVmax] = config.hawkingVmax ?? 2.0
  f32[I.hawkingLh] = config.hawkingLh ?? 0.6
  f32[I.hawkingDeltaN] = Math.max(0, Math.min(0.6, config.hawkingDeltaN ?? 0.0))
  f32[I.hawkingInjectRate] = Math.max(0, Math.min(0.5, config.hawkingInjectRate ?? 0.05))
  u32[I.hawkingPairInjection] = config.hawkingPairInjection ? 1 : 0
  u32[I.hawkingSeed] = (config.hawkingSeed ?? 1337) >>> 0
  u32[I.hawkingStepIndex] = (params.hawkingStepIndex ?? 0) >>> 0

  // Wormhole-shader trig cache (host-precomputed cos/sin of 0.5·dt·g).
  // tau·g is dispatch-uniform; hoist cos/sin off the GPU thread and into a
  // single CPU compute per pack. The shader early-returns when wormhole is
  // disabled, so values are unused in that path; we still write valid trig
  // (cos(0)=1, sin(0)=0 with default g=0) so the buffer stays deterministic.
  // Clamp through clampFinite so a transient NaN/Infinity in either field
  // (e.g. malformed saved state) cannot leak into the trig and contaminate
  // the wormhole kernel. Default to (0, 0) → cos=1, sin=0 (no coupling).
  const wormholeG = clampFinite(config.wormholeCouplingG, 0, 0, Number.POSITIVE_INFINITY)
  const wormholeTau = 0.5 * clampFinite(config.dt, 0, 0, Number.POSITIVE_INFINITY)
  f32[I.wormholeCosTau] = Math.cos(wormholeTau * wormholeG)
  f32[I.wormholeSinTau] = Math.sin(wormholeTau * wormholeG)

  // ER=EPR double-trace wormhole coupling.
  // Enabled + G + axis + pad. Axis defaults to 0 (x-axis reflection).
  u32[I.wormholeCouplingEnabled] = config.wormholeCouplingEnabled ? 1 : 0
  f32[I.wormholeCouplingG] = wormholeG
  u32[I.wormholeMirrorAxis] =
    normalizeMirrorAxisForLattice(config.wormholeMirrorAxis, config.latticeDim) >>> 0
  u32[I._padWormhole] = 0

  // Analog-Hawking island overlay.
  // When the overlay is off (or radius is zero) the shader no-ops regardless
  // of the other fields — we still zero them so the GPU sees stable data.
  const islandEnabled = config.islandOverlayEnabled === true
  const islandRadius = Math.max(0, config.islandRadiusWs ?? 0)
  const islandActive = islandEnabled && islandRadius > 0
  u32[I.islandOverlayEnabled] = islandActive ? 1 : 0
  f32[I.islandCenterX0] = islandActive ? (config.islandCenterX0 ?? 0) : 0
  f32[I.islandRadiusWs] = islandActive ? islandRadius : 0
  // Boost defaults to 1.0 (no brightening) when off; clamp to [1.0, 4.0] so a
  // bogus config value cannot over-saturate the density texture.
  const rawBoost = config.islandBoost ?? 1.0
  const clampedBoost = Math.min(4.0, Math.max(1.0, Number.isFinite(rawBoost) ? rawBoost : 1.0))
  f32[I.islandBoost] = islandActive ? clampedBoost : 1.0

  // Curved-space TDSE v1 metric.
  // metricKind codes: 0=flat, 1=morrisThorne, 2=schwarzschild, 3=deSitter,
  // 4=antiDeSitter, 5=sphere2D, 6=torus, 7=doubleThroat.
  // The curved RK4 integrator evaluates the metric analytically from these
  // fields + the v2 block below. Pad slots stay 0 from the u32.fill(0) at top.
  const kind: MetricKind = metric.kind
  const metricKind = METRIC_KIND_MAP[kind] ?? 0
  u32[I.metricKind] = metricKind
  // throatRadius is consumed by both morrisThorne and doubleThroat (as the
  // shared b₀). Clamp to its physical bounds; zero when not relevant.
  const wantsThroat = kind === 'morrisThorne' || kind === 'doubleThroat'
  f32[I.throatRadius] = wantsThroat
    ? clampFinite(metric.throatRadius, MIN_THROAT_RADIUS, MIN_THROAT_RADIUS, MAX_THROAT_RADIUS)
    : 0

  // Curved-space TDSE v2 metric block.
  // Each field is zero when not relevant to the active metric kind; otherwise
  // clamped to its bounds from `lib/physics/tdse/metrics/types.ts`.
  f32[I.schwarzschildMass] =
    kind === 'schwarzschild'
      ? clampFinite(
          metric.schwarzschildMass,
          MIN_SCHWARZSCHILD_MASS,
          MIN_SCHWARZSCHILD_MASS,
          MAX_SCHWARZSCHILD_MASS
        )
      : 0
  f32[I.hubbleRate] =
    kind === 'deSitter'
      ? clampFinite(metric.hubbleRate, MIN_HUBBLE_RATE, MIN_HUBBLE_RATE, MAX_HUBBLE_RATE)
      : 0
  f32[I.adsRadius] =
    kind === 'antiDeSitter'
      ? clampFinite(metric.adsRadius, MIN_ADS_RADIUS, MIN_ADS_RADIUS, MAX_ADS_RADIUS)
      : 0
  f32[I.sphereRadius] =
    kind === 'sphere2D'
      ? clampFinite(metric.sphereRadius, MIN_SPHERE_RADIUS, MIN_SPHERE_RADIUS, MAX_SPHERE_RADIUS)
      : 0
  f32[I.doubleThroatSep] =
    kind === 'doubleThroat'
      ? clampFinite(
          metric.doubleThroatSeparation,
          MIN_DOUBLE_THROAT_SEPARATION,
          MIN_DOUBLE_THROAT_SEPARATION,
          MAX_DOUBLE_THROAT_SEPARATION
        )
      : 0
  // doubleThroatRadius: falls back to throatRadius per the CPU evaluator.
  f32[I.doubleThroatRad] =
    kind === 'doubleThroat'
      ? clampFinite(
          metric.doubleThroatRadius ?? metric.throatRadius,
          MIN_THROAT_RADIUS,
          MIN_THROAT_RADIUS,
          MAX_THROAT_RADIUS
        )
      : 0
  // _padV2a/b/c stay 0 from u32.fill(0) above.

  // torusPeriod (3 × f32). Zero when not torus.
  if (kind === 'torus') {
    const periods = metric.torusPeriod
    f32[I.torusPeriod + 0] = clampFinite(
      periods?.[0],
      MIN_TORUS_PERIOD,
      MIN_TORUS_PERIOD,
      MAX_TORUS_PERIOD
    )
    f32[I.torusPeriod + 1] = clampFinite(
      periods?.[1],
      MIN_TORUS_PERIOD,
      MIN_TORUS_PERIOD,
      MAX_TORUS_PERIOD
    )
    f32[I.torusPeriod + 2] = clampFinite(
      periods?.[2],
      MIN_TORUS_PERIOD,
      MIN_TORUS_PERIOD,
      MAX_TORUS_PERIOD
    )
  }

  // RK4 per-stage simTime offsets.
  // K1 = t, K2 = K3 = t + dt/2, K4 = t + dt.
  // NOTE: written once per frame at start-of-frame simTime — stale for
  // stepsPerFrame > 1. Acceptable for v2a; only deSitter consumes time.
  const tStart = simTime
  const halfDt = 0.5 * config.dt
  f32[I.stageTimeK1] = tStart
  f32[I.stageTimeK2] = tStart + halfDt
  f32[I.stageTimeK3] = tStart + halfDt
  f32[I.stageTimeK4] = tStart + config.dt

  // Curved-space TDSE v2 Wave 6 visualization block. All render-only — do
  // not touch the kinetic path. Opacity is clamped to [0, 1] so a bogus
  // store value can't amplify the overlay beyond the intended blend range.
  // _padV2d stays 0 from fill.
  u32[I.showCurvatureOverlay] = config.showCurvatureOverlay ? 1 : 0
  u32[I.densityViewMode] = config.densityView === 'proper' ? 1 : 0
  const rawOpacity = config.curvatureOverlayOpacity ?? 0.4
  f32[I.curvatureOverlayOpacity] = Math.min(
    1,
    Math.max(0, Number.isFinite(rawOpacity) ? rawOpacity : 0.4)
  )

  // Host-precomputed reciprocal spacing (array<f32, 12> ×2).
  // Eliminates one divide + max + mul per cell per RK4 stage in the curved
  // kinetic kernel. Mirrors kGridScale's precompute pattern. Mirrors the
  // shader's `1.0 / max(dx, 1e-12)` exactly so quantum dynamics are
  // bit-identical to the prior in-shader compute. Slots beyond latticeDim
  // remain zero from `u32.fill(0)` above.
  for (let d = 0; d < config.latticeDim; d++) {
    const dx = effSpacing[d]!
    // Compute in JS double precision, then store as f32. The shader uses
    // `1.0 / max(dx, 1e-12)`; mirror exactly to avoid drift.
    const safeDx = Math.max(Number.isFinite(dx) ? dx : 0, 1e-12)
    const invDx = 1.0 / safeDx
    f32[I.invSpacing + d] = invDx
    f32[I.invSpacing2 + d] = invDx * invDx
  }
}

/**
 * Write TDSE uniform data into a pre-allocated ArrayBuffer, then upload to the GPU.
 *
 * @param device - WebGPU device
 * @param uniformBuffer - Target GPU uniform buffer
 * @param uniformData - Pre-allocated ArrayBuffer (TDSE_UNIFORMS_LAYOUT.totalSize bytes)
 * @param uniformU32 - Uint32Array view of uniformData
 * @param uniformF32 - Float32Array view of uniformData
 * @param params - Current config and derived values
 */
export function writeTdseUniforms(
  device: GPUDevice,
  uniformBuffer: GPUBuffer,
  uniformData: ArrayBuffer,
  uniformU32: Uint32Array,
  uniformF32: Float32Array,
  params: TdseUniformParams
): void {
  packTdseUniformData(uniformData, uniformU32, uniformF32, params)
  device.queue.writeBuffer(uniformBuffer, 0, uniformData)
}

/** Inputs for pre-packing a frame of ordered TDSEUniforms snapshots. */
export interface PrePackTdseFrameSnapshotsParams extends Omit<TdseUniformParams, 'simTime'> {
  state: TdseUniformStepStagingState
  device: GPUDevice
  simTime: number
  stepsThisFrame: number
  uniformData: ArrayBuffer
  uniformU32: Uint32Array
  uniformF32: Float32Array
}

/**
 * Pre-pack `stepsThisFrame + 1` full TDSEUniforms snapshots into a staging
 * buffer. Command-encoder copies can then patch the live TDSE uniform buffer
 * in-order before each physics step; queue.writeBuffer cannot provide that
 * ordering because all queued writes land before the command buffer executes.
 */
export function prePackTdseFrameSnapshots(
  params: PrePackTdseFrameSnapshotsParams
): GPUBuffer | null {
  const steps = Number.isFinite(params.stepsThisFrame) ? Math.floor(params.stepsThisFrame) : 0
  if (steps <= 0) return null
  const slotSize = TDSE_UNIFORMS_LAYOUT.totalSize
  const staging = ensureTdseUniformStepStaging(params.state, params.device, (steps + 1) * slotSize)
  const base: Omit<TdseUniformParams, 'simTime'> = {
    config: params.config,
    totalSites: params.totalSites,
    maxDensity: params.maxDensity,
    initialMaxDensity: params.initialMaxDensity,
    autoScaleMaxGain: params.autoScaleMaxGain,
    strides: params.strides,
    needsInit: params.needsInit,
    basisX: params.basisX,
    basisY: params.basisY,
    basisZ: params.basisZ,
    boundingRadius: params.boundingRadius,
    customPotentialScale: params.customPotentialScale,
    hawkingStepIndex: params.hawkingStepIndex,
  }
  for (let step = 0; step <= steps; step++) {
    packTdseUniformData(params.uniformData, params.uniformU32, params.uniformF32, {
      ...base,
      needsInit: step === 0 ? params.needsInit : false,
      simTime: params.simTime + step * base.config.dt,
    })
    params.device.queue.writeBuffer(staging, step * slotSize, params.uniformData)
  }
  return staging
}

/**
 * Pre-compute all FFT stage uniforms for all axes and both directions into a
 * single ArrayBuffer. Slots are laid out in execution order: forward FFT axes
 * (from latticeDim-1 down to 0), then inverse FFT axes (same order).
 *
 * This data is written to fftStagingBuffer once per rebuild. Individual slots
 * are then copied to fftUniformBuffer via encoder.copyBufferToBuffer before
 * each dispatch, ensuring correct per-stage data within the command buffer.
 *
 * (device.queue.writeBuffer cannot be used per-stage because all writeBuffer
 * calls complete before the command buffer executes, so only the last write
 * would be visible to the GPU.)
 *
 * @param config - Current TDSE configuration
 * @param totalSites - Total number of lattice sites
 * @returns Pre-computed FFT staging data as an ArrayBuffer
 */
export function buildTdseFFTStagingData(config: TdseConfig, totalSites: number): ArrayBuffer {
  return packFFTStageUniforms(config, totalSites)
}

/**
 * Pre-compute per-axis FFT uniforms for the shared-memory FFT kernel.
 * One slot per axis per direction (forward then inverse), laid out in
 * execution order: latticeDim-1 down to 0 for forward, same for inverse.
 *
 * Each slot is 32 bytes (FFTAxisUniforms), matching FFT_UNIFORM_SIZE.
 *
 * @param config - Current TDSE configuration
 * @param totalSites - Total number of lattice sites
 * @returns Pre-computed axis staging data as an ArrayBuffer
 */
export function buildTdseFFTAxisStagingData(config: TdseConfig, totalSites: number): ArrayBuffer {
  return packFFTAxisUniforms(config, totalSites)
}
