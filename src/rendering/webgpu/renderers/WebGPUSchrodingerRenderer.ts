/**
 * WebGPU Schrödinger Renderer
 *
 * Renders N-dimensional quantum wavefunctions using WebGPU volume raymarching.
 * Supports harmonic oscillator and hydrogen ND modes.
 *
 * @module rendering/webgpu/renderers/WebGPUSchrodingerRenderer
 */

import { computeBoundingRadius } from '@/lib/geometry/extended/schroedinger/boundingRadius'
import {
  flattenPresetForUniforms,
  generateQuantumPreset,
  getNamedPreset,
  type QuantumPreset,
} from '@/lib/geometry/extended/schroedinger/presets'
import { logger } from '@/lib/logger'

import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import { WebGPUBasePass } from '../core/WebGPUBasePass'
import { DensityGridComputePass } from '../passes/DensityGridComputePass'
import { EigenfunctionCacheComputePass } from '../passes/EigenfunctionCacheComputePass'
import {
  composeSchroedingerShader,
  composeSchroedingerVertexShader,
  composeSchroedingerVertexShader2D,
  type QuantumModeForShader,
  type SchroedingerWGSLShaderConfig,
} from '../shaders/schroedinger/compose'
import { packLightingUniforms } from '../utils/lighting'
import {
  applyModeOverrides,
  buildPipelineOutputs,
  buildShaderConfig,
  computePipelineCacheKey,
} from './rendererConfigUtils'
import type { SchrodingerRendererConfig } from './schrodingerRendererTypes'
import {
  type AnimationState,
  type AppearanceStoreState,
  BAYER_OFFSETS,
  type CameraSnapshot,
  COLOR_ALGORITHM_MAP,
  type ExtendedStoreSnapshot,
  type GeometryState,
  getStoreSnapshot,
  type LightingSnapshot,
  type PBRSliceState,
  type PerformanceSnapshot,
  QUANTUM_MODE_MAP,
  type RotationState,
  SCHROEDINGER_UNIFORM_SIZE,
  type TransformSnapshot,
} from './schrodingerRendererTypes'
import {
  createVersionTracker,
  isBasisDirty,
  isSchroedingerDirty,
  resetVersionTracker,
  updateBasisVersions,
  updateSchroedingerVersions,
  type VersionTracker,
} from './stateDiffing'
import { computeLatticeBoundingRadius } from './strategies/computeGridUtils'
import { createModeStrategy } from './strategies/createStrategy'
import type { ModeFrameContext, QuantumModeStrategy } from './strategies/types'
import {
  applyHOMomentumTransform,
  computeCanonicalCompensation,
  packBasisVectors,
  packCameraUniforms,
  packMaterialUniforms,
  packQualityUniforms,
  packSchroedingerUniforms,
} from './uniformPacking'
export type { SchrodingerRendererConfig } from './schrodingerRendererTypes'

/**
 * WebGPU renderer for quantum wavefunctions.
 */
export class WebGPUSchrodingerRenderer extends WebGPUBasePass {
  /** LRU cache for compiled render pipelines keyed by shader config. */
  private static renderPipelineCache = new Map<string, GPURenderPipeline>()
  private static readonly MAX_CACHE_SIZE = 16

  /** Clear the static render pipeline cache (e.g. on device loss). */
  static clearPipelineCache(): void {
    WebGPUSchrodingerRenderer.renderPipelineCache.clear()
  }

  private renderPipeline: GPURenderPipeline | null = null
  private vertexBuffer: GPUBuffer | null = null
  private indexBuffer: GPUBuffer | null = null

  // Uniform buffers
  private cameraUniformBuffer: GPUBuffer | null = null
  private lightingUniformBuffer: GPUBuffer | null = null
  private materialUniformBuffer: GPUBuffer | null = null
  private qualityUniformBuffer: GPUBuffer | null = null
  private schroedingerUniformBuffer: GPUBuffer | null = null
  private basisUniformBuffer: GPUBuffer | null = null

  // Bind groups
  // Group 0: Camera
  // Group 1: Combined (Lighting + Material + Quality)
  // Group 2: Object (Schrödinger + Basis)
  private cameraBindGroup: GPUBindGroup | null = null
  private lightingBindGroup: GPUBindGroup | null = null
  private objectBindGroup: GPUBindGroup | null = null
  private objectBindGroupLayout: GPUBindGroupLayout | null = null

  // Mode strategy: encapsulates compute passes, open quantum, bounding radius per mode
  private strategy: QuantumModeStrategy

  // Configuration
  private rendererConfig: SchrodingerRendererConfig
  private shaderConfig: SchroedingerWGSLShaderConfig

  // Geometry
  private indexCount = 0

  // Draw statistics from last execute()
  private lastDrawStats: import('../core/types').WebGPUPassDrawStats = {
    calls: 0,
    triangles: 0,
    vertices: 0,
    lines: 0,
    points: 0,
  }

  // Quantum preset caching (like WebGL SchroedingerMesh)
  private cachedPreset: QuantumPreset | null = null
  private cachedPresetConfig: {
    presetName: string
    seed: number
    termCount: number
    maxQuantumNumber: number
    frequencySpread: number
    dimension: number
  } | null = null
  private flattenedPreset: {
    omega: Float32Array
    quantum: Int32Array
    coeff: Float32Array
    energy: Float32Array
  } | null = null

  // Auto-compensation factor for canonical HO normalization.
  // Multiplied into densityGain so canonical normalization produces
  // the same visual brightness as the old visual-damping normalization.
  private canonicalDensityCompensation = 1.0
  private cachedPeakDensity = 0.1

  // Dynamic bounding radius: physics-based sphere that contains all
  // visually significant wavefunction density. Updated per state change.
  private boundingRadius = 2.0

