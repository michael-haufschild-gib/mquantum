/**
 * Free Scalar Field Compute Pass — Uniform Writing, Field Estimation & Diagnostics
 *
 * Pure data-writing functions extracted from FreeScalarFieldComputePass.
 * No GPU pipeline or bind group logic — only buffer writes,
 * physics-based field value estimation, and CPU-side diagnostics.
 */

// ───────────────────────────────────────────────────────────────────────────
// Uniform layout — single source of truth for FreeScalarUniforms struct
// ───────────────────────────────────────────────────────────────────────────

/**
 * Total size of the FreeScalarUniforms struct in bytes. Must match the
 * struct definition in
 * `src/rendering/webgpu/shaders/schroedinger/compute/freeScalarInit.wgsl.ts`.
 *
 * Canonical δφ layout: the last 32 bytes hold the three cosmology
 * coefficients `(aKinetic, aPotential, aFull)` plus three words of
 * alignment padding.
 */
export const FSF_UNIFORM_SIZE = 528

/**
 * Byte offset of the `dt` field in FreeScalarUniforms. Used by the per-step
 * leapfrog kickstart to overwrite only the dt slot without re-uploading the
 * full struct.
 */
export const FSF_DT_BYTE_OFFSET = 12

/**
 * Byte offset of the `aKinetic` field in FreeScalarUniforms. The six
 * per-substep scalars
 * `(aKinetic, aPotential, aFull, massSquaredScale, aPotentialRatio1,
 *   aPotentialRatio2)` are contiguous starting here — `FreeScalarField
 * ComputePass.writeCosmologyCoefsSlot` writes a 24-byte span at this
 * offset per substep whenever cosmology or preheating is active. The
 * first three carry the FLRW background coefficients; the fourth
 * carries the parametric-resonance drive factor
 * `1 + A·sin(Ω·(η−η_ref))`; the last two carry the Bianchi-I anisotropy
 * per-axis ratios `aPot_1/aPot_0` and `aPot_2/aPot_0`.
 */
export const FSF_COSMO_COEFS_BYTE_OFFSET = 504

/**
 * Number of f32 entries in the per-substep coefficient slot
 * `(aKinetic, aPotential, aFull, massSquaredScale, aPotentialRatio1,
 *   aPotentialRatio2)`. Six — the Bianchi-I Kasner round repurposed the
 * two trailing `_padCosmo1`/`_padCosmo2` words at offsets 520/524 as
 * anisotropy ratios, keeping the total struct size at 528 bytes.
 */
export const FSF_COSMO_COEFS_F32_COUNT = 6

/** Byte size of the contiguous per-substep coefficient slot. */
export const FSF_COSMO_COEFS_BYTE_SIZE = FSF_COSMO_COEFS_F32_COUNT * 4

/**
 * Index of the `aKinetic` field in the Float32Array view of the uniform
 * buffer (i.e. `FSF_COSMO_COEFS_BYTE_OFFSET / 4`). Derived once so the byte
 * and f32 offsets cannot drift.
 */
export const FSF_COSMO_COEFS_F32_INDEX = FSF_COSMO_COEFS_BYTE_OFFSET / 4

if (!Number.isInteger(FSF_COSMO_COEFS_F32_INDEX)) {
  throw new Error(
    `FSF_COSMO_COEFS_BYTE_OFFSET (${FSF_COSMO_COEFS_BYTE_OFFSET}) must be a multiple of 4 to fit a Float32Array index`
  )
}

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import type { CosmologyCoefs } from '@/lib/physics/cosmology/background'
import { computeMassSquaredScale } from '@/lib/physics/cosmology/preheating'
import {
  __resetFsfCosmologyWarnDedupForTests,
  computeFsfCosmologyCoefs,
  computeFsfCosmologySnapshot,
  computeFsfVacuumDispersion,
  FSF_IDENTITY_COSMO_COEFS,
} from '@/lib/physics/freeScalar/vacuumDispersion'
import {
  estimateVacuumEnergyVisualScale,
  estimateVacuumMaxPhi,
  estimateVacuumMaxPi,
  type VacuumDispersion,
} from '@/lib/physics/freeScalar/vacuumSpectrum'
import { computePMLSigmaMaxND, PML_GRADING_EXPONENT } from '@/lib/physics/pml/profile'
import type { FsfDiagnosticsSnapshot } from '@/stores/diagnostics/types'

import { computeStridesPadded, MAX_DIM, MAX_SLICE_POSITIONS_WRITE_COUNT } from './computePassUtils'

// PERF: WeakMap-backed typed array view cache. Avoids creating 3 new
// TypedArray views per frame (180/sec at 60 FPS). The views share the
// underlying ArrayBuffer so caching is safe and GC-friendly.
const _u32Cache = new WeakMap<ArrayBuffer, Uint32Array>()
const _f32Cache = new WeakMap<ArrayBuffer, Float32Array>()
const _i32Cache = new WeakMap<ArrayBuffer, Int32Array>()

