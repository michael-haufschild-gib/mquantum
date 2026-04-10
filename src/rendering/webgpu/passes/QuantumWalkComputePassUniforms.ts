/**
 * Quantum Walk — Uniform Buffer Packing
 *
 * Pure functions that pack QW configuration into uniform buffer layouts
 * expected by the compute shaders.
 *
 * @module rendering/webgpu/passes/QuantumWalkComputePassUniforms
 */

import type { QuantumWalkConfig } from '@/lib/geometry/extended/quantumWalk'

import { QW_ABSORBER_UNIFORMS_SIZE } from '../shaders/schroedinger/compute/quantumWalkAbsorber.wgsl'
import { QW_WRITE_GRID_UNIFORMS_SIZE } from '../shaders/schroedinger/compute/qwWriteGrid.wgsl'

const FIELD_VIEW_MAP: Record<string, number> = { probability: 0, phase: 1, coinState: 2 }

/**
 * Pack QW write-grid uniforms into an ArrayBuffer matching the WGSL struct layout.
 *
 * @param config - Quantum walk configuration
 * @param totalSites - Total number of lattice sites
 * @param gpuMaxDensity - Peak density from GPU readback (1-frame lag)
 * @param strides - Row-major strides per dimension
 * @param basisX - Camera X basis vector (12 floats)
 * @param basisY - Camera Y basis vector (12 floats)
 * @param basisZ - Camera Z basis vector (12 floats)
 * @param boundingRadius - Bounding sphere radius for the lattice volume
 * @returns Packed uniform buffer ready for GPU upload
 */
export function packWriteGridUniforms(
  config: QuantumWalkConfig,
  totalSites: number,
  gpuMaxDensity: number,
  strides: number[],
  basisX: Float32Array | undefined,
  basisY: Float32Array | undefined,
  basisZ: Float32Array | undefined,
  boundingRadius: number
): ArrayBuffer {
  const buf = new ArrayBuffer(QW_WRITE_GRID_UNIFORMS_SIZE)
  const u32 = new Uint32Array(buf)
  const f32 = new Float32Array(buf)

  const numCoinStates = 2 * config.latticeDim

  // Scalars (offset 0-15)
  u32[0] = config.latticeDim
  u32[1] = totalSites
  u32[2] = numCoinStates
  u32[3] = FIELD_VIEW_MAP[config.fieldView] ?? 0

  // gridSize (offset 16, 12 u32)
  for (let d = 0; d < config.latticeDim; d++) {
    u32[4 + d] = config.gridSize[d] ?? 64
  }

  // strides (offset 64, 12 u32)
  for (let d = 0; d < config.latticeDim; d++) {
    u32[16 + d] = strides[d] ?? 1
  }

  // spacing (offset 112, 12 f32)
  for (let d = 0; d < config.latticeDim; d++) {
    f32[28 + d] = config.spacing[d] ?? 0.1
  }

  // Rendering parameters (offset 160)
  f32[40] = boundingRadius
  // maxDensity from GPU atomicMax readback (1-frame lag)
  f32[41] = Math.max(gpuMaxDensity, 1e-8)
  u32[42] = 0 // _pad0
  u32[43] = 0 // _pad1

  // basisX (offset 176, 12 f32)
  for (let d = 0; d < 12; d++) {
    f32[44 + d] = basisX?.[d] ?? (d === 0 ? 1 : 0)
  }

  // basisY (offset 224, 12 f32)
  for (let d = 0; d < 12; d++) {
    f32[56 + d] = basisY?.[d] ?? (d === 1 ? 1 : 0)
  }

  // basisZ (offset 272, 12 f32)
  for (let d = 0; d < 12; d++) {
    f32[68 + d] = basisZ?.[d] ?? (d === 2 ? 1 : 0)
  }

  // slicePositions (offset 320, 12 f32)
  // Store array is 0-indexed (i=0 -> dim 3), WGSL reads slicePositions[d] where d >= 3
  for (let i = 0; i < config.slicePositions.length; i++) {
    f32[80 + 3 + i] = config.slicePositions[i] ?? 0
  }

  return buf
}

/**
 * Pack QW absorber uniforms into an ArrayBuffer matching the WGSL struct layout.
 *
 * @param config - Quantum walk configuration
 * @param totalSites - Total number of lattice sites
 * @param strides - Row-major strides per dimension
 * @param sigmaMax - Pre-computed PML sigma max (0 if absorber disabled)
 * @returns Packed uniform buffer ready for GPU upload
 */
export function packAbsorberUniforms(
  config: QuantumWalkConfig,
  totalSites: number,
  strides: number[],
  sigmaMax: number
): ArrayBuffer {
  const buf = new ArrayBuffer(QW_ABSORBER_UNIFORMS_SIZE)
  const u32 = new Uint32Array(buf)
  const f32 = new Float32Array(buf)

  u32[0] = totalSites
  u32[1] = config.latticeDim
  u32[2] = config.absorberEnabled ? 1 : 0
  f32[3] = sigmaMax
  for (let d = 0; d < config.latticeDim; d++) {
    u32[4 + d] = config.gridSize[d] ?? 64
  }
  for (let d = 0; d < config.latticeDim; d++) {
    u32[16 + d] = strides[d] ?? 1
  }
  f32[28] = config.absorberWidth

  return buf
}
