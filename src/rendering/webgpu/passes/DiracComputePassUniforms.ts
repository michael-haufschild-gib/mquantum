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

import {
  DEFAULT_DIRAC_CONFIG,
  type DiracConfig,
  isDiracFieldView,
  isDiracInitialCondition,
  isDiracPotentialType,
} from '@/lib/geometry/extended/dirac'
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
  if (config.showPotential !== true) return 'none'
  return isDiracPotentialType(config.potentialType) ? config.potentialType : 'none'
}

/** Float/u32 indices of every DiracUniforms field (byteOffset / 4). */
const I = DIRAC_UNIFORMS_LAYOUT.index

function finiteNumber(value: unknown, fallback: number, min = -Infinity, max = Infinity): number {
  const finite = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.max(min, Math.min(max, finite))
}

function finiteInteger(value: unknown, fallback: number, min: number, max: number): number {
  return Math.floor(finiteNumber(value, fallback, min, max))
}

function finiteArrayValue(
  values: readonly number[] | undefined,
  index: number,
  fallback: number,
  min = -Infinity,
  max = Infinity
): number {
  return finiteNumber(values?.[index], fallback, min, max)
}

function positiveArrayValue(
  values: readonly number[] | undefined,
  index: number,
  fallback: number,
  max = Infinity
): number {
  const value = values?.[index]
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback
  return Math.min(value, max)
}