  // Pre-allocated staging buffers to avoid per-frame GC pressure
  // Schroedinger: 1456 bytes (364 floats) - includes domain + diverging color controls
  private schroedingerUniformData = new ArrayBuffer(SCHROEDINGER_UNIFORM_SIZE)
  private schroedingerFloatView = new Float32Array(this.schroedingerUniformData)
  private schroedingerIntView = new Int32Array(this.schroedingerUniformData)
  // Camera: 512 bytes (128 floats)
  private cameraUniformData = new Float32Array(128)
  // Basis: 192 bytes (48 floats)
  private basisUniformData = new Float32Array(48)
  // Lighting: 576 bytes (144 floats)
  private lightingUniformData = new Float32Array(144)
  // Material: 160 bytes (40 floats) - WGSL vec3f has 16-byte alignment
  private materialUniformData = new Float32Array(40)
  private materialDataView = new DataView(this.materialUniformData.buffer)
  // Quality: 48 bytes (12 floats)
  private qualityUniformData = new Float32Array(12)
  private qualityDataView = new DataView(this.qualityUniformData.buffer)
  // Time update: 4 bytes (1 float) - for dirty-flag optimization partial writes
  private timeUpdateBuffer = new Float32Array(1)
  // PERF: Pre-allocated clearValue objects to avoid per-frame object literal allocation
  private readonly clearValueTransparent = { r: 0, g: 0, b: 0, a: 0 }
  private readonly clearValueInvalidPos = { r: 0, g: 0, b: 0, a: -1 }
  // PERF: Pre-allocated DataView for camera uniform uint32 writes (avoids per-frame allocation)
  private cameraDataView = new DataView(this.cameraUniformData.buffer)

  // Temporal Bayer offset freeze: only advance when scene changes to prevent jitter
  private temporalBayerIndex = 0
  private prevTemporalAnimTime = Number.NaN
  private prevTemporalVPMatrix = new Float32Array(16)
  private completedTemporalCycle = false

  // Consolidated dirty-flag version tracking (see stateDiffing.ts)
  private versions: VersionTracker = createVersionTracker()

  // Time field offset in SchroedingerUniforms buffer (bytes)
  // Used for partial buffer writes when only time changes
  private static readonly TIME_FIELD_OFFSET = 908
  private static readonly BOUND_RADIUS_QUANT_STEP = 0.05
  private static readonly BOUND_RADIUS_REBUILD_THRESHOLD = 0.05

  constructor(config?: SchrodingerRendererConfig) {
    super({
      id: 'schroedinger',
      priority: 100,
      inputs: [],
      outputs: buildPipelineOutputs(config),
    })

    this.rendererConfig = applyModeOverrides(config)
    this.strategy = createModeStrategy(this.rendererConfig)
    this.shaderConfig = buildShaderConfig(this.rendererConfig)
    this.strategy.configureShader(this.shaderConfig, this.rendererConfig)
  }

  setDimension(dimension: number): void {
    if (this.rendererConfig.dimension === dimension) return
    this.rendererConfig.dimension = dimension
    this.shaderConfig.dimension = dimension
  }

  setQuantumMode(mode: QuantumModeForShader): void {
    if (this.rendererConfig.quantumMode === mode) return
    this.rendererConfig.quantumMode = mode
    this.shaderConfig.quantumMode = mode
  }

  protected async createPipeline(ctx: WebGPUSetupContext): Promise<void> {
    try {
      await this.createPipelineImpl(ctx)
    } catch (err) {
      // On ANY error, clear all static pipeline caches to prevent stale/bad entries
      // from persisting across rebuild attempts.
      logger.error('[SchrodingerRenderer] Pipeline creation failed, clearing all caches:', err)
      WebGPUSchrodingerRenderer.renderPipelineCache.clear()
      DensityGridComputePass.clearPipelineCache()
      EigenfunctionCacheComputePass.clearPipelineCache()
      throw err
    }
  }

