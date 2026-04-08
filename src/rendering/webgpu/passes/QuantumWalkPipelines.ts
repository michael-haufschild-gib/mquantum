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
    code: quantumWalkCoinBlock,
  })
  const shiftModule = device.createShaderModule({
    label: 'qw-shift',
    code: freeScalarNDIndexBlock + '\n' + quantumWalkShiftBlock,
  })
  const writeGridModule = device.createShaderModule({
    label: 'qw-write-grid',
    code: freeScalarNDIndexBlock + '\n' + qwWriteGridUniformsBlock + '\n' + qwWriteGridBlock,
  })
  const absorberModule = device.createShaderModule({
    label: 'qw-absorber',
    code:
      freeScalarNDIndexBlock +
      '\n' +
      qwAbsorberUniformsBlock +
      '\n' +
      pmlProfileBlock +
      '\n' +
      quantumWalkAbsorberBlock,
  })

  const coinBGL = createComputeBGL(device, 'qw-coin-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
  const shiftBGL = createComputeBGL(device, 'qw-shift-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
  const writeGridBGL = createComputeBGL(device, 'qw-write-grid-bgl', [
    'uniform',
    'read-only-storage',
    { storageTexture: { format: 'rgba16float', viewDimension: '3d' } },
    'storage',
  ])
  const absorberBGL = createComputeBGL(device, 'qw-absorber-bgl', ['uniform', 'storage'])

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
    shiftUniformBuffer: device.createBuffer({
      label: 'qw-shift-uniform',
      size: 16 + 12 * 4 * 2,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
    writeGridUniformBuffer: device.createBuffer({
      label: 'qw-write-grid-uniform',
      size: QW_WRITE_GRID_UNIFORMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    }),
    absorberUniformBuffer: device.createBuffer({
      label: 'qw-absorber-uniform',
      size: QW_ABSORBER_UNIFORMS_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
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
