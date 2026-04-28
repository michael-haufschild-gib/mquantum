/**
 * TDSE Compute Pass — Uniform Writing & FFT Staging
 *
 * Pure data-writing functions extracted from TDSEComputePass.
 * No GPU pipeline or bind group logic — only buffer writes.
 */

import { normalizeTdseBlackHoleParams } from '@/lib/geometry/extended/tdse'
import type { TdseConfig } from '@/lib/geometry/extended/types'
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
} from '@/lib/physics/tdse/metrics/types'

import {
  MAX_DIM,
  packFFTAxisUniforms,
  packFFTStageUniforms,
  writeSlicePositionsToF32,
} from './computePassUtils'

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

/** Clamp `v` into `[lo, hi]`; non-finite input returns `lo`. */
function clampFinite(v: number | undefined, lo: number, hi: number): number {
  if (v === undefined || !Number.isFinite(v)) return lo
  return Math.min(hi, Math.max(lo, v))
}

/**
 * Write TDSE uniform data into a pre-allocated ArrayBuffer, then upload to the GPU.
 *
 * @param device - WebGPU device
 * @param uniformBuffer - Target GPU uniform buffer
 * @param uniformData - Pre-allocated ArrayBuffer (UNIFORM_SIZE bytes)
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
  u32.fill(0)

  // Pre-compute effective spacing (compactification and torus metric period).
  const effSpacing = computeTdseEffectiveSpacing(config)

  // Lattice params (0-15)
  u32[0] = config.latticeDim
  u32[1] = totalSites
  f32[2] = config.dt
  f32[3] = config.hbar

  // Physics (16-31)
  f32[4] = config.mass
  u32[5] = config.stepsPerFrame
  u32[6] = INIT_MAP[config.initialCondition] ?? 0
  u32[7] = POT_MAP[config.potentialType] ?? 0

  // gridSize (32, indices 8-19)
  for (let d = 0; d < config.latticeDim; d++) u32[8 + d] = config.gridSize[d]!
  // strides (80, indices 20-31)
  for (let d = 0; d < config.latticeDim; d++) u32[20 + d] = strides[d]!
  // spacing (128, indices 32-43) — uses effective spacing (compact dims overridden)
  for (let d = 0; d < config.latticeDim; d++) f32[32 + d] = effSpacing[d]!
  // packetCenter (176, indices 44-55)
  // Write full array length: BEC encodes non-spatial params beyond latticeDim
  const centerLen = Math.min(config.packetCenter.length, MAX_DIM)
  for (let d = 0; d < centerLen; d++) f32[44 + d] = config.packetCenter[d] ?? 0
  // packetMomentum (224, indices 56-67)
  // Write full array length: BEC encodes vortex/soliton params beyond latticeDim
  // [0]=vortexCharge, [1]=solitonDepth, [2]=solitonVelocity,
  // [3]=vortexLatticeCount, [4]=vortexAlternateCharge
  const momLen = Math.min(config.packetMomentum.length, MAX_DIM)
  for (let d = 0; d < momLen; d++) f32[56 + d] = config.packetMomentum[d] ?? 0

  // Packet scalars (272-287, indices 68-71)
  f32[68] = config.packetWidth
  f32[69] = config.packetAmplitude
  f32[70] = boundingRadius ?? 2.0
  u32[71] = VIEW_MAP[config.fieldView] ?? 0

  // Potential params (288-319, indices 72-79)
  f32[72] = config.barrierHeight
  f32[73] = config.barrierWidth
  f32[74] = config.barrierCenter
  f32[75] = config.wellDepth
  f32[76] = config.wellWidth
  // Use init omega for the init pass when a quench is configured.
  // The evolution omega is restored via copyBufferToBuffer before potential fill.
  const hasOmegaQuench =
    config.harmonicOmegaInit !== undefined && config.harmonicOmegaInit !== config.harmonicOmega
  f32[77] = needsInit && hasOmegaQuench ? config.harmonicOmegaInit! : config.harmonicOmega
  f32[78] = config.stepHeight
  u32[79] = config.absorberEnabled ? 1 : 0

  // Absorber + drive (320-351, indices 80-87)
  // absorberWidth is PML fraction; absorberStrength is σ_max computed from PML target reflection
  f32[80] = config.absorberWidth
  f32[81] = sigmaMaxFromPmlConfig(config)
  u32[82] = config.driveEnabled ? 1 : 0
  u32[83] = WAVEFORM_MAP[config.driveWaveform] ?? 0
  f32[84] = config.driveFrequency
  f32[85] = config.driveAmplitude
  f32[86] = simTime
  // AutoScale gain cap: never amplify beyond autoScaleMaxGain × initial peak density.
  // Without this, a 0.001-density residual gets amplified 1000× and looks like a full wavepacket.
  const densityFloor = initialMaxDensity / Math.max(autoScaleMaxGain, 1)
  f32[87] = config.autoScale ? Math.max(maxDensity, densityFloor) : 1.0

  // slicePositions (offset 352, indices 88-99, WGSL array<f32, 12>).
  writeSlicePositionsToF32(f32, 88, config.slicePositions)

  // Basis vectors (400-543, indices 100-135)
  const writeBasis = (offset: number, b?: Float32Array) => {
    if (b) {
      for (let d = 0; d < Math.min(b.length, MAX_DIM); d++) f32[offset + d] = b[d]!
    }
  }
  writeBasis(100, params.basisX)
  if (!params.basisX) f32[100] = 1.0
  writeBasis(112, params.basisY)
  if (!params.basisY) f32[113] = 1.0
  writeBasis(124, params.basisZ)
  if (!params.basisZ) f32[126] = 1.0

  // kGridScale (544, indices 136-147): 2*pi / (N * a_eff)
  for (let d = 0; d < config.latticeDim; d++) {
    const N = config.gridSize[d]!
    const a = effSpacing[d]!
    f32[136 + d] = (2 * Math.PI) / (N * a)
  }

  // Double slit params (592, indices 148-151)
  f32[148] = config.slitSeparation
  f32[149] = config.slitWidth
  f32[150] = config.wallThickness
  f32[151] = config.wallHeight

  // Periodic lattice params (608, indices 152-153)
  f32[152] = config.latticeDepth
  f32[153] = config.latticePeriod

  // Display overlay (616, index 154)
  u32[154] = config.showPotential ? 1 : 0

  // Double well params (620-631, indices 155-157)
  f32[155] = config.doubleWellLambda
  f32[156] = config.doubleWellSeparation
  f32[157] = config.doubleWellAsymmetry

  // BEC interaction strength (632, index 158)
  f32[158] = config.interactionStrength ?? 0.0

  // BEC trap anisotropy ratios (636, indices 159-170)
  const anisotropy = config.trapAnisotropy
  for (let d = 0; d < MAX_DIM; d++) {
    f32[159 + d] = anisotropy?.[d] ?? 1.0
  }

  // Radial double well params (684-699, indices 171-174)
  f32[171] = config.radialWellInner
  f32[172] = config.radialWellOuter
  f32[173] = config.radialWellDepth
  f32[174] = config.radialWellTilt

  // Imaginary-time mode flag (offset 700, index 175)
  u32[175] = config.imaginaryTimeEnabled ? 1 : 0

  // Custom potential display scale (offset 704, index 176)
  f32[176] = params.customPotentialScale ?? 1.0

  // N-D vortex reconnection parameters (offset 708-731, indices 177-182)
  const vp1 = config.vortexPlane1 ?? [0, 1]
  const vp2 = config.vortexPlane2 ?? [2, 3]
  u32[177] = vp1[0]
  u32[178] = vp1[1]
  u32[179] = vp2[0]
  u32[180] = vp2[1]
  f32[181] = config.vortexSeparation ?? 0.0
  u32[182] = config.vortexPairCount ?? 2

  // Coupled anharmonic coupling (offset 732, index 183)
  f32[183] = config.anharmonicLambda ?? 1.0

  // Periodic-dimension bitmask (offset 736, index 184). User-selected KK
  // compact dimensions and metric-imposed compact axes both skip PML damping.
  // Example: sphere2D wraps φ (axis 2) even when the user did not toggle a
  // generic Kaluza-Klein compactification flag.
  const userCompactMask = buildCompactDimsMask(config.compactDims, config.latticeDim)
  const metricCompactMask =
    config.metric !== undefined ? metricPeriodicDimsMask(config.metric.kind, config.latticeDim) : 0
  u32[184] = userCompactMask | metricCompactMask

  // Stochastic decoherence branching (offsets 740-744, indices 185-186)
  // branchingEnabled is always written as 0 in the TDSE compute uniform.
  // Branch fraction encoding in the density texture alpha channel triggered a
  // Metal shader compiler bug on Apple Silicon — the runtime if-branch in the
  // writeGrid WGSL corrupted texture sampling in the fragment shader's raymarching
  // loop. Branch visualization is now computed directly in the fragment shader
  // from ray position using branchPlaneThreshold/branchTransitionWidth in
  // SchroedingerUniforms.
  u32[185] = 0
  f32[186] = config.branchPlanePosition ?? 0.0

  // Black-hole Regge–Wheeler ringdown parameters (offsets 748-756, indices 187-189)
  const bh = normalizeTdseBlackHoleParams(config)
  f32[187] = bh.bhMass
  f32[188] = bh.bhMultipoleL
  f32[189] = bh.bhSpin

  // Analog Hawking (waterfall sonic horizon) parameters (offsets 760-796, indices 190-199).
  // Only the first 7 slots are live — the remaining three are pad to preserve
  // the 16-byte struct-size alignment. The u32.fill(0) above has already
  // zeroed the pad slots; writing them explicitly would add no value.
  f32[190] = config.hawkingVmax ?? 2.0
  f32[191] = config.hawkingLh ?? 0.6
  f32[192] = Math.max(0, Math.min(0.6, config.hawkingDeltaN ?? 0.0))
  f32[193] = Math.max(0, Math.min(0.5, config.hawkingInjectRate ?? 0.05))
  u32[194] = config.hawkingPairInjection ? 1 : 0
  u32[195] = (config.hawkingSeed ?? 1337) >>> 0
  u32[196] = (params.hawkingStepIndex ?? 0) >>> 0

  // Wormhole-shader trig cache (offsets 792, 796 — indices 198, 199).
  // tau·g is dispatch-uniform; hoist cos/sin off the GPU thread and into a
  // single CPU compute per pack. The shader early-returns when wormhole is
  // disabled, so values are unused in that path; we still write valid trig
  // (cos(0)=1, sin(0)=0 with default g=0) so the buffer stays deterministic.
  // Clamp through clampFinite so a transient NaN/Infinity in either field
  // (e.g. malformed saved state) cannot leak into the trig and contaminate
  // the wormhole kernel. Default to (0, 0) → cos=1, sin=0 (no coupling).
  const wormholeG = clampFinite(config.wormholeCouplingG, 0, Number.POSITIVE_INFINITY)
  const wormholeTau = 0.5 * clampFinite(config.dt, 0, Number.POSITIVE_INFINITY)
  f32[198] = Math.cos(wormholeTau * wormholeG)
  f32[199] = Math.sin(wormholeTau * wormholeG)

  // ER=EPR double-trace wormhole coupling (offsets 800-815, indices 200-203).
  // Enabled + G + axis + pad. Axis defaults to 0 (x-axis reflection).
  u32[200] = config.wormholeCouplingEnabled ? 1 : 0
  f32[201] = wormholeG
  u32[202] = Math.max(0, Math.min(2, Math.floor(config.wormholeMirrorAxis ?? 0))) >>> 0
  u32[203] = 0

  // Analog-Hawking island overlay (offsets 816-831, indices 204-207).
  // When the overlay is off (or radius is zero) the shader no-ops regardless
  // of the other fields — we still zero them so the GPU sees stable data.
  const islandEnabled = config.islandOverlayEnabled === true
  const islandRadius = Math.max(0, config.islandRadiusWs ?? 0)
  const islandActive = islandEnabled && islandRadius > 0
  u32[204] = islandActive ? 1 : 0
  f32[205] = islandActive ? (config.islandCenterX0 ?? 0) : 0
  f32[206] = islandActive ? islandRadius : 0
  // Boost defaults to 1.0 (no brightening) when off; clamp to [1.0, 4.0] so a
  // bogus config value cannot over-saturate the density texture.
  const rawBoost = config.islandBoost ?? 1.0
  const clampedBoost = Math.min(4.0, Math.max(1.0, Number.isFinite(rawBoost) ? rawBoost : 1.0))
  f32[207] = islandActive ? clampedBoost : 1.0

  // Curved-space TDSE v1 metric (offsets 832-847, indices 208-211).
  // metricKind codes: 0=flat, 1=morrisThorne, 2=schwarzschild, 3=deSitter,
  // 4=antiDeSitter, 5=sphere2D, 6=torus, 7=doubleThroat.
  // The curved RK4 integrator evaluates the metric analytically from these
  // fields + the v2 block below. Pad slots stay 0 from the u32.fill(0) at top.
  const metric = config.metric
  const kind: MetricKind = metric?.kind ?? 'flat'
  const metricKind = METRIC_KIND_MAP[kind] ?? 0
  u32[208] = metricKind
  // throatRadius is consumed by both morrisThorne and doubleThroat (as the
  // shared b₀). Clamp to its physical bounds; zero when not relevant.
  const wantsThroat = kind === 'morrisThorne' || kind === 'doubleThroat'
  f32[209] = wantsThroat
    ? clampFinite(metric?.throatRadius, MIN_THROAT_RADIUS, MAX_THROAT_RADIUS)
    : 0

  // Curved-space TDSE v2 metric block (offsets 848-911, indices 212-227).
  // Each field is zero when not relevant to the active metric kind; otherwise
  // clamped to its bounds from `lib/physics/tdse/metrics/types.ts`.
  f32[212] =
    kind === 'schwarzschild'
      ? clampFinite(metric?.schwarzschildMass, MIN_SCHWARZSCHILD_MASS, MAX_SCHWARZSCHILD_MASS)
      : 0
  f32[213] =
    kind === 'deSitter' ? clampFinite(metric?.hubbleRate, MIN_HUBBLE_RATE, MAX_HUBBLE_RATE) : 0
  f32[214] =
    kind === 'antiDeSitter' ? clampFinite(metric?.adsRadius, MIN_ADS_RADIUS, MAX_ADS_RADIUS) : 0
  f32[215] =
    kind === 'sphere2D'
      ? clampFinite(metric?.sphereRadius, MIN_SPHERE_RADIUS, MAX_SPHERE_RADIUS)
      : 0
  f32[216] =
    kind === 'doubleThroat'
      ? clampFinite(
          metric?.doubleThroatSeparation,
          MIN_DOUBLE_THROAT_SEPARATION,
          MAX_DOUBLE_THROAT_SEPARATION
        )
      : 0
  // doubleThroatRadius: falls back to throatRadius per the CPU evaluator.
  f32[217] =
    kind === 'doubleThroat'
      ? clampFinite(
          metric?.doubleThroatRadius ?? metric?.throatRadius,
          MIN_THROAT_RADIUS,
          MAX_THROAT_RADIUS
        )
      : 0
  // indices 218, 219 are _padV2a/b — kept at 0 from u32.fill(0) above.

  // torusPeriod (3 × f32 at indices 220-222). Zero when not torus.
  if (kind === 'torus') {
    const periods = metric?.torusPeriod
    f32[220] = clampFinite(periods?.[0], MIN_TORUS_PERIOD, MAX_TORUS_PERIOD)
    f32[221] = clampFinite(periods?.[1], MIN_TORUS_PERIOD, MAX_TORUS_PERIOD)
    f32[222] = clampFinite(periods?.[2], MIN_TORUS_PERIOD, MAX_TORUS_PERIOD)
  }
  // index 223 is _padV2c.

  // RK4 per-stage simTime offsets (indices 224-227).
  // K1 = t, K2 = K3 = t + dt/2, K4 = t + dt.
  // NOTE: written once per frame at start-of-frame simTime — stale for
  // stepsPerFrame > 1. Acceptable for v2a; only deSitter consumes time.
  const tStart = simTime
  const halfDt = 0.5 * config.dt
  f32[224] = tStart
  f32[225] = tStart + halfDt
  f32[226] = tStart + halfDt
  f32[227] = tStart + config.dt

  // Curved-space TDSE v2 Wave 6 visualization block (offsets 912-927,
  // indices 228-231). All render-only — do not touch the kinetic path.
  // showCurvatureOverlay (228) and densityViewMode (229) are u32 flags.
  // Opacity is clamped to [0, 1] so a bogus store value can't amplify the
  // overlay beyond the intended blend range. _padV2d stays 0 from fill.
  u32[228] = config.showCurvatureOverlay ? 1 : 0
  u32[229] = config.densityView === 'proper' ? 1 : 0
  const rawOpacity = config.curvatureOverlayOpacity ?? 0.4
  f32[230] = Math.min(1, Math.max(0, Number.isFinite(rawOpacity) ? rawOpacity : 0.4))

  // Host-precomputed reciprocal spacing (offsets 928-1023, indices 232-255).
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
    f32[232 + d] = invDx
    f32[244 + d] = invDx * invDx
  }

  device.queue.writeBuffer(uniformBuffer, 0, uniformData)
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
