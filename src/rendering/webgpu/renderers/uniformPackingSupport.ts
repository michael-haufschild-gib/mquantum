/**
 * Uniform packing for camera, material, quality, and basis buffers.
 *
 * Separated from the Schrödinger-specific packing to keep each module
 * under the 600-line limit. These functions are pure — no GPU resources,
 * no store access.
 *
 * @module rendering/webgpu/renderers/uniformPackingSupport
 */

import type { AntiDeSitterConfig } from '@/lib/geometry/extended/antiDeSitter'
import type { QuantumPreset } from '@/lib/geometry/extended/schroedinger/presets'
import { logger } from '@/lib/logger'
import { hermite } from '@/lib/math/hermitePolynomial'
import { factorial } from '@/lib/math/specialFunctions'
import {
  adsEnergy as computeAdsEnergy,
  resolveDelta as resolveAdsDelta,
  tachyonGrowthRate as computeAdsGrowthRate,
} from '@/lib/physics/antiDeSitter/math'
import type { AppearanceStoreState } from '@/stores/scene/appearanceStore'
import type { PBRSliceState } from '@/stores/slices/visual/pbrSlice'

import { MAX_DIM, MAX_TERMS } from '../shaders/schroedinger/uniforms.wgsl'
import { parseHexColorToLinearRgb, type Rgb } from '../utils/color'
import { sanitizePixelExtent } from '../utils/sceneMath'
import { zeroReservedFields } from '../utils/structLayout'
import { CAMERA_UNIFORMS_LAYOUT } from './cameraLayout'
import { MATERIAL_UNIFORMS_LAYOUT } from './materialLayout'
import { QUALITY_UNIFORMS_LAYOUT } from './qualityLayout'
import type { CameraSnapshot, TransformSnapshot } from './schrodingerRendererTypes'
import { SCHROEDINGER_LAYOUT } from './schroedingerLayout'

const I = SCHROEDINGER_LAYOUT.index
const CL = CAMERA_UNIFORMS_LAYOUT.index
const ML = MATERIAL_UNIFORMS_LAYOUT.index
const QL = QUALITY_UNIFORMS_LAYOUT.index
const DEFAULT_COMPENSATION_DIMENSION = 3
const DEFAULT_COMPENSATION_BOUNDING_RADIUS = 2.0

// ---------------------------------------------------------------------------
// Shared helper
// ---------------------------------------------------------------------------

/** Parse hex color to linear RGB, defaulting to white on failure. */
const parseColor = (hex: string): Rgb => parseHexColorToLinearRgb(hex)

// =========================================================================
// HO momentum transform
// =========================================================================

/**
 * In-place transform of already-packed Schroedinger uniforms for HO momentum space.
 *
 * Physics: HO eigenfunctions are eigenfunctions of the Fourier transform.
 * phi_n(k, omega) = (-i)^n * phi_n(k, 1/omega).
 * This inverts omegas and applies phase rotations to coefficients so the GPU shader
 * runs the normal position-mode path and produces correct momentum-space results.
 *
 * Must be called AFTER packSchroedingerUniforms and BEFORE the buffer write.
 *
 * @param floatView - Float32 view of the Schroedinger uniform buffer
 * @param intView - Int32 view of the same buffer
 * @param dimension - Number of spatial dimensions
 * @param hbar - Reduced Planck constant (1.0 for k-space, user value for p-space)
 */