function _getCachedU32(buf: ArrayBuffer): Uint32Array {
  let v = _u32Cache.get(buf)
  if (!v) {
    v = new Uint32Array(buf)
    _u32Cache.set(buf, v)
  }
  return v
}
function _getCachedF32(buf: ArrayBuffer): Float32Array {
  let v = _f32Cache.get(buf)
  if (!v) {
    v = new Float32Array(buf)
    _f32Cache.set(buf, v)
  }
  return v
}
function _getCachedI32(buf: ArrayBuffer): Int32Array {
  let v = _i32Cache.get(buf)
  if (!v) {
    v = new Int32Array(buf)
    _i32Cache.set(buf, v)
  }
  return v
}

// Re-export the shared cosmology helpers so external call sites (tests,
// other passes) can continue importing from this pass file if they want.
// The source of truth is `@/lib/physics/freeScalar/vacuumDispersion`; new
// code should import from there directly.
export {
  __resetFsfCosmologyWarnDedupForTests,
  computeFsfCosmologyCoefs,
  computeFsfCosmologySnapshot,
  computeFsfVacuumDispersion,
  FSF_IDENTITY_COSMO_COEFS,
}

// ───────────────────────────────────────────────────────────────────────────
// Config hashing
// ───────────────────────────────────────────────────────────────────────────

/**
 * Hash config fields that require buffer rebuild (grid shape changes).
 * @param config - Free scalar field configuration
 */
export function computeFsfConfigHash(config: FreeScalarConfig): string {
  return `${config.gridSize.join('x')}_d${config.latticeDim}`
}

/**
 * Hash config fields that require field reinitialization without buffer rebuild.
 * Covers physics params that change the initial condition but not the grid shape.
 *
 * Cosmology participates in the hash because the initial vacuum sample
 * (η₀, preset, steepness, hubble) and the runtime clock depend on it — a
 * cosmology-only change would otherwise leave the compute pass reusing
 * stale buffers even when `needsReset` isn't explicitly flipped.
 *
 * @param config - Free scalar field configuration
 */
export function computeFsfInitHash(config: FreeScalarConfig): string {
  const base = `${config.initialCondition}_m${config.mass}_k${config.modeK.join(',')}_c${config.packetCenter.join(',')}_w${config.packetWidth}_a${config.packetAmplitude}_s${config.vacuumSeed}`
  const cosmo = config.cosmology
  const bk =
    cosmo.enabled && cosmo.preset === 'bianchiKasner' && cosmo.kasnerExponents
      ? `_bk${cosmo.kasnerExponents.p1},${cosmo.kasnerExponents.p2},${cosmo.kasnerExponents.p3}`
      : ''
  const cosmoHash = cosmo.enabled
    ? `_cosmo1_${cosmo.preset}_eta${cosmo.eta0}_h${cosmo.hubble}_st${cosmo.steepness}${bk}`
    : '_cosmo0'
  if (config.selfInteractionEnabled) {
    return `${base}${cosmoHash}_si${config.selfInteractionLambda}_v${config.selfInteractionVev}`
  }
  return `${base}${cosmoHash}`
}

// ───────────────────────────────────────────────────────────────────────────
// Cosmological integrator coefficients — see
// `@/lib/physics/freeScalar/vacuumDispersion` for the implementation.
// The helpers are re-exported at the top of this file for backward compat.
// ───────────────────────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────────────────
// Uniform writing
// ───────────────────────────────────────────────────────────────────────────

/** Enum maps for initial condition type -> shader integer. */
const INIT_CONDITION_MAP: Record<string, number> = {
  vacuumNoise: 0,
  singleMode: 1,
  gaussianPacket: 2,
  kinkProfile: 3,
}

/** Enum maps for field view → shader integer. */
const FIELD_VIEW_MAP: Record<string, number> = {
  phi: 0,
  pi: 1,
  energyDensity: 2,
  wallDensity: 3,
}

/** Parameters for writing FreeScalarUniforms to a GPU buffer. */
export interface FsfUniformParams {
  config: FreeScalarConfig
  totalSites: number
  maxFieldValue: number
  basisX?: Float32Array
  basisY?: Float32Array
  basisZ?: Float32Array
  boundingRadius?: number
  colorAlgorithm?: number
  /**
   * Current simulation conformal time `η`. Required — the compute pass
   * tracks `simEta` regardless of whether cosmology is enabled (it stays
   * at zero when disabled), so callers always have a value to pass. The
   * uniform writer forwards it to `computeMEffSq`, which short-circuits
   * to `mass²` when cosmology is off.
   */
  simEta: number
  /**
   * Minkowski-path preheating clock counter. Forwarded alongside
   * `preheatingReferenceEta` so the full uniform upload can stage the
   * *live* drive phase into the `massSquaredScale` slot instead of the
   * pessimistic `1.0` identity. Without this, a paused-and-resumed or
   * loaded-from-save preheating run would have its initial half-step
   * kickstart (and any non-playing frame that re-uploads the uniform
   * buffer) see the unperturbed mass term — desynchronising the
   * Mathieu drive from the saved field buffers on frame 1. Ignored when
   * preheating is disabled; in cosmology-active configs it is unused
   * because the drive clock is `simEta` (which this function already
   * receives).
   */
  preheatingTime: number
  /**
   * Reference `η` captured at the most recent reset, used as the phase
   * anchor for `sin(Ω·(clock − ref))`. Must match what the compute pass
   * last recorded — the uniforms writer does not recompute it.
   */
  preheatingReferenceEta: number
}

