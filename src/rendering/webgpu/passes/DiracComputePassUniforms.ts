/**
 * Dirac Compute Pass — Uniform Writing & FFT Staging
 *
 * Pure data-writing functions extracted from DiracComputePass.
 * No GPU pipeline or bind group logic — only buffer writes.
 */

import type { DiracConfig } from '@/lib/geometry/extended/dirac'
import { computePMLSigmaMaxND, PML_GRADING_EXPONENT } from '@/lib/physics/pml/profile'

import { FFT_UNIFORM_SIZE, MAX_DIM } from './computePassUtils'

/** Parameters for writing DiracUniforms to a GPU buffer. */
export interface DiracUniformParams {
  config: DiracConfig
  totalSites: number
  currentSpinorSize: number
  simTime: number
  maxDensity: number
  strides: number[]
  basisX?: Float32Array
  basisY?: Float32Array
  basisZ?: Float32Array
  boundingRadius?: number
}

/** Enum maps for Dirac initial conditions, potential types, and field views. */
const INIT_MAP: Record<string, number> = {
  gaussianPacket: 0,
  planeWave: 1,
  standingWave: 2,
  zitterbewegung: 3,
}
const POT_MAP: Record<string, number> = {
  none: 0,
  step: 1,
  barrier: 2,
  well: 3,
  harmonicTrap: 4,
  coulomb: 5,
}
const VIEW_MAP: Record<string, number> = {
  totalDensity: 0,
  particleDensity: 1,
  antiparticleDensity: 2,
  particleAntiparticleSplit: 3,
  spinDensity: 4,
  currentDensity: 5,
  phase: 6,
}

/**
 * Write all Dirac uniform fields into the pre-allocated u32/f32 views,
 * then upload to the GPU uniform buffer.
 *
 * @param device - WebGPU device (for queue.writeBuffer)
 * @param uniformBuffer - Target GPU uniform buffer
 * @param uniformData - Underlying ArrayBuffer shared by u32/f32 views
 * @param u32 - Uint32Array view into uniformData
 * @param f32 - Float32Array view into uniformData
 * @param params - All values needed to populate the uniform struct
 */
