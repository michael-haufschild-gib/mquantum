/**
 * TDSE — Observable & Gram-Schmidt Pipeline Builders
 *
 * Extracted from TDSEComputePassSetup to keep file sizes under the lint limit.
 * Builds the 4 observables reduction pipelines and 3 Gram-Schmidt pipelines.
 *
 * @module rendering/webgpu/passes/TDSEObservablesGSPipelines
 */

import {
  energySpectralDensityBlock,
  energySpectralDensityUniformsBlock,
} from '../shaders/schroedinger/compute/energySpectralDensity.wgsl'
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
import { createComputeBGL } from '../utils/computeBindGroupLayout'
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
  energySpectrumPipeline: GPUComputePipeline
  energySpectrumBGL: GPUBindGroupLayout
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

  const obsPosReduceBGL = createComputeBGL(device, 'obs-pos-reduce-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'storage',
    'read-only-storage',
  ])
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

  const obsPosFinalBGL = createComputeBGL(device, 'obs-pos-final-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
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

  const obsMomReduceBGL = createComputeBGL(device, 'obs-mom-reduce-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
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

  const obsMomFinalBGL = createComputeBGL(device, 'obs-mom-final-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])
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

  const gsReduceBGL = createComputeBGL(device, 'gs-reduce-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    'storage',
    'storage',
  ])
  const gsReducePipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, gramSchmidtInnerProductReduceBlock, 'gs-reduce'),
    [gsReduceBGL],
    'gs-reduce'
  )

  const gsFinalizeBGL = createComputeBGL(device, 'gs-finalize-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'storage',
  ])
  const gsFinalizePipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, gramSchmidtInnerProductFinalizeBlock, 'gs-finalize'),
    [gsFinalizeBGL],
    'gs-finalize'
  )

  const gsSubtractBGL = createComputeBGL(device, 'gs-subtract-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'read-only-storage',
    'storage',
    'storage',
  ])
  const gsSubtractPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, gramSchmidtSubtractBlock, 'gs-subtract'),
    [gsSubtractBGL],
    'gs-subtract'
  )

  // ── Energy Spectral Density ──
  const energySpectrumBGL = createComputeBGL(device, 'energy-spectrum-bgl', [
    'uniform',
    'read-only-storage',
    'storage',
  ])

  // NDIndex block provides linearToND (not used by this shader but the uniform struct references
  // array types that need the block prepended for WGSL parsing context). Actually, this shader
  // does its own index decomposition, so only needs its own uniform block.
  const energySpectrumPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(
      device,
      energySpectralDensityUniformsBlock + energySpectralDensityBlock,
      'energy-spectrum'
    ),
    [energySpectrumBGL],
    'energy-spectrum'
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
    energySpectrumPipeline,
    energySpectrumBGL,
  }
}