/**
 * Write the uniform buffer with current config values.
 * Layout matches the N-D FreeScalarUniforms struct (512 bytes).
 *
 * Writes into the provided pre-allocated typed array views, then uploads
 * the backing ArrayBuffer to the GPU uniform buffer.
 *
 * @param device - GPU device
 * @param uniformBuffer - GPU uniform buffer
 * @param uniformData - Pre-allocated ArrayBuffer (512 bytes)
 * @param params - Uniform parameters
 * @returns The computed maxFieldValue for this frame
 */
export function writeFsfUniforms(
  device: GPUDevice,
  uniformBuffer: GPUBuffer,
  uniformData: ArrayBuffer,
  params: FsfUniformParams
): number {
  const { config, totalSites, basisX, basisY, basisZ, boundingRadius, colorAlgorithm } = params

  // PERF: Reuse cached typed array views instead of creating 3 new views per frame.
  // TypedArray constructors are cheap (~100ns) but the GC pressure from ~180 views/sec
  // at 60 FPS is measurable in CPU flame graphs. The views are backed by the same
  // ArrayBuffer so they share the same memory — caching is safe.
  const u32 = _getCachedU32(uniformData)
  const f32 = _getCachedF32(uniformData)
  const i32 = _getCachedI32(uniformData)

  // Zero out the entire buffer first (ensures unused array slots are 0)
  u32.fill(0)

  const strides = computeStridesPadded(config.gridSize, config.latticeDim)

  // Scalars (offset 0-15, 4 u32s)
  u32[0] = config.latticeDim // offset 0
  u32[1] = totalSites // offset 4
  f32[2] = config.mass // offset 8
  f32[3] = config.dt // offset 12

  // gridSize: array<u32, 12> (offset 16, indices 4-15)
  for (let d = 0; d < config.latticeDim; d++) {
    u32[4 + d] = config.gridSize[d]!
  }

  // strides: array<u32, 12> (offset 64, indices 16-27)
  for (let d = 0; d < config.latticeDim; d++) {
    u32[16 + d] = strides[d]!
  }

  // spacing: array<f32, 12> (offset 112, indices 28-39)
  for (let d = 0; d < config.latticeDim; d++) {
    f32[28 + d] = config.spacing[d]!
  }

  // Init/display scalars (offset 160-191, indices 40-47)
  u32[40] = INIT_CONDITION_MAP[config.initialCondition] ?? 2 // offset 160
  u32[41] = FIELD_VIEW_MAP[config.fieldView] ?? 0 // offset 164
  u32[42] = config.stepsPerFrame // offset 168
  f32[43] = config.packetWidth // offset 172
  f32[44] = config.packetAmplitude // offset 176
  const maxField = params.maxFieldValue
  f32[45] = maxField // offset 180
  f32[46] = boundingRadius ?? 2.0 // offset 184
  // analysisMode at index 47 (offset 188): 0=off, 1=hamiltonian/character, 2=flux, 3=kSpace
  // Derived from the numeric color algorithm: 12/13 -> mode 1, 14 -> mode 2, 15 -> mode 3
  const alg = colorAlgorithm ?? 0
  u32[47] = alg === 12 || alg === 13 ? 1 : alg === 14 ? 2 : alg === 15 ? 3 : 0

  // packetCenter: array<f32, 12> (offset 192, indices 48-59)
  for (let d = 0; d < config.latticeDim; d++) {
    f32[48 + d] = config.packetCenter[d] ?? 0
  }

  // modeK: array<i32, 12> (offset 240, indices 60-71)
  for (let d = 0; d < config.latticeDim; d++) {
    i32[60 + d] = config.modeK[d] ?? 0
  }

  // slicePositions: array<f32, 12> (offset 288, indices 72-83)
  // Store slicePositions[i] maps to extra dims i=0,1,... (dim 3,4,...).
  // WGSL reads slicePositions[d] where d is the full dimension index (d >= 3),
  // so write at index 72 + 3 + i to align with WGSL array indexing.
  // Clamped to MAX_SLICE_POSITIONS_WRITE_COUNT so an oversized store array
  // cannot overflow past the slicePositions region into basisX at f32[84+].
  const fsfSliceN = Math.min(config.slicePositions.length, MAX_SLICE_POSITIONS_WRITE_COUNT)
  for (let i = 0; i < fsfSliceN; i++) {
    f32[72 + 3 + i] = config.slicePositions[i]!
  }

  // basisX: array<f32, 12> (offset 336, indices 84-95)
  if (basisX) {
    for (let d = 0; d < Math.min(basisX.length, MAX_DIM); d++) {
      f32[84 + d] = basisX[d]!
    }
  } else {
    // Default identity: basisX = [1,0,0,...], basisY = [0,1,0,...], basisZ = [0,0,1,...]
    f32[84] = 1.0
  }

  // basisY: array<f32, 12> (offset 384, indices 96-107)
  if (basisY) {
    for (let d = 0; d < Math.min(basisY.length, MAX_DIM); d++) {
      f32[96 + d] = basisY[d]!
    }
  } else {
    f32[97] = 1.0
  }

  // basisZ: array<f32, 12> (offset 432, indices 108-119)
  if (basisZ) {
    for (let d = 0; d < Math.min(basisZ.length, MAX_DIM); d++) {
      f32[108 + d] = basisZ[d]!
    }
  } else {
    f32[110] = 1.0
  }

  // Self-interaction params (offset 480, indices 120-123)
  u32[120] = config.selfInteractionEnabled ? 1 : 0 // offset 480
  f32[121] = config.selfInteractionLambda // offset 484
  f32[122] = config.selfInteractionVev // offset 488
  // absorberEnabled mode: 0 = off, 1 = damp toward φ=0, 2 = damp toward
  // φ = sign(x₀−center)·vev (kink-aware). The kink-aware branch preserves
  // the domain-wall asymptotes at the PML boundary instead of dragging
  // them toward 0 — a bug in the pre-fix code that slowly dissolved the
  // kink. Route to it when the initial condition is `kinkProfile` AND
  // self-interaction is on (so `selfInteractionVev` holds the physical
  // vacuum value); every other config keeps the ordinary damp-toward-0
  // path, bit-identical to the pre-fix behaviour.
  const useKinkAwarePml =
    config.absorberEnabled &&
    config.initialCondition === 'kinkProfile' &&
    config.selfInteractionEnabled
  u32[123] = config.absorberEnabled ? (useKinkAwarePml ? 2 : 1) : 0 // offset 492

  // PML absorber parameters (offset 496-511, indices 124-127)
  f32[124] = config.absorberWidth ?? 0.2 // offset 496
  f32[125] = config.absorberEnabled // offset 500 (sigma_max)
    ? computePMLSigmaMaxND(
        config.pmlTargetReflection ?? 1e-6,
        config.absorberWidth ?? 0.2,
        config.gridSize,
        config.dt,
        PML_GRADING_EXPONENT,
        config.latticeDim
      )
    : 0

  // Cosmology coefficients at the current conformal time. Under Minkowski
  // or cosmology-disabled configs these collapse to (1, 1, 1), so the
  // shader's canonical-variable leapfrog degenerates to flat-space
  // Klein-Gordon bit-identically. The offsets match the per-substep
  // partial write in `FreeScalarFieldComputePass.writeCosmologyCoefsSlot`.
  const coefs = computeFsfCosmologyCoefs(config, params.simEta)
  f32[FSF_COSMO_COEFS_F32_INDEX] = coefs.aKinetic // offset 504
  f32[FSF_COSMO_COEFS_F32_INDEX + 1] = coefs.aPotential // offset 508
  f32[FSF_COSMO_COEFS_F32_INDEX + 2] = coefs.aFull // offset 512
  // massSquaredScale — evaluate the *live* drive phase so a paused run,
  // a load-from-save, or the initial half-step kickstart all see the
  // correct `1 + A·sin(Ω·(clock − ref))` rather than the identity. The
  // clock is `simEta` under cosmology and `preheatingTime` under
  // Minkowski; computeMassSquaredScale returns `1` when the drive is
  // disabled, so the shader's `massCoef = m² · aFull · massSquaredScale`
  // factorization reduces to the bare KG term bit-identically on the
  // no-preheating path. The per-substep upload in the leapfrog loop
  // continues to refresh this slot while playing.
  const preheatingClock = config.cosmology.enabled ? params.simEta : params.preheatingTime
  const liveMassSquaredScale = computeMassSquaredScale(
    preheatingClock,
    config.preheating,
    params.preheatingReferenceEta
  )
  f32[FSF_COSMO_COEFS_F32_INDEX + 3] = liveMassSquaredScale // offset 516 (massSquaredScale)
  // Bianchi-I per-axis kinetic ratios. Default to 1 for every isotropic
  // preset — the pi-update shader's correction terms
  // `(ratio − 1) · axialLap` evaluate to exactly 0 so the output reduces
  // bit-identically to the pre-Bianchi single-coef form.
  f32[FSF_COSMO_COEFS_F32_INDEX + 4] = coefs.aPotentialRatio1 ?? 1 // offset 520
  f32[FSF_COSMO_COEFS_F32_INDEX + 5] = coefs.aPotentialRatio2 ?? 1 // offset 524

  device.queue.writeBuffer(uniformBuffer, 0, uniformData)

  return maxField
}

