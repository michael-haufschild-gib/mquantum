/**
 * TDSE — Observable & Gram-Schmidt Pipeline Builders
 *
 * Extracted from TDSEComputePassSetup to keep file sizes under the lint limit.
 * Builds the 4 observables reduction pipelines and 3 Gram-Schmidt pipelines.
 *
 * @module rendering/webgpu/passes/TDSEObservablesGSPipelines
 */

import { freeScalarNDIndexBlock } from '../shaders/schroedinger/compute/freeScalarNDIndex.wgsl'
import {
  gramSchmidtInnerProductFinalizeBlock,
  gramSchmidtInnerProductReduceBlock,
  gramSchmidtSubtractBlock,
} from '../shaders/schroedinger/compute/gramSchmidt.wgsl'
import {
  observablesMomentumFinalizeBlock,
  observablesMomentumReduceBlock,
} from '../shaders/schroedinger/compute/observablesMomentumReduce.wgsl'
import {
  observablesPositionFinalizeBlock,
  observablesPositionReduceBlock,
} from '../shaders/schroedinger/compute/observablesPositionReduce.wgsl'
import type { TdsePassHelpers } from './TDSEComputePassSetup'

/** Pipeline results for observables + Gram-Schmidt. */
export interface ObsGSPipelineResult {
  obsPosReducePipeline: GPUComputePipeline
  obsPosReduceBGL: GPUBindGroupLayout
  obsPosFinalPipeline: GPUComputePipeline
  obsPosFinalBGL: GPUBindGroupLayout
  obsMomReducePipeline: GPUComputePipeline
  obsMomReduceBGL: GPUBindGroupLayout
  obsMomFinalPipeline: GPUComputePipeline
  obsMomFinalBGL: GPUBindGroupLayout
  gsReducePipeline: GPUComputePipeline
  gsReduceBGL: GPUBindGroupLayout
  gsFinalizePipeline: GPUComputePipeline
  gsFinalizeBGL: GPUBindGroupLayout
  gsSubtractPipeline: GPUComputePipeline
  gsSubtractBGL: GPUBindGroupLayout
}

/**
 * Build observables reduction + Gram-Schmidt orthogonalization pipelines.
 *
 * @param device - GPU device
 * @param helpers - Base-class helper methods
 * @returns All observables + GS pipelines and their bind group layouts
 */
export function buildObsGSPipelines(
  device: GPUDevice,
  helpers: TdsePassHelpers
): ObsGSPipelineResult {
  // ── Observable Expectation Value Reduction ──

  const obsPosReduceBGL = device.createBindGroupLayout({
    label: 'obs-pos-reduce-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    ],
  })
  const obsPosReducePipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      freeScalarNDIndexBlock + observablesPositionReduceBlock,
      'obs-pos-reduce'
    ),
    [obsPosReduceBGL],
    'obs-pos-reduce'
  )

  const obsPosFinalBGL = device.createBindGroupLayout({
    label: 'obs-pos-final-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
  const obsPosFinalPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      freeScalarNDIndexBlock + observablesPositionFinalizeBlock,
      'obs-pos-final'
    ),
    [obsPosFinalBGL],
    'obs-pos-final'
  )

  const obsMomReduceBGL = device.createBindGroupLayout({
    label: 'obs-mom-reduce-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
  const obsMomReducePipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      freeScalarNDIndexBlock + observablesMomentumReduceBlock,
      'obs-mom-reduce'
    ),
    [obsMomReduceBGL],
    'obs-mom-reduce'
  )

  const obsMomFinalBGL = device.createBindGroupLayout({
    label: 'obs-mom-final-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
  const obsMomFinalPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      freeScalarNDIndexBlock + observablesMomentumFinalizeBlock,
      'obs-mom-final'
    ),
    [obsMomFinalBGL],
    'obs-mom-final'
  )

  // ── Gram-Schmidt Orthogonalization ──

  const gsReduceBGL = device.createBindGroupLayout({
    label: 'gs-reduce-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
  const gsReducePipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, gramSchmidtInnerProductReduceBlock, 'gs-reduce'),
    [gsReduceBGL],
    'gs-reduce'
  )

  const gsFinalizeBGL = device.createBindGroupLayout({
    label: 'gs-finalize-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
  const gsFinalizePipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, gramSchmidtInnerProductFinalizeBlock, 'gs-finalize'),
    [gsFinalizeBGL],
    'gs-finalize'
  )

  const gsSubtractBGL = device.createBindGroupLayout({
    label: 'gs-subtract-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  })
  const gsSubtractPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, gramSchmidtSubtractBlock, 'gs-subtract'),
    [gsSubtractBGL],
    'gs-subtract'
  )

  return {
    obsPosReducePipeline,
    obsPosReduceBGL,
    obsPosFinalPipeline,
    obsPosFinalBGL,
    obsMomReducePipeline,
    obsMomReduceBGL,
    obsMomFinalPipeline,
    obsMomFinalBGL,
    gsReducePipeline,
    gsReduceBGL,
    gsFinalizePipeline,
    gsFinalizeBGL,
    gsSubtractPipeline,
    gsSubtractBGL,
  }
}
