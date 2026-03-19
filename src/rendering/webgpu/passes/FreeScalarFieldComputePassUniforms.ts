/**
 * Free Scalar Field Compute Pass — Uniform Writing, Field Estimation & Diagnostics
 *
 * Pure data-writing functions extracted from FreeScalarFieldComputePass.
 * No GPU pipeline or bind group logic — only buffer writes,
 * physics-based field value estimation, and CPU-side diagnostics.
 */

import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { estimateVacuumMaxPhi } from '@/lib/physics/freeScalar/vacuumSpectrum'
import { computePMLSigmaMaxND } from '@/lib/physics/pml/profile'
import type { FsfDiagnosticsSnapshot } from '@/stores/fsfDiagnosticsStore'

import { MAX_DIM } from './computePassUtils'

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
 * @param config - Free scalar field configuration
 */
export function computeFsfInitHash(config: FreeScalarConfig): string {
  const base = `${config.initialCondition}_m${config.mass}_k${config.modeK.join(',')}_c${config.packetCenter.join(',')}_w${config.packetWidth}_a${config.packetAmplitude}_s${config.vacuumSeed}`
  if (config.selfInteractionEnabled) {
    return `${base}_si${config.selfInteractionLambda}_v${config.selfInteractionVev}`
  }
  return base
}

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

/**
 * Compute strides for N-D indexing (C-order / last-dimension-fastest):
 * strides[latticeDim-1] = 1, strides[d] = strides[d+1] * gridSize[d+1]
 *
 * @param config - Free scalar field configuration
 * @returns Array of strides (length MAX_DIM, unused entries = 0)
 */