export function applyHOMomentumTransform(
  floatView: Float32Array,
  intView: Int32Array,
  dimension: number,
  hbar: number
): void {
  // 1. Invert omegas: omega_j -> 1/(hbar^2 * omega_j)
  const hbar2 = hbar * hbar
  for (let j = 0; j < MAX_DIM; j++) {
    const omega = floatView[I.omega + j]!
    floatView[I.omega + j] = 1.0 / (hbar2 * Math.max(omega, 0.01))
  }

  // 2. Rotate coefficients by (-i)^{sum n_j} per term
  const termCount = Math.min(Math.max(intView[I.termCount]!, 1), MAX_TERMS)

  for (let k = 0; k < termCount; k++) {
    let totalN = 0
    for (let j = 0; j < dimension; j++) {
      totalN += intView[I.quantum + k * MAX_DIM + j]!
    }

    const re = floatView[I.coeff + k * 4]!
    const im = floatView[I.coeff + k * 4 + 1]!
    const mod = ((totalN % 4) + 4) % 4
    switch (mod) {
      case 0:
        break // x1
      case 1:
        floatView[I.coeff + k * 4] = im
        floatView[I.coeff + k * 4 + 1] = -re
        break // x(-i)
      case 2:
        floatView[I.coeff + k * 4] = -re
        floatView[I.coeff + k * 4 + 1] = -im
        break // x(-1)
      case 3:
        floatView[I.coeff + k * 4] = -im
        floatView[I.coeff + k * 4 + 1] = re
        break // x(i)
    }
  }

  // 3. Force representationMode = 0 (position) — shader runs normal path
  intView[I.representationMode] = 0
}

// =========================================================================
// Camera uniform buffer
// =========================================================================

/** All values needed to pack the camera uniform buffer (528 bytes). */
export interface CameraPackParams {
  camera: CameraSnapshot
  animationTime: number
  is2D: boolean
  transform?: TransformSnapshot
  bayerOffset: readonly [number, number]
  size: { width: number; height: number }
  frameDelta: number
  frameNumber: number
}

/**
 * Pack camera matrices, model matrix, and per-frame scalars into the camera uniform buffer.
 *
 * Also precomputes `cameraPositionModel = inverseModelMatrix * (cameraPosition, 1)` to
 * eliminate a per-pixel mat4*vec4 of all-uniform operands in the fragment shaders.
 * Re-run whenever camera position OR model matrix changes — this function is called
 * every frame the camera buffer is marked dirty, which already covers both.
 *
 * @param data - Float32Array(132) for the camera uniform buffer (528 bytes)
 * @param dataView - DataView of the same buffer (for uint32 writes)
 * @param p - Camera pack parameters
 */