function finiteBasisValue(
  basis: Float32Array | undefined,
  index: number,
  fallback: number
): number {
  return finiteNumber(basis?.[index], fallback)
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
  if (uniformData.byteLength !== DIRAC_UNIFORM_SIZE) {
    throw new RangeError(
      `writeDiracUniforms expected ${DIRAC_UNIFORM_SIZE} bytes, got ${uniformData.byteLength}`
    )
  }

  const { config, totalSites, currentSpinorSize, simTime, maxDensity, strides } = params
  const { basisX, basisY, basisZ, boundingRadius } = params
  const latticeDim = finiteInteger(config.latticeDim, DEFAULT_DIRAC_CONFIG.latticeDim, 1, MAX_DIM)
  const safeGridSize = Array.from({ length: latticeDim }, (_, d) =>
    finiteInteger(
      config.gridSize?.[d],
      DEFAULT_DIRAC_CONFIG.gridSize[d] ?? 2,
      1,
      Number.MAX_SAFE_INTEGER
    )
  )
  const safeSpacing = Array.from({ length: latticeDim }, (_, d) =>
    positiveArrayValue(config.spacing, d, DEFAULT_DIRAC_CONFIG.spacing[d] ?? 0.15)
  )
  const safePotentialType = effectiveDiracPotentialType(config)
  const safeInitialCondition = isDiracInitialCondition(config.initialCondition)
    ? config.initialCondition
    : DEFAULT_DIRAC_CONFIG.initialCondition
  const safeFieldView = isDiracFieldView(config.fieldView)
    ? config.fieldView
    : DEFAULT_DIRAC_CONFIG.fieldView
  u32.fill(0)

  // Lattice parameter arrays
  for (let d = 0; d < latticeDim; d++) u32[I.gridSize + d] = safeGridSize[d]!
  for (let d = 0; d < latticeDim; d++) {
    u32[I.strides + d] = finiteInteger(strides[d], 1, 1, Number.MAX_SAFE_INTEGER)
  }
  for (let d = 0; d < latticeDim; d++) f32[I.spacing + d] = safeSpacing[d]!

  // Lattice scalars
  u32[I.totalSites] = finiteInteger(totalSites, 1, 1, Number.MAX_SAFE_INTEGER)
  u32[I.latticeDim] = latticeDim
  f32[I.mass] = finiteNumber(config.mass, DEFAULT_DIRAC_CONFIG.mass, 0.000001)
  f32[I.speedOfLight] = finiteNumber(
    config.speedOfLight,
    DEFAULT_DIRAC_CONFIG.speedOfLight,
    0.000001
  )

  // Physics scalars
  f32[I.hbar] = finiteNumber(config.hbar, DEFAULT_DIRAC_CONFIG.hbar, 0.000001)
  f32[I.dt] = finiteNumber(config.dt, DEFAULT_DIRAC_CONFIG.dt, 0.000001)
  u32[I.spinorSize] = finiteInteger(currentSpinorSize, 1, 1, Number.MAX_SAFE_INTEGER)
  u32[I.potentialType] = POT_MAP[safePotentialType] ?? 0

  // Potential parameters
  f32[I.potentialStrength] = finiteNumber(
    config.potentialStrength,
    DEFAULT_DIRAC_CONFIG.potentialStrength
  )
  f32[I.potentialWidth] = finiteNumber(
    config.potentialWidth,
    DEFAULT_DIRAC_CONFIG.potentialWidth,
    0.000001
  )
  f32[I.potentialCenter] = finiteNumber(
    config.potentialCenter,
    DEFAULT_DIRAC_CONFIG.potentialCenter
  )
  f32[I.harmonicOmega] = finiteNumber(
    config.harmonicOmega,
    DEFAULT_DIRAC_CONFIG.harmonicOmega,
    0.000001
  )

  // Potential + init
  f32[I.coulombZ] = finiteNumber(config.coulombZ, DEFAULT_DIRAC_CONFIG.coulombZ, 0)
  u32[I.initCondition] = INIT_MAP[safeInitialCondition] ?? 0
  f32[I.packetWidth] = finiteNumber(config.packetWidth, DEFAULT_DIRAC_CONFIG.packetWidth, 0.000001)
  f32[I.positiveEnergyFraction] = finiteNumber(
    config.positiveEnergyFraction,
    DEFAULT_DIRAC_CONFIG.positiveEnergyFraction,
    0,
    1
  )

  // Packet init arrays
  for (let d = 0; d < latticeDim; d++) {
    f32[I.packetCenter + d] = finiteArrayValue(config.packetCenter, d, 0)
  }
  for (let d = 0; d < latticeDim; d++) {
    f32[I.packetMomentum + d] = finiteArrayValue(config.packetMomentum, d, 0)
  }

  // Display + simulation state
  u32[I.fieldView] = VIEW_MAP[safeFieldView] ?? 0
  u32[I.autoScale] = config.autoScale === true ? 1 : 0
  f32[I.simTime] = finiteNumber(simTime, 0)
  u32[I.absorberEnabled] = config.absorberEnabled === true ? 1 : 0

  // PML absorber — auto-compute sigma_max from PML target reflection coefficient.
  f32[I.absorberWidth] = finiteNumber(
    config.absorberWidth,
    DEFAULT_DIRAC_CONFIG.absorberWidth,
    0,
    0.5
  )
  f32[I.absorberStrength] = sigmaMaxFromPmlConfig({
    ...config,
    latticeDim,
    gridSize: safeGridSize,
    dt: f32[I.dt]!,
    absorberEnabled: config.absorberEnabled === true,
    absorberWidth: f32[I.absorberWidth]!,
  })

  // Slice positions for extra dimensions (WGSL array<f32, 12>).
  writeSlicePositionsToF32(
    f32,
    I.slicePositions,
    Array.isArray(config.slicePositions)
      ? config.slicePositions.map((value) => finiteNumber(value, 0))
      : []
  )

  // Basis vectors (each array<f32, 12>)
  const writeBasis = (offset: number, b: Float32Array | undefined, axis: number) => {
    for (let d = 0; d < MAX_DIM; d++) {
      f32[offset + d] = finiteBasisValue(b, d, d === axis ? 1 : 0)
    }
  }
  writeBasis(I.basisX, basisX, 0)
  writeBasis(I.basisY, basisY, 1)
  writeBasis(I.basisZ, basisZ, 2)

  // Bounding + density scale
  f32[I.boundingRadius] = finiteNumber(boundingRadius, 2.0, 0.000001)
  f32[I.densityScale] = finiteNumber(maxDensity, 1.0, 0)
  u32[I.stepsPerFrame] = finiteInteger(
    config.stepsPerFrame,
    DEFAULT_DIRAC_CONFIG.stepsPerFrame,
    1,
    256
  )
  u32[I.showPotential] = config.showPotential === true ? 1 : 0

  // Spin polarization angles (Bloch sphere)
  f32[I.spinTheta] = finiteArrayValue(config.spinDirection, 0, 0)
  f32[I.spinPhi] = finiteArrayValue(config.spinDirection, 1, 0)

  // kGridScale: 2π / (N · a) per dimension. Hoisted out of the kinetic
  // kernel so each thread replaces a divide with a multiply during k-vector
  // construction. Mirrors TDSE's kGridScale field.
  const TWO_PI = Math.PI * 2
  for (let d = 0; d < latticeDim; d++) {
    const N = safeGridSize[d]!
    const a = safeSpacing[d]!
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