/**
 * Choice of dispersion + rescale for the vacuum auto-scale estimators.
 *
 * Under the canonical δφ formulation the adiabatic vacuum at `η₀` is drawn
 * from a Minkowski-style sampler with the injected dispersion
 * `ω_k² = k_lat² + m²·a²(η₀)`, then rescaled by `B = a^(n−2)` so the
 * sample has canonical variances `⟨|δφ_k|²⟩ = 1/(2 B ω_k)`,
 * `⟨|π_δφ,k|²⟩ = B ω_k / 2`. The auto-scale estimators need to know both
 * pieces: the numeric `massSq` to forward to the raw sampler, and the
 * `aPotential = B` to apply the per-amplitude rescale on top.
 *
 * Minkowski and the cosmology-disabled path collapse to
 * `{ dispersion: 'kgFloor', aPotential: 1 }`, recovering the bare
 * Klein-Gordon auto-scale bit-identically (for `mass > M_FLOOR`).
 */
interface VacuumAutoScale {
  /**
   * Dispersion for the auto-scale estimators. Three branches mirror the
   * actual sampler's dispatch in `sampleAdiabaticVacuum`:
   *
   * - `'kgFloor'` — Minkowski / cosmology-disabled. Klein-Gordon
   *   `ω² = k_lat² + max(m, M_FLOOR)²`.
   * - `number` — isotropic FLRW. Scalar `m²·a²(η₀)` forwarded to the
   *   Mukhanov-Sasaki branch via `ω² = k_lat² + m²·a²(η₀)`.
   * - `AnisotropicVacuumDispersion` — genuinely anisotropic Bianchi-I
   *   (any `aPotentialRatio_i ≠ 1`). Carries per-axis `axisPotentials`
   *   plus `kineticScale = aKinetic` so the brightness estimator
   *   integrates the same axis-weighted ω the actual sampler uses.
   *   Without this branch the visualizer mis-normalizes initial vacuum
   *   brightness on Kasner presets — see #62 review.
   */
  dispersion: VacuumDispersion
  aPotential: number
  aFull: number
}

