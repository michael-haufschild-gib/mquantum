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
// --- Pure WGSL composers (Phase 2b) ---

/** Pure WGSL for the observables position-reduce compute shader. */
export function composeObsPosReduceShader(): string {
  return freeScalarNDIndexBlock + observablesPositionReduceBlock
}

/** Pure WGSL for the observables position-finalize compute shader. */
export function composeObsPosFinalShader(): string {
  return freeScalarNDIndexBlock + observablesPositionFinalizeBlock
}

/** Pure WGSL for the observables momentum-reduce compute shader. */
export function composeObsMomReduceShader(): string {
  return freeScalarNDIndexBlock + observablesMomentumReduceBlock
}

/** Pure WGSL for the observables momentum-finalize compute shader. */
export function composeObsMomFinalShader(): string {
  return freeScalarNDIndexBlock + observablesMomentumFinalizeBlock
}

/** Pure WGSL for the Gram-Schmidt inner-product reduce compute shader. */
export function composeGsReduceShader(): string {
  return gramSchmidtInnerProductReduceBlock
}

/** Pure WGSL for the Gram-Schmidt inner-product finalize compute shader. */
export function composeGsFinalizeShader(): string {
  return gramSchmidtInnerProductFinalizeBlock
}

/** Pure WGSL for the Gram-Schmidt subtract compute shader. */
export function composeGsSubtractShader(): string {
  return gramSchmidtSubtractBlock
}

/** Pure WGSL for the energy-spectral-density compute shader. */
export function composeEnergySpectrumShader(): string {
  return energySpectralDensityUniformsBlock + energySpectralDensityBlock
}

/**
 * Compile every observables/ground-state compute pipeline and return them
 * with their bind group layouts. One-time setup per device.
 */
export function buildObsGSPipelines(
  device: GPUDevice,
  helpers: TdsePassHelpers
): ObsGSPipelineResult {
  // ── Observable Expectation Value Reduction ──

  // Binding 0 (ObsReduceUniforms) is `read-only-storage` because the struct
  // embeds scalar arrays (spec-forbidden in uniform address space). See
  // observablesPositionReduce.wgsl.ts for the matching `var<storage, read>`.
  const obsPosReduceBGL = createComputeBGL(device, 'obs-pos-reduce-bgl', [
    'read-only-storage',
    'read-only-storage',
    'storage',
    'read-only-storage',
  ])
  const obsPosReducePipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeObsPosReduceShader(), 'obs-pos-reduce'),
    [obsPosReduceBGL],
    'obs-pos-reduce'
  )

  // Binding 0 (ObsReduceUniforms) — see obs-pos-reduce BGL comment.
  const obsPosFinalBGL = createComputeBGL(device, 'obs-pos-final-bgl', [
    'read-only-storage',
    'read-only-storage',
    'storage',
  ])
  const obsPosFinalPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeObsPosFinalShader(), 'obs-pos-final'),
    [obsPosFinalBGL],
    'obs-pos-final'
  )

  // Binding 0 (ObsMomReduceUniforms) — see obs-pos-reduce BGL comment.
  const obsMomReduceBGL = createComputeBGL(device, 'obs-mom-reduce-bgl', [
    'read-only-storage',
    'read-only-storage',
    'storage',
  ])
  const obsMomReducePipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeObsMomReduceShader(), 'obs-mom-reduce'),
    [obsMomReduceBGL],
    'obs-mom-reduce'
  )

  // Binding 0 (ObsMomReduceUniforms) — see obs-pos-reduce BGL comment.
  const obsMomFinalBGL = createComputeBGL(device, 'obs-mom-final-bgl', [
    'read-only-storage',
    'read-only-storage',
    'storage',
  ])
  const obsMomFinalPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeObsMomFinalShader(), 'obs-mom-final'),
    [obsMomFinalBGL],
    'obs-mom-final'
  )

  // ── Gram-Schmidt Orthogonalization ──

  const gsReduceBGL = createComputeBGL(device, 'gs-reduce-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'storage',
    'storage',
  ])
  const gsReducePipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeGsReduceShader(), 'gs-reduce'),
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
    helpers.createShaderModule(device, composeGsFinalizeShader(), 'gs-finalize'),
    [gsFinalizeBGL],
    'gs-finalize'
  )

  const gsSubtractBGL = createComputeBGL(device, 'gs-subtract-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'storage',
  ])
  const gsSubtractPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeGsSubtractShader(), 'gs-subtract'),
    [gsSubtractBGL],
    'gs-subtract'
  )

  // ── Energy Spectral Density ──
  // Binding 0 (EnergySpectrumUniforms) — see obs-pos-reduce BGL comment.
  const energySpectrumBGL = createComputeBGL(device, 'energy-spectrum-bgl', [
    'read-only-storage',
    'read-only-storage',
    'storage',
  ])
  const energySpectrumPipeline = helpers.createComputePipeline(
    device,
    helpers.createShaderModule(device, composeEnergySpectrumShader(), 'energy-spectrum'),
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
