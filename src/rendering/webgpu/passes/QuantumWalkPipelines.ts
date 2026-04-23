/**
 * Quantum Walk — Pipeline and Buffer Factory
 *
 * Creates all GPU compute pipelines, bind group layouts, and uniform buffers
 * for the quantum walk simulation. Extracted from QuantumWalkComputePass.
 *
 * @module rendering/webgpu/passes/QuantumWalkPipelines
 */

import { freeScalarNDIndexBlock } from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
import { pmlProfileBlock } from '../shaders/schroedinger/compute/pmlProfile.wgsl'
import {
  quantumWalkAbsorberBlock,
  QW_ABSORBER_UNIFORMS_SIZE,
  qwAbsorberUniformsBlock,
} from '../shaders/schroedinger/compute/quantumWalkAbsorber.wgsl'
import { quantumWalkCoinBlock } from '../shaders/schroedinger/compute/quantumWalkCoin.wgsl'
import { quantumWalkShiftBlock } from '../shaders/schroedinger/compute/quantumWalkShift.wgsl'
import {
  QW_WRITE_GRID_UNIFORMS_SIZE,
  qwWriteGridBlock,
  qwWriteGridUniformsBlock,
} from '../shaders/schroedinger/compute/qwWriteGrid.wgsl'
import { createComputeBGL } from '../utils/computeBindGroupLayout'

// --- Pure WGSL composers (Phase 2b) ---

/** Pure WGSL for the quantum-walk coin compute shader (no prelude needed). */
export function composeQwCoinShader(): string {
  return quantumWalkCoinBlock
}

/** Pure WGSL for the quantum-walk shift compute shader. */
export function composeQwShiftShader(): string {
  return freeScalarNDIndexBlock + '\n' + quantumWalkShiftBlock
}

/** Pure WGSL for the quantum-walk write-grid compute shader. */
export function composeQwWriteGridShader(): string {
  return freeScalarNDIndexBlock + '\n' + qwWriteGridUniformsBlock + '\n' + qwWriteGridBlock
}

/** Pure WGSL for the quantum-walk absorber compute shader. */
export function composeQwAbsorberShader(): string {
  return (
    freeScalarNDIndexBlock +
    '\n' +
    qwAbsorberUniformsBlock +
    '\n' +
    pmlProfileBlock +
    '\n' +
    quantumWalkAbsorberBlock
  )
}

/** All GPU resources created by the pipeline factory. */
export interface QwPipelineResult {
  coinPipeline: GPUComputePipeline
  shiftPipeline: GPUComputePipeline
  writeGridPipeline: GPUComputePipeline
  absorberPipeline: GPUComputePipeline
  coinUniformBuffer: GPUBuffer
  shiftUniformBuffer: GPUBuffer
  writeGridUniformBuffer: GPUBuffer
  absorberUniformBuffer: GPUBuffer
  maxDensityAtomicBuffer: GPUBuffer
  maxDensityReadbackBuffer: GPUBuffer
}

/**
 * Create all compute pipelines and uniform buffers for quantum walk simulation.
 *
 * @param device - WebGPU device
 * @returns All created pipelines and buffers
 */
export function createQwPipelines(device: GPUDevice): QwPipelineResult {
  const coinModule = device.createShaderModule({
    label: 'qw-coin',
    code: composeQwCoinShader(),
  })
  const shiftModule = device.createShaderModule({
    label: 'qw-shift',
    code: composeQwShiftShader(),
  })
  const writeGridModule = device.createShaderModule({
    label: 'qw-write-grid',
    code: composeQwWriteGridShader(),
  })
  const absorberModule = device.createShaderModule({
    label: 'qw-absorber',
    code: composeQwAbsorberShader(),
  })

  const coinBGL = createComputeBGL(device, 'qw-coin-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
  // Binding 0 for shift/writeGrid/absorber is `read-only-storage` because the
  // respective Uniforms structs embed scalar arrays with 4-byte stride —
  // spec-forbidden in uniform address space. See matching shader declarations.
  const shiftBGL = createComputeBGL(device, 'qw-shift-bgl', [
    'read-only-storage',
    'read-only-storage',
    'storage',
  ])
  const writeGridBGL = createComputeBGL(device, 'qw-write-grid-bgl', [
    'read-only-storage',
    'read-only-storage',
    { storageTexture: { format: 'rgba16float', viewDimension: '3d' } },
    'storage',
  ])
  const absorberBGL = createComputeBGL(device, 'qw-absorber-bgl', ['read-only-storage', 'storage'])

  return {
    coinPipeline: device.createComputePipeline({
      label: 'qw-coin-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [coinBGL] }),
      compute: { module: coinModule, entryPoint: 'main' },
    }),
    shiftPipeline: device.createComputePipeline({
      label: 'qw-shift-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [shiftBGL] }),
      compute: { module: shiftModule, entryPoint: 'main' },
    }),
    writeGridPipeline: device.createComputePipeline({
      label: 'qw-write-grid-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [writeGridBGL] }),
      compute: { module: writeGridModule, entryPoint: 'main' },
    }),
    absorberPipeline: device.createComputePipeline({
      label: 'qw-absorber-pipeline',
      layout: device.createPipelineLayout({ bindGroupLayouts: [absorberBGL] }),
      compute: { module: absorberModule, entryPoint: 'main' },
    }),
    coinUniformBuffer: device.createBuffer({
      label: 'qw-coin-uniform',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
    // Shift/WriteGrid/Absorber params bind as STORAGE because their structs
    // embed scalar arrays that are spec-forbidden in uniform address space.
    // See matching shader declarations in quantumWalk*.wgsl.ts.
    shiftUniformBuffer: device.createBuffer({
      label: 'qw-shift-uniform',
      size: 16 + 12 * 4 * 2,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
    writeGridUniformBuffer: device.createBuffer({
      label: 'qw-write-grid-uniform',
      size: QW_WRITE_GRID_UNIFORMS_SIZE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
    absorberUniformBuffer: device.createBuffer({
      label: 'qw-absorber-uniform',
      size: QW_ABSORBER_UNIFORMS_SIZE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
    maxDensityAtomicBuffer: device.createBuffer({
      label: 'qw-max-density-atomic',
      size: 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    }),
    maxDensityReadbackBuffer: device.createBuffer({
      label: 'qw-max-density-readback',
      size: 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    }),
  }
}