function resolveVacuumAutoScale(config: FreeScalarConfig): VacuumAutoScale {
  const cosmo = config.cosmology
  if (!cosmo.enabled || cosmo.preset === 'minkowski') {
    return { dispersion: 'kgFloor', aPotential: 1, aFull: 1 }
  }
  const coefs = computeFsfCosmologyCoefs(config, cosmo.eta0)
  // Guard against the identity-fallback path where coefs may carry the
  // Minkowski sentinels — treat those as "no rescale" and let the call
  // sites operate in the flat-space branch.
  const aPotential = coefs.aPotential > 0 ? coefs.aPotential : 1
  const aFull = coefs.aFull > 0 ? coefs.aFull : 1
  const ratio1 = coefs.aPotentialRatio1 ?? 1
  const ratio2 = coefs.aPotentialRatio2 ?? 1
  const anisotropic = ratio1 !== 1 || ratio2 !== 1
  if (anisotropic && Number.isFinite(coefs.aKinetic) && coefs.aKinetic > 0) {
    // Mirror `sampleAdiabaticVacuum`: axisPotentials_d = aPotential · ratio_d
    // (Bianchi-I touches only the three spatial axes; extra dims keep the
    // axis-0 weight). massSqEff = m²·aFull. kineticScale = aKinetic.
    const massSqEff = config.mass * config.mass * aFull
    if (Number.isFinite(massSqEff)) {
      const axisPotentials = new Array<number>(config.latticeDim).fill(aPotential)
      if (config.latticeDim > 1) axisPotentials[1] = aPotential * ratio1
      if (config.latticeDim > 2) axisPotentials[2] = aPotential * ratio2
      return {
        dispersion: { massSq: massSqEff, axisPotentials, kineticScale: coefs.aKinetic },
        aPotential,
        aFull,
      }
    }
  }
  const aSq = aFull / aPotential // a^n / a^(n−2) = a²
  return {
    dispersion: config.mass * config.mass * aSq,
    aPotential,
    aFull,
  }
}

/**
 * Compute the maxPhiEstimate for the given config.
 * Returns the estimated peak amplitude of the phi field based on the
 * initial condition type and autoScale setting.
 *
 * Under cosmology the vacuum branch draws from `ω_k² = k_lat² + m²·a²(η₀)`
 * and then rescales by `B = a^(n−2)` so the δφ field has variance
 * `1/(2 B ω_k)` per mode. We apply the raw Minkowski estimator with the
 * injected `massSq` and divide by `√B` to get the canonical δφ amplitude
 * estimate. Using bare `mass²` would under- or over-estimate the on-screen
 * density floor whenever `a(η₀) ≠ 1`.
 *
 * **Vacuum + autoScale=false**: the vacuum-noise initial condition has no
 * user-set "amplitude" to fall back on (`packetAmplitude`, VEV, etc. are
 * irrelevant). Returning `1.0` under `!autoScale` leaves the shader
 * saturated on any lattice whose typical vacuum amplitude exceeds 1 —
 * the observed "over-bright initial frame" on the Bianchi-Kasner Cigar
 * preset. The autoScale=false branch for vacuumNoise therefore reuses
 * the exact same physics-based estimator as the autoScale=true branch,
 * giving a static (config-deterministic, never rescaling per frame)
 * baseline that calibrates the brightness at η=η₀ once. Subsequent η
 * evolution pushes normRho above/below 1, preserving the "fixed gain,
 * brightness-is-physics" intent of presets like `bianchiKasnerCigar`.
 *
 * Other non-vacuum initial conditions keep the `=1` fallback because
 * `packetAmplitude`/VEV supply the scale.
 *
 * @param config - Free scalar field configuration
 * @returns Estimated peak phi amplitude
 */
export function computeFsfMaxPhiEstimate(config: FreeScalarConfig): number {
  if (config.initialCondition === 'vacuumNoise') {
    const { dispersion, aPotential } = resolveVacuumAutoScale(config)
    const rawMaxPhi = estimateVacuumMaxPhi(config, dispersion)
    return rawMaxPhi / Math.sqrt(aPotential)
  }
  if (!config.autoScale) return 1.0
  if (config.initialCondition === 'kinkProfile') return config.selfInteractionVev
  return config.packetAmplitude
}