export function writeDiracUniforms(
  device: GPUDevice,
  uniformBuffer: GPUBuffer,
  uniformData: ArrayBuffer,
  u32: Uint32Array,
  f32: Float32Array,
  params: DiracUniformParams
): void {
  const { config, totalSites, currentSpinorSize, simTime, maxDensity, strides } = params
  const { basisX, basisY, basisZ, boundingRadius } = params
  u32.fill(0)

  // gridSize (offset 0, indices 0-11)
  for (let d = 0; d < config.latticeDim; d++) u32[d] = config.gridSize[d]!
  // strides (offset 48, indices 12-23)
  for (let d = 0; d < config.latticeDim; d++) u32[12 + d] = strides[d]!
  // spacing (offset 96, indices 24-35)
  for (let d = 0; d < config.latticeDim; d++) f32[24 + d] = config.spacing[d]!

  // Lattice scalars (offset 144, indices 36-39)
  u32[36] = totalSites
  u32[37] = config.latticeDim
  f32[38] = config.mass
  f32[39] = config.speedOfLight

  // Physics scalars (offset 160, indices 40-43)
  f32[40] = config.hbar
  f32[41] = config.dt
  u32[42] = currentSpinorSize
  u32[43] = POT_MAP[config.potentialType] ?? 0

  // Potential parameters (offset 176, indices 44-47)
  f32[44] = config.potentialStrength
  f32[45] = config.potentialWidth
  f32[46] = config.potentialCenter
  f32[47] = config.harmonicOmega

  // Potential + init (offset 192, indices 48-51)
  f32[48] = config.coulombZ
  u32[49] = INIT_MAP[config.initialCondition] ?? 0
  f32[50] = config.packetWidth
  f32[51] = config.positiveEnergyFraction

  // packetCenter (offset 208, indices 52-63)
  for (let d = 0; d < config.latticeDim; d++) f32[52 + d] = config.packetCenter[d] ?? 0
  // packetMomentum (offset 256, indices 64-75)
  for (let d = 0; d < config.latticeDim; d++) f32[64 + d] = config.packetMomentum[d] ?? 0

  // Display + simulation state (offset 304, indices 76-79)
  u32[76] = VIEW_MAP[config.fieldView] ?? 0
  u32[77] = config.autoScale ? 1 : 0
  f32[78] = simTime
  u32[79] = config.absorberEnabled ? 1 : 0

  // PML absorber (offset 320, indices 80-81)
  f32[80] = config.absorberWidth
  // Auto-compute sigma_max from PML target reflection coefficient
  f32[81] = config.absorberEnabled
    ? computePMLSigmaMaxND(
        config.pmlTargetReflection ?? 1e-6,
        config.absorberWidth,
        config.gridSize,
        config.dt,
        PML_GRADING_EXPONENT,
        config.latticeDim
      )
    : 0

  // slicePositions (offset 328, indices 82-93)
  // Store array is 0-indexed (i=0 -> dim 3), WGSL reads slicePositions[d] where d >= 3
  for (let i = 0; i < config.slicePositions.length; i++) f32[82 + 3 + i] = config.slicePositions[i]!

  // Basis vectors (offset 376, indices 94-105, 106-117, 118-129)
  const writeBasis = (offset: number, b?: Float32Array) => {
    if (b) {
      for (let d = 0; d < Math.min(b.length, MAX_DIM); d++) f32[offset + d] = b[d]!
    }
  }
  writeBasis(94, basisX)
  if (!basisX) f32[94] = 1.0
  writeBasis(106, basisY)
  if (!basisY) f32[107] = 1.0
  writeBasis(118, basisZ)
  if (!basisZ) f32[120] = 1.0

  // Bounding + density scale (offset 520, indices 130-133)
  f32[130] = boundingRadius ?? 2.0
  f32[131] = maxDensity
  u32[132] = config.stepsPerFrame
  u32[133] = config.showPotential ? 1 : 0

  // Spin polarization angles (offset 536, indices 134-135)
  f32[134] = config.spinDirection[0] ?? 0
  f32[135] = config.spinDirection[1] ?? 0

  device.queue.writeBuffer(uniformBuffer, 0, uniformData)
}

/**
 * Build pre-computed FFT stage uniform data for all forward + inverse stages.
 *
 * @param config - Dirac configuration with grid sizes and lattice dimension
 * @param totalSites - Total number of lattice sites
 * @returns ArrayBuffer containing packed FFT stage uniforms
 */
export function buildDiracFFTStagingData(config: DiracConfig, totalSites: number): ArrayBuffer {
  let totalSlots = 0
  for (let d = 0; d < config.latticeDim; d++) {
    totalSlots += Math.log2(config.gridSize[d]!)
  }
  totalSlots *= 2

  const data = new ArrayBuffer(totalSlots * FFT_UNIFORM_SIZE)
  let slotIdx = 0

  for (const direction of [1.0, -1.0]) {
    let axisStride = 1
    for (let d = config.latticeDim - 1; d >= 0; d--) {
      const axisDim = config.gridSize[d]!
      const stages = Math.log2(axisDim)

      for (let s = 0; s < stages; s++) {
        const offset = slotIdx * FFT_UNIFORM_SIZE
        const view = new DataView(data, offset, FFT_UNIFORM_SIZE)
        view.setUint32(0, axisDim, true)
        view.setUint32(4, s, true)
        view.setFloat32(8, direction, true)
        view.setUint32(12, totalSites, true)
        view.setUint32(16, axisStride, true)
        view.setUint32(20, totalSites / axisDim, true)
        view.setFloat32(24, 1.0 / axisDim, true)
        view.setUint32(28, 0, true)
        slotIdx++
      }
      axisStride *= axisDim
    }
  }

  return data
}