export function packCameraUniforms(
  data: Float32Array,
  dataView: DataView,
  p: CameraPackParams
): void {
  const { camera, animationTime, is2D, transform, bayerOffset, size, frameDelta, frameNumber } = p

  // Matrices at correct offsets (each mat4x4f = 16 floats)
  if (camera.viewMatrix) data.set(camera.viewMatrix.elements, CL.viewMatrix)
  if (camera.projectionMatrix) data.set(camera.projectionMatrix.elements, CL.projectionMatrix)
  if (camera.viewProjectionMatrix)
    data.set(camera.viewProjectionMatrix.elements, CL.viewProjectionMatrix)
  if (camera.inverseViewMatrix) data.set(camera.inverseViewMatrix.elements, CL.inverseViewMatrix)
  if (camera.inverseProjectionMatrix)
    data.set(camera.inverseProjectionMatrix.elements, CL.inverseProjectionMatrix)

  // Model matrix computation
  let scale: number
  let posX: number
  let posY: number
  let posZ: number

  if (is2D) {
    const camPos = camera.position ?? { x: 0, y: 0, z: 8 }
    const camTarget = camera.target ?? { x: 0, y: 0, z: 0 }
    const dx = camPos.x - (camTarget.x ?? 0)
    const dy = camPos.y - (camTarget.y ?? 0)
    const dz = camPos.z - (camTarget.z ?? 0)
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const defaultDistance = 8.0
    scale = distance > 0 ? distance / defaultDistance : 1.0
    posX = camTarget.x ?? 0
    posY = camTarget.y ?? 0
    posZ = 0
  } else {
    scale = transform?.uniformScale ?? 1.0
    const position = transform?.position ?? [0, 0, 0]
    posX = position[0] ?? 0
    posY = position[1] ?? 0
    posZ = position[2] ?? 0
  }

  // modelMatrix (column-major). Float index = CL.modelMatrix + col*4 + row.
  const mm = CL.modelMatrix
  data[mm + 0] = scale
  data[mm + 1] = 0
  data[mm + 2] = 0
  data[mm + 3] = 0
  data[mm + 4] = 0
  data[mm + 5] = scale
  data[mm + 6] = 0
  data[mm + 7] = 0
  data[mm + 8] = 0
  data[mm + 9] = 0
  data[mm + 10] = scale
  data[mm + 11] = 0
  data[mm + 12] = posX
  data[mm + 13] = posY
  data[mm + 14] = posZ
  data[mm + 15] = 1.0

  // inverseModelMatrix
  const invScale = scale !== 0 ? 1.0 / scale : 1.0
  const im = CL.inverseModelMatrix
  data[im + 0] = invScale
  data[im + 1] = 0
  data[im + 2] = 0
  data[im + 3] = 0
  data[im + 4] = 0
  data[im + 5] = invScale
  data[im + 6] = 0
  data[im + 7] = 0
  data[im + 8] = 0
  data[im + 9] = 0
  data[im + 10] = invScale
  data[im + 11] = 0
  data[im + 12] = -posX * invScale
  data[im + 13] = -posY * invScale
  data[im + 14] = -posZ * invScale
  data[im + 15] = 1.0

  // Camera position. Zero before the conditional so a frame without
  // `camera.position` doesn't leak prior-frame values into the world-space
  // camera position OR the cameraPositionModel derived below (data is
  // reused across frames).
  const cp = CL.cameraPosition
  data[cp + 0] = 0
  data[cp + 1] = 0
  data[cp + 2] = 0
  if (camera.position) {
    data[cp + 0] = camera.position.x
    data[cp + 1] = camera.position.y
    data[cp + 2] = camera.position.z
  }
  data[CL.cameraNear] = camera.near || 0.1
  data[CL.cameraFar] = camera.far || 10000
  data[CL.fov] = ((camera.fov || 50) * Math.PI) / 180 // radians
  const safeWidth = sanitizePixelExtent(size.width)
  const safeHeight = sanitizePixelExtent(size.height)
  const safeAspect = safeWidth / safeHeight
  data[CL.resolution + 0] = safeWidth
  data[CL.resolution + 1] = safeHeight
  data[CL.aspectRatio] = safeAspect

  // DEV diagnostic
  if (import.meta.env.DEV && camera.projectionMatrix?.elements) {
    const projAspect = camera.projectionMatrix.elements[5]! / camera.projectionMatrix.elements[0]!
    if (Math.abs(projAspect - safeAspect) > 0.01) {
      logger.warn(
        `[Schrodinger] ASPECT MISMATCH! projection: ${projAspect.toFixed(4)}, ctx.size: ${safeAspect.toFixed(4)} (${safeWidth}x${safeHeight})`
      )
    }
  }

  data[CL.time] = animationTime
  data[CL.deltaTime] = frameDelta
  dataView.setUint32(CAMERA_UNIFORMS_LAYOUT.byteOffset.frameNumber, frameNumber, true)

  data[CL.bayerOffset + 0] = bayerOffset[0]
  data[CL.bayerOffset + 1] = bayerOffset[1]
  data[CL._padding + 0] = 0
  data[CL._padding + 1] = 0

  // PERF: Precompute `cameraPositionModel = inverseModelMatrix * (cameraPosition, 1)`.
  // Reads inverseModelMatrix and cameraPosition from the slots written above
  // and writes the result to cameraPositionModel (vec3f).
  const cx = data[cp + 0] ?? 0
  const cy = data[cp + 1] ?? 0
  const cz = data[cp + 2] ?? 0
  // Column-major mat4 * vec4(cx, cy, cz, 1):
  //   out.x = M[0]*cx + M[4]*cy + M[8]*cz  + M[12]
  //   out.y = M[1]*cx + M[5]*cy + M[9]*cz  + M[13]
  //   out.z = M[2]*cx + M[6]*cy + M[10]*cz + M[14]
  const cpm = CL.cameraPositionModel
  data[cpm + 0] =
    (data[im + 0] ?? 0) * cx +
    (data[im + 4] ?? 0) * cy +
    (data[im + 8] ?? 0) * cz +
    (data[im + 12] ?? 0)
  data[cpm + 1] =
    (data[im + 1] ?? 0) * cx +
    (data[im + 5] ?? 0) * cy +
    (data[im + 9] ?? 0) * cz +
    (data[im + 13] ?? 0)
  data[cpm + 2] =
    (data[im + 2] ?? 0) * cx +
    (data[im + 6] ?? 0) * cy +
    (data[im + 10] ?? 0) * cz +
    (data[im + 14] ?? 0)
  data[CL._paddingEnd] = 0
}

