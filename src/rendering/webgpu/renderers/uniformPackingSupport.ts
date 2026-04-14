/**
 * Uniform packing for camera, material, quality, and basis buffers.
 *
 * Separated from the Schrödinger-specific packing to keep each module
 * under the 600-line limit. These functions are pure — no GPU resources,
 * no store access.
 *
 * @module rendering/webgpu/renderers/uniformPackingSupport
 */

import type { QuantumPreset } from '@/lib/geometry/extended/schroedinger/presets'
import { logger } from '@/lib/logger'
import { hermite } from '@/lib/math/hermitePolynomial'
import { factorial } from '@/lib/math/specialFunctions'
import type { AppearanceStoreState } from '@/stores/appearanceStore'
import type { PBRSliceState } from '@/stores/slices/visual/pbrSlice'

import { MAX_DIM, MAX_TERMS } from '../shaders/schroedinger/uniforms.wgsl'
import { parseHexColorToLinearRgb, type Rgb } from '../utils/color'
import type { CameraSnapshot, TransformSnapshot } from './schrodingerRendererTypes'
import { SCHROEDINGER_LAYOUT } from './schroedingerLayout'

const I = SCHROEDINGER_LAYOUT.index

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

/** All values needed to pack the camera uniform buffer (512 bytes). */
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
 * @param data - Float32Array(128) for the camera uniform buffer
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
  if (camera.viewMatrix) data.set(camera.viewMatrix.elements, 0)
  if (camera.projectionMatrix) data.set(camera.projectionMatrix.elements, 16)
  if (camera.viewProjectionMatrix) data.set(camera.viewProjectionMatrix.elements, 32)
  if (camera.inverseViewMatrix) data.set(camera.inverseViewMatrix.elements, 48)
  if (camera.inverseProjectionMatrix) data.set(camera.inverseProjectionMatrix.elements, 64)

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

  // modelMatrix (offset 80, column-major)
  data[80] = scale
  data[81] = 0
  data[82] = 0
  data[83] = 0
  data[84] = 0
  data[85] = scale
  data[86] = 0
  data[87] = 0
  data[88] = 0
  data[89] = 0
  data[90] = scale
  data[91] = 0
  data[92] = posX
  data[93] = posY
  data[94] = posZ
  data[95] = 1.0

  // inverseModelMatrix (offset 96)
  const invScale = scale !== 0 ? 1.0 / scale : 1.0
  data[96] = invScale
  data[97] = 0
  data[98] = 0
  data[99] = 0
  data[100] = 0
  data[101] = invScale
  data[102] = 0
  data[103] = 0
  data[104] = 0
  data[105] = 0
  data[106] = invScale
  data[107] = 0
  data[108] = -posX * invScale
  data[109] = -posY * invScale
  data[110] = -posZ * invScale
  data[111] = 1.0

  // Camera position (offset 112)
  if (camera.position) {
    data[112] = camera.position.x
    data[113] = camera.position.y
    data[114] = camera.position.z
  }
  data[115] = camera.near || 0.1
  data[116] = camera.far || 10000
  data[117] = ((camera.fov || 50) * Math.PI) / 180 // radians
  data[118] = size.width
  data[119] = size.height
  data[120] = size.width / size.height

  // DEV diagnostic
  if (import.meta.env.DEV && camera.projectionMatrix?.elements) {
    const projAspect = camera.projectionMatrix.elements[5]! / camera.projectionMatrix.elements[0]!
    const ctxAspect = size.width / size.height
    if (Math.abs(projAspect - ctxAspect) > 0.01) {
      logger.warn(
        `[Schrodinger] ASPECT MISMATCH! projection: ${projAspect.toFixed(4)}, ctx.size: ${ctxAspect.toFixed(4)} (${size.width}x${size.height})`
      )
    }
  }

  data[121] = animationTime
  data[122] = frameDelta
  dataView.setUint32(123 * 4, frameNumber, true)

  data[124] = bayerOffset[0]
  data[125] = bayerOffset[1]
  data[126] = 0
  data[127] = 0
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

  // baseColor: vec4f (idx 0-3)
  const faceColor = parseColor(appearance?.faceColor ?? '#ffffff')
  data[0] = faceColor[0]
  data[1] = faceColor[1]
  data[2] = faceColor[2]
  data[3] = 1.0

  // metallic, roughness, reflectance, ao (idx 4-7)
  data[4] = pbr?.face?.metallic ?? 0.0
  data[5] = pbr?.face?.roughness ?? 0.5
  data[6] = pbr?.face?.reflectance ?? 0.5
  data[7] = 1.0

  // emissive + emissiveIntensity (idx 8-11)
  const faceEmission = appearance?.faceEmission ?? 0.0
  data[8] = faceColor[0]
  data[9] = faceColor[1]
  data[10] = faceColor[2]
  data[11] = faceEmission

  // ior, transmission, thickness (idx 12-14)
  data[12] = pbr?.face?.ior ?? 1.5
  data[13] = pbr?.face?.transmission ?? 0.0
  data[14] = pbr?.face?.thickness ?? 1.0

  // sssEnabled: u32 (idx 15)
  const sssEnabled = appearance?.sssEnabled ?? false
  dataView.setUint32(15 * 4, sssEnabled ? 1 : 0, true)

  // sssIntensity (idx 16)
  data[16] = appearance?.sssIntensity ?? 1.0

  // sssColor: vec3f (idx 20-22, aligned to byte 80)
  const sssColor = parseColor(appearance?.sssColor ?? '#ff8844')
  data[20] = sssColor[0]
  data[21] = sssColor[1]
  data[22] = sssColor[2]

  // sssThickness, sssJitter (idx 23-24)
  data[23] = appearance?.sssThickness ?? 1.0
  data[24] = appearance?.sssJitter ?? 0.2

  // Reserved (Fresnel rim removed, idx 25-31)
  data[25] = 0.0
  data[26] = 0.0
  data[28] = 0.0
  data[29] = 0.0
  data[30] = 0.0
  data[31] = 0.0

  // specularIntensity (idx 32)
  data[32] = pbr?.face?.specularIntensity ?? 0.8

  // specularColor: vec3f (idx 36-38, aligned to byte 144)
  const specularColor = parseColor(pbr?.face?.specularColor ?? '#ffffff')
  data[36] = specularColor[0]
  data[37] = specularColor[1]
  data[38] = specularColor[2]
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
  data[1] = 0.001 / qualityMultiplier
  data[3] = 0
  data[6] = 0
  data[7] = 0
  data[8] = qualityMultiplier

  dataView.setInt32(0 * 4, Math.floor(128 * qualityMultiplier), true)
  dataView.setInt32(2 * 4, 0, true)
  dataView.setInt32(4 * 4, 0, true)
  dataView.setInt32(5 * 4, 0, true)
  dataView.setInt32(9 * 4, 0, true)
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
  if (preset.termCount === 0) return { compensation: 1.0, peakDensity: 0.1 }

  // Find the dominant term (largest |c_k|^2)
  let dominantIdx = 0
  let maxCoeffMag = 0
  for (let k = 0; k < preset.termCount; k++) {
    const coeff = preset.coefficients[k]
    if (!coeff) continue
    const [cRe, cIm] = coeff
    const mag = cRe * cRe + cIm * cIm
    if (mag > maxCoeffMag) {
      maxCoeffMag = mag
      dominantIdx = k
    }
  }

  const qn = preset.quantumNumbers[dominantIdx]
  if (!qn) return { compensation: 1.0, peakDensity: 0.1 }
  const dim = Math.min(dimension, qn.length)

  // Compute peak |psi|^2 = |c_dominant|^2 * prod_i peak_1D(n_i, omega_i)
  let peakDensity = maxCoeffMag
  for (let j = 0; j < dim; j++) {
    const nRaw = qn[j]
    if (nRaw == null) continue
    const n = Math.max(0, Math.min(6, Math.round(nRaw)))
    const omega = Math.max(preset.omega[j] ?? 1.0, 0.01)

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
    peakDensity *= peak1D
  }

  if (peakDensity <= 0) return { compensation: 1.0, peakDensity: 0.1 }

  const TARGET_ALPHA = 0.7
  const DEFAULT_DENSITY_GAIN = 2.0
  const TYPICAL_SAMPLES = 32
  const estimatedStepLen = (2 * boundingRadius) / TYPICAL_SAMPLES
  const neededGain = -Math.log(1 - TARGET_ALPHA) / (peakDensity * estimatedStepLen)

  return {
    compensation: neededGain / DEFAULT_DENSITY_GAIN,
    peakDensity,
  }
}
