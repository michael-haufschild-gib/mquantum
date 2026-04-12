/**
 * Type definitions for the Dirac compute pass setup functions.
 *
 * Separated from implementation to keep file sizes within the 600-line limit.
 * Used by both DiracComputePass.ts and DiracComputePassSetup.ts.
 */

/**
 * GPU buffers created by {@link rebuildDiracBuffers}.
 * Every field is non-null after a successful call.
 */
export interface DiracBufferResult {
  spinorReBuffer: GPUBuffer
  spinorImBuffer: GPUBuffer
  potentialBuffer: GPUBuffer
  gammaBuffer: GPUBuffer
  fftScratchA: GPUBuffer
  fftScratchB: GPUBuffer
  uniformBuffer: GPUBuffer
  fftUniformBuffer: GPUBuffer
  fftStagingBuffer: GPUBuffer
  fftAxisUniformBuffer: GPUBuffer
  fftAxisStagingBuffer: GPUBuffer
  packUniformBuffer: GPUBuffer
  packUniformBufferNoNorm: GPUBuffer
  diagUniformBuffer: GPUBuffer
  diagPartialNormBuffer: GPUBuffer
  diagPartialMaxBuffer: GPUBuffer
  diagPartialParticleBuffer: GPUBuffer
  diagPartialAntiBuffer: GPUBuffer
  diagResultBuffer: GPUBuffer
  diagStagingBuffer: GPUBuffer
  totalSites: number
  currentSpinorSize: number
  fwdStageCount: number
  diagNumWorkgroups: number
}

/** Old buffers to destroy before rebuilding. Any field may be null. */
export interface DiracDestroyableBuffers {
  spinorReBuffer: GPUBuffer | null
  spinorImBuffer: GPUBuffer | null
  potentialBuffer: GPUBuffer | null
  gammaBuffer: GPUBuffer | null
  fftScratchA: GPUBuffer | null
  fftScratchB: GPUBuffer | null
  uniformBuffer: GPUBuffer | null
  fftUniformBuffer: GPUBuffer | null
  fftStagingBuffer: GPUBuffer | null
  fftAxisUniformBuffer: GPUBuffer | null
  fftAxisStagingBuffer: GPUBuffer | null
  packUniformBuffer: GPUBuffer | null
  packUniformBufferNoNorm: GPUBuffer | null
  diagUniformBuffer: GPUBuffer | null
  diagPartialNormBuffer: GPUBuffer | null
  diagPartialMaxBuffer: GPUBuffer | null
  diagPartialParticleBuffer: GPUBuffer | null
  diagPartialAntiBuffer: GPUBuffer | null
  diagResultBuffer: GPUBuffer | null
  diagStagingBuffer: GPUBuffer | null
}

/**
 * Pipeline and bind group layout objects created by {@link buildDiracPipelines}.
 */
export interface DiracPipelineResult {
  initPipeline: GPUComputePipeline
  initBGL: GPUBindGroupLayout
  potentialPipeline: GPUComputePipeline
  potentialBGL: GPUBindGroupLayout
  potentialHalfPipeline: GPUComputePipeline
  potentialHalfBGL: GPUBindGroupLayout
  absorberPipeline: GPUComputePipeline
  renormalizePipeline: GPUComputePipeline
  renormalizeBGL: GPUBindGroupLayout
  packPipeline: GPUComputePipeline
  packBGL: GPUBindGroupLayout
  unpackPipeline: GPUComputePipeline
  unpackBGL: GPUBindGroupLayout
  fftStagePipeline: GPUComputePipeline
  fftStageBGL: GPUBindGroupLayout
  fftSharedMemPipeline: GPUComputePipeline
  fftSharedMemBGL: GPUBindGroupLayout
  kineticPipeline: GPUComputePipeline
  kineticBGL: GPUBindGroupLayout
  writeGridPipeline: GPUComputePipeline
  writeGridBGL: GPUBindGroupLayout
  diagReducePipeline: GPUComputePipeline
  diagReduceBGL: GPUBindGroupLayout
  diagFinalizePipeline: GPUComputePipeline
  diagFinalizeBGL: GPUBindGroupLayout
}

/**
 * Bind group objects created by {@link rebuildDiracBindGroups}.
 */
export interface DiracBindGroupResult {
  initBG: GPUBindGroup | null
  potentialBG: GPUBindGroup | null
  potentialHalfBG: GPUBindGroup | null
  fftStageABBG: GPUBindGroup | null
  fftStageBABG: GPUBindGroup | null
  fftSharedMemBG: GPUBindGroup | null
  kineticBG: GPUBindGroup | null
  writeGridBG: GPUBindGroup | null
  diagReduceBG: GPUBindGroup | null
  diagFinalizeBG: GPUBindGroup | null
  renormalizeBG: GPUBindGroup | null
  renormalizeUniformBuffer: GPUBuffer | null
  cachedPackBGs: GPUBindGroup[]
  cachedUnpackBGs: GPUBindGroup[]
  cachedUnpackBGsNoNorm: GPUBindGroup[]
}

/** Buffers and resources needed to create bind groups. */
export interface DiracBindGroupInputs {
  uniformBuffer: GPUBuffer
  spinorReBuffer: GPUBuffer
  spinorImBuffer: GPUBuffer
  potentialBuffer: GPUBuffer
  gammaBuffer: GPUBuffer
  fftScratchA: GPUBuffer
  fftScratchB: GPUBuffer
  fftUniformBuffer: GPUBuffer
  fftAxisUniformBuffer: GPUBuffer
  packUniformBuffer: GPUBuffer
  packUniformBufferNoNorm: GPUBuffer
  densityTextureView: GPUTextureView
  diagUniformBuffer: GPUBuffer
  diagPartialNormBuffer: GPUBuffer
  diagPartialMaxBuffer: GPUBuffer
  diagPartialParticleBuffer: GPUBuffer
  diagPartialAntiBuffer: GPUBuffer
  diagResultBuffer: GPUBuffer
  totalSites: number
  currentSpinorSize: number
}

/**
 * Helper callbacks that bridge to the base class's protected methods.
 * Passed by DiracComputePass so the standalone functions can use the
 * same shader compilation / pipeline creation infrastructure.
 */
export interface DiracPassHelpers {
  createShaderModule: (device: GPUDevice, code: string, label: string) => GPUShaderModule
  createComputePipeline: (
    device: GPUDevice,
    shaderModule: GPUShaderModule,
    bindGroupLayouts: GPUBindGroupLayout[],
    label: string
  ) => GPUComputePipeline
  createUniformBuffer: (device: GPUDevice, size: number, label: string) => GPUBuffer
}