export function computeFsfStrides(config: FreeScalarConfig): number[] {
  const strides = new Array(MAX_DIM).fill(0)
  strides[config.latticeDim - 1] = 1
  for (let d = config.latticeDim - 2; d >= 0; d--) {
    strides[d] = strides[d + 1]! * config.gridSize[d + 1]!
  }
  return strides
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

  const u32 = new Uint32Array(uniformData)
  const f32 = new Float32Array(uniformData)
  const i32 = new Int32Array(uniformData)

  // Zero out the entire buffer first (ensures unused array slots are 0)
  u32.fill(0)

  const strides = computeFsfStrides(config)

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
  for (let i = 0; i < config.slicePositions.length; i++) {
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
  u32[123] = config.absorberEnabled ? 1 : 0 // offset 492 (absorberEnabled)

  // PML absorber parameters (offset 496-511, indices 124-127)
  f32[124] = config.absorberWidth ?? 0.2 // offset 496
  f32[125] = config.absorberEnabled // offset 500 (sigma_max)
    ? computePMLSigmaMaxND(
        config.pmlTargetReflection ?? 1e-6,
        config.absorberWidth ?? 0.2,
        config.gridSize,
        config.dt,
        3, // cubic grading (hardcoded to match WGSL shader)
        config.latticeDim
      )
    : 0
  u32[126] = 0 // offset 504 (padding)
  u32[127] = 0 // offset 508 (padding)

  device.queue.writeBuffer(uniformBuffer, 0, uniformData)

  return maxField
}

/**
 * Compute the maxPhiEstimate for the given config.
 * Returns the estimated peak amplitude of the phi field based on the
 * initial condition type and autoScale setting.
 *
 * @param config - Free scalar field configuration
 * @returns Estimated peak phi amplitude
 */
export function computeFsfMaxPhiEstimate(config: FreeScalarConfig): number {
  if (!config.autoScale) return 1.0
  if (config.initialCondition === 'vacuumNoise') return estimateVacuumMaxPhi(config)
  if (config.initialCondition === 'kinkProfile') return config.selfInteractionVev
  return config.packetAmplitude
}

/**
 * Estimate maxFieldValue for auto-scale normalization, accounting for
 * initial condition type and current field view.
 *
 * @param config - Free scalar field configuration
 * @param maxPhiEstimate - Current estimate of maximum phi amplitude
 * @returns Estimated maximum field value for normalization
 */
export function estimateFsfMaxFieldValue(config: FreeScalarConfig, maxPhiEstimate: number): number {
  if (!config.autoScale) return 1.0

  const phi0 = maxPhiEstimate

  if (config.fieldView === 'phi') {
    return phi0
  }

  // wallDensity: V(phi) = lambda * (phi^2 - v^2)^2, max at phi=0 -> lambda * v^4
  if (config.fieldView === 'wallDensity') {
    if (config.selfInteractionEnabled) {
      const v = config.selfInteractionVev
      return config.selfInteractionLambda * v * v * v * v
    }
    return 1.0
  }

  // Compute omega from lattice dispersion relation.
  // For vacuum noise all modes are excited, so omega_max (Nyquist) is correct.
  // For singleMode / gaussianPacket, use the actual mode wavevector to avoid
  // overestimating by 10-100x (which makes pi/energy views appear too dim).
  let omegaSq = config.mass * config.mass
  if (config.initialCondition === 'vacuumNoise') {
    // omega_max^2 = m^2 + sum_d (2/a_d)^2 -- conservative upper bound
    for (let d = 0; d < config.latticeDim; d++) {
      const a = config.spacing[d]!
      omegaSq += (2 / a) * (2 / a)
    }
  } else {
    // Lattice dispersion for the actual mode: sk = (2/a) sin(k_phys * a / 2)
    for (let d = 0; d < config.latticeDim; d++) {
      const N = config.gridSize[d]!
      const a = config.spacing[d]!
      if (N <= 1 || a <= 0) continue
      const latticeL = N * a
      const kPhys = (2 * Math.PI * (config.modeK[d] ?? 0)) / latticeL
      const sk = (2 * Math.sin(kPhys * a * 0.5)) / a
      omegaSq += sk * sk
    }
  }
  const omega = Math.sqrt(omegaSq)

  if (config.fieldView === 'pi') {
    return phi0 * omega
  }

  // energyDensity: E ~ 0.5 * (pi^2 + (grad phi)^2 + m^2 phi^2) + V(phi)
  let energy = phi0 * phi0 * omegaSq * 0.5
  if (config.selfInteractionEnabled) {
    // Max potential energy at phi=0: V(0) = lambda * v^4
    const v = config.selfInteractionVev
    energy += config.selfInteractionLambda * v * v * v * v
  }
  return energy
}

// ───────────────────────────────────────────────────────────────────────────
// CPU-side diagnostics computation
// ───────────────────────────────────────────────────────────────────────────

/**
 * Compute field statistics from mapped readback data.
 *
 * Pure CPU function operating on Float32Array views from mapped staging
 * buffers. The caller is responsible for mapping/unmapping.
 *
 * @param phi - Mapped phi field data
 * @param pi - Mapped pi (conjugate momentum) field data
 * @param config - Free scalar field configuration
 * @returns Diagnostics snapshot for the store
 */
export function computeFsfDiagnostics(
  phi: Float32Array,
  pi: Float32Array,
  config: FreeScalarConfig
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

  // Gradient energy: sum_d (phi[i+1] - phi[i])^2 / (2 * a_d^2) * dV
  // All dimensions contribute to total energy (including slice dims d>=3)
  let gradEnergy = 0
  const strides = computeFsfStrides(config)
  for (let d = 0; d < config.latticeDim; d++) {
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
        gradEnergy += diff * diff * invA2
      }
    }
  }
  gradEnergy *= 0.5 * dV

  const totalNorm = sumPhi2 * dV
  const kineticEnergy = 0.5 * sumPi2 * dV
  const massEnergy = 0.5 * config.mass * config.mass * sumPhi2 * dV
  let potentialEnergy = 0
  if (config.selfInteractionEnabled) {
    const lambda = config.selfInteractionLambda
    const v2 = config.selfInteractionVev * config.selfInteractionVev
    for (let i = 0; i < N; i++) {
      const p = phi[i]!
      const diff = p * p - v2
      potentialEnergy += lambda * diff * diff
    }
    potentialEnergy *= dV
  }

  const totalEnergy = kineticEnergy + gradEnergy + massEnergy + potentialEnergy
  const meanPhi = sumPhi / N
  const variancePhi = sumPhi2 / N - meanPhi * meanPhi

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