// =========================================================================
// Material uniform buffer
// =========================================================================

/** All values needed to pack the material uniform buffer (160 bytes). */
export interface MaterialPackParams {
  appearance: AppearanceStoreState | undefined
  pbr: PBRSliceState | undefined
}

/**
 * Pack PBR material parameters into the material uniform buffer.
 *
 * @param data - Float32Array(40) for the material uniform buffer
 * @param dataView - DataView of the same buffer (for uint32 writes)
 * @param p - Material pack parameters
 */
export function packMaterialUniforms(
  data: Float32Array,
  dataView: DataView,
  p: MaterialPackParams
): void {
  const { appearance, pbr } = p

  // baseColor: vec4f
  const faceColor = parseColor(appearance?.faceColor ?? '#ffffff')
  const bc = ML.baseColor
  data[bc + 0] = faceColor[0]
  data[bc + 1] = faceColor[1]
  data[bc + 2] = faceColor[2]
  data[bc + 3] = 1.0

  // metallic, roughness, reflectance, ao
  data[ML.metallic] = pbr?.face?.metallic ?? 0.0
  data[ML.roughness] = pbr?.face?.roughness ?? 0.5
  data[ML.reflectance] = pbr?.face?.reflectance ?? 0.5
  data[ML.ao] = 1.0

  // emissive + emissiveIntensity
  const faceEmission = appearance?.faceEmission ?? 0.0
  const em = ML.emissive
  data[em + 0] = faceColor[0]
  data[em + 1] = faceColor[1]
  data[em + 2] = faceColor[2]
  data[ML.emissiveIntensity] = faceEmission

  // ior, transmission, thickness
  data[ML.ior] = pbr?.face?.ior ?? 1.5
  data[ML.transmission] = pbr?.face?.transmission ?? 0.0
  data[ML.thickness] = pbr?.face?.thickness ?? 1.0

  // sssEnabled: u32
  const sssEnabled = appearance?.sssEnabled ?? false
  dataView.setUint32(MATERIAL_UNIFORMS_LAYOUT.byteOffset.sssEnabled, sssEnabled ? 1 : 0, true)

  // sssIntensity
  data[ML.sssIntensity] = appearance?.sssIntensity ?? 1.0

  // sssColor: vec3f (vec3f alignment leaves an implicit 12-byte pad gap before)
  const sssColor = parseColor(appearance?.sssColor ?? '#ff8844')
  const sc = ML.sssColor
  data[sc + 0] = sssColor[0]
  data[sc + 1] = sssColor[1]
  data[sc + 2] = sssColor[2]

  // sssThickness, sssJitter
  data[ML.sssThickness] = appearance?.sssThickness ?? 1.0
  data[ML.sssJitter] = appearance?.sssJitter ?? 0.2

  // Reserved Fresnel rim slots (kept for buffer-layout compatibility) and
  // explicit `_padding2` are zeroed declaratively. Zero is safe for both
  // f32 (+0.0) and u32/i32 since the bit pattern is all-zeros.
  zeroReservedFields(data, MATERIAL_UNIFORMS_LAYOUT)

  // specularIntensity
  data[ML.specularIntensity] = pbr?.face?.specularIntensity ?? 0.8

  // specularColor: vec3f (vec3f alignment leaves an implicit 12-byte pad gap before)
  const specularColor = parseColor(pbr?.face?.specularColor ?? '#ffffff')
  const sp = ML.specularColor
  data[sp + 0] = specularColor[0]
  data[sp + 1] = specularColor[1]
  data[sp + 2] = specularColor[2]
}

