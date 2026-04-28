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
import type { ObsGSPipelineResult, TdsePassHelpers } from './TDSEComputePassTypes'

export type { ObsGSPipelineResult }

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
 * Compile every observables/ground-state compute pipeline asynchronously
 * and return them with their bind group layouts. One-time setup per device.
 *
 * Compiles fire in parallel via `Promise.all` so the JS main thread is
 * not blocked on each `device.createComputePipelineAsync`. Called from
 * the parent TDSE `buildTdsePipelines` whose own `Promise.all` stitches
 * these with the core TDSE pipelines into a single concurrent compile
 * batch.
 */
export async function buildObsGSPipelines(
  device: GPUDevice,
  helpers: TdsePassHelpers
): Promise<ObsGSPipelineResult> {
  // ── Bind group layouts (sync, cheap) ───────────────────────────────
  // Binding 0 (ObsReduceUniforms) is `read-only-storage` because the struct
  // embeds scalar arrays (spec-forbidden in uniform address space). See
  // observablesPositionReduce.wgsl.ts for the matching `var<storage, read>`.
  const obsPosReduceBGL = createComputeBGL(device, 'obs-pos-reduce-bgl', [
    'read-only-storage',
    'read-only-storage',
    'storage',
    'read-only-storage',
  ])
  const obsPosFinalBGL = createComputeBGL(device, 'obs-pos-final-bgl', [
    'read-only-storage',
    'read-only-storage',
    'storage',
  ])
  const obsMomReduceBGL = createComputeBGL(device, 'obs-mom-reduce-bgl', [
    'read-only-storage',
    'read-only-storage',
    'storage',
  ])
  const obsMomFinalBGL = createComputeBGL(device, 'obs-mom-final-bgl', [
    'read-only-storage',
    'read-only-storage',
    'storage',
  ])
  const gsReduceBGL = createComputeBGL(device, 'gs-reduce-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'storage',
    'storage',
  ])
  const gsFinalizeBGL = createComputeBGL(device, 'gs-finalize-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'storage',
  ])
  const gsSubtractBGL = createComputeBGL(device, 'gs-subtract-bgl', [
    'uniform',
    'read-only-storage',
    'read-only-storage',
    'storage',
  ])
  const energySpectrumBGL = createComputeBGL(device, 'energy-spectrum-bgl', [
    'read-only-storage',
    'read-only-storage',
    'storage',
  ])

  const issuePipeline = (
    label: string,
    code: string,
    bgls: GPUBindGroupLayout[]
  ): Promise<GPUComputePipeline> =>
    device.createComputePipelineAsync({
      label: `${label}-pipeline`,
      layout: device.createPipelineLayout({
        label: `${label}-layout`,
        bindGroupLayouts: bgls,
      }),
      compute: {
        module: helpers.createShaderModule(device, code, label),
        entryPoint: 'main',
      },
    })

  const [
    obsPosReducePipeline,
    obsPosFinalPipeline,
    obsMomReducePipeline,
    obsMomFinalPipeline,
    gsReducePipeline,
    gsFinalizePipeline,
    gsSubtractPipeline,
    energySpectrumPipeline,
  ] = await Promise.all([
    issuePipeline('obs-pos-reduce', composeObsPosReduceShader(), [obsPosReduceBGL]),
    issuePipeline('obs-pos-final', composeObsPosFinalShader(), [obsPosFinalBGL]),
    issuePipeline('obs-mom-reduce', composeObsMomReduceShader(), [obsMomReduceBGL]),
    issuePipeline('obs-mom-final', composeObsMomFinalShader(), [obsMomFinalBGL]),
    issuePipeline('gs-reduce', composeGsReduceShader(), [gsReduceBGL]),
    issuePipeline('gs-finalize', composeGsFinalizeShader(), [gsFinalizeBGL]),
    issuePipeline('gs-subtract', composeGsSubtractShader(), [gsSubtractBGL]),
    issuePipeline('energy-spectrum', composeEnergySpectrumShader(), [energySpectrumBGL]),
  ])

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
