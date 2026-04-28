/**
 * Dirac Compute Pass — Uniform Writing & FFT Staging
 *
 * Pure data-writing functions extracted from DiracComputePass.
 * No GPU pipeline or bind group logic — only buffer writes.
 */

import type { DiracConfig } from '@/lib/geometry/extended/dirac'
import { sigmaMaxFromPmlConfig } from '@/lib/physics/pml/profile'

import { MAX_DIM, packFFTStageUniforms, writeSlicePositionsToF32 } from './computePassUtils'

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
  axialCharge: 7,
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
  f32[81] = sigmaMaxFromPmlConfig(config)

  // slicePositions (offset 328, indices 82-93, WGSL array<f32, 12>).
  writeSlicePositionsToF32(f32, 82, config.slicePositions)

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

  // kGridScale (offset 544, indices 136-147): 2π / (N * a) per dimension.
  // Hoisted out of the kinetic kernel so each thread replaces a divide with
  // a multiply during k-vector construction. Mirrors TDSE's kGridScale field.
  const TWO_PI = Math.PI * 2
  for (let d = 0; d < config.latticeDim; d++) {
    const N = config.gridSize[d]!
    const a = config.spacing[d]!
    f32[136 + d] = TWO_PI / (N * a)
  }

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
  return packFFTStageUniforms(config, totalSites)
}