// =========================================================================
// Quality uniform buffer
// =========================================================================

/**
 * Pack quality/performance parameters into the quality uniform buffer.
 *
 * @param data - Float32Array(12) for the quality uniform buffer
 * @param dataView - DataView of the same buffer (for int32 writes)
 * @param qualityMultiplier - Current quality multiplier (0.0-1.0+)
 */
export function packQualityUniforms(
  data: Float32Array,
  dataView: DataView,
  qualityMultiplier: number
): void {
  // Live fields. Reserved (`_`-prefixed) slots are zeroed below in one pass
  // — keeps the buffer-layout-compat zeros declarative.
  data[QL.sdfSurfaceDistance] = 0.001 / qualityMultiplier
  data[QL.qualityMultiplier] = qualityMultiplier

  dataView.setInt32(
    QUALITY_UNIFORMS_LAYOUT.byteOffset.sdfMaxIterations,
    Math.floor(128 * qualityMultiplier),
    true
  )

  // Bulk-zero every reserved (`_`-prefixed) slot. Zero is safe for both
  // f32 (+0.0) and i32 (0x00000000) — the bit pattern is identical.
  zeroReservedFields(data, QUALITY_UNIFORMS_LAYOUT)
}

// =========================================================================
// Basis vectors uniform buffer
// =========================================================================

/** All values needed to pack the basis vectors uniform buffer (192 bytes). */
export interface BasisPackParams {
  dimension: number
  basisX?: Float32Array
  basisY?: Float32Array
  basisZ?: Float32Array
  origin?: Float32Array
  sliceAnimationEnabled: boolean
  sliceSpeed: number
  sliceAmplitude: number
  accumulatedTime: number
}

/** Golden ratio for incommensurate phase offsets in slice animation. */
const PHI = 1.618033988749895

/**
 * Pack N-dimensional basis vectors and origin into the basis uniform buffer.
 *
 * @param data - Float32Array(48) for the basis uniform buffer
 * @param p - Basis pack parameters
 */
export function packBasisVectors(data: Float32Array, p: BasisPackParams): void {
  const STRIDE = 12

  // Zero-fill for clean slate
  data.fill(0)

  // Default basis vectors (identity for first 3 dims)
  data[0] = 1.0 // X: [1, 0, 0, ...]
  data[STRIDE + 1] = 1.0 // Y: [0, 1, 0, ...]
  data[STRIDE * 2 + 2] = 1.0 // Z: [0, 0, 1, ...]

  // Override with stored basis
  if (p.basisX) {
    for (let i = 0; i < Math.min(p.basisX.length, MAX_DIM); i++) {
      data[i] = p.basisX[i] ?? 0
    }
  }
  if (p.basisY) {
    for (let i = 0; i < Math.min(p.basisY.length, MAX_DIM); i++) {
      data[STRIDE + i] = p.basisY[i] ?? 0
    }
  }
  if (p.basisZ) {
    for (let i = 0; i < Math.min(p.basisZ.length, MAX_DIM); i++) {
      data[STRIDE * 2 + i] = p.basisZ[i] ?? 0
    }
  }

  // Origin (rotated N-D point from store)
  const originOffset = STRIDE * 3
  if (p.origin) {
    for (let i = 0; i < Math.min(p.origin.length, MAX_DIM); i++) {
      data[originOffset + i] = p.origin[i] ?? 0
    }
  }

  // Slice animation: time-varying offset on extra dimensions (4D+)
  if (p.sliceAnimationEnabled && p.dimension > 3) {
    for (let i = 3; i < Math.min(p.dimension, MAX_DIM); i++) {
      const extraDimIndex = i - 3
      const phase = extraDimIndex * PHI
      const t1 = p.accumulatedTime * p.sliceSpeed * 2 * Math.PI + phase
      const t2 = p.accumulatedTime * p.sliceSpeed * 1.3 * 2 * Math.PI + phase * 1.5
      const offset = p.sliceAmplitude * (0.7 * Math.sin(t1) + 0.3 * Math.sin(t2))
      data[originOffset + i] = (data[originOffset + i] ?? 0) + offset
    }
  }
}

