/**
 * Eigenfunction Cache Compute Pass
 *
 * Pre-computes 1D harmonic oscillator eigenfunctions φ_n(x, ω) and their
 * derivatives φ'_n(x, ω) into a storage buffer. The fragment shader then
 * uses cheap cubic Hermite interpolation lookups instead of computing
 * Hermite polynomials + exp() per sample.
 *
 * CPU-side deduplication: extracts unique (n, ω) pairs from the quantum
 * preset and assigns sequential cache indices. An index map lets the
 * shader look up the correct cache slot for any (term, dimension) pair.
 *
 * @module rendering/webgpu/passes/EigenfunctionCacheComputePass
 */

import { WebGPUBaseComputePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { composeEigenfunctionCacheComputeShader } from '../shaders/schroedinger/compute/composeEigenCache'
import { EIGEN_CACHE_SAMPLES, MAX_EIGEN_FUNCS } from '../shaders/schroedinger/quantum/eigenfunctionCache.wgsl'

// SchroedingerUniforms byte offsets (must match uniforms.wgsl.ts and renderer)
const OFFSET_TERM_COUNT = 4 // i32 at byte 4
const OFFSET_OMEGA = 16 // array<vec4f, 3> at byte 16 (11 f32 values)
const OFFSET_QUANTUM = 64 // array<vec4<i32>, 22> at byte 64 (88 i32 values)

// Hydrogen ND extra dimension offsets
const OFFSET_EXTRA_DIM_N = 608 // array<vec4<i32>, 2> at byte 608 (8 i32 values)
const OFFSET_EXTRA_DIM_OMEGA = 640 // array<vec4f, 2> at byte 640 (8 f32 values)

const MAX_TERMS = 8
const MAX_DIM = 11

// Compute shader workgroup size (must match WGSL)
const WORKGROUP_SIZE = 256

// Per-function compute params: vec4f(xMin, xMax, n_as_f32, omega)
// Global header: u32 numFuncs + 3 padding = 16 bytes
// Func array: MAX_EIGEN_FUNCS × 16 bytes = 1408 bytes
// Total: 1424 bytes
const COMPUTE_PARAMS_SIZE = 16 + MAX_EIGEN_FUNCS * 16

// Metadata for fragment shader:
// Header: u32 numFuncs, u32 dimension, u32 _pad0, u32 _pad1 = 16 bytes
// Per-func metadata: MAX_EIGEN_FUNCS × vec4f(xMin, xMax, invRange, 0) = 1408 bytes
// Index map: 22 × vec4<i32> = 352 bytes
// Total: 1776 bytes
const FRAGMENT_META_SIZE = 16 + MAX_EIGEN_FUNCS * 16 + 22 * 16

/**
 * Configuration for the eigenfunction cache compute pass.
 */
export interface EigenfunctionCacheConfig {
  /** Number of dimensions (3-11) */
  dimension: number
  /** Whether this is hydrogen ND mode (only extra dims 3+ are HO) */
  isHydrogenND?: boolean
}

/**
 * Result of CPU-side deduplication.
 */
interface DeduplicationResult {
  /** Number of unique (n, ω) functions */
  numUniqueFuncs: number
  /** Per-function params for compute shader: [xMin, xMax, n, omega] */
  funcParams: Float32Array
  /** Index map: flatIdx → unique function index (i32 array) */
  indexMap: Int32Array
  /** Per-function metadata for fragment shader: [xMin, xMax, invRange, 0] */
  funcMeta: Float32Array
}

export class EigenfunctionCacheComputePass extends WebGPUBaseComputePass {
  // GPU resources
  private cacheBuffer: GPUBuffer | null = null
  private computeParamsBuffer: GPUBuffer | null = null
  private fragmentMetaBuffer: GPUBuffer | null = null
  private computeBindGroup: GPUBindGroup | null = null
  private computeBindGroupLayout: GPUBindGroupLayout | null = null

  // CPU-side buffers (pre-allocated to avoid per-update allocation)
  private computeParamsData = new ArrayBuffer(COMPUTE_PARAMS_SIZE)
  private computeParamsU32 = new Uint32Array(this.computeParamsData)
  private computeParamsF32 = new Float32Array(this.computeParamsData)
  private fragmentMetaData = new ArrayBuffer(FRAGMENT_META_SIZE)
  private fragmentMetaU32 = new Uint32Array(this.fragmentMetaData)
  private fragmentMetaF32 = new Float32Array(this.fragmentMetaData)
  private fragmentMetaI32 = new Int32Array(this.fragmentMetaData)

  // Mode config
  private isHydrogenND: boolean

  // Dirty tracking
  private needsRecompute = true
  private lastSchroedingerVersion = -1
  private numUniqueFuncs = 0

  constructor(config: EigenfunctionCacheConfig) {
    super({
      id: 'eigenfunction-cache-compute',
      inputs: [],
      outputs: [],
      isCompute: true,
      workgroupSize: [WORKGROUP_SIZE, 1, 1],
    })
    this.isHydrogenND = config.isHydrogenND ?? false
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx

    // Compose compute shader
    const { wgsl } = composeEigenfunctionCacheComputeShader()
    const shaderModule = this.createShaderModule(device, wgsl, 'eigenfunction-cache-compute')

    // Storage buffer for cached eigenfunctions: array<vec2f>
    // Size: MAX_EIGEN_FUNCS × SAMPLES × 2 × 4 bytes = 704 KB
    const cacheBufferSize = MAX_EIGEN_FUNCS * EIGEN_CACHE_SAMPLES * 2 * 4
    this.cacheBuffer = device.createBuffer({
      label: 'eigenfunction-cache-storage',
      size: cacheBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    })
    // Zero-initialize: for hydrogen 3D (0 extra HO dims), the compute shader
    // never dispatches, leaving the buffer with garbage VRAM. The buffer is still
    // bound to the fragment shader at group 2, so ensure it contains zeros.
    new Float32Array(this.cacheBuffer.getMappedRange()).fill(0)
    this.cacheBuffer.unmap()

    // Compute params uniform buffer
    this.computeParamsBuffer = this.createUniformBuffer(
      device,
      COMPUTE_PARAMS_SIZE,
      'eigen-cache-compute-params'
    )

    // Fragment shader metadata uniform buffer
    this.fragmentMetaBuffer = this.createUniformBuffer(
      device,
      FRAGMENT_META_SIZE,
      'eigen-cache-fragment-meta'
    )

    // Compute shader bind group layout:
    // Group 0, Binding 0: EigenCacheComputeParams (uniform)
    // Group 0, Binding 1: eigenCacheOut (storage, read_write)
    this.computeBindGroupLayout = device.createBindGroupLayout({
      label: 'eigen-cache-compute-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'uniform' as const },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.COMPUTE,
          buffer: { type: 'storage' as const },
        },
      ],
    })

    this.computeBindGroup = device.createBindGroup({
      label: 'eigen-cache-compute-bg',
      layout: this.computeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.computeParamsBuffer } },
        { binding: 1, resource: { buffer: this.cacheBuffer } },
      ],
    })

    this.computePipeline = this.createComputePipeline(
      device,
      shaderModule,
      [this.computeBindGroupLayout],
      'eigenfunction-cache-compute'
    )
  }

  /**
   * Extract unique (n, ω) pairs from SchroedingerUniforms and build index map.
   *
   * For HO mode: caches all dimensions (0 to dimension-1) for all terms.
   * For hydrogen ND: caches only extra dimensions (3 to dimension-1) for termIdx=0,
   * reading from extraDimN/extraDimOmega uniform arrays.
   */
  private deduplicateFromUniforms(
    schroedingerData: ArrayBuffer,
    dimension: number
  ): DeduplicationResult {
    const floatView = new Float32Array(schroedingerData)
    const intView = new Int32Array(schroedingerData)

    // Deduplicate: find unique (n, ω) pairs
    const uniqueMap = new Map<string, number>() // key → unique index
    const uniqueParams: Array<{ n: number; omega: number }> = []
    const indexMap = new Int32Array(MAX_TERMS * MAX_DIM).fill(-1) // -1 = unused

    if (this.isHydrogenND) {
      // Hydrogen ND: only cache extra dimensions (3+) for single "term" at index 0
      const extraDimCount = Math.max(dimension - 3, 0)
      const extraDimNBase = OFFSET_EXTRA_DIM_N / 4
      const extraDimOmegaBase = OFFSET_EXTRA_DIM_OMEGA / 4

      for (let i = 0; i < extraDimCount; i++) {
        const dimIdx = i + 3 // actual dimension index
        const n = intView[extraDimNBase + i]!
        const omega = floatView[extraDimOmegaBase + i]!
        const key = `${n}:${omega.toFixed(6)}`

        let uniqueIdx = uniqueMap.get(key)
        if (uniqueIdx === undefined) {
          uniqueIdx = uniqueParams.length
          uniqueMap.set(key, uniqueIdx)
          uniqueParams.push({ n, omega })
        }

        // Map (termIdx=0, dimIdx) to unique function index
        indexMap[0 * MAX_DIM + dimIdx] = uniqueIdx
      }
      // Dims 0-2 remain -1 (hydrogen core, not cached)
    } else {
      // HO mode: cache all dimensions for all terms
      const termCount = Math.min(Math.max(intView[OFFSET_TERM_COUNT / 4]!, 1), MAX_TERMS)

      // Extract omega values (for HO momentum, the uniform buffer already
      // contains 1/ω from the CPU transform in updateSchroedingerUniforms)
      const omegaBase = OFFSET_OMEGA / 4
      const omegas: number[] = []
      for (let j = 0; j < dimension; j++) {
        omegas.push(floatView[omegaBase + j]!)
      }

      // Extract quantum numbers
      const quantumBase = OFFSET_QUANTUM / 4
      const quantumNumbers: number[][] = []
      for (let k = 0; k < termCount; k++) {
        const row: number[] = []
        for (let j = 0; j < dimension; j++) {
          row.push(intView[quantumBase + k * MAX_DIM + j]!)
        }
        quantumNumbers.push(row)
      }

      for (let k = 0; k < termCount; k++) {
        for (let j = 0; j < dimension; j++) {
          const n = quantumNumbers[k]![j]!
          const omega = omegas[j]!
          const key = `${n}:${omega.toFixed(6)}`

          let uniqueIdx = uniqueMap.get(key)
          if (uniqueIdx === undefined) {
            uniqueIdx = uniqueParams.length
            uniqueMap.set(key, uniqueIdx)
            uniqueParams.push({ n, omega })
          }

          indexMap[k * MAX_DIM + j] = uniqueIdx
        }
      }
    }

    const numUniqueFuncs = uniqueParams.length

    // Compute per-function domain and metadata
    const funcParams = new Float32Array(MAX_EIGEN_FUNCS * 4)
    const funcMeta = new Float32Array(MAX_EIGEN_FUNCS * 4)

    for (let i = 0; i < numUniqueFuncs; i++) {
      const { n, omega } = uniqueParams[i]!
      const sqrtOmega = Math.sqrt(Math.max(omega, 0.01))

      // Domain: classical turning point + Gaussian tail margin
      // For position: x_tp = sqrt(2n+1) / sqrt(omega), margin = 4 / sqrt(omega)
      // For momentum: same formula with effectiveOmega=1/ω produces
      //   k_tp = sqrt(2n+1) * sqrt(ω), margin = 4 * sqrt(ω)
      const turningPoint = Math.sqrt(2 * n + 1) / sqrtOmega
      const margin = 4.0 / sqrtOmega
      const xMax = turningPoint + margin
      const xMin = -xMax

      const invRange = (EIGEN_CACHE_SAMPLES - 1) / (xMax - xMin)

      // Compute params for compute shader
      funcParams[i * 4 + 0] = xMin
      funcParams[i * 4 + 1] = xMax
      funcParams[i * 4 + 2] = n // stored as f32
      funcParams[i * 4 + 3] = omega

      // Fragment shader metadata
      funcMeta[i * 4 + 0] = xMin
      funcMeta[i * 4 + 1] = xMax
      funcMeta[i * 4 + 2] = invRange
      funcMeta[i * 4 + 3] = 0 // padding
    }

    return { numUniqueFuncs, funcParams, indexMap, funcMeta }
  }

  /**
   * Update cache from SchroedingerUniforms.
   * Performs CPU-side deduplication and uploads metadata.
   */
  updateFromUniforms(
    device: GPUDevice,
    schroedingerData: ArrayBuffer,
    version: number,
    dimension: number
  ): void {
    if (!this.computeParamsBuffer || !this.fragmentMetaBuffer) return
    if (version === this.lastSchroedingerVersion) return

    this.lastSchroedingerVersion = version

    const dedup = this.deduplicateFromUniforms(schroedingerData, dimension)
    this.numUniqueFuncs = dedup.numUniqueFuncs

    // Upload compute params
    this.computeParamsU32[0] = dedup.numUniqueFuncs
    this.computeParamsU32[1] = 0
    this.computeParamsU32[2] = 0
    this.computeParamsU32[3] = 0
    // Copy func params starting at offset 16 bytes = 4 floats
    this.computeParamsF32.set(dedup.funcParams, 4)
    device.queue.writeBuffer(this.computeParamsBuffer, 0, this.computeParamsData)

    // Upload fragment shader metadata
    this.fragmentMetaU32[0] = dedup.numUniqueFuncs
    this.fragmentMetaU32[1] = dimension
    this.fragmentMetaU32[2] = 0
    this.fragmentMetaU32[3] = 0
    // Per-function metadata starting at offset 16 bytes = 4 floats
    this.fragmentMetaF32.set(dedup.funcMeta, 4)
    // Index map starting at offset (16 + MAX_EIGEN_FUNCS * 16) bytes
    const indexMapOffset = (16 + MAX_EIGEN_FUNCS * 16) / 4
    this.fragmentMetaI32.set(dedup.indexMap, indexMapOffset)
    device.queue.writeBuffer(this.fragmentMetaBuffer, 0, this.fragmentMetaData)

    this.needsRecompute = true
  }

  /**
   * Execute compute pass to fill cache buffer.
   */
  execute(ctx: WebGPURenderContext): void {
    if (!this.computePipeline || !this.computeBindGroup || !this.needsRecompute) return
    if (this.numUniqueFuncs === 0) return

    const computePass = ctx.beginComputePass({
      label: 'eigenfunction-cache-compute-pass',
    })

    // Each workgroup handles one function (256 threads per function)
    // With 1024 samples and 256 threads, each workgroup handles 4 passes
    // Actually: workgroup_size=256, SAMPLES=1024, so we need ceil(1024/256) = 4 dispatches per func
    // But the shader uses global_invocation_id.x % SAMPLES and workgroup_id.x = funcIdx
    // So we need numFuncs workgroups in x, each of size 256
    // 256 threads per workgroup, 1024 samples → need 4 workgroups per function
    const workgroupsPerFunc = Math.ceil(EIGEN_CACHE_SAMPLES / WORKGROUP_SIZE)

    this.dispatchCompute(
      computePass,
      this.computePipeline,
      [this.computeBindGroup],
      this.numUniqueFuncs * workgroupsPerFunc, // x
      1, // y
      1 // z
    )

    computePass.end()
    this.needsRecompute = false
  }

  /** Get the storage buffer containing cached eigenfunctions. */
  getCacheBuffer(): GPUBuffer | null {
    return this.cacheBuffer
  }

  /** Get the metadata uniform buffer for the fragment shader. */
  getMetadataBuffer(): GPUBuffer | null {
    return this.fragmentMetaBuffer
  }

  /** Whether the cache has been computed at least once. */
  isReady(): boolean {
    return !this.needsRecompute && this.numUniqueFuncs > 0
  }

  /** Mark cache as needing recomputation. */
  markDirty(): void {
    this.needsRecompute = true
    this.lastSchroedingerVersion = -1
  }

  dispose(): void {
    this.cacheBuffer?.destroy()
    this.cacheBuffer = null
    this.computeParamsBuffer?.destroy()
    this.computeParamsBuffer = null
    this.fragmentMetaBuffer?.destroy()
    this.fragmentMetaBuffer = null
    this.computeBindGroup = null
    this.computeBindGroupLayout = null
    this.numUniqueFuncs = 0
    this.needsRecompute = true
    this.lastSchroedingerVersion = -1
    super.dispose()
  }
}