  private async createPipelineImpl(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx
    // Force full uniform buffer writes on first frame after (re)initialization.
    resetVersionTracker(this.versions)

    const dim = this.rendererConfig.dimension ?? 3
    const isFreeScalar = this.rendererConfig.quantumMode === 'freeScalarField'
    const isTdse =
      this.rendererConfig.quantumMode === 'tdseDynamics' ||
      this.rendererConfig.quantumMode === 'becDynamics'
    const isDirac = this.rendererConfig.quantumMode === 'diracEquation'
    const isPauli = this.rendererConfig.isPauli === true
    const isComputeMode = isFreeScalar || isTdse || isDirac || isPauli
    // Compute-based modes require volumetric 3D rendering — override 2D pipeline
    const pipelineIs2D =
      !isComputeMode && (dim === 2 || this.rendererConfig.representation === 'wigner')
    // =====================================================================
    // Phase 1: Delegate compute pass creation to strategy
    // =====================================================================

    this.strategy.dispose()
    this.strategy = createModeStrategy(this.rendererConfig)
    const modeSetup = this.strategy.setup(ctx, this.rendererConfig)

    // =====================================================================
    // Phase 3: Render pipeline — check cache or start async compilation
    // =====================================================================

    const cacheKey = computePipelineCacheKey(this.shaderConfig, this.rendererConfig)
    const cachedPipeline = WebGPUSchrodingerRenderer.renderPipelineCache.get(cacheKey)

    if (import.meta.env.DEV) {
      console.log(
        `[SchrodingerRenderer] Pipeline ${cachedPipeline ? 'CACHE HIT' : 'CACHE MISS'} dim=${dim} key=${cacheKey}`
      )
    }

    // Always create bind group layouts (cheap, needed for bind groups regardless of cache)
    // Group 0: Camera
    const cameraBindGroupLayout = device.createBindGroupLayout({
      label: 'schroedinger-camera-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' as const },
        },
      ],
    })

    // Group 1: Combined (Lighting + Material + Quality)
    const combinedBindGroupLayout = device.createBindGroupLayout({
      label: 'schroedinger-combined-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Lighting
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Material
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Quality
      ],
    })

    // Group 2: Object (Schroedinger + Basis + strategy-provided entries)
    const objectBindGroupLayoutEntries: GPUBindGroupLayoutEntry[] = [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Schroedinger uniforms
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Basis vectors
      ...modeSetup.additionalLayoutEntries,
    ]
    const objectBindGroupLayout = device.createBindGroupLayout({
      label: 'schroedinger-object-bgl',
      entries: objectBindGroupLayoutEntries,
    })
    this.objectBindGroupLayout = objectBindGroupLayout

    let renderPipelinePromise: Promise<GPURenderPipeline> | null = null

    if (cachedPipeline) {
      // Cache hit — reuse compiled pipeline (skip shader composition + compilation)
      this.renderPipeline = cachedPipeline
      // LRU: move to end of map
      WebGPUSchrodingerRenderer.renderPipelineCache.delete(cacheKey)
      WebGPUSchrodingerRenderer.renderPipelineCache.set(cacheKey, cachedPipeline)
    } else {
      // Cache miss — compose shader and start async compilation
      const { wgsl: fragmentShader } = composeSchroedingerShader(this.shaderConfig)
      const vertexShader = pipelineIs2D
        ? composeSchroedingerVertexShader2D()
        : composeSchroedingerVertexShader()

      const vertexModule = this.createShaderModule(device, vertexShader, 'schroedinger-vertex')
      const fragmentModule = this.createShaderModule(
        device,
        fragmentShader,
        'schroedinger-fragment'
      )

      const pipelineLayout = device.createPipelineLayout({
        label: 'schroedinger-pipeline-layout',
        bindGroupLayouts: [cameraBindGroupLayout, combinedBindGroupLayout, objectBindGroupLayout],
      })

      // Start async compilation (non-blocking, runs in parallel with compute passes)
      renderPipelinePromise = device.createRenderPipelineAsync({
        label: 'schroedinger-pipeline',
        layout: pipelineLayout,
        vertex: {
          module: vertexModule,
          entryPoint: 'main',
          buffers: pipelineIs2D
            ? [] // 2D fullscreen triangle uses vertex_index, no vertex buffer
            : [
                {
                  arrayStride: 12, // 3 floats position
                  attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' as const }],
                },
              ],
        },
        fragment: {
          module: fragmentModule,
          entryPoint: 'fragmentMain',
          targets: pipelineIs2D
            ? [
                {
                  format: 'rgba16float' as GPUTextureFormat,
                  blend: {
                    color: {
                      srcFactor: 'src-alpha' as const,
                      dstFactor: 'one-minus-src-alpha' as const,
                      operation: 'add' as const,
                    },
                    alpha: {
                      srcFactor: 'one' as const,
                      dstFactor: 'one-minus-src-alpha' as const,
                      operation: 'add' as const,
                    },
                  },
                },
              ]
            : this.rendererConfig.temporal
              ? [
                  {
                    format: 'rgba16float' as GPUTextureFormat,
                    ...(this.rendererConfig.isosurface
                      ? {}
                      : {
                          blend: {
                            color: {
                              srcFactor: 'src-alpha' as const,
                              dstFactor: 'one-minus-src-alpha' as const,
                              operation: 'add' as const,
                            },
                            alpha: {
                              srcFactor: 'one' as const,
                              dstFactor: 'one-minus-src-alpha' as const,
                              operation: 'add' as const,
                            },
                          },
                        }),
                  },
                  {
                    format: 'rgba32float' as GPUTextureFormat,
                  },
                ]
              : this.rendererConfig.isosurface
                ? [{ format: 'rgba16float' as GPUTextureFormat }]
                : [
                    {
                      format: 'rgba16float' as GPUTextureFormat,
                      blend: {
                        color: {
                          srcFactor: 'src-alpha' as const,
                          dstFactor: 'one-minus-src-alpha' as const,
                          operation: 'add' as const,
                        },
                        alpha: {
                          srcFactor: 'one' as const,
                          dstFactor: 'one-minus-src-alpha' as const,
                          operation: 'add' as const,
                        },
                      },
                    },
                  ],
        },
        primitive: {
          topology: 'triangle-list' as const,
          cullMode: pipelineIs2D ? ('none' as const) : ('front' as const),
        },
        depthStencil: pipelineIs2D
          ? undefined
          : this.rendererConfig.temporal
            ? undefined
            : {
                format: 'depth24plus' as GPUTextureFormat,
                depthWriteEnabled: true,
                depthCompare: 'less' as GPUCompareFunction,
              },
      })
    }

    // =====================================================================
    // Phase 4: Wait for all pending compilations in parallel
    // =====================================================================

    const pendingWork: Promise<void>[] = [...modeSetup.initPromises]

    // Render pipeline compilation (cache miss only)
    if (renderPipelinePromise) {
      pendingWork.push(
        renderPipelinePromise.then((pipeline) => {
          this.renderPipeline = pipeline
          // Store in cache with LRU eviction
          if (
            WebGPUSchrodingerRenderer.renderPipelineCache.size >=
            WebGPUSchrodingerRenderer.MAX_CACHE_SIZE
          ) {
            const oldest = WebGPUSchrodingerRenderer.renderPipelineCache.keys().next().value!
            WebGPUSchrodingerRenderer.renderPipelineCache.delete(oldest)
          }
          WebGPUSchrodingerRenderer.renderPipelineCache.set(cacheKey, pipeline)
        })
      )
    }

    if (pendingWork.length > 0) {
      await Promise.all(pendingWork)
    }

    // Safety check: render pipeline must be valid after Phase 4
    if (!this.renderPipeline) {
      throw new Error(
        `[SchrodingerRenderer] Render pipeline is null after Phase 4 (dim=${dim}, cacheHit=${!!cachedPipeline})`
      )
    }

    if (import.meta.env.DEV) {
      console.log(`[SchrodingerRenderer] Phase 4 complete: pipeline=${!!this.renderPipeline}`)
    }

    // =====================================================================
    // Phase 5: Create uniform buffers, bind groups, geometry (always fresh)
    // These are per-instance and cheap to create (~1ms total).
    // =====================================================================

    // Destroy previous uniform buffers to prevent VRAM leaks on pipeline rebuild
    this.cameraUniformBuffer?.destroy()
    this.lightingUniformBuffer?.destroy()
    this.materialUniformBuffer?.destroy()
    this.qualityUniformBuffer?.destroy()
    this.schroedingerUniformBuffer?.destroy()
    this.basisUniformBuffer?.destroy()

    // Create uniform buffers
    // CameraUniforms: 7 mat4x4f (448) + vec3f+f32 (16) + 4×f32+vec2f (16) + 4×f32 (16) = 496 bytes, round to 512
    this.cameraUniformBuffer = this.createUniformBuffer(device, 512, 'schroedinger-camera')
    // LightingUniforms: 8×LightData (512) + vec3f+f32 (16) + i32+pad+vec3f (32) = 560 bytes, round to 576
    this.lightingUniformBuffer = this.createUniformBuffer(device, 576, 'schroedinger-lighting')
    // Material and Quality buffers for combined bind group
    // 160 bytes due to WGSL vec3f 16-byte alignment requirements
    this.materialUniformBuffer = this.createUniformBuffer(device, 160, 'schroedinger-material')
    this.qualityUniformBuffer = this.createUniformBuffer(device, 64, 'schroedinger-quality')
    // Schroedinger uniforms: 1344 bytes for all quantum parameters + momentum representation controls
    this.schroedingerUniformBuffer = this.createUniformBuffer(
      device,
      SCHROEDINGER_UNIFORM_SIZE,
      'schroedinger-uniforms'
    )
    this.basisUniformBuffer = this.createUniformBuffer(device, 192, 'schroedinger-basis')

    // Create bind groups - consolidated layout
    // Group 0: Camera
    this.cameraBindGroup = device.createBindGroup({
      label: 'schroedinger-camera-bg',
      layout: cameraBindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.cameraUniformBuffer } }],
    })

    // Group 1: Combined (Lighting + Material + Quality)
    this.lightingBindGroup = device.createBindGroup({
      label: 'schroedinger-combined-bg',
      layout: combinedBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.lightingUniformBuffer } },
        { binding: 1, resource: { buffer: this.materialUniformBuffer } },
        { binding: 2, resource: { buffer: this.qualityUniformBuffer } },
      ],
    })

    // Group 2: Object (Schroedinger + Basis + strategy-provided entries)
    // getBindGroupEntries() is called here (after await) because GPU resources
    // (density textures, cache buffers) may not exist until init completes.
    this.objectBindGroup = device.createBindGroup({
      label: 'schroedinger-object-bg',
      layout: objectBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.schroedingerUniformBuffer } },
        { binding: 1, resource: { buffer: this.basisUniformBuffer } },
        ...modeSetup.getBindGroupEntries(),
      ],
    })

    // Create bounding geometry (sphere for volume) — not needed for 2D fullscreen triangle
    if (!pipelineIs2D) {
      this.createBoundingGeometry(device)
    }
  }

  /**
   * Apply a new raw bounding radius with quantization and hysteresis.
   * Rebuilds bounding geometry only when the quantized radius shifts enough.
   */
  private applyBoundingRadius(rawBoundR: number): void {
    const quantStep = WebGPUSchrodingerRenderer.BOUND_RADIUS_QUANT_STEP
    const quantizedBoundR = Math.ceil(rawBoundR / quantStep) * quantStep
    if (
      Math.abs(quantizedBoundR - this.boundingRadius) >=
        WebGPUSchrodingerRenderer.BOUND_RADIUS_REBUILD_THRESHOLD &&
      this.device
    ) {
      this.boundingRadius = quantizedBoundR
      this.createBoundingGeometry(this.device)
    }
  }

  private createBoundingGeometry(device: GPUDevice): void {
    // Destroy previous geometry buffers to prevent VRAM leaks on bounding radius change
    this.vertexBuffer?.destroy()
    this.indexBuffer?.destroy()

    // Create a cube for volume raymarching sized to bounding radius
    const halfSize = this.boundingRadius

    // 8 vertices of a cube (each corner)
    // prettier-ignore
    const vertices = new Float32Array([
      // Front face
      -halfSize, -halfSize,  halfSize,
       halfSize, -halfSize,  halfSize,
       halfSize,  halfSize,  halfSize,
      -halfSize,  halfSize,  halfSize,
      // Back face
      -halfSize, -halfSize, -halfSize,
      -halfSize,  halfSize, -halfSize,
       halfSize,  halfSize, -halfSize,
       halfSize, -halfSize, -halfSize,
      // Top face
      -halfSize,  halfSize, -halfSize,
      -halfSize,  halfSize,  halfSize,
       halfSize,  halfSize,  halfSize,
       halfSize,  halfSize, -halfSize,
      // Bottom face
      -halfSize, -halfSize, -halfSize,
       halfSize, -halfSize, -halfSize,
       halfSize, -halfSize,  halfSize,
      -halfSize, -halfSize,  halfSize,
      // Right face
       halfSize, -halfSize, -halfSize,
       halfSize,  halfSize, -halfSize,
       halfSize,  halfSize,  halfSize,
       halfSize, -halfSize,  halfSize,
      // Left face
      -halfSize, -halfSize, -halfSize,
      -halfSize, -halfSize,  halfSize,
      -halfSize,  halfSize,  halfSize,
      -halfSize,  halfSize, -halfSize,
    ])

    // 6 faces × 2 triangles × 3 vertices = 36 indices
    // prettier-ignore
    const indices = new Uint16Array([
      0,  1,  2,    0,  2,  3,   // Front
      4,  5,  6,    4,  6,  7,   // Back
      8,  9,  10,   8,  10, 11,  // Top
      12, 13, 14,   12, 14, 15,  // Bottom
      16, 17, 18,   16, 18, 19,  // Right
      20, 21, 22,   20, 22, 23,  // Left
    ])

    const vertexData = vertices
    const indexData = indices

    this.vertexBuffer = device.createBuffer({
      label: 'schroedinger-vertices',
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(this.vertexBuffer, 0, vertexData)

    this.indexBuffer = device.createBuffer({
      label: 'schroedinger-indices',
      size: indexData.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    })
    device.queue.writeBuffer(this.indexBuffer, 0, indexData)

    this.indexCount = indices.length
  }

  updateCameraUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.cameraUniformBuffer) return

    const camera = getStoreSnapshot<CameraSnapshot>(ctx, 'camera')
    if (!camera) return

    const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
    const animationTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0
    const is2D =
      (this.rendererConfig.dimension ?? 3) === 2 || this.rendererConfig.representation === 'wigner'

    // Temporal Bayer offset: advance only when scene content changes
    const animTimeChanged = animationTime !== this.prevTemporalAnimTime
    let cameraChanged = false
    if (camera.viewProjectionMatrix?.elements) {
      const vpElems = camera.viewProjectionMatrix.elements
      for (let i = 0; i < 16; i++) {
        if (vpElems[i] !== this.prevTemporalVPMatrix[i]) {
          cameraChanged = true
          break
        }
      }
      this.prevTemporalVPMatrix.set(vpElems)
    }
    const sceneChanged = animTimeChanged || cameraChanged

    if (sceneChanged) {
      this.temporalBayerIndex = (this.temporalBayerIndex + 1) % 4
      this.completedTemporalCycle = false
    } else if (!this.completedTemporalCycle) {
      const nextIndex = (this.temporalBayerIndex + 1) % 4
      this.temporalBayerIndex = nextIndex
      if (nextIndex === 0) {
        this.completedTemporalCycle = true
      }
    }
    this.prevTemporalAnimTime = animationTime

    const transform = is2D ? undefined : getStoreSnapshot<TransformSnapshot>(ctx, 'transform')

    packCameraUniforms(this.cameraUniformData, this.cameraDataView, {
      camera,
      animationTime,
      is2D,
      transform,
      bayerOffset: BAYER_OFFSETS[this.temporalBayerIndex]!,
      size: ctx.size,
      frameDelta: ctx.frame?.delta || 0.016,
      frameNumber: ctx.frame?.frameNumber || 0,
    })

    this.writeUniformBuffer(this.device, this.cameraUniformBuffer, this.cameraUniformData)
  }

  updateSchroedingerUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.schroedingerUniformBuffer) return

    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const schroedinger = extended?.schroedinger
    const schroedingerVersion = extended?.schroedingerVersion ?? 0
    const pbr = getStoreSnapshot<PBRSliceState>(ctx, 'pbr')
    const appearance = getStoreSnapshot<AppearanceStoreState>(ctx, 'appearance')
    const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
    const animationTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0

    const uncertaintyConfidenceMass = schroedinger?.uncertaintyConfidenceMass ?? 0.68
    const uncertaintyBoundaryWidth = schroedinger?.uncertaintyBoundaryWidth ?? 0.3
    let uncertaintyLogRhoThreshold = -2.0
    if (this.strategy.setUncertaintyConfidenceMass) {
      const threshold = this.strategy.setUncertaintyConfidenceMass(uncertaintyConfidenceMass)
      if (threshold !== null) {
        uncertaintyLogRhoThreshold = threshold
      }
    }

    // === DIRTY-FLAG OPTIMIZATION ===
    const storeVersions = {
      schroedingerVersion,
      appearanceVersion: appearance?.appearanceVersion ?? 0,
      pbrVersion: pbr?.pbrVersion ?? 0,
      pauliSpinorVersion: extended?.pauliSpinorVersion ?? 0,
    }

    if (!isSchroedingerDirty(this.versions, storeVersions)) {
      // Partial buffer write: only time + uncertainty threshold
      this.timeUpdateBuffer[0] = animationTime
      this.device.queue.writeBuffer(
        this.schroedingerUniformBuffer,
        WebGPUSchrodingerRenderer.TIME_FIELD_OFFSET,
        this.timeUpdateBuffer
      )
      this.timeUpdateBuffer[0] = uncertaintyLogRhoThreshold
      this.device.queue.writeBuffer(this.schroedingerUniformBuffer, 1180, this.timeUpdateBuffer)
      return
    }

    updateSchroedingerVersions(this.versions, storeVersions)

    const geometry = getStoreSnapshot<GeometryState>(ctx, 'geometry')
    const dimension = geometry?.dimension ?? this.rendererConfig.dimension ?? 3
    const quantumModeStr = schroedinger?.quantumMode ?? 'harmonicOscillator'
    const quantumModeInt = QUANTUM_MODE_MAP[quantumModeStr] ?? 0
    const isUniformComputeMode =
      quantumModeStr === 'freeScalarField' ||
      quantumModeStr === 'tdseDynamics' ||
      quantumModeStr === 'becDynamics' ||
      quantumModeStr === 'diracEquation'

    // --- Quantum preset generation ---
    const needsPresetRegen = this.maybeRegeneratePreset(schroedinger, dimension)

    // --- Momentum scale ---
    const isPSpace = schroedinger?.momentumDisplayUnits === 'p'
    const hbar = isPSpace ? Math.max(schroedinger?.momentumHbar ?? 1.0, 1e-4) : 1.0
    const effectiveMomentumScale = (schroedinger?.momentumScale ?? 1.0) / hbar

    // --- Bounding radius ---
    this.updateBoundingRadiusFromState(
      schroedinger,
      extended,
      dimension,
      quantumModeStr,
      isUniformComputeMode,
      effectiveMomentumScale
    )

    // --- Canonical compensation ---
    if (this.strategy.isComputeMode) {
      this.canonicalDensityCompensation = 1.0
      this.cachedPeakDensity = 1.0
    } else if (needsPresetRegen && this.cachedPreset) {
      const result = computeCanonicalCompensation(this.cachedPreset, dimension, this.boundingRadius)
      this.canonicalDensityCompensation = result.compensation
      this.cachedPeakDensity = result.peakDensity
    }

    // --- Derived values for packing ---
    const performance = getStoreSnapshot<PerformanceSnapshot>(ctx, 'performance')
    const qualityMultiplier = performance?.qualityMultiplier ?? 1.0
    const fastMode = qualityMultiplier < 0.75
    const defaultSampleCount = fastMode ? 32 : 64
    const baseSampleCount = schroedinger?.sampleCount ?? defaultSampleCount
    const radiusScale = this.boundingRadius / 2.0
    const effectiveSampleCount = Math.min(Math.max(8, Math.ceil(baseSampleCount * radiusScale)), 96)

    const colorAlgorithm =
      this.rendererConfig.colorAlgorithm ??
      COLOR_ALGORITHM_MAP[appearance?.colorAlgorithm ?? 'radialDistance'] ??
      11

    const isDensityMatrixMode = this.rendererConfig.openQuantumEnabled ?? false

    // --- Pack uniform buffer ---
    packSchroedingerUniforms(this.schroedingerFloatView, this.schroedingerIntView, {
      quantumModeInt,
      quantumModeStr,
      isUniformComputeMode,
      isDensityMatrixMode,
      dimension,
      presetTermCount: this.cachedPreset?.termCount ?? 1,
      presetData: this.flattenedPreset,
      boundingRadius: this.boundingRadius,
      canonicalDensityCompensation: this.canonicalDensityCompensation,
      cachedPeakDensity: this.cachedPeakDensity,
      colorAlgorithm,
      effectiveSampleCount,
      effectiveMomentumScale,
      hbar,
      animationTime,
      uncertaintyLogRhoThreshold,
      uncertaintyConfidenceMass,
      uncertaintyBoundaryWidth,
      schroedinger,
      appearance,
      pbr,
      pauliSpinor: extended?.pauliSpinor,
      rendererOpenQuantumEnabled: this.rendererConfig.openQuantumEnabled ?? false,
      rendererQuantumMode: this.rendererConfig.quantumMode ?? 'harmonicOscillator',
      rendererTermCount: this.rendererConfig.termCount,
    })

    // HO momentum transform (in-place on already-packed buffer)
    const isHOMomentum =
      !isUniformComputeMode &&
      schroedinger?.representation === 'momentum' &&
      quantumModeStr !== 'hydrogenND'
    if (isHOMomentum) {
      applyHOMomentumTransform(
        this.schroedingerFloatView,
        this.schroedingerIntView,
        dimension,
        hbar
      )
    }

    this.writeUniformBuffer(this.device, this.schroedingerUniformBuffer, this.schroedingerFloatView)
  }

  /** Check if quantum preset needs regeneration, and regenerate if so. Returns whether it did. */
  private maybeRegeneratePreset(
    schroedinger: Partial<import('@/lib/geometry/extended/types').SchroedingerConfig> | undefined,
    dimension: number
  ): boolean {
    const presetName = schroedinger?.presetName ?? 'custom'
    const seed = schroedinger?.seed ?? 42
    const termCount = schroedinger?.termCount ?? 1
    const maxQuantumNumber = schroedinger?.maxQuantumNumber ?? 6
    const frequencySpread = schroedinger?.frequencySpread ?? 0.01
    const currentConfig = {
      presetName,
      seed,
      termCount,
      maxQuantumNumber,
      frequencySpread,
      dimension,
    }

    const frequencySpreadChanged =
      !this.cachedPresetConfig ||
      Math.abs(this.cachedPresetConfig.frequencySpread - currentConfig.frequencySpread) > 1e-6
    const needsRegen =
      !this.cachedPresetConfig ||
      this.cachedPresetConfig.presetName !== currentConfig.presetName ||
      this.cachedPresetConfig.seed !== currentConfig.seed ||
      this.cachedPresetConfig.termCount !== currentConfig.termCount ||
      this.cachedPresetConfig.maxQuantumNumber !== currentConfig.maxQuantumNumber ||
      frequencySpreadChanged ||
      this.cachedPresetConfig.dimension !== currentConfig.dimension

    if (!needsRegen) return false

    let preset: QuantumPreset
    if (presetName === 'custom') {
      preset = generateQuantumPreset(seed, dimension, termCount, maxQuantumNumber, frequencySpread)
    } else {
      preset =
        getNamedPreset(presetName, dimension) ??
        generateQuantumPreset(seed, dimension, termCount, maxQuantumNumber, frequencySpread)
    }
    this.cachedPreset = preset
    this.cachedPresetConfig = { ...currentConfig }
    this.flattenedPreset = flattenPresetForUniforms(preset)
    this.strategy.resetOpenQuantumState?.()
    return true
  }

  /** Compute and apply bounding radius from strategy, Pauli config, or analytic formula. */
  private updateBoundingRadiusFromState(
    schroedinger: Partial<import('@/lib/geometry/extended/types').SchroedingerConfig> | undefined,
    extended: ExtendedStoreSnapshot | undefined,
    dimension: number,
    quantumModeStr: string,
    isUniformComputeMode: boolean,
    effectiveMomentumScale: number
  ): void {
    const strategyBoundR = this.strategy.computeBoundingRadius(
      (schroedinger as import('./strategies/types').SchroedingerSnapshot) ?? {},
      dimension,
      this.rendererConfig
    )

    if (strategyBoundR === null && this.rendererConfig.isPauli) {
      const pauliCfg = extended?.pauliSpinor
      if (pauliCfg) {
        this.applyBoundingRadius(
          computeLatticeBoundingRadius(
            pauliCfg.latticeDim ?? 3,
            pauliCfg.gridSize ?? [64],
            pauliCfg.spacing ?? [0.15]
          )
        )
      }
    } else if (strategyBoundR !== null) {
      this.applyBoundingRadius(strategyBoundR)
    } else if (this.cachedPreset) {
      const oqCfg = schroedinger?.openQuantum
      const effectiveN =
        this.rendererConfig.openQuantumEnabled && oqCfg?.enabled && quantumModeStr === 'hydrogenND'
          ? Math.max(schroedinger?.principalQuantumNumber ?? 2, oqCfg.hydrogenBasisMaxN ?? 2)
          : (schroedinger?.principalQuantumNumber ?? 2)
      const rawBoundR = computeBoundingRadius(
        quantumModeStr,
        this.cachedPreset,
        dimension,
        effectiveN,
        schroedinger?.bohrRadiusScale ?? 1.0,
        schroedinger?.extraDimQuantumNumbers as number[] | undefined,
        schroedinger?.extraDimOmega as number[] | undefined,
        !isUniformComputeMode && schroedinger?.representation === 'momentum'
          ? 'momentum'
          : 'position',
        effectiveMomentumScale
      )
      const fieldScale = schroedinger?.fieldScale ?? 1.0
      this.applyBoundingRadius(rawBoundR / Math.max(fieldScale, 1e-4))
    }
  }

  updateBasisVectors(ctx: WebGPURenderContext): void {
    if (!this.device || !this.basisUniformBuffer) return

    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const schroedinger = extended?.schroedinger
    const schroedingerVersion = extended?.schroedingerVersion ?? 0
    const rotation = getStoreSnapshot<RotationState>(ctx, 'rotation')
    const rotationVersion = rotation?.version ?? 0
    const geometry = getStoreSnapshot<GeometryState>(ctx, 'geometry')
    const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
    const accumulatedTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0
    const dimension = geometry?.dimension ?? this.rendererConfig.dimension ?? 4

    const sliceAnimationEnabled = schroedinger?.sliceAnimationEnabled ?? false
    const sliceSpeed = schroedinger?.sliceSpeed ?? 0.02
    const sliceAmplitude = schroedinger?.sliceAmplitude ?? 0.3
    const requiresTimeDrivenBasis = sliceAnimationEnabled && dimension > 3

    const basisVersions = {
      rotationVersion,
      schroedingerVersion,
      dimension,
      accumulatedTime,
      requiresTimeDrivenBasis,
    }

    if (!isBasisDirty(this.versions, basisVersions)) return

    packBasisVectors(this.basisUniformData, {
      dimension,
      basisX: schroedinger?.basisX as Float32Array | undefined,
      basisY: schroedinger?.basisY as Float32Array | undefined,
      basisZ: schroedinger?.basisZ as Float32Array | undefined,
      origin: schroedinger?.origin as Float32Array | undefined,
      sliceAnimationEnabled,
      sliceSpeed,
      sliceAmplitude,
      accumulatedTime,
    })

    this.writeUniformBuffer(this.device, this.basisUniformBuffer, this.basisUniformData)
    updateBasisVersions(this.versions, basisVersions)
  }

  /**
   * Update lighting uniforms from lightingStore.
   * @param ctx
   */
  updateLightingUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.lightingUniformBuffer) return

    const lighting = getStoreSnapshot<LightingSnapshot>(ctx, 'lighting')
    if (!lighting) return
    const lightingVersion = lighting?.version ?? 0
    if (lightingVersion === this.versions.lastLightingVersion) return
    this.versions.lastLightingVersion = lightingVersion

    const data = this.lightingUniformData
    packLightingUniforms(data, lighting)

    this.writeUniformBuffer(this.device, this.lightingUniformBuffer, data)
  }

  updateMaterialUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.materialUniformBuffer) return

    const pbr = getStoreSnapshot<PBRSliceState>(ctx, 'pbr')
    const appearance = getStoreSnapshot<AppearanceStoreState>(ctx, 'appearance')

    packMaterialUniforms(this.materialUniformData, this.materialDataView, {
      appearance,
      pbr,
    })

    this.writeUniformBuffer(this.device, this.materialUniformBuffer, this.materialUniformData)
  }

  updateQualityUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.qualityUniformBuffer) return

    const performance = getStoreSnapshot<PerformanceSnapshot>(ctx, 'performance')
    const qualityMultiplier = performance?.qualityMultiplier ?? 1.0

    const qualitySignature = qualityMultiplier.toFixed(4)
    if (qualitySignature === this.versions.lastQualitySignature) return
    this.versions.lastQualitySignature = qualitySignature

    packQualityUniforms(this.qualityUniformData, this.qualityDataView, qualityMultiplier)

    this.writeUniformBuffer(this.device, this.qualityUniformBuffer, this.qualityUniformData)
  }

  private executeNullGuardWarned = false

  execute(ctx: WebGPURenderContext): void {
    const is2D =
      (this.rendererConfig.dimension ?? 3) === 2 || this.rendererConfig.representation === 'wigner'

    // Guard: 2D mode doesn't use vertex/index buffers
    if (
      !this.device ||
      !this.renderPipeline ||
      !this.cameraBindGroup ||
      !this.lightingBindGroup ||
      !this.objectBindGroup
    ) {
      if (!this.executeNullGuardWarned) {
        this.executeNullGuardWarned = true
        logger.warn(
          `[SchrodingerRenderer] execute() skipped — null resources:`,
          `device=${!!this.device} pipeline=${!!this.renderPipeline}`,
          `camera=${!!this.cameraBindGroup} lighting=${!!this.lightingBindGroup}`,
          `object=${!!this.objectBindGroup}`
        )
      }
      return
    }
    // 3D mode additionally requires vertex/index buffers
    if (!is2D && (!this.vertexBuffer || !this.indexBuffer)) {
      return
    }

    // ============================================
    // DIRTY-FLAG OPTIMIZATION: Only update changed uniform categories
    // ============================================
    // Get store versions for dirty checking
    const appearance = getStoreSnapshot<AppearanceStoreState>(ctx, 'appearance')
    const pbr = getStoreSnapshot<PBRSliceState>(ctx, 'pbr')
    const appearanceVersion = appearance?.appearanceVersion ?? 0
    const pbrVersion = pbr?.pbrVersion ?? 0

    // ALWAYS update: Camera (mouse movement) and Basis (rotation animation)
    this.updateCameraUniforms(ctx)
    this.updateBasisVectors(ctx)

    // ALWAYS update: Schroedinger uniforms contain time-dependent data (animationTime)
    // Internal preset regeneration caching uses schroedingerVersion within updateSchroedingerUniforms()
    // but the buffer write must happen each frame for animation to work
    this.updateSchroedingerUniforms(ctx)

    // CONDITIONAL: Lighting uniforms - update only when lighting.version changes
    this.updateLightingUniforms(ctx)

    // CONDITIONAL: Material uniforms - depends on appearance/PBR versions
    if (
      appearanceVersion !== this.versions.lastAppearanceVersion ||
      pbrVersion !== this.versions.lastPbrVersion
    ) {
      this.updateMaterialUniforms(ctx)
      this.versions.lastAppearanceVersion = appearanceVersion
      this.versions.lastPbrVersion = pbrVersion
    }

    // ALWAYS update: Quality (cheap, needed for fast/slow toggle responsiveness)
    this.updateQualityUniforms(ctx)

    // ============================================
    // MODE-SPECIFIC COMPUTE PHASE (delegated to strategy)
    // ============================================
    const colorAlgorithm =
      this.rendererConfig.colorAlgorithm ??
      COLOR_ALGORITHM_MAP[appearance?.colorAlgorithm ?? 'radialDistance'] ??
      11

    const frameContext: ModeFrameContext = {
      device: this.device,
      rendererConfig: this.rendererConfig,
      schroedingerUniformData: this.schroedingerUniformData,
      basisUniformData: this.basisUniformData,
      schroedingerFloatView: this.schroedingerFloatView,
      schroedingerIntView: this.schroedingerIntView,
      boundingRadius: this.boundingRadius,
      colorAlgorithm,
      cachedPreset: this.cachedPreset
        ? {
            preset: this.cachedPreset,
            config: this.cachedPresetConfig,
          }
        : null,
      rebuildObjectBindGroup: (additionalEntries) => {
        if (
          this.objectBindGroupLayout &&
          this.schroedingerUniformBuffer &&
          this.basisUniformBuffer
        ) {
          this.objectBindGroup = this.device!.createBindGroup({
            label: 'schroedinger-object-bg',
            layout: this.objectBindGroupLayout,
            entries: [
              { binding: 0, resource: { buffer: this.schroedingerUniformBuffer } },
              { binding: 1, resource: { buffer: this.basisUniformBuffer } },
              ...additionalEntries,
            ],
          })
        }
      },
    }
    this.strategy.executeFrame(ctx, frameContext)

    // ============================================
    // RENDER TARGET SETUP
    // ============================================
    if (is2D) {
      // 2D mode: only color output, no depth, no MRT
      const colorView = ctx.getWriteTarget('object-color')
      if (!colorView) {
        logger.warn('[WebGPU Schrödinger] Missing color render target for 2D')
        return
      }

      const passEncoder = ctx.beginRenderPass({
        label: 'schroedinger-render-2d',
        colorAttachments: [
          {
            view: colorView,
            loadOp: 'clear' as const,
            storeOp: 'store' as const,
            clearValue: this.clearValueTransparent,
          },
        ],
      })

      passEncoder.setPipeline(this.renderPipeline)
      passEncoder.setBindGroup(0, this.cameraBindGroup)
      passEncoder.setBindGroup(1, this.lightingBindGroup)
      passEncoder.setBindGroup(2, this.objectBindGroup)

      // Fullscreen triangle — 3 vertices from vertex_index, no vertex/index buffers
      passEncoder.draw(3)
      passEncoder.end()

      this.lastDrawStats = {
        calls: 1,
        triangles: 1,
        vertices: 3,
        lines: 0,
        points: 0,
      }
      return
    }

    // ============================================
    // 3D RENDER PATH (existing logic)
    // ============================================
    // Get render targets based on mode:
    // - Temporal (volumetric or isosurface): quarter-color + quarter-position (no depth)
    // - Isosurface/standard volumetric (non-temporal): object-color + depth-buffer
    const isTemporal = !!this.rendererConfig.temporal

    // Color output target
    const colorView = isTemporal
      ? ctx.getWriteTarget('quarter-color')
      : ctx.getWriteTarget('object-color')

    // Depth buffer - only needed for non-temporal modes.
    // Temporal mode renders to quarter-res without depth testing and is composited later.
    const depthView = isTemporal ? null : ctx.getWriteTarget('depth-buffer')

    if (!colorView) {
      logger.warn(
        `[WebGPU Schrödinger] Missing color render target (temporal=${isTemporal}, target=${isTemporal ? 'quarter-color' : 'object-color'})`
      )
      return
    }

    if (!isTemporal && !depthView) {
      logger.warn('[WebGPU Schrödinger] Missing depth buffer for non-temporal mode')
      return
    }

    // Secondary MRT output is only used by temporal accumulation.
    const secondaryView = isTemporal ? ctx.getWriteTarget('quarter-position') : null

    if (isTemporal && !secondaryView) {
      logger.warn('[WebGPU Schrödinger] Temporal mode requires quarter-position target')
      return
    }

    // Build color attachments - MRT for temporal, single target otherwise.
    // Use alpha=0 clear value for proper compositing (transparent where nothing rendered)
    // PERF: Use pre-allocated clearValue objects to avoid per-frame literal allocation
    const colorAttachments: GPURenderPassColorAttachment[] = [
      {
        view: colorView,
        loadOp: 'clear' as const,
        storeOp: 'store' as const,
        clearValue: this.clearValueTransparent,
      },
    ]

    // Add secondary MRT attachment for temporal mode.
    if (isTemporal && secondaryView) {
      // Temporal mode (volumetric or isosurface): world position buffer
      colorAttachments.push({
        view: secondaryView,
        loadOp: 'clear' as const,
        storeOp: 'store' as const,
        clearValue: this.clearValueInvalidPos, // Invalid position (a < 0 means no hit)
      })
    }

    // Begin render pass - depth buffer only for non-temporal modes.
    // Temporal mode renders to quarter-res without depth testing.
    const passEncoder = ctx.beginRenderPass({
      label: 'schroedinger-render',
      colorAttachments,
      depthStencilAttachment: depthView
        ? {
            view: depthView,
            depthLoadOp: 'clear' as const,
            depthStoreOp: 'store' as const,
            depthClearValue: 1.0,
          }
        : undefined,
    })

    // Set pipeline and bind groups - consolidated layout
    // Group 0: Camera
    // Group 1: Combined (Lighting + Material + Quality)
    // Group 2: Object (Schroedinger + Basis)
    passEncoder.setPipeline(this.renderPipeline)
    passEncoder.setBindGroup(0, this.cameraBindGroup)
    passEncoder.setBindGroup(1, this.lightingBindGroup) // Combined
    passEncoder.setBindGroup(2, this.objectBindGroup)

    passEncoder.setVertexBuffer(0, this.vertexBuffer!)
    passEncoder.setIndexBuffer(this.indexBuffer!, 'uint16' as const)
    passEncoder.drawIndexed(this.indexCount)

    passEncoder.end()

    // Update draw statistics (fullscreen quad = 2 triangles)
    this.lastDrawStats = {
      calls: 1,
      triangles: Math.floor(this.indexCount / 3),
      vertices: this.indexCount,
      lines: 0,
      points: 0,
    }
  }

  /**
   * Get draw statistics from the last execute() call.
   */
  getDrawStats(): import('../core/types').WebGPUPassDrawStats {
    return this.lastDrawStats
  }

  dispose(): void {
    // Dispose mode-specific compute passes and state
    this.strategy.dispose()

    this.vertexBuffer?.destroy()
    this.indexBuffer?.destroy()
    this.cameraUniformBuffer?.destroy()
    this.lightingUniformBuffer?.destroy()
    this.materialUniformBuffer?.destroy()
    this.qualityUniformBuffer?.destroy()
    this.schroedingerUniformBuffer?.destroy()
    this.basisUniformBuffer?.destroy()

    this.vertexBuffer = null
    this.indexBuffer = null
    this.cameraUniformBuffer = null
    this.lightingUniformBuffer = null
    this.materialUniformBuffer = null
    this.qualityUniformBuffer = null
    this.schroedingerUniformBuffer = null
    this.basisUniformBuffer = null

    super.dispose()
  }
}