// =========================================================================
// Canonical density compensation
// =========================================================================

/**
 * Compute the auto-compensation factor for canonical HO normalization.
 *
 * Evaluates the peak |psi|^2 of the dominant superposition term using
 * physicists' Hermite polynomials, then derives a densityGain multiplier
 * so that the default gain=2.0 produces alpha ~0.7 at peak density.
 *
 * @param preset - The quantum preset with coefficients and quantum numbers
 * @param dimension - Number of spatial dimensions
 * @param boundingRadius - Current bounding radius (for step length estimate)
 * @returns Object with `compensation` factor and `peakDensity` value
 */
export function computeCanonicalCompensation(
  preset: QuantumPreset,
  dimension: number,
  boundingRadius: number
): { compensation: number; peakDensity: number } {
  const termCount =
    Number.isFinite(preset.termCount) && preset.termCount > 0
      ? Math.min(MAX_TERMS, Math.floor(preset.termCount))
      : 0
  if (termCount === 0) return { compensation: 1.0, peakDensity: 0.1 }

  // Find the dominant term (largest |c_k|^2)
  let dominantIdx = 0
  let maxCoeffMag = 0
  for (let k = 0; k < termCount; k++) {
    const coeff = preset.coefficients[k]
    if (!coeff) continue
    const [cRe, cIm] = coeff
    if (!Number.isFinite(cRe) || !Number.isFinite(cIm)) continue
    const mag = cRe * cRe + cIm * cIm
    if (!Number.isFinite(mag)) continue
    if (mag > maxCoeffMag) {
      maxCoeffMag = mag
      dominantIdx = k
    }
  }

  const qn = preset.quantumNumbers[dominantIdx]
  if (!qn) return { compensation: 1.0, peakDensity: 0.1 }
  if (maxCoeffMag <= 0) return { compensation: 1.0, peakDensity: 0.1 }
  const requestedDim =
    Number.isFinite(dimension) && dimension > 0
      ? Math.floor(dimension)
      : Math.min(DEFAULT_COMPENSATION_DIMENSION, qn.length)
  const dim = Math.max(0, Math.min(MAX_DIM, qn.length, requestedDim))

  // Compute peak |psi|^2 = |c_dominant|^2 * prod_i peak_1D(n_i, omega_i)
  let peakDensity = maxCoeffMag
  for (let j = 0; j < dim; j++) {
    const nRaw = qn[j]
    if (nRaw == null) continue
    const n =
      typeof nRaw === 'number' && Number.isFinite(nRaw)
        ? Math.max(0, Math.min(6, Math.round(nRaw)))
        : 0
    const omegaRaw = preset.omega[j]
    const omega =
      typeof omegaRaw === 'number' && Number.isFinite(omegaRaw) ? Math.max(omegaRaw, 0.01) : 1.0

    // Find max of H_n^2(u) * exp(-u^2) numerically over u in [0, 5]
    let maxHermiteSq = 0
    for (let i = 0; i <= 500; i++) {
      const u = (i / 500) * 5.0
      const hn = hermite(n, u)
      const val = hn * hn * Math.exp(-u * u)
      if (val > maxHermiteSq) maxHermiteSq = val
    }

    const twoN_nFact = Math.pow(2, n) * factorial(n)
    const peak1D = (Math.sqrt(omega / Math.PI) / twoN_nFact) * maxHermiteSq
    if (!Number.isFinite(peak1D) || peak1D <= 0) continue
    peakDensity *= peak1D
    if (!Number.isFinite(peakDensity)) return { compensation: 1.0, peakDensity: 0.1 }
  }

  if (!Number.isFinite(peakDensity) || peakDensity <= 0) {
    return { compensation: 1.0, peakDensity: 0.1 }
  }

  const TARGET_ALPHA = 0.7
  const DEFAULT_DENSITY_GAIN = 2.0
  const TYPICAL_SAMPLES = 32
  const safeBoundingRadius =
    Number.isFinite(boundingRadius) && boundingRadius > 0
      ? boundingRadius
      : DEFAULT_COMPENSATION_BOUNDING_RADIUS
  const estimatedStepLen = (2 * safeBoundingRadius) / TYPICAL_SAMPLES
  const neededGain = -Math.log(1 - TARGET_ALPHA) / (peakDensity * estimatedStepLen)

  if (!Number.isFinite(neededGain) || neededGain <= 0) {
    return { compensation: 1.0, peakDensity: 0.1 }
  }

  return {
    compensation: neededGain / DEFAULT_DENSITY_GAIN,
    peakDensity,
  }
}