/**
 * Estimate maxFieldValue for auto-scale normalization, accounting for
 * initial condition type and current field view.
 *
 * Under cosmology the vacuum branch forwards `m²·a²(η₀)` to the Minkowski
 * estimator and then applies the `B = a^(n−2)` rescale so the estimate
 * lines up with the canonical δφ variance. The non-vacuum branches use
 * the physical dispersion `ω² = k_lat² + m²·a²(η₀)` and apply the same
 * `aPotential` weight to the `π_δφ = aPotential·δφ·ω` initial kick.
 *
 * For the `energyDensity` view the shader renders the *proper* energy
 * density `ρ = T_{μν} u^μ u^ν = H_canonical / a^n` (a comoving observer's
 * local measurement), not the raw canonical Hamiltonian density. The
 * estimator mirrors that convention by dividing the canonical estimate
 * by `aFull(η₀)` — under Minkowski `aFull = 1` and this is a bit-identical
 * no-op; under cosmology it rescales the calibration to match the
 * shader's proper-density output so `normRho ≈ 1` at the initial time.
 *
 * @param config - Free scalar field configuration
 * @param maxPhiEstimate - Current estimate of maximum phi amplitude
 * @returns Estimated maximum field value for normalization
 */
export function estimateFsfMaxFieldValue(config: FreeScalarConfig, maxPhiEstimate: number): number {
  // Vacuum noise has no user-set amplitude to fall back on, so we compute
  // the physics-based estimator even under autoScale=false. The result is
  // deterministic in the config (no runtime chasing), providing a static
  // calibration anchor at η=η₀. Matches `computeFsfMaxPhiEstimate`, which
  // mirrors the same logic so `maxPhiEstimate` has consistent semantics
  // whether autoScale is on or off. See that function's docstring for the
  // "bianchiKasnerCigar over-bright" regression that motivated this.
  if (!config.autoScale && config.initialCondition !== 'vacuumNoise') return 1.0

  const phi0 = maxPhiEstimate

  if (config.fieldView === 'phi') {
    return phi0
  }

  const { dispersion, aPotential, aFull } = resolveVacuumAutoScale(config)

  // wallDensity: V(phi) = lambda * (phi^2 - v^2)^2, max at phi=0 -> lambda * v^4.
  // The shader renders the bare potential `V(φ)` (no aFull weight — it
  // implicitly lives in the proper frame), so the estimator returns the
  // bare `λ·v⁴` without the `aFull` multiplication that an earlier
  // revision wrongly applied.
  if (config.fieldView === 'wallDensity') {
    if (config.selfInteractionEnabled) {
      const v = config.selfInteractionVev
      return config.selfInteractionLambda * v * v * v * v
    }
    return 1.0
  }

  // `aFull` guard used by every energyDensity branch below. Under Minkowski
  // or the identity fallback `aFull = 1`, so the division is a no-op and
  // every existing non-cosmology test continues to land at the bit-identical
  // canonical formula.
  const properEnergyScale = aFull > 0 ? aFull : 1

  // For vacuum noise, use exact k-space sums instead of the conservative omega_max
  // bound. The exact sums give tight 3-sigma bounds.
  if (config.initialCondition === 'vacuumNoise') {
    if (config.fieldView === 'pi') {
      // π_δφ variance = B · ω_k/2; π_M variance = ω_k/2; rescale by √B.
      const rawMaxPi = estimateVacuumMaxPi(config, dispersion)
      return rawMaxPi * Math.sqrt(aPotential)
    }
    // energyDensity (proper, per comoving observer): the spatial mean of the
    // canonical Hamiltonian density is `⟨E⟩ = meanOmega/2`. We normalize to
    // `2·⟨E⟩ = meanOmega` (returned by `estimateVacuumEnergyVisualScale`) so the
    // typical voxel lands near `normRho ≈ 0.5` — unlike an extreme-peak
    // divisor, which would leave almost the entire cube at ~5% brightness
    // because the one-sided chi-squared-like ε distribution has peaks
    // ~13× its spatial mean. Divide by `aFull(η₀)` to convert to proper
    // density, matching the shader's output.
    let canonicalEnergy = estimateVacuumEnergyVisualScale(config, dispersion)
    if (config.selfInteractionEnabled) {
      const v = config.selfInteractionVev
      canonicalEnergy += aFull * config.selfInteractionLambda * v * v * v * v
    }
    return canonicalEnergy / properEnergyScale
  }

  // Non-vacuum modes (singleMode, gaussianPacket, kinkProfile):
  // physical dispersion ω² = k_lat² + m²·a². Anisotropic Bianchi-I
  // metadata is stripped here: per-mode ω for these initial conditions
  // is computed downstream via `config.modeK` / `packetCenter`, so the
  // axis-weighting isn't plumbed through this scalar estimator.
  let scalarMassSq: number
  if (dispersion === 'kgFloor') {
    scalarMassSq = config.mass * config.mass
  } else if (typeof dispersion === 'number') {
    scalarMassSq = dispersion
  } else {
    // Anisotropic record — collapse to the carried scalar massSq for
    // the non-vacuum estimator's flat-mass term.
    scalarMassSq = dispersion.massSq
  }
  let omegaSq = scalarMassSq
  for (let d = 0; d < config.latticeDim; d++) {
    const N = config.gridSize[d]!
    const a = config.spacing[d]!
    if (N <= 1 || a <= 0) continue
    const latticeL = N * a
    const kPhys = (2 * Math.PI * (config.modeK[d] ?? 0)) / latticeL
    const sk = (2 * Math.sin(kPhys * a * 0.5)) / a
    omegaSq += sk * sk
  }
  const omega = Math.sqrt(Math.max(omegaSq, 0))

  if (config.fieldView === 'pi') {
    // π_δφ = aPotential · δφ · ω for the singleMode/gaussianPacket init
    // kick (matches the shader). Without cosmology aPotential = 1.
    return phi0 * omega * aPotential
  }

  // energyDensity (proper, per comoving observer): for a plane-wave / packet
  // with peak amplitude φ₀ and frequency ω, the canonical Hamiltonian density
  // time-averages to ½·aPotential·φ₀²·ω² — π = aPotential·φ₀·ω·sin(k·x) makes
  // the kinetic term scale with aPotential rather than 1, and (using
  // aKinetic·aPotential² = aPotential) the kinetic / gradient / mass pieces
  // collapse into a single aPotential·ω² prefactor. Without the aPotential
  // factor the estimator overshoots by ≈ 1/aPotential under cosmology (e.g.
  // ~128× for de Sitter at η=-8, H=2, n=4), driving normRho near zero and
  // making the field render as black. Divide by `aFull(η₀)` to land in the
  // proper frame — no-op under Minkowski (aPotential = aFull = 1), correctly
  // rescales under cosmology. Self-interaction carries the `aFull` weight
  // from the action term before the same uniform division, which collapses
  // it to the bare potential.
  let canonicalEnergy = aPotential * phi0 * phi0 * omegaSq * 0.5
  if (config.selfInteractionEnabled) {
    const v = config.selfInteractionVev
    canonicalEnergy += aFull * config.selfInteractionLambda * v * v * v * v
  }
  return canonicalEnergy / properEnergyScale
}

