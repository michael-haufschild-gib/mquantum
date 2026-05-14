/**
 * Dirac Compute Pass — Uniform Writing & FFT Staging
 *
 * Pure data-writing functions extracted from DiracComputePass.
 * No GPU pipeline or bind group logic — only buffer writes.
 *
 * All struct offsets come from `DIRAC_UNIFORMS_LAYOUT.index`, which is
 * derived from the WGSL field declarations. There are no hand-computed
 * magic numbers in this file.
 */

import type { DiracConfig } from '@/lib/geometry/extended/dirac'
import { sigmaMaxFromPmlConfig } from '@/lib/physics/pml/profile'

import { MAX_DIM, packFFTStageUniforms, writeSlicePositionsToF32 } from './computePassUtils'
import { DIRAC_UNIFORM_SIZE, DIRAC_UNIFORMS_LAYOUT } from './diracUniformsLayout'

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

/** Physics potential is disabled when the UI potential switch is off. */
export function effectiveDiracPotentialType(config: DiracConfig): DiracConfig['potentialType'] {
  return config.showPotential ? config.potentialType : 'none'
}

/** Float/u32 indices of every DiracUniforms field (byteOffset / 4). */
const I = DIRAC_UNIFORMS_LAYOUT.index

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
  if (uniformData.byteLength !== DIRAC_UNIFORM_SIZE) {
    throw new RangeError(
      `writeDiracUniforms expected ${DIRAC_UNIFORM_SIZE} bytes, got ${uniformData.byteLength}`
    )
  }

  const { config, totalSites, currentSpinorSize, simTime, maxDensity, strides } = params
  const { basisX, basisY, basisZ, boundingRadius } = params
  u32.fill(0)

  // Lattice parameter arrays
  for (let d = 0; d < config.latticeDim; d++) u32[I.gridSize + d] = config.gridSize[d]!
  for (let d = 0; d < config.latticeDim; d++) u32[I.strides + d] = strides[d]!
  for (let d = 0; d < config.latticeDim; d++) f32[I.spacing + d] = config.spacing[d]!

  // Lattice scalars
  u32[I.totalSites] = totalSites
  u32[I.latticeDim] = config.latticeDim
  f32[I.mass] = config.mass
  f32[I.speedOfLight] = config.speedOfLight

  // Physics scalars
  f32[I.hbar] = config.hbar
  f32[I.dt] = config.dt
  u32[I.spinorSize] = currentSpinorSize
  u32[I.potentialType] = POT_MAP[effectiveDiracPotentialType(config)] ?? 0

  // Potential parameters
  f32[I.potentialStrength] = config.potentialStrength
  f32[I.potentialWidth] = config.potentialWidth
  f32[I.potentialCenter] = config.potentialCenter
  f32[I.harmonicOmega] = config.harmonicOmega

  // Potential + init
  f32[I.coulombZ] = config.coulombZ
  u32[I.initCondition] = INIT_MAP[config.initialCondition] ?? 0
  f32[I.packetWidth] = config.packetWidth
  f32[I.positiveEnergyFraction] = config.positiveEnergyFraction

  // Packet init arrays
  for (let d = 0; d < config.latticeDim; d++) {
    f32[I.packetCenter + d] = config.packetCenter[d] ?? 0
  }
  for (let d = 0; d < config.latticeDim; d++) {
    f32[I.packetMomentum + d] = config.packetMomentum[d] ?? 0
  }

  // Display + simulation state
  u32[I.fieldView] = VIEW_MAP[config.fieldView] ?? 0
  u32[I.autoScale] = config.autoScale ? 1 : 0
  f32[I.simTime] = simTime
  u32[I.absorberEnabled] = config.absorberEnabled ? 1 : 0

  // PML absorber — auto-compute sigma_max from PML target reflection coefficient.
  f32[I.absorberWidth] = config.absorberWidth
  f32[I.absorberStrength] = sigmaMaxFromPmlConfig(config)

  // Slice positions for extra dimensions (WGSL array<f32, 12>).
  writeSlicePositionsToF32(f32, I.slicePositions, config.slicePositions)

  // Basis vectors (each array<f32, 12>)
  const writeBasis = (offset: number, b?: Float32Array) => {
    if (b) {
      for (let d = 0; d < Math.min(b.length, MAX_DIM); d++) f32[offset + d] = b[d]!
    }
  }
  writeBasis(I.basisX, basisX)
  if (!basisX) f32[I.basisX] = 1.0
  writeBasis(I.basisY, basisY)
  if (!basisY) f32[I.basisY + 1] = 1.0
  writeBasis(I.basisZ, basisZ)
  if (!basisZ) f32[I.basisZ + 2] = 1.0

  // Bounding + density scale
  f32[I.boundingRadius] = boundingRadius ?? 2.0
  f32[I.densityScale] = maxDensity
  u32[I.stepsPerFrame] = config.stepsPerFrame
  u32[I.showPotential] = config.showPotential ? 1 : 0

  // Spin polarization angles (Bloch sphere)
  f32[I.spinTheta] = config.spinDirection[0] ?? 0
  f32[I.spinPhi] = config.spinDirection[1] ?? 0

  // kGridScale: 2π / (N · a) per dimension. Hoisted out of the kinetic
  // kernel so each thread replaces a divide with a multiply during k-vector
  // construction. Mirrors TDSE's kGridScale field.
  const TWO_PI = Math.PI * 2
  for (let d = 0; d < config.latticeDim; d++) {
    const N = config.gridSize[d]!
    const a = config.spacing[d]!
    f32[I.kGridScale + d] = TWO_PI / (N * a)
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