// =========================================================================
// Anti-de Sitter time-evolution uniforms
// =========================================================================

/**
 * Write the two AdS time-evolution uniforms (`adsEnergy`, `adsGrowthRate`).
 *
 * Stable states (above BF): `adsEnergy = Δ + ℓ + 2n` so the shader rotates
 * phase by `-E·t`. Tachyonic states (below BF): `adsGrowthRate = γ` so the
 * shader amplifies `|ψ|²` by `cosh²(γ·t)`. The slots are mutually exclusive
 * — only one is nonzero at a time. Every non-AdS mode leaves both at 0, so
 * the shader's phase/rho multipliers are no-ops there.
 *
 * @param floatView Float32 view into the SchroedingerUniforms buffer.
 * @param quantumModeStr Active quantum mode key.
 * @param ads Active Anti-de Sitter configuration, or undefined.
 */
export function packAdsTimeEvolution(
  floatView: Float32Array,
  quantumModeStr: string,
  ads: AntiDeSitterConfig | undefined
): void {
  if (quantumModeStr !== 'antiDeSitter' || !ads) {
    floatView[I.adsEnergy] = 0
    floatView[I.adsGrowthRate] = 0
    return
  }
  // Stage 2A: BTZ thermal state is time-translation-invariant (KMS
  // stationarity). Zero both uniforms so the shader neither spins the
  // phase nor amplifies |ψ|² — the packed density IS the observable.
  if (ads.btzEnabled && ads.d === 3) {
    floatView[I.adsEnergy] = 0
    floatView[I.adsGrowthRate] = 0
    return
  }
  // Stage 2B: HKLL non-eigenstate sources (localized spot, planeWave) have no
  // well-defined single-mode energy — the bound-state (n, ℓ) sliders are
  // hidden in these modes, so rotating the phase at that stale rate would be
  // physically meaningless. Eigenstate mode keeps the standard E·t rotation.
  if (ads.hkllEnabled && ads.hkllBoundarySource !== 'eigenstate') {
    floatView[I.adsEnergy] = 0
    floatView[I.adsGrowthRate] = 0
    return
  }
  const growth = computeAdsGrowthRate(ads.d, ads.mL)
  if (growth > 0) {
    floatView[I.adsEnergy] = 0
    floatView[I.adsGrowthRate] = growth
    return
  }
  const E = computeAdsEnergy(ads.n, ads.l, resolveAdsDelta(ads.d, ads.mL, ads.branch).delta)
  floatView[I.adsEnergy] = Number.isFinite(E) ? E : 0
  floatView[I.adsGrowthRate] = 0
}