// ───────────────────────────────────────────────────────────────────────────
// CPU-side diagnostics computation
// ───────────────────────────────────────────────────────────────────────────

/**
 * Coefficient bundle used by the CPU diagnostics Hamiltonian. Extends the
 * cosmology triple `(aKinetic, aPotential, aFull)` with the preheating drive
 * scalar `massSquaredScale = 1 + A·sin(Ω·(t−ref))` so the reported total
 * energy matches the time-dependent Hamiltonian the GPU pi-update is
 * actually integrating. Under cosmology-off and preheating-off all four
 * fields are `1` and the expression collapses to the bare Klein-Gordon
 * Hamiltonian bit-identically.
 */
export interface FsfHamiltonianCoefs extends CosmologyCoefs {
  /** Preheating drive scalar `1 + A·sin(Ω·(t−ref))`; `1` when disabled. */
  massSquaredScale: number
}

/**
 * Identity Hamiltonian coefficients `(1, 1, 1, 1)` returned under Minkowski
 * + preheating disabled. Distinct from {@link FSF_IDENTITY_COSMO_COEFS}
 * (the 3-field cosmology-only identity) so tests and diagnostics call sites
 * pick the right shape without ad-hoc spreads. Using a shared constant
 * keeps reference equality stable across the hot-path callers so downstream
 * memos cache correctly.
 */
export const FSF_IDENTITY_HAMILTONIAN_COEFS: FsfHamiltonianCoefs = {
  aKinetic: 1,
  aPotential: 1,
  aFull: 1,
  massSquaredScale: 1,
}

/**
 * Compute field statistics from mapped readback data.
 *
 * Pure CPU function operating on Float32Array views from mapped staging
 * buffers. The caller is responsible for mapping/unmapping.
 *
 * **Total energy** is the canonical Hamiltonian in the δφ variables with
 * the time-dependent preheating drive applied to the mass term:
 *
 *     H = ∫ d^d x [½ aKinetic π² + ½ aPotential (∇δφ)²
 *                  + ½ mass²·aFull·massSquaredScale δφ² + aFull V(δφ)]
 *
 * Under the Minkowski preset (cosmology disabled) and with preheating off
 * the four coefs collapse to 1 and this recovers the bare Klein-Gordon
 * energy. Under non-Minkowski cosmology the energy is NOT conserved —
 * the time-dependent background does work on the field — so the
 * `energyDrift` field loses its Minkowski interpretation, but each
 * individual snapshot still reports the physically meaningful instantaneous
 * total. The `massSquaredScale` factor must match what the GPU
 * `freeScalarUpdatePi` shader used at the readback time; otherwise the
 * diagnostics Hamiltonian is computed with a different effective mass
 * than the integrator is evolving with.
 *
 * @param phi - Mapped phi field data
 * @param pi - Mapped pi (canonical conjugate momentum) field data
 * @param config - Free scalar field configuration
 * @param coefs - Cosmology + preheating coefficients at the readback time.
 *                Caller obtains the cosmology triple from
 *                `computeFsfCosmologyCoefs(config, simEta)` and the
 *                `massSquaredScale` from `computeMassSquaredScale` at the
 *                same clock value the pi-update last saw. Under Minkowski
 *                with preheating off all four fields collapse to `1`.
 * @returns Diagnostics snapshot for the store
 */
export function computeFsfDiagnostics(
  phi: Float32Array,
  pi: Float32Array,
  config: FreeScalarConfig,
  coefs: FsfHamiltonianCoefs
): FsfDiagnosticsSnapshot {
  const N = phi.length

  // Compute cell volume (product of spacings)
  let dV = 1
  for (let d = 0; d < config.latticeDim; d++) dV *= config.spacing[d]!

  // Single pass: accumulate all statistics
  let sumPhi = 0,
    sumPhi2 = 0,
    sumPi2 = 0,
    maxPhi = 0,
    maxPi = 0

  for (let i = 0; i < N; i++) {
    const p = phi[i]!
    const q = pi[i]!
    sumPhi += p
    sumPhi2 += p * p
    sumPi2 += q * q
    const ap = Math.abs(p)
    const aq = Math.abs(q)
    if (ap > maxPhi) maxPhi = ap
    if (aq > maxPi) maxPi = aq
  }

  // Gradient energy: sum_d (phi[i+1] - phi[i])^2 / (2 * a_d^2) * aPot_d * dV
  // All dimensions contribute to total energy (including slice dims d>=3).
  // For Bianchi-I Kasner the GPU integrator weights axes 1 and 2 by
  // aPotentialRatio1/2; replicate that here so the CPU diagnostics
  // Hamiltonian matches the GPU's anisotropic gradient term.
  let gradEnergy = 0
  const strides = computeStridesPadded(config.gridSize, config.latticeDim)
  for (let d = 0; d < config.latticeDim; d++) {
    const axisPotential =
      d === 1
        ? coefs.aPotential * (coefs.aPotentialRatio1 ?? 1)
        : d === 2
          ? coefs.aPotential * (coefs.aPotentialRatio2 ?? 1)
          : coefs.aPotential
    const stride = strides[d]!
    const Nd = config.gridSize[d]!
    const a = config.spacing[d]!
    const invA2 = 1 / (a * a)
    for (let i = 0; i < N; i++) {
      const iNext = i + stride
      const dimPos = Math.floor((i / stride) % Nd)
      // With PML, boundaries are absorbing -- don't wrap gradients across faces
      const jNext =
        dimPos === Nd - 1 ? (config.absorberEnabled ? -1 : i - stride * (Nd - 1)) : iNext
      if (jNext >= 0 && jNext < N) {
        const diff = phi[jNext]! - phi[i]!
        gradEnergy += diff * diff * invA2 * axisPotential
      }
    }
  }
  gradEnergy *= 0.5 * dV

  const totalNorm = sumPhi2 * dV
  const kineticEnergy = 0.5 * coefs.aKinetic * sumPi2 * dV
  // Canonical mass-term energy:
  //   ½ · m² · a^n · massSquaredScale(η) · Σφ² · dV
  // The `massSquaredScale` factor mirrors the GPU pi-update's
  // `massCoef = m²·aFull·massSquaredScale`, so the diagnostics
  // Hamiltonian is evaluated with the same time-dependent effective
  // mass the integrator is using. Under Minkowski coefs.aFull = 1 and
  // with preheating disabled coefs.massSquaredScale = 1, so this
  // reduces to ½ · m² · Σφ² · dV — bit-identical to the pre-cosmology,
  // pre-preheating pipeline.
  const massEnergy =
    0.5 * config.mass * config.mass * coefs.aFull * coefs.massSquaredScale * sumPhi2 * dV
  let potentialEnergy = 0
  if (config.selfInteractionEnabled) {
    const lambda = config.selfInteractionLambda
    const v2 = config.selfInteractionVev * config.selfInteractionVev
    for (let i = 0; i < N; i++) {
      const p = phi[i]!
      const diff = p * p - v2
      potentialEnergy += lambda * diff * diff
    }
    // V(δφ) contribution to the Hamiltonian action carries the full
    // volume form a^n = coefs.aFull.
    potentialEnergy *= dV * coefs.aFull
  }

  const totalEnergy = kineticEnergy + gradEnergy + massEnergy + potentialEnergy
  const meanPhi = sumPhi / N
  // The two-sum variance formula sumPhi²/N − ⟨φ⟩² is numerically unstable
  // for nearly-uniform fields (e.g. early frames of a kink profile or any
  // ground-state-like configuration where φ is close to a constant). Float
  // cancellation between the two large nearly-equal terms produces a small
  // negative result, which then renders in the FSF analysis panel as
  // "Var(φ) = -0.000003" — visually broken for a quantity that is
  // mathematically non-negative. Clamp at zero so displayed and exported
  // diagnostics stay physically meaningful.
  const variancePhi = Math.max(0, sumPhi2 / N - meanPhi * meanPhi)

  return {
    totalEnergy,
    totalNorm,
    maxPhi,
    maxPi,
    energyDrift: 0, // computed by store
    meanPhi,
    variancePhi,
  }
}
