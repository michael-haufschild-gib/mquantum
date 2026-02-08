/**
 * WebGPU Schrödinger Renderer
 *
 * Renders N-dimensional quantum wavefunctions using WebGPU volume raymarching.
 * Supports harmonic oscillator and hydrogen ND modes.
 *
 * @module rendering/webgpu/renderers/WebGPUSchrodingerRenderer
 */

import { WebGPUBasePass } from '../core/WebGPUBasePass'
import type { WebGPURenderContext, WebGPUSetupContext } from '../core/types'
import {
  composeSchroedingerShader,
  composeSchroedingerVertexShader,
  type SchroedingerWGSLShaderConfig,
  type QuantumModeForShader,
} from '../shaders/schroedinger/compose'
import type { ColorAlgorithm as WGSLColorAlgorithm } from '../shaders/types'
import { MAX_DIM, MAX_TERMS, MAX_EXTRA_DIM } from '../shaders/schroedinger/uniforms.wgsl'
import {
  generateQuantumPreset,
  getNamedPreset,
  flattenPresetForUniforms,
  type QuantumPreset,
} from '@/lib/geometry/extended/schroedinger/presets'
import { computeBoundingRadius } from '@/lib/geometry/extended/schroedinger/boundingRadius'
import { computeRadialProbabilityNorm } from '@/lib/math/hydrogenRadialProbability'
import { DensityGridComputePass } from '../passes/DensityGridComputePass'
import { EigenfunctionCacheComputePass } from '../passes/EigenfunctionCacheComputePass'
import { parseHexColorToLinearRgb } from '../utils/color'
import { packLightingUniforms } from '../utils/lighting'

/** Bayer pattern offsets for 4-frame temporal jitter cycle */
const BAYER_OFFSETS: [number, number][] = [
  [0, 0],
  [1, 1],
  [1, 0],
  [0, 1],
]

const SCHROEDINGER_UNIFORM_SIZE = 1376

// PERF: Module-level string→int lookup maps (avoids recreating per-update)
const QUANTUM_MODE_MAP: Record<string, number> = {
  harmonicOscillator: 0,
  hydrogenND: 1,
}
const COLOR_ALGORITHM_MAP: Record<string, number> = {
  monochromatic: 0,
  analogous: 1,
  cosine: 2,
  normal: 3,
  distance: 4,
  lch: 5,
  multiSource: 6,
  radial: 7,
  phase: 8,
  mixed: 9,
  blackbody: 10,
}
const NODAL_DEFINITION_MAP: Record<string, number> = {
  psiAbs: 0,
  realPart: 1,
  imagPart: 2,
  complexIntersection: 3,
}
const NODAL_FAMILY_MAP: Record<string, number> = {
  all: 0,
  radial: 1,
  angular: 2,
}
const NODAL_RENDER_MODE_MAP: Record<string, number> = {
  band: 0,
  surface: 1,
}
const CROSS_SECTION_COMPOSITE_MODE_MAP: Record<string, number> = {
  overlay: 0,
  sliceOnly: 1,
}
const CROSS_SECTION_SCALAR_MAP: Record<string, number> = {
  density: 0,
  real: 1,
  imag: 2,
}
const PROBABILITY_CURRENT_STYLE_MAP: Record<string, number> = {
  magnitude: 0,
  arrows: 1,
  surfaceLIC: 2,
  streamlines: 3,
}
const PROBABILITY_CURRENT_PLACEMENT_MAP: Record<string, number> = {
  isosurface: 0,
  volume: 1,
}
const PROBABILITY_CURRENT_COLOR_MODE_MAP: Record<string, number> = {
  magnitude: 0,
  direction: 1,
  circulationSign: 2,
}
const REPRESENTATION_MODE_MAP: Record<string, number> = {
  position: 0,
  momentum: 1,
}
const MOMENTUM_DISPLAY_MODE_MAP: Record<string, number> = {
  normalized: 0,
  k: 1,
  p: 2,
}

export interface SchrodingerRendererConfig {
  dimension?: number
  isosurface?: boolean
  quantumMode?: QuantumModeForShader
  termCount?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  /** Compile-time color module selection (0-10) */
  colorAlgorithm?: WGSLColorAlgorithm
  /** Enable temporal accumulation for volumetric mode */
  temporal?: boolean
  /** Compile-time specialization flag for nodal calculations. */
  nodalEnabled?: boolean
  /** Compile-time specialization flag for phase materiality. */
  phaseMaterialityEnabled?: boolean
  /** Compile-time specialization flag for interference. */
  interferenceEnabled?: boolean
  /** Compile-time specialization flag for uncertainty boundary emphasis. */
  uncertaintyBoundaryEnabled?: boolean
  /** Whether eigenfunction caching is enabled (compile-time shader specialization). */
  eigenfunctionCacheEnabled?: boolean
  /** Wavefunction representation — triggers pipeline rebuild when changed.
   *  HO momentum uses CPU uniform transform; hydrogen momentum uses shader path. */
  representation?: 'position' | 'momentum'
}

/**
 * WebGPU renderer for quantum wavefunctions.
 */
export class WebGPUSchrodingerRenderer extends WebGPUBasePass {
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

  // Density Grid Compute Pass (for uncertainty boundary threshold extraction + grid raymarching)
  private densityGridPass: DensityGridComputePass | null = null
  private densityGridInitialized = false
  private densityGridSampler: GPUSampler | null = null

  // Eigenfunction Cache Compute Pass (HO mode acceleration)
  private eigenCachePass: EigenfunctionCacheComputePass | null = null
  private eigenCacheInitialized = false

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
  // Schroedinger: 1344 bytes (336 floats) - includes representation + momentum controls
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
  private readonly clearValueNormal = { r: 0.5, g: 0.5, b: 1, a: 0 }
  private readonly clearValueInvalidPos = { r: 0, g: 0, b: 0, a: -1 }
  // PERF: Pre-allocated DataView for camera uniform uint32 writes (avoids per-frame allocation)
  private cameraDataView = new DataView(this.cameraUniformData.buffer)

  // Temporal Bayer offset freeze: only advance when scene changes to prevent jitter
  private temporalBayerIndex = 0
  private prevTemporalAnimTime = Number.NaN
  private prevTemporalVPMatrix = new Float32Array(16)
  private completedTemporalCycle = false

  // Dirty-flag version tracking - skip uniform updates when unchanged
  // Schroedinger uses partial buffer writes: only time field (4 bytes) when settings unchanged
  private lastSchroedingerVersion = -1
  private lastLightingVersion = -1
  private lastAppearanceVersion = -1
  private lastQualitySignature = ''
  private lastBasisRotationVersion = -1
  private lastBasisSchroedingerVersion = -1
  private lastBasisDimension = -1
  private lastBasisAnimationTime = Number.NaN
  private lastPbrVersion = -1
  // Separate appearance version tracker for the Schroedinger uniform buffer.
  // Emission/Rim parameters are sourced from the appearance store (matching WebGL),
  // so the Schroedinger buffer must also be updated when appearance changes.
  private lastSchrodingerAppearanceVersion = -1
  // Schroedinger uniforms also read roughness from the PBR store; keep this
  // version so buffer updates are not skipped when only PBR changes.
  private lastSchrodingerPbrVersion = -1

  // Time field offset in SchroedingerUniforms buffer (bytes)
  // Used for partial buffer writes when only time changes
  private static readonly TIME_FIELD_OFFSET = 908
  private static readonly BOUND_RADIUS_QUANT_STEP = 0.05
  private static readonly BOUND_RADIUS_REBUILD_THRESHOLD = 0.05

  constructor(config?: SchrodingerRendererConfig) {
    // Determine outputs based on mode
    // Write to 'object-color' like other renderers (Mandelbulb, Julia, Polytope)
    // EnvironmentCompositePass will composite object-color over environment to produce hdr-color
    // Isosurface mode uses MRT (color + normal + depth) like Mandelbulb
    // Volumetric mode uses color + depth (alpha blending handled by EnvironmentCompositePass)
    // Temporal mode uses quarter-res outputs that get accumulated by WebGPUTemporalCloudPass
    // Temporal takes priority: isosurface+temporal uses quarter-res (no normal/depth buffer)
    const isIsosurface = config?.isosurface ?? false
    const isTemporal = config?.temporal ?? false
    const outputs = isTemporal
      ? [
          // Temporal mode (volumetric or isosurface): quarter-res color + position for temporal accumulation
          // No depth buffer needed - all targets are quarter-res, composited in environment pass
          { resourceId: 'quarter-color', access: 'write' as const, binding: 0 },
          { resourceId: 'quarter-position', access: 'write' as const, binding: 1 },
        ]
      : isIsosurface
        ? [
            { resourceId: 'object-color', access: 'write' as const, binding: 0 },
            { resourceId: 'normal-buffer', access: 'write' as const, binding: 1 },
            { resourceId: 'depth-buffer', access: 'write' as const, binding: 2 },
          ]
        : [
            { resourceId: 'object-color', access: 'write' as const, binding: 0 },
            { resourceId: 'depth-buffer', access: 'write' as const, binding: 1 },
          ]

    super({
      id: 'schroedinger',
      priority: 100,
      inputs: [],
      outputs,
    })

    this.rendererConfig = {
      dimension: 3,
      isosurface: false,
      quantumMode: 'harmonicOscillator',
      temporal: false,
      nodalEnabled: true,
      phaseMaterialityEnabled: true,
      interferenceEnabled: true,
      uncertaintyBoundaryEnabled: true,
      ...config,
    }

    const enableCache = this.rendererConfig.eigenfunctionCacheEnabled ?? true

    // Density grid raymarching: only for 3D hydrogen mode.
    // For hydrogen ND (dim > 3), the 64^3 grid is too coarse to capture the oscillatory
    // structure from extra-dimensional HO eigenfunctions, causing visible lattice artifacts.
    // Those dimensions use inline evaluation with eigencache instead (ho1DCached for extra dims).
    // HO mode uses eigencache + analytical gradient in both position and momentum representations.
    const isHydrogen = this.rendererConfig.quantumMode === 'hydrogenND'
    const dim = this.rendererConfig.dimension ?? 3
    const useDensityGrid = enableCache && isHydrogen && dim <= 3

    // Eigenfunction cache: always enabled when cache is on.
    // For HO momentum, the uniform buffer contains 1/ω → cache produces k-space functions automatically.
    const useEigenfunctionCache = enableCache

    this.shaderConfig = {
      dimension: this.rendererConfig.dimension!,
      isosurface: this.rendererConfig.isosurface,
      quantumMode: this.rendererConfig.quantumMode,
      termCount: this.rendererConfig.termCount,
      nodal: this.rendererConfig.nodalEnabled ?? true,
      colorAlgorithm: this.rendererConfig.colorAlgorithm,
      temporalAccumulation: this.rendererConfig.temporal,
      phaseMateriality: this.rendererConfig.phaseMaterialityEnabled ?? true,
      interference: this.rendererConfig.interferenceEnabled ?? true,
      uncertaintyBoundary: this.rendererConfig.uncertaintyBoundaryEnabled ?? true,
      useEigenfunctionCache,
      useDensityGrid,
      densityGridSize: 64,
    }
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
    const { device } = ctx
    // Force a lighting buffer write on first frame after (re)initialization.
    this.lastLightingVersion = -1
    this.lastQualitySignature = ''
    this.lastBasisRotationVersion = -1
    this.lastBasisSchroedingerVersion = -1
    this.lastBasisDimension = -1
    this.lastBasisAnimationTime = Number.NaN
    this.lastPbrVersion = -1
    this.lastSchrodingerPbrVersion = -1

    // Density grid compute pass provides uncertainty boundary threshold extraction.
    // Always create it (cheap when idle — only runs when uncertainty boundary is enabled).
    this.densityGridPass?.dispose()
    this.densityGridPass = null
    this.densityGridInitialized = false

    this.densityGridPass = new DensityGridComputePass({
      dimension: this.rendererConfig.dimension ?? 3,
      quantumMode: this.rendererConfig.quantumMode,
      termCount: this.rendererConfig.termCount,
      gridSize: 64,
    })
    await this.densityGridPass.initialize(ctx)
    this.densityGridInitialized = true

    // Eigenfunction cache compute pass (HO mode + hydrogen ND extra dims)
    this.eigenCachePass?.dispose()
    this.eigenCachePass = null
    this.eigenCacheInitialized = false

    if (this.shaderConfig.useEigenfunctionCache) {
      this.eigenCachePass = new EigenfunctionCacheComputePass({
        dimension: this.rendererConfig.dimension ?? 3,
        isHydrogenND: this.rendererConfig.quantumMode === 'hydrogenND',
      })
      await this.eigenCachePass.initialize(ctx)
      this.eigenCacheInitialized = true
    }

    // Update density grid phase availability based on actual texture format
    // r16float only stores rho (R channel); rgba16float stores rho, logRho, phase (R, G, B)
    if (this.shaderConfig.useDensityGrid && this.densityGridPass) {
      this.shaderConfig.densityGridHasPhase = this.densityGridPass.getTextureFormat() === 'rgba16float'
    }

    // Compose shaders
    const { wgsl: fragmentShader } = composeSchroedingerShader(this.shaderConfig)
    const vertexShader = composeSchroedingerVertexShader()

    // Create shader modules
    const vertexModule = this.createShaderModule(device, vertexShader, 'schroedinger-vertex')
    const fragmentModule = this.createShaderModule(device, fragmentShader, 'schroedinger-fragment')

    // Create bind group layouts - consolidated to stay within 4-group limit
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

    // Group 2: Object (Schroedinger + Basis + optional Cache)
    const objectBindGroupEntries: GPUBindGroupLayoutEntry[] = [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Schroedinger uniforms
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Basis vectors
    ]
    // Eigenfunction cache: storage buffer + metadata uniform
    if (this.eigenCachePass) {
      objectBindGroupEntries.push(
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' as const } }, // eigenCache
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // eigenMeta
      )
    }
    // Density grid texture + sampler for grid-based hydrogen raymarching
    if (this.shaderConfig.useDensityGrid && this.densityGridPass) {
      objectBindGroupEntries.push(
        {
          binding: 4,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const, viewDimension: '3d' as const },
        }, // densityGridTexture
        {
          binding: 5,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' as const },
        }, // densityGridSampler
      )
    }
    const objectBindGroupLayout = device.createBindGroupLayout({
      label: 'schroedinger-object-bgl',
      entries: objectBindGroupEntries,
    })
    // Create pipeline layout
    const bindGroupLayouts: GPUBindGroupLayout[] = [
      cameraBindGroupLayout,
      combinedBindGroupLayout, // Contains combined lighting+material+quality
      objectBindGroupLayout,
    ]

    const pipelineLayout = device.createPipelineLayout({
      label: 'schroedinger-pipeline-layout',
      bindGroupLayouts,
    })

    // Create render pipeline (async to avoid freezing browser during compilation)
    // The Schroedinger shader is 3000-5000 lines of WGSL (quantum math, volume integration,
    // PBR lighting, etc.) and synchronous compilation blocks the main thread for seconds.
    this.renderPipeline = await device.createRenderPipelineAsync({
      label: 'schroedinger-pipeline',
      layout: pipelineLayout,
      vertex: {
        module: vertexModule,
        entryPoint: 'main',
        buffers: [
          {
            arrayStride: 12, // 3 floats position
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' as const }],
          },
        ],
      },
      fragment: {
        module: fragmentModule,
        entryPoint: 'fragmentMain',
        // Target configuration depends on mode:
        // - Temporal (volumetric or isosurface): MRT (color + position), with alpha blend on color
        // - Isosurface (non-temporal): MRT (color + normal), no blend
        // - Standard volumetric: single target with alpha blend
        targets: this.rendererConfig.temporal
          ? [
              {
                // Temporal color output (volumetric: alpha blend, isosurface: no blend)
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
                // Position buffer (rgba32float for world positions) - no blend
                format: 'rgba32float' as GPUTextureFormat,
              },
            ]
          : this.rendererConfig.isosurface
            ? [
                { format: 'rgba16float' as GPUTextureFormat }, // Color buffer (no blend for solid surface)
                { format: 'rgba16float' as GPUTextureFormat }, // Normal buffer
              ]
            : [
                {
                  // Standard volumetric mode needs alpha blending
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
        // CRITICAL: Use 'front' to match THREE.BackSide in WebGL
        // BackSide = render back faces = cull front faces
        cullMode: 'front' as const,
      },
      // Depth state: only for modes that use depth buffer (not temporal)
      // Temporal mode renders to quarter-res without depth testing
      depthStencil: this.rendererConfig.temporal
        ? undefined
        : {
            format: 'depth24plus' as GPUTextureFormat,
            depthWriteEnabled: true,
            depthCompare: 'less' as GPUCompareFunction,
          },
    })

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

    // Group 2: Object (Schroedinger + Basis + optional Cache)
    const objectBindGroupEntries2: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: this.schroedingerUniformBuffer } },
      { binding: 1, resource: { buffer: this.basisUniformBuffer } },
    ]
    if (this.eigenCachePass) {
      const cacheBuffer = this.eigenCachePass.getCacheBuffer()
      const metaBuffer = this.eigenCachePass.getMetadataBuffer()
      if (cacheBuffer && metaBuffer) {
        objectBindGroupEntries2.push(
          { binding: 2, resource: { buffer: cacheBuffer } },
          { binding: 3, resource: { buffer: metaBuffer } },
        )
      }
    }
    // Density grid texture + sampler for grid-based hydrogen raymarching
    if (this.shaderConfig.useDensityGrid && this.densityGridPass) {
      const densityView = this.densityGridPass.getDensityTextureView()
      if (densityView) {
        // Create trilinear-filtering sampler for smooth grid interpolation
        this.densityGridSampler = device.createSampler({
          label: 'density-grid-sampler',
          magFilter: 'linear',
          minFilter: 'linear',
        })
        objectBindGroupEntries2.push(
          { binding: 4, resource: densityView },
          { binding: 5, resource: this.densityGridSampler },
        )
      }
    }
    this.objectBindGroup = device.createBindGroup({
      label: 'schroedinger-object-bg',
      layout: objectBindGroupLayout,
      entries: objectBindGroupEntries2,
    })

    // Create bounding geometry (sphere for volume)
    this.createBoundingGeometry(device)
  }

  private createBoundingGeometry(device: GPUDevice): void {
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

    const camera = ctx.frame?.stores?.['camera'] as any
    if (!camera) return

    // Get animation time (respects pause state)
    const animation = ctx.frame?.stores?.['animation'] as any
    const animationTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0

    // CameraUniforms layout (512 bytes = 128 floats):
    // 7 mat4x4f (7 × 16 floats = 112) + vec3f+f32 (4) + remaining scalars (12)
    // Use pre-allocated buffer to avoid per-frame GC pressure
    const data = this.cameraUniformData

    // Matrices at correct offsets (each mat4x4f = 16 floats)
    if (camera.viewMatrix) {
      data.set(camera.viewMatrix.elements, 0) // offset 0
    }
    if (camera.projectionMatrix) {
      data.set(camera.projectionMatrix.elements, 16) // offset 16
    }
    if (camera.viewProjectionMatrix) {
      data.set(camera.viewProjectionMatrix.elements, 32) // offset 32
    }
    if (camera.inverseViewMatrix) {
      data.set(camera.inverseViewMatrix.elements, 48) // offset 48
    }
    if (camera.inverseProjectionMatrix) {
      data.set(camera.inverseProjectionMatrix.elements, 64) // offset 64
    }

    // Model matrices for raymarching coordinate space conversion
    // Read transform from store for position/scale
    const transform = ctx.frame?.stores?.['transform'] as any
    const scale = transform?.uniformScale ?? 1.0
    const position = transform?.position ?? [0, 0, 0]

    // Build model matrix: translation * scale
    // Column-major order for WebGPU (same as Three.js)
    // modelMatrix (offset 80): [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, tx, ty, tz, 1]
    data[80] = scale
    data[81] = 0
    data[82] = 0
    data[83] = 0
    data[84] = 0
    data[85] = scale
    data[86] = 0
    data[87] = 0
    data[88] = 0
    data[89] = 0
    data[90] = scale
    data[91] = 0
    data[92] = position[0]
    data[93] = position[1]
    data[94] = position[2]
    data[95] = 1.0

    // inverseModelMatrix (offset 96): inverse of translation * scale
    // inv(T*S) = inv(S) * inv(T) = [1/s, 0, 0, 0, 0, 1/s, 0, 0, 0, 0, 1/s, 0, -tx/s, -ty/s, -tz/s, 1]
    const invScale = scale !== 0 ? 1.0 / scale : 1.0
    data[96] = invScale
    data[97] = 0
    data[98] = 0
    data[99] = 0
    data[100] = 0
    data[101] = invScale
    data[102] = 0
    data[103] = 0
    data[104] = 0
    data[105] = 0
    data[106] = invScale
    data[107] = 0
    data[108] = -position[0] * invScale
    data[109] = -position[1] * invScale
    data[110] = -position[2] * invScale
    data[111] = 1.0

    // Camera position at offset 112 (after 7 matrices)
    if (camera.position) {
      data[112] = camera.position.x
      data[113] = camera.position.y
      data[114] = camera.position.z
    }
    data[115] = camera.near || 0.1 // cameraNear (packed with cameraPosition)
    data[116] = camera.far || 1000 // cameraFar
    // Shader code expects FOV in radians for temporal jitter ray offset math.
    data[117] = ((camera.fov || 50) * Math.PI) / 180 // fov (radians)
    data[118] = ctx.size.width // resolution.x
    data[119] = ctx.size.height // resolution.y
    data[120] = ctx.size.width / ctx.size.height // aspectRatio
    data[121] = animationTime // time (respects animation pause state)
    data[122] = ctx.frame?.delta || 0.016 // deltaTime
    // frameNumber is u32 in WGSL - write as uint32 via pre-allocated DataView
    // PERF: Reuse cached DataView instead of allocating new one per frame
    this.cameraDataView.setUint32(123 * 4, ctx.frame?.frameNumber || 0, true)

    // Temporal accumulation: Bayer offset for quarter-res rendering.
    // Only advance the Bayer cycle when scene content changes (camera move/rotate
    // or animation time change) to prevent sub-pixel jitter on static scenes.
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

    const bayerOffset = BAYER_OFFSETS[this.temporalBayerIndex]!
    data[124] = bayerOffset[0] // bayerOffset.x
    data[125] = bayerOffset[1] // bayerOffset.y
    data[126] = 0 // padding
    data[127] = 0 // padding

    this.writeUniformBuffer(this.device, this.cameraUniformBuffer, data)
  }

  /**
   * Compute peak-density-based auto-normalization for densityGain.
   *
   * Analytically computes the peak |ψ|² for the dominant superposition term,
   * then returns a compensation factor that targets a specific per-step opacity
   * (alpha ≈ 0.7) at peak density. This ensures the full density dynamic range
   * maps to a useful opacity range regardless of quantum numbers, preventing
   * opacity saturation that would hide internal structure in complex states.
   */
  private computeCanonicalCompensation(preset: QuantumPreset, dimension: number): number {
    // Physicists' Hermite polynomial coefficients H_n(u), stored as [u^0, u^1, ..., u^6]
    const HERMITE_COEFFS: number[][] = [
      [1],                                      // H_0
      [0, 2],                                    // H_1
      [-2, 0, 4],                                // H_2
      [0, -12, 0, 8],                            // H_3
      [12, 0, -48, 0, 16],                       // H_4
      [0, 120, 0, -160, 0, 32],                  // H_5
      [-120, 0, 720, 0, -480, 0, 64],            // H_6
    ]
    const FACTORIALS = [1, 1, 2, 6, 24, 120, 720]

    if (preset.termCount === 0) return 1.0

    // Find the dominant term (largest |c_k|²)
    let dominantIdx = 0
    let maxCoeffMag = 0
    for (let k = 0; k < preset.termCount; k++) {
      const coeff = preset.coefficients[k]
      if (!coeff) continue
      const [cRe, cIm] = coeff
      const mag = cRe * cRe + cIm * cIm
      if (mag > maxCoeffMag) {
        maxCoeffMag = mag
        dominantIdx = k
      }
    }

    const qn = preset.quantumNumbers[dominantIdx]
    if (!qn) return 1.0
    const dim = Math.min(dimension, qn.length)

    // Compute peak |ψ|² = |c_dominant|² × ∏ᵢ peak_1D(nᵢ, ωᵢ)
    // where peak_1D(n,ω) = √(ω/π) / (2ⁿ n!) × max_u[Hₙ²(u)·e^{-u²}]
    let peakDensity = maxCoeffMag
    for (let j = 0; j < dim; j++) {
      const nRaw = qn[j]
      if (nRaw == null) continue
      const n = Math.max(0, Math.min(6, Math.round(nRaw)))
      const omega = Math.max(preset.omega[j] ?? 1.0, 0.01)
      const coeffs = HERMITE_COEFFS[n]
      if (!coeffs) continue

      // Find max of Hₙ²(u)·e^{-u²} numerically over u ∈ [0, 5]
      let maxHermiteSq = 0
      for (let i = 0; i <= 500; i++) {
        const u = (i / 500) * 5.0
        let hn = 0
        for (let k = coeffs.length - 1; k >= 0; k--) {
          hn = hn * u + (coeffs[k] ?? 0)
        }
        const val = hn * hn * Math.exp(-u * u)
        if (val > maxHermiteSq) maxHermiteSq = val
      }

      const factorial = FACTORIALS[n] ?? 1
      const twoN_nFact = Math.pow(2, n) * factorial
      const peak1D = Math.sqrt(omega / Math.PI) / twoN_nFact * maxHermiteSq
      peakDensity *= peak1D
    }

    if (peakDensity <= 0) return 1.0
    this.cachedPeakDensity = peakDensity

    // Target: at peak density with default densityGain=2.0, alpha per step ≈ 0.7
    // Higher target ensures narrow lobes (2-3 steps wide) build up near-opaque,
    // preventing the "translucent colored clouds" look on complex states.
    // alpha = 1 - exp(-densityGain * rho * stepLen)
    // => densityGain = -ln(1 - target_alpha) / (peakRho * stepLen)
    const TARGET_ALPHA = 0.7
    const DEFAULT_DENSITY_GAIN = 2.0
    const TYPICAL_SAMPLES = 32
    const estimatedStepLen = (2 * this.boundingRadius) / TYPICAL_SAMPLES
    const neededGain = -Math.log(1 - TARGET_ALPHA) / (peakDensity * estimatedStepLen)

    // Return compensation so that: effective = userGain * compensation
    // At default userGain=2.0: effective = 2.0 * (neededGain/2.0) = neededGain → alpha≈0.7 at peak
    return neededGain / DEFAULT_DENSITY_GAIN
  }

  updateSchroedingerUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.schroedingerUniformBuffer) return

    const extended = ctx.frame?.stores?.['extended'] as any
    const schroedinger = extended?.schroedinger
    const schroedingerVersion = extended?.schroedingerVersion ?? 0
    // Get PBR data for roughness (WebGL uses 'pbr-face' source via UniformManager)
    const pbr = ctx.frame?.stores?.['pbr'] as any
    // Get appearance data for SSS/Fresnel (global appearance controls)
    const appearance = ctx.frame?.stores?.['appearance'] as any
    // Get animation time (respects pause state)
    const animation = ctx.frame?.stores?.['animation'] as any
    const animationTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0

    const uncertaintyConfidenceMass = schroedinger?.uncertaintyConfidenceMass ?? 0.68
    const uncertaintyBoundaryWidth = schroedinger?.uncertaintyBoundaryWidth ?? 0.3
    let uncertaintyLogRhoThreshold = -2.0
    if (this.densityGridPass) {
      this.densityGridPass.setConfidenceMass(uncertaintyConfidenceMass)
      uncertaintyLogRhoThreshold = this.densityGridPass.getLogRhoThreshold()
    }

    // === DIRTY-FLAG OPTIMIZATION ===
    // When schroedinger settings unchanged AND appearance unchanged,
    // only update the time field (4 bytes) instead of full buffer (~1KB)
    // Note: Emission/Rim parameters come from the appearance store (matching WebGL),
    // so we must also check appearanceVersion to detect those changes.
    const appearanceVersion = appearance?.appearanceVersion ?? 0
    const pbrVersion = pbr?.pbrVersion ?? 0
    const versionChanged = schroedingerVersion !== this.lastSchroedingerVersion
    const appearanceChanged = appearanceVersion !== this.lastSchrodingerAppearanceVersion
    const pbrChanged = pbrVersion !== this.lastSchrodingerPbrVersion
    if (
      !versionChanged &&
      !appearanceChanged &&
      !pbrChanged &&
      this.lastSchroedingerVersion !== -1
    ) {
      // Partial buffer write: update time and uncertainty threshold scalars
      // Uses pre-allocated buffer to avoid per-frame allocation
      this.timeUpdateBuffer[0] = animationTime
      this.device.queue.writeBuffer(
        this.schroedingerUniformBuffer,
        WebGPUSchrodingerRenderer.TIME_FIELD_OFFSET,
        this.timeUpdateBuffer
      )
      // Boundary threshold can refresh after density-grid recomputation even when
      // store versions are unchanged, so keep this scalar updated too.
      this.timeUpdateBuffer[0] = uncertaintyLogRhoThreshold
      this.device.queue.writeBuffer(this.schroedingerUniformBuffer, 1180, this.timeUpdateBuffer)
      return
    }

    // Full buffer update needed - version changed, appearance changed, or spread animation active
    this.lastSchroedingerVersion = schroedingerVersion
    this.lastSchrodingerAppearanceVersion = appearanceVersion
    this.lastSchrodingerPbrVersion = pbrVersion

    // Reuse pre-allocated staging buffer to avoid per-frame GC pressure
    // See uniforms.wgsl.ts for the exact layout with packed arrays
    const floatView = this.schroedingerFloatView
    const intView = this.schroedingerIntView
    // NOTE: floatView.fill(0) is NOT needed here because:
    // 1. All shader-read struct fields are explicitly set below with defaults
    // 2. Alignment padding bytes (offsets 728-735, 836-847, 868-879, 956-959)
    //    exist for vec3f→next-field alignment but are never read by the shader
    // 3. Float32Array is zero-initialized by JavaScript on construction
    // IMPORTANT: Any new struct field MUST have an explicit default value assignment

    // Byte offsets based on the WGSL struct layout:
    // struct SchroedingerUniforms {
    //   quantumMode: i32,              // offset 0
    //   termCount: i32,                // offset 4
    //   _padScalar0: i32,              // offset 8
    //   _padScalar1: i32,              // offset 12
    //   omega: array<vec4f, 3>,        // offset 16 (48 bytes, holds 11 values)
    //   quantum: array<vec4<i32>, 22>, // offset 64 (352 bytes, holds 88 values)
    //   coeff: array<vec4f, 8>,        // offset 416 (128 bytes, xy = complex value)
    //   energy: array<vec4f, 2>,       // offset 544 (32 bytes, holds 8 values)
    //   principalN: i32,               // offset 576
    //   azimuthalL: i32,               // offset 580
    //   magneticM: i32,                // offset 584
    //   bohrRadius: f32,               // offset 588
    //   useRealOrbitals: u32,          // offset 592
    //   hydrogenBoost: f32,            // offset 596
    //   hydrogenNDBoost: f32,          // offset 600
    //   hydrogenRadialThreshold: f32,  // offset 604
    //   extraDimN: array<vec4<i32>, 2>, // offset 608 (32 bytes)
    //   extraDimOmega: array<vec4f, 2>, // offset 640 (32 bytes)
    //   phaseAnimationEnabled: u32,    // offset 672
    //   timeScale: f32,                // offset 676
    //   ... (more scalar fields follow)
    // }

    // --- Get geometry store for dimension ---
    const geometry = ctx.frame?.stores?.['geometry'] as any
    const dimension = geometry?.dimension ?? this.rendererConfig.dimension ?? 3

    // --- Quantum mode mapping (string to int, like WebGL) ---
    const quantumModeStr = schroedinger?.quantumMode ?? 'harmonicOscillator'
    const quantumModeInt = QUANTUM_MODE_MAP[quantumModeStr] ?? 0

    // --- Quantum preset generation (like WebGL SchroedingerMesh.tsx lines 598-638) ---
    // Read config values from store
    const presetName = schroedinger?.presetName ?? 'custom'
    const seed = schroedinger?.seed ?? 42
    const termCount = schroedinger?.termCount ?? 1
    const maxQuantumNumber = schroedinger?.maxQuantumNumber ?? 6
    const frequencySpread = schroedinger?.frequencySpread ?? 0.01

    // Check if preset needs regeneration
    const currentConfig = {
      presetName,
      seed,
      termCount,
      maxQuantumNumber,
      frequencySpread,
      dimension,
    }

    const needsPresetRegen =
      !this.cachedPresetConfig ||
      this.cachedPresetConfig.presetName !== currentConfig.presetName ||
      this.cachedPresetConfig.seed !== currentConfig.seed ||
      this.cachedPresetConfig.termCount !== currentConfig.termCount ||
      this.cachedPresetConfig.maxQuantumNumber !== currentConfig.maxQuantumNumber ||
      Math.abs(this.cachedPresetConfig.frequencySpread - currentConfig.frequencySpread) > 0.001 ||
      this.cachedPresetConfig.dimension !== currentConfig.dimension

    if (needsPresetRegen) {
      // Generate or get preset (like WebGL)
      let preset: QuantumPreset
      if (presetName === 'custom') {
        preset = generateQuantumPreset(
          seed,
          dimension,
          termCount,
          maxQuantumNumber,
          frequencySpread
        )
      } else {
        preset =
          getNamedPreset(presetName, dimension) ??
          generateQuantumPreset(seed, dimension, termCount, maxQuantumNumber, frequencySpread)
      }

      // Cache the preset and its flattened form
      this.cachedPreset = preset
      this.cachedPresetConfig = { ...currentConfig }
      this.flattenedPreset = flattenPresetForUniforms(preset)

    }

    // Compute physics-based bounding radius for this state.
    // Must run on EVERY full update (not just preset regen) because hydrogen n/l/m
    // changes affect bounding radius but don't trigger HO preset regeneration.
    if (this.cachedPreset) {
      const quantumModeStr = schroedinger?.quantumMode ?? 'harmonicOscillator'
      const extraDimQuantumNumbers = schroedinger?.extraDimQuantumNumbers as number[] | undefined
      const extraDimOmega = schroedinger?.extraDimOmega as number[] | undefined
      const newBoundR = computeBoundingRadius(
        quantumModeStr,
        this.cachedPreset,
        dimension,
        schroedinger?.principalQuantumNumber ?? 2,
        schroedinger?.bohrRadiusScale ?? 1.0,
        extraDimQuantumNumbers,
        extraDimOmega,
        schroedinger?.representation ?? 'position',
        schroedinger?.momentumScale ?? 1.0
      )
      const quantStep = WebGPUSchrodingerRenderer.BOUND_RADIUS_QUANT_STEP
      const quantizedBoundR = Math.ceil(newBoundR / quantStep) * quantStep
      // Rebuild bounding geometry only when quantized bound shifts enough.
      // This adds hysteresis and avoids geometry churn during small bound oscillations.
      if (
        Math.abs(quantizedBoundR - this.boundingRadius) >=
          WebGPUSchrodingerRenderer.BOUND_RADIUS_REBUILD_THRESHOLD &&
        this.device
      ) {
        this.boundingRadius = quantizedBoundR
        this.createBoundingGeometry(this.device)
      }
    }

    // Compute auto-compensation AFTER bounding radius update so stepLen estimate is correct
    if (needsPresetRegen && this.cachedPreset) {
      this.canonicalDensityCompensation = this.computeCanonicalCompensation(this.cachedPreset, dimension)
    }

    // Use cached flattened preset data
    const presetData = this.flattenedPreset
    const presetTermCount = this.cachedPreset?.termCount ?? 1

    // --- Scalars (offset 0-15) ---
    intView[0] = quantumModeInt // quantumMode (mapped from string)
    intView[1] = presetTermCount // termCount (from generated preset)
    intView[2] = 0 // _padScalar0
    intView[3] = 0 // _padScalar1

    // --- omega array (offset 16, 3 vec4f = 12 floats, use 11) ---
    // Use generated preset omega values (already includes frequency spread from generation)
    const omegaOffset = 16 / 4 // offset in float32 units
    for (let i = 0; i < MAX_DIM; i++) {
      floatView[omegaOffset + i] = presetData?.omega[i] ?? 1.0
    }
    floatView[omegaOffset + 11] = 0.0 // padding slot

    // --- quantum array (offset 64, 22 vec4i = 88 ints) ---
    const quantumOffset = 64 / 4 // offset in int32 units
    for (let i = 0; i < MAX_TERMS * MAX_DIM; i++) {
      intView[quantumOffset + i] = presetData?.quantum[i] ?? 0
    }

    // --- coeff array (offset 416, 8 vec4f, xy = complex value, zw = padding) ---
    // Note: WebGPU uses vec4f packing, WebGL uses interleaved float pairs
    const coeffOffset = 416 / 4
    for (let i = 0; i < MAX_TERMS; i++) {
      const baseIdx = coeffOffset + i * 4
      // presetData.coeff is interleaved: [re0, im0, re1, im1, ...]
      floatView[baseIdx] = presetData?.coeff[i * 2] ?? (i === 0 ? 1.0 : 0.0) // real
      floatView[baseIdx + 1] = presetData?.coeff[i * 2 + 1] ?? 0.0 // imag
      floatView[baseIdx + 2] = 0.0 // padding
      floatView[baseIdx + 3] = 0.0 // padding
    }

    // --- energy array (offset 544, 2 vec4f = 8 floats) ---
    const energyOffset = 544 / 4
    for (let i = 0; i < MAX_TERMS; i++) {
      floatView[energyOffset + i] = presetData?.energy[i] ?? 0.5
    }

    // --- Hydrogen scalar fields (offset 576-607) ---
    // Read from correct store field names (WebGL uses principalQuantumNumber, etc.)
    const principalN = schroedinger?.principalQuantumNumber ?? 2
    const azimuthalL = schroedinger?.azimuthalQuantumNumber ?? 1
    const magneticM = schroedinger?.magneticQuantumNumber ?? 0
    const bohrRadius = schroedinger?.bohrRadiusScale ?? 1.0

    // Validate quantum numbers (like WebGL SchroedingerMesh.tsx lines 518-520)
    const validN = Math.max(1, principalN)
    const validL = Math.max(0, Math.min(azimuthalL, validN - 1))
    const validM = Math.max(-validL, Math.min(magneticM, validL))

    intView[576 / 4] = validN
    intView[580 / 4] = validL
    intView[584 / 4] = validM
    floatView[588 / 4] = bohrRadius
    intView[592 / 4] = schroedinger?.useRealOrbitals ? 1 : 0

    // Compute hydrogen boost values (like WebGL SchroedingerMesh.tsx lines 529-544)
    // hydrogenBoost = 50 * n² * 3^l
    const lBoost = Math.pow(3.0, validL)
    const hydrogenBoost = 50.0 * validN * validN * lBoost
    floatView[596 / 4] = hydrogenBoost

    // hydrogenNDBoost = hydrogenBoost * (1 + (dim - 3) * 0.3)
    const dimFactor = 1.0 + (dimension - 3) * 0.3
    const hydrogenNDBoost = hydrogenBoost * dimFactor
    floatView[600 / 4] = hydrogenNDBoost

    // hydrogenRadialThreshold = 25 * n * a0 * (1 + 0.1*l)
    const hydrogenRadialThreshold = 25.0 * validN * bohrRadius * (1.0 + 0.1 * validL)
    floatView[604 / 4] = hydrogenRadialThreshold

    // --- extraDimN array (offset 608, 2 vec4i = 8 ints) ---
    // Read from correct store field name: extraDimQuantumNumbers
    const extraDimNOffset = 608 / 4
    const extraDimQuantumNumbers = schroedinger?.extraDimQuantumNumbers as number[] | undefined
    for (let i = 0; i < MAX_EXTRA_DIM; i++) {
      intView[extraDimNOffset + i] = extraDimQuantumNumbers?.[i] ?? 0
    }

    // --- extraDimOmega array (offset 640, 2 vec4f = 8 floats) ---
    // Read from correct store field name, apply frequency spread like WebGL
    const extraDimOmegaOffset = 640 / 4
    const extraDimOmega = schroedinger?.extraDimOmega as number[] | undefined
    const extraDimFrequencySpread = schroedinger?.extraDimFrequencySpread ?? 0
    for (let i = 0; i < MAX_EXTRA_DIM; i++) {
      const baseOmega = extraDimOmega?.[i] ?? 1.0
      // Apply frequency spread like WebGL (SchroedingerMesh.tsx line 559)
      const spread = 1.0 + (i - 3.5) * extraDimFrequencySpread
      floatView[extraDimOmegaOffset + i] = baseOmega * spread
    }

    // --- More scalar fields (offset 672+) ---
    intView[672 / 4] = schroedinger?.phaseAnimationEnabled ? 1 : 0
    // Volume rendering parameters - defaults match DEFAULT_SCHROEDINGER_CONFIG
    floatView[676 / 4] = schroedinger?.timeScale ?? 0.8 // WebGL default: 0.8
    floatView[680 / 4] = schroedinger?.fieldScale ?? 1.0
    floatView[684 / 4] = (schroedinger?.densityGain ?? 2.0) * this.canonicalDensityCompensation
    floatView[688 / 4] = schroedinger?.powderScale ?? 1.0 // WebGL default: 1.0
    // Emission & Rim: read from appearance store (matching WebGL SchroedingerMesh.tsx lines 782-791)
    // The UI (SchroedingerAdvanced.tsx) writes to appearance.faceEmission, etc.
    floatView[692 / 4] = appearance?.faceEmission ?? 0.0
    floatView[696 / 4] = appearance?.faceEmissionThreshold ?? 0.0
    floatView[700 / 4] = appearance?.faceEmissionColorShift ?? 0.0
    floatView[704 / 4] = this.cachedPeakDensity
    floatView[708 / 4] = schroedinger?.densityContrast ?? 1.8
    floatView[712 / 4] = schroedinger?.scatteringAnisotropy ?? 0.0
    floatView[716 / 4] = pbr?.face?.roughness ?? 0.3 // WebGL uses 'pbr-face' source

    // SSS fields in SchroedingerUniforms are DEAD — shader reads from MaterialUniforms
    // (material.sss* in bind group 1). Keep struct layout stable by zero-filling.
    intView[720 / 4] = 0     // sssEnabled (dead)
    floatView[724 / 4] = 0.0 // sssIntensity (dead)
    // bytes 728-735: implicit padding before vec3f
    floatView[736 / 4] = 0.0 // sssColor.r (dead)
    floatView[740 / 4] = 0.0 // sssColor.g (dead)
    floatView[744 / 4] = 0.0 // sssColor.b (dead)
    floatView[748 / 4] = 0.0 // _pad1
    floatView[752 / 4] = 0.0 // sssThickness (dead)
    floatView[756 / 4] = 0.0 // sssJitter (dead)

    // Reserved (formerly erosion, removed)
    floatView[760 / 4] = 0.0
    floatView[764 / 4] = 0.0
    floatView[768 / 4] = 0.0
    intView[772 / 4] = 0

    // Reserved (formerly curl noise flow, removed)
    intView[776 / 4] = 0
    floatView[780 / 4] = 0.0
    floatView[784 / 4] = 0.0
    floatView[788 / 4] = 0.0
    intView[792 / 4] = 0

    // Reserved (formerly dispersion, removed)
    intView[796 / 4] = 0
    floatView[800 / 4] = 0.0
    intView[804 / 4] = 0
    intView[808 / 4] = 0

    // Reserved fields (formerly shadows + AO — removed, keeping layout for buffer compatibility)
    intView[812 / 4] = 0 // _reservedShadow0
    floatView[816 / 4] = 0 // _reservedShadow1
    intView[820 / 4] = 0 // _reservedShadow2
    floatView[824 / 4] = 0 // _reservedAo0
    intView[828 / 4] = 0 // _reservedAo1
    floatView[832 / 4] = 0 // _reservedAo2
    // _reservedAoColor (vec3f at offset 848 + _pad2)
    floatView[848 / 4] = 0
    floatView[852 / 4] = 0
    floatView[856 / 4] = 0
    floatView[860 / 4] = 0 // _pad2

    // Nodal fields
    intView[864 / 4] = schroedinger?.nodalEnabled ? 1 : 0

    // nodalColor (vec3f at offset 880 after padding) - WebGL default: cyan (#00ffff)
    const nodalColor = this.parseColor(schroedinger?.nodalColor ?? '#00ffff')
    floatView[880 / 4] = nodalColor[0]
    floatView[884 / 4] = nodalColor[1]
    floatView[888 / 4] = nodalColor[2]
    floatView[892 / 4] = schroedinger?.nodalStrength ?? 1.0 // WebGL default: 1.0

    // More fields
    intView[896 / 4] = schroedinger?.energyColorEnabled ? 1 : 0
    intView[900 / 4] = schroedinger?.uncertaintyBoundaryEnabled ? 1 : 0
    floatView[904 / 4] = schroedinger?.uncertaintyBoundaryStrength ?? 0.5
    floatView[908 / 4] = animationTime // time (respects animation pause state)
    intView[912 / 4] = schroedinger?.isoEnabled ? 1 : 0
    floatView[916 / 4] = schroedinger?.isoThreshold ?? -3.0 // WebGL default: -3.0
    // HQ mode (quality >= 0.75) uses 64 samples, fast mode uses 32
    // Scale sample count by bounding radius ratio to maintain step density
    const performance = ctx.frame?.stores?.['performance'] as any
    const qualityMultiplier = performance?.qualityMultiplier ?? 1.0
    const fastMode = qualityMultiplier < 0.75
    const defaultSampleCount = fastMode ? 32 : 64
    const baseSampleCount = schroedinger?.sampleCount ?? defaultSampleCount
    const radiusScale = this.boundingRadius / 2.0
    const effectiveSampleCount = Math.min(
      Math.max(8, Math.ceil(baseSampleCount * radiusScale)),
      96
    )
    intView[920 / 4] = effectiveSampleCount

    // Phase shift fields
    intView[924 / 4] = schroedinger?.phaseAnimationEnabled ? 1 : 0
    floatView[928 / 4] = schroedinger?.phaseTheta ?? 0.0
    floatView[932 / 4] = schroedinger?.phasePhi ?? 0.0
    floatView[936 / 4] = 0.0 // _pad3

    // Color algorithm system (offset 940+)
    // Use canonical mapping shared with WebGL (palette/types.ts COLOR_ALGORITHM_TO_INT)
    const colorAlgorithm = COLOR_ALGORITHM_MAP[appearance?.colorAlgorithm ?? 'mixed'] ?? 9
    intView[940 / 4] = colorAlgorithm
    floatView[944 / 4] = appearance?.distribution?.power ?? 1.0
    floatView[948 / 4] = appearance?.distribution?.cycles ?? 1.0
    floatView[952 / 4] = appearance?.distribution?.offset ?? 0.0

    // Cosine palette coefficients (offset 960-1024)
    // Note: distOffset ends at byte 956, but vec4f requires 16-byte alignment
    // so there's 4 bytes of implicit padding before cosineA at offset 960
    const cosineCoeffs = appearance?.cosineCoefficients ?? {
      a: [0.5, 0.5, 0.5],
      b: [0.5, 0.5, 0.5],
      c: [1.0, 1.0, 1.0],
      d: [0.0, 0.33, 0.67],
    }
    // cosineA (vec4f at offset 960 after alignment padding)
    floatView[960 / 4] = cosineCoeffs.a?.[0] ?? 0.5
    floatView[964 / 4] = cosineCoeffs.a?.[1] ?? 0.5
    floatView[968 / 4] = cosineCoeffs.a?.[2] ?? 0.5
    floatView[972 / 4] = 0.0 // w unused
    // cosineB (vec4f at offset 976)
    floatView[976 / 4] = cosineCoeffs.b?.[0] ?? 0.5
    floatView[980 / 4] = cosineCoeffs.b?.[1] ?? 0.5
    floatView[984 / 4] = cosineCoeffs.b?.[2] ?? 0.5
    floatView[988 / 4] = 0.0 // w unused
    // cosineC (vec4f at offset 992)
    floatView[992 / 4] = cosineCoeffs.c?.[0] ?? 1.0
    floatView[996 / 4] = cosineCoeffs.c?.[1] ?? 1.0
    floatView[1000 / 4] = cosineCoeffs.c?.[2] ?? 1.0
    floatView[1004 / 4] = 0.0 // w unused
    // cosineD (vec4f at offset 1008)
    floatView[1008 / 4] = cosineCoeffs.d?.[0] ?? 0.0
    floatView[1012 / 4] = cosineCoeffs.d?.[1] ?? 0.33
    floatView[1016 / 4] = cosineCoeffs.d?.[2] ?? 0.67
    floatView[1020 / 4] = 0.0 // w unused

    // Fog controls (offset 1024+)
    intView[1024 / 4] = schroedinger?.fogIntegrationEnabled ? 1 : 0
    floatView[1028 / 4] = schroedinger?.fogContribution ?? 1.0
    floatView[1032 / 4] = schroedinger?.internalFogDensity ?? 0.0
    intView[1036 / 4] = 0  // Reserved (formerly erosionHQ)

    // Dynamic bounding radius (offset 1040+)
    floatView[1040 / 4] = this.boundingRadius
    floatView[1044 / 4] = 1.0 / this.boundingRadius
    intView[1048 / 4] = schroedinger?.phaseMaterialityEnabled ? 1 : 0
    floatView[1052 / 4] = schroedinger?.phaseMaterialityStrength ?? 1.0

    // Interference fringing (offset 1056+)
    intView[1056 / 4] = schroedinger?.interferenceEnabled ? 1 : 0
    floatView[1060 / 4] = schroedinger?.interferenceAmp ?? 0.5
    floatView[1064 / 4] = schroedinger?.interferenceFreq ?? 10.0
    floatView[1068 / 4] = schroedinger?.interferenceSpeed ?? 1.0

    // Physical nodal controls (offset 1072+)
    intView[1072 / 4] = NODAL_DEFINITION_MAP[schroedinger?.nodalDefinition ?? 'psiAbs'] ?? 0
    floatView[1076 / 4] = schroedinger?.nodalTolerance ?? 0.02
    intView[1080 / 4] = NODAL_FAMILY_MAP[schroedinger?.nodalFamilyFilter ?? 'all'] ?? 0
    intView[1084 / 4] = schroedinger?.nodalLobeColoringEnabled ? 1 : 0

    const nodalColorReal = this.parseColor(schroedinger?.nodalColorReal ?? '#00ffff')
    floatView[1088 / 4] = nodalColorReal[0]
    floatView[1092 / 4] = nodalColorReal[1]
    floatView[1096 / 4] = nodalColorReal[2]
    floatView[1100 / 4] = 0.0 // _padNodal0

    const nodalColorImag = this.parseColor(schroedinger?.nodalColorImag ?? '#ff66ff')
    floatView[1104 / 4] = nodalColorImag[0]
    floatView[1108 / 4] = nodalColorImag[1]
    floatView[1112 / 4] = nodalColorImag[2]
    floatView[1116 / 4] = 0.0 // _padNodal1

    const nodalColorPositive = this.parseColor(schroedinger?.nodalColorPositive ?? '#22c55e')
    floatView[1120 / 4] = nodalColorPositive[0]
    floatView[1124 / 4] = nodalColorPositive[1]
    floatView[1128 / 4] = nodalColorPositive[2]
    floatView[1132 / 4] = 0.0 // _padNodal2

    const nodalColorNegative = this.parseColor(schroedinger?.nodalColorNegative ?? '#ef4444')
    floatView[1136 / 4] = nodalColorNegative[0]
    floatView[1140 / 4] = nodalColorNegative[1]
    floatView[1144 / 4] = nodalColorNegative[2]
    floatView[1148 / 4] = 0.0 // _padNodal3

    // Probability Current Flow + uncertainty confidence mass (offset 1152-1164)
    intView[1152 / 4] = schroedinger?.probabilityFlowEnabled ? 1 : 0
    floatView[1156 / 4] = schroedinger?.probabilityFlowSpeed ?? 1.0
    floatView[1160 / 4] = schroedinger?.probabilityFlowStrength ?? 0.3
    floatView[1164 / 4] = uncertaintyConfidenceMass

    // LCH perceptual color parameters + uncertainty boundary controls (offset 1168-1180)
    floatView[1168 / 4] = appearance?.lchLightness ?? 0.7
    floatView[1172 / 4] = appearance?.lchChroma ?? 0.15
    floatView[1176 / 4] = uncertaintyBoundaryWidth
    floatView[1180 / 4] = uncertaintyLogRhoThreshold

    // Multi-source blend weights (offset 1184-1200, vec4f)
    const msWeights = appearance?.multiSourceWeights
    floatView[1184 / 4] = msWeights?.depth ?? 0.5
    floatView[1188 / 4] = msWeights?.orbitTrap ?? 0.3
    floatView[1192 / 4] = msWeights?.normal ?? 0.2
    floatView[1196 / 4] = 0.0 // w unused

    // Nodal render mode + reserved padding (offset 1200-1216)
    intView[1200 / 4] = NODAL_RENDER_MODE_MAP[schroedinger?.nodalRenderMode ?? 'band'] ?? 0
    intView[1204 / 4] = 0
    floatView[1208 / 4] = 0.0
    floatView[1212 / 4] = 0.0

    // Cross-section slice controls (offset 1216-1280)
    const crossSectionNormal = schroedinger?.crossSectionPlaneNormal ?? [0, 0, 1]
    const nx = Number(crossSectionNormal[0] ?? 0)
    const ny = Number(crossSectionNormal[1] ?? 0)
    const nz = Number(crossSectionNormal[2] ?? 1)
    const nLen = Math.hypot(nx, ny, nz)
    const invNLen = nLen > 1e-6 ? 1.0 / nLen : 1.0

    intView[1216 / 4] = schroedinger?.crossSectionEnabled ? 1 : 0
    intView[1220 / 4] =
      CROSS_SECTION_COMPOSITE_MODE_MAP[schroedinger?.crossSectionCompositeMode ?? 'overlay'] ?? 0
    intView[1224 / 4] = CROSS_SECTION_SCALAR_MAP[schroedinger?.crossSectionScalar ?? 'density'] ?? 0
    intView[1228 / 4] = schroedinger?.crossSectionAutoWindow ? 1 : 0

    floatView[1232 / 4] = nx * invNLen
    floatView[1236 / 4] = ny * invNLen
    floatView[1240 / 4] = nz * invNLen
    floatView[1244 / 4] = schroedinger?.crossSectionPlaneOffset ?? 0.0

    floatView[1248 / 4] = schroedinger?.crossSectionWindowMin ?? 0.0
    floatView[1252 / 4] = schroedinger?.crossSectionWindowMax ?? 1.0
    floatView[1256 / 4] = schroedinger?.crossSectionOpacity ?? 0.75
    floatView[1260 / 4] = schroedinger?.crossSectionThickness ?? 0.02

    const crossSectionPlaneColor = this.parseColor(schroedinger?.crossSectionPlaneColor ?? '#66ccff')
    floatView[1264 / 4] = crossSectionPlaneColor[0]
    floatView[1268 / 4] = crossSectionPlaneColor[1]
    floatView[1272 / 4] = crossSectionPlaneColor[2]
    floatView[1276 / 4] = 0.0

    // Physical probability current controls (offset 1280-1328)
    const probabilityCurrentEnabled = schroedinger?.probabilityCurrentEnabled ?? false
    intView[1280 / 4] = probabilityCurrentEnabled ? 1 : 0
    intView[1284 / 4] =
      PROBABILITY_CURRENT_STYLE_MAP[schroedinger?.probabilityCurrentStyle ?? 'magnitude'] ?? 0
    intView[1288 / 4] =
      PROBABILITY_CURRENT_PLACEMENT_MAP[schroedinger?.probabilityCurrentPlacement ?? 'isosurface'] ?? 0
    intView[1292 / 4] =
      PROBABILITY_CURRENT_COLOR_MODE_MAP[schroedinger?.probabilityCurrentColorMode ?? 'magnitude'] ?? 0

    floatView[1296 / 4] = schroedinger?.probabilityCurrentScale ?? 1.0
    floatView[1300 / 4] = schroedinger?.probabilityCurrentSpeed ?? 1.0
    floatView[1304 / 4] = schroedinger?.probabilityCurrentDensityThreshold ?? 0.01
    floatView[1308 / 4] = schroedinger?.probabilityCurrentMagnitudeThreshold ?? 0.0
    const lineDensity = schroedinger?.probabilityCurrentLineDensity ?? 8.0
    const stepSize = schroedinger?.probabilityCurrentStepSize ?? 0.04
    const integrationSteps = schroedinger?.probabilityCurrentSteps ?? 20
    // Probability current in momentum space uses broader stencil deltas and heavier evaluation;
    // cap line density and integration steps to keep the overlay responsive.
    const isMomentum = schroedinger?.representation === 'momentum'
    floatView[1312 / 4] = isMomentum ? Math.min(lineDensity, 3.0) : lineDensity
    floatView[1316 / 4] = isMomentum ? Math.max(stepSize, 0.02) : stepSize
    intView[1320 / 4] = isMomentum ? Math.min(integrationSteps, 8) : integrationSteps
    floatView[1324 / 4] = schroedinger?.probabilityCurrentOpacity ?? 0.7

    // Representation + momentum controls (offset 1328-1344)
    intView[1328 / 4] = REPRESENTATION_MODE_MAP[schroedinger?.representation ?? 'position'] ?? 0
    intView[1332 / 4] = MOMENTUM_DISPLAY_MODE_MAP[schroedinger?.momentumDisplayUnits ?? 'normalized'] ?? 0
    floatView[1336 / 4] = schroedinger?.momentumScale ?? 1.0
    floatView[1340 / 4] = schroedinger?.momentumHbar ?? 1.0

    // Radial probability overlay (offset 1344-1376)
    const radialProbEnabled = schroedinger?.radialProbabilityEnabled ?? false
    intView[1344 / 4] = radialProbEnabled ? 1 : 0
    floatView[1348 / 4] = schroedinger?.radialProbabilityOpacity ?? 0.6
    floatView[1352 / 4] = (radialProbEnabled && quantumModeStr !== 'harmonicOscillator')
      ? computeRadialProbabilityNorm(validN, validL, bohrRadius)
      : 1.0
    floatView[1356 / 4] = 0.0  // padding
    const rpColor = this.parseColor(schroedinger?.radialProbabilityColor ?? '#44aaff')
    floatView[1360 / 4] = rpColor[0]
    floatView[1364 / 4] = rpColor[1]
    floatView[1368 / 4] = rpColor[2]
    floatView[1372 / 4] = 0.0  // padding

    // ============================================
    // HO MOMENTUM: CPU UNIFORM TRANSFORMATION
    // ============================================
    // Physics: HO eigenfunctions are eigenfunctions of the Fourier transform.
    // φ̃_n(k, ω) = (-i)^n · φ_n(k, 1/ω) — same function, reciprocal ω, phase rotation.
    // Transform the uniform buffer so the GPU shader runs the normal position-mode path
    // and produces correct momentum-space wavefunctions automatically.
    // All optimizations (eigencache, analytical gradient, temporal reprojection) work at 60 FPS.
    // Exception: Hydrogen momentum has genuinely different functional form (Gegenbauer polynomials),
    // so it keeps representationMode=1 and its own shader path in psiBlockHydrogenND.
    const isHOMomentum = (schroedinger?.representation === 'momentum') &&
      quantumModeStr !== 'hydrogenND'

    if (isHOMomentum) {
      // 1. Invert omegas: ω_j → 1/ω_j
      const omegaOff = 16 / 4
      for (let j = 0; j < MAX_DIM; j++) {
        const omega = floatView[omegaOff + j]!
        floatView[omegaOff + j] = 1.0 / Math.max(omega, 0.01)
      }

      // 2. Rotate coefficients by (-i)^{Σ n_j} per term
      const quantumOff = 64 / 4
      const coeffOff = 416 / 4
      const termCount = Math.min(Math.max(intView[1]!, 1), MAX_TERMS)

      for (let k = 0; k < termCount; k++) {
        // Sum quantum numbers for this term
        let totalN = 0
        for (let j = 0; j < dimension; j++) {
          totalN += intView[quantumOff + k * MAX_DIM + j]!
        }

        // (-i)^totalN phase rotation of complex coefficient
        const re = floatView[coeffOff + k * 4]!
        const im = floatView[coeffOff + k * 4 + 1]!
        const mod = ((totalN % 4) + 4) % 4
        switch (mod) {
          case 0: break                                                                            // ×1
          case 1: floatView[coeffOff + k * 4] = im; floatView[coeffOff + k * 4 + 1] = -re; break  // ×(-i)
          case 2: floatView[coeffOff + k * 4] = -re; floatView[coeffOff + k * 4 + 1] = -im; break // ×(-1)
          case 3: floatView[coeffOff + k * 4] = -im; floatView[coeffOff + k * 4 + 1] = re; break  // ×(i)
        }
      }

      // 3. Force representationMode = 0 (position) — shader runs normal path
      intView[1328 / 4] = 0
    }

    this.writeUniformBuffer(this.device, this.schroedingerUniformBuffer, floatView)
  }

  updateBasisVectors(ctx: WebGPURenderContext): void {
    if (!this.device || !this.basisUniformBuffer) return

    const extended = ctx.frame?.stores?.['extended'] as any
    const schroedinger = extended?.schroedinger
    const schroedingerVersion = extended?.schroedingerVersion ?? 0
    const rotation = ctx.frame?.stores?.['rotation'] as any
    const rotationVersion = rotation?.version ?? 0
    const geometry = ctx.frame?.stores?.['geometry'] as any
    const animation = ctx.frame?.stores?.['animation'] as any
    const accumulatedTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0

    // Get dimension from geometry store
    const dimension = geometry?.dimension ?? this.rendererConfig.dimension ?? 4

    // Slice animation settings
    const sliceAnimationEnabled = schroedinger?.sliceAnimationEnabled ?? false
    const sliceSpeed = schroedinger?.sliceSpeed ?? 0.02
    const sliceAmplitude = schroedinger?.sliceAmplitude ?? 0.3
    const parameterValues = schroedinger?.parameterValues as number[] | undefined
    const requiresTimeDrivenBasis = sliceAnimationEnabled && dimension > 3
    const basisStaticInputsUnchanged =
      rotationVersion === this.lastBasisRotationVersion &&
      schroedingerVersion === this.lastBasisSchroedingerVersion &&
      dimension === this.lastBasisDimension

    if (basisStaticInputsUnchanged) {
      if (!requiresTimeDrivenBasis) {
        return
      }
      if (Math.abs(accumulatedTime - this.lastBasisAnimationTime) < 1e-6) {
        return
      }
    }

    // BasisVectors struct uses array<vec4f, 3> for each member (48 floats total)
    // Stride is 12 (not 11) because array<vec4f, 3> = 3 * 4 = 12 floats
    // Use pre-allocated buffer to avoid per-frame GC pressure
    const STRIDE = 12
    const basisData = this.basisUniformData
    // Reset to zero for clean slate (values not set will be 0)
    basisData.fill(0)

    // Default basis vectors
    basisData[0] = 1.0 // X basis: [1, 0, 0, ...]
    basisData[STRIDE + 1] = 1.0 // Y basis: [0, 1, 0, ...]
    basisData[STRIDE * 2 + 2] = 1.0 // Z basis: [0, 0, 1, ...]

    // Override with stored basis if available
    const basisX = schroedinger?.basisX as Float32Array | undefined
    const basisY = schroedinger?.basisY as Float32Array | undefined
    const basisZ = schroedinger?.basisZ as Float32Array | undefined
    const origin = schroedinger?.origin as Float32Array | undefined

    if (basisX) {
      for (let i = 0; i < Math.min(basisX.length, MAX_DIM); i++) {
        basisData[i] = basisX[i] ?? 0
      }
    }
    if (basisY) {
      for (let i = 0; i < Math.min(basisY.length, MAX_DIM); i++) {
        basisData[STRIDE + i] = basisY[i] ?? 0
      }
    }
    if (basisZ) {
      for (let i = 0; i < Math.min(basisZ.length, MAX_DIM); i++) {
        basisData[STRIDE * 2 + i] = basisZ[i] ?? 0
      }
    }

    // Origin with slice animation support (4D+ only)
    // Like WebGL SchroedingerMesh.tsx lines 947-965
    const PHI = 1.618033988749895 // Golden ratio for phase offsets
    const originOffset = STRIDE * 3

    if (sliceAnimationEnabled && dimension > 3) {
      // Apply slice animation to dimensions >= 3
      // First 3 dimensions (x, y, z) stay at 0
      for (let i = 0; i < 3; i++) {
        basisData[originOffset + i] = origin?.[i] ?? 0
      }

      // Animate extra dimensions (4D+)
      for (let i = 3; i < Math.min(dimension, MAX_DIM); i++) {
        const extraDimIndex = i - 3
        const phase = extraDimIndex * PHI

        // Two-frequency animation for natural variation
        const t1 = accumulatedTime * sliceSpeed * 2 * Math.PI + phase
        const t2 = accumulatedTime * sliceSpeed * 1.3 * 2 * Math.PI + phase * 1.5

        // Combined offset with weighted sine waves
        const offset = sliceAmplitude * (0.7 * Math.sin(t1) + 0.3 * Math.sin(t2))

        // Base value from parameter values (or 0 if not available)
        const baseValue = parameterValues?.[extraDimIndex] ?? 0
        basisData[originOffset + i] = baseValue + offset
      }
    } else if (origin) {
      // No slice animation - use stored origin values directly
      for (let i = 0; i < Math.min(origin.length, MAX_DIM); i++) {
        basisData[originOffset + i] = origin[i] ?? 0
      }
    }

    this.writeUniformBuffer(this.device, this.basisUniformBuffer, basisData)
    this.lastBasisRotationVersion = rotationVersion
    this.lastBasisSchroedingerVersion = schroedingerVersion
    this.lastBasisDimension = dimension
    this.lastBasisAnimationTime = requiresTimeDrivenBasis ? accumulatedTime : Number.NaN
  }

  /**
   * Update lighting uniforms from lightingStore.
   * @param ctx
   */
  updateLightingUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.lightingUniformBuffer) return

    const lighting = ctx.frame?.stores?.['lighting'] as any
    if (!lighting) return
    const lightingVersion = lighting?.version ?? 0
    if (lightingVersion === this.lastLightingVersion) return
    this.lastLightingVersion = lightingVersion

    const data = this.lightingUniformData
    packLightingUniforms(data, lighting)

    this.writeUniformBuffer(this.device, this.lightingUniformBuffer, data)
  }

  private parseColor(hex: string): [number, number, number] {
    const rgb = parseHexColorToLinearRgb(hex, [1, 1, 1])
    return [rgb[0], rgb[1], rgb[2]]
  }

  updateMaterialUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.materialUniformBuffer) return

    const pbr = ctx.frame?.stores?.['pbr'] as any
    const appearance = ctx.frame?.stores?.['appearance'] as any

    // MaterialUniforms struct layout - WGSL vec3f has 16-byte alignment!
    // Byte offsets shown in comments (index = byte/4):
    // struct MaterialUniforms {
    //   baseColor: vec4f,        // bytes 0-15   (idx 0-3)
    //   metallic: f32,           // bytes 16-19  (idx 4)
    //   roughness: f32,          // bytes 20-23  (idx 5)
    //   reflectance: f32,        // bytes 24-27  (idx 6)
    //   ao: f32,                 // bytes 28-31  (idx 7)
    //   emissive: vec3f,         // bytes 32-43  (idx 8-10)
    //   emissiveIntensity: f32,  // bytes 44-47  (idx 11)
    //   ior: f32,                // bytes 48-51  (idx 12)
    //   transmission: f32,       // bytes 52-55  (idx 13)
    //   thickness: f32,          // bytes 56-59  (idx 14)
    //   sssEnabled: u32,         // bytes 60-63  (idx 15)
    //   sssIntensity: f32,       // bytes 64-67  (idx 16)
    //   <padding>                // bytes 68-79  (idx 17-19) - alignment gap
    //   sssColor: vec3f,         // bytes 80-91  (idx 20-22)
    //   sssThickness: f32,       // bytes 92-95  (idx 23)
    //   sssJitter: f32,          // bytes 96-99  (idx 24)
    //   _reserved_fresnel0: u32, // bytes 100-103 (idx 25) — Fresnel rim removed
    //   _reserved_fresnel1: f32, // bytes 104-107 (idx 26)
    //   <padding>                // bytes 108-111 (idx 27) - alignment gap
    //   _reserved_fresnel2: vec3f, // bytes 112-123 (idx 28-30)
    //   _padding2: f32,          // bytes 124-127 (idx 31)
    //   specularIntensity: f32,  // bytes 128-131 (idx 32)
    //   <padding>                // bytes 132-143 (idx 33-35) - alignment gap
    //   specularColor: vec3f,    // bytes 144-155 (idx 36-38)
    //   <struct padding>         // bytes 156-159 (idx 39) - struct alignment
    // }
    // Total: 40 floats = 160 bytes
    const data = this.materialUniformData
    const dataView = this.materialDataView

    // baseColor: vec4f (idx 0-3) - alpha is fixed to 1.0 (surface opacity control removed)
    const faceColor = this.parseColor(appearance?.faceColor ?? '#ffffff')
    data[0] = faceColor[0]
    data[1] = faceColor[1]
    data[2] = faceColor[2]
    data[3] = 1.0

    // metallic, roughness, reflectance, ao (idx 4-7)
    data[4] = pbr?.face?.metallic ?? 0.0
    data[5] = pbr?.face?.roughness ?? 0.5
    data[6] = pbr?.face?.reflectance ?? 0.5
    data[7] = 1.0 // ao (ambient occlusion factor)

    // emissive: vec3f + emissiveIntensity: f32 (idx 8-11)
    const faceEmission = appearance?.faceEmission ?? 0.0
    data[8] = faceColor[0]
    data[9] = faceColor[1]
    data[10] = faceColor[2]
    data[11] = faceEmission

    // ior, transmission, thickness (idx 12-14)
    data[12] = pbr?.face?.ior ?? 1.5
    data[13] = pbr?.face?.transmission ?? 0.0
    data[14] = pbr?.face?.thickness ?? 1.0

    // sssEnabled: u32 (idx 15)
    const sssEnabled = appearance?.sssEnabled ?? false
    dataView.setUint32(15 * 4, sssEnabled ? 1 : 0, true)

    // sssIntensity: f32 (idx 16)
    data[16] = appearance?.sssIntensity ?? 1.0

    // idx 17-19: alignment gap (vec3f requires 16-byte alignment)

    // sssColor: vec3f (idx 20-22) - aligned to byte 80
    const sssColor = this.parseColor(appearance?.sssColor ?? '#ff8844')
    data[20] = sssColor[0]
    data[21] = sssColor[1]
    data[22] = sssColor[2]

    // sssThickness, sssJitter (idx 23-24)
    data[23] = appearance?.sssThickness ?? 1.0
    data[24] = appearance?.sssJitter ?? 0.2

    // idx 25-31: reserved (Fresnel rim removed — zeroed for buffer compatibility)
    data[25] = 0.0
    data[26] = 0.0
    // idx 27: alignment gap
    data[28] = 0.0
    data[29] = 0.0
    data[30] = 0.0
    data[31] = 0.0

    // specularIntensity: f32 (idx 32)
    data[32] = pbr?.face?.specularIntensity ?? 0.8

    // idx 33-35: alignment gap

    // specularColor: vec3f (idx 36-38) - aligned to byte 144
    const specularColor = this.parseColor(pbr?.face?.specularColor ?? '#ffffff')
    data[36] = specularColor[0]
    data[37] = specularColor[1]
    data[38] = specularColor[2]

    // idx 39: struct padding

    this.writeUniformBuffer(this.device, this.materialUniformBuffer, data)
  }

  updateQualityUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.qualityUniformBuffer) return

    const performance = ctx.frame?.stores?.['performance'] as any

    // QualityUniforms struct layout:
    // sdfMaxIterations: i32 (0)
    // sdfSurfaceDistance: f32 (1)
    // _reservedShadowQuality: i32 (2)
    // _reservedShadowSoftness: f32 (3)
    // _reservedAoEnabled: i32 (4)
    // _reservedAoSamples: i32 (5)
    // _reservedAoRadius: f32 (6)
    // _reservedAoIntensity: f32 (7)
    // qualityMultiplier: f32 (8)
    // _reservedDebug: i32 (9)
    // Use pre-allocated buffer to avoid per-frame GC pressure
    const data = this.qualityUniformData

    // Quality multiplier affects ray march quality
    const qualityMultiplier = performance?.qualityMultiplier ?? 1.0

    const qualitySignature = qualityMultiplier.toFixed(4)
    if (qualitySignature === this.lastQualitySignature) {
      return
    }
    this.lastQualitySignature = qualitySignature

    data[1] = 0.001 / qualityMultiplier // sdfSurfaceDistance (smaller = more precise)
    data[3] = 0 // _reservedShadowSoftness
    data[6] = 0 // _reservedAoRadius
    data[7] = 0 // _reservedAoIntensity
    data[8] = qualityMultiplier

    // Use pre-allocated DataView for integer writes
    this.qualityDataView.setInt32(0 * 4, Math.floor(128 * qualityMultiplier), true) // sdfMaxIterations
    this.qualityDataView.setInt32(2 * 4, 0, true) // _reservedShadowQuality
    this.qualityDataView.setInt32(4 * 4, 0, true) // _reservedAoEnabled
    this.qualityDataView.setInt32(5 * 4, 0, true) // _reservedAoSamples
    this.qualityDataView.setInt32(9 * 4, 0, true) // _reservedDebug

    this.writeUniformBuffer(this.device, this.qualityUniformBuffer, data)
  }

  execute(ctx: WebGPURenderContext): void {
    if (
      !this.device ||
      !this.renderPipeline ||
      !this.vertexBuffer ||
      !this.indexBuffer ||
      !this.cameraBindGroup ||
      !this.lightingBindGroup ||
      !this.objectBindGroup
    ) {
      return
    }

    // ============================================
    // DIRTY-FLAG OPTIMIZATION: Only update changed uniform categories
    // ============================================
    // Get store versions for dirty checking
    const appearance = ctx.frame?.stores?.['appearance'] as any
    const pbr = ctx.frame?.stores?.['pbr'] as any
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
    if (appearanceVersion !== this.lastAppearanceVersion || pbrVersion !== this.lastPbrVersion) {
      this.updateMaterialUniforms(ctx)
      this.lastAppearanceVersion = appearanceVersion
      this.lastPbrVersion = pbrVersion
    }

    // ALWAYS update: Quality (cheap, needed for fast/slow toggle responsiveness)
    this.updateQualityUniforms(ctx)

    // ============================================
    // DENSITY GRID COMPUTE PASS (if enabled)
    // ============================================
    // Run compute shader to pre-compute density texture before rendering
    // Store local reference before check to prevent TOCTOU race condition
    const gridPass = this.densityGridPass
    if (gridPass && this.densityGridInitialized) {
      // Get versions for dirty tracking - prevents unnecessary grid recomputation
      const extended = ctx.frame?.stores?.['extended'] as any
      const rotation = ctx.frame?.stores?.['rotation'] as any
      const geometry = ctx.frame?.stores?.['geometry'] as any
      const animation = ctx.frame?.stores?.['animation'] as any
      const schroedingerVersion = extended?.schroedingerVersion ?? 0
      const rotationVersion = rotation?.version ?? 0
      const dimension = geometry?.dimension ?? this.rendererConfig.dimension ?? 3
      const sliceAnimationEnabled = extended?.schroedinger?.sliceAnimationEnabled ?? false
      const accumulatedTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0
      const basisTimeBucket =
        sliceAnimationEnabled && dimension > 3 ? Math.floor(accumulatedTime * 120.0) : 0
      const basisVersion = rotationVersion * 1000003 + basisTimeBucket

      // Sync uniform data from renderer to compute pass
      // The compute pass needs the same Schroedinger and Basis uniforms
      // Pass versions to enable smart dirty tracking - only recompute when parameters change
      gridPass.updateSchroedingerUniforms(
        ctx.device,
        this.schroedingerUniformData,
        schroedingerVersion
      )
      gridPass.updateBasisUniforms(ctx.device, this.basisUniformData.buffer, basisVersion)
      // Sync bounding radius so density grid covers the full wavefunction extent
      gridPass.updateWorldBound(ctx.device, this.boundingRadius)

      // Execute compute pass - fills the 3D density texture
      gridPass.execute(ctx)
      // Internal compute pass is not graph-registered, so trigger its post-frame hook here.
      // This schedules readback mapping via queue.onSubmittedWorkDone() after submit.
      gridPass.postFrame?.()
    }

    // ============================================
    // EIGENFUNCTION CACHE COMPUTE PASS (HO mode)
    // ============================================
    // Pre-compute 1D eigenfunctions for cache-accelerated rendering
    const cachePass = this.eigenCachePass
    if (cachePass && this.eigenCacheInitialized) {
      const extended = ctx.frame?.stores?.['extended'] as any
      const geometry = ctx.frame?.stores?.['geometry'] as any
      const schroedingerVersion = extended?.schroedingerVersion ?? 0
      const dimension = geometry?.dimension ?? this.rendererConfig.dimension ?? 3

      // Sync uniform data and perform CPU-side deduplication
      cachePass.updateFromUniforms(
        ctx.device,
        this.schroedingerUniformData,
        schroedingerVersion,
        dimension
      )

      // Execute compute pass - fills eigenfunction cache storage buffer.
      // For HO momentum, the uniform buffer already contains 1/ω from the
      // CPU transform, so the cache naturally produces k-space eigenfunctions.
      cachePass.execute(ctx)
    }

    // Get render targets based on mode:
    // - Temporal (volumetric or isosurface): quarter-color + quarter-position (no depth)
    // - Isosurface (non-temporal): object-color + normal-buffer + depth-buffer
    // - Standard volumetric: object-color + depth-buffer
    const isTemporal = !!this.rendererConfig.temporal

    // Color output target
    const colorView = isTemporal
      ? ctx.getWriteTarget('quarter-color')
      : ctx.getWriteTarget('object-color')

    // Depth buffer - only needed for non-temporal modes.
    // Temporal mode renders to quarter-res without depth testing and is composited later.
    const depthView = isTemporal ? null : ctx.getWriteTarget('depth-buffer')

    if (!colorView) {
      console.warn('[WebGPU Schrödinger] Missing color render target')
      return
    }

    if (!isTemporal && !depthView) {
      console.warn('[WebGPU Schrödinger] Missing depth buffer for non-temporal mode')
      return
    }

    // Secondary MRT output based on mode
    // - Temporal (volumetric or isosurface): world position buffer
    // - Isosurface (non-temporal): normal buffer
    const secondaryView = isTemporal
      ? ctx.getWriteTarget('quarter-position')
      : this.rendererConfig.isosurface
        ? ctx.getWriteTarget('normal-buffer')
        : null

    if (isTemporal && !secondaryView) {
      console.warn('[WebGPU Schrödinger] Temporal mode requires quarter-position target')
      return
    }

    if (!isTemporal && this.rendererConfig.isosurface && !secondaryView) {
      console.warn('[WebGPU Schrödinger] Isosurface mode requires normal-buffer target')
      return
    }

    // Build color attachments - MRT for isosurface/temporal, single for standard volumetric
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

    // Add secondary MRT attachment based on mode
    if (isTemporal && secondaryView) {
      // Temporal mode (volumetric or isosurface): world position buffer
      colorAttachments.push({
        view: secondaryView,
        loadOp: 'clear' as const,
        storeOp: 'store' as const,
        clearValue: this.clearValueInvalidPos, // Invalid position (a < 0 means no hit)
      })
    } else if (this.rendererConfig.isosurface && secondaryView) {
      // Isosurface mode (non-temporal): normal buffer
      colorAttachments.push({
        view: secondaryView,
        loadOp: 'clear' as const,
        storeOp: 'store' as const,
        clearValue: this.clearValueNormal, // Default normal pointing up (+Z)
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

    passEncoder.setVertexBuffer(0, this.vertexBuffer)
    passEncoder.setIndexBuffer(this.indexBuffer, 'uint16' as const)
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
    // Dispose compute passes
    this.densityGridPass?.dispose()
    this.densityGridPass = null
    this.densityGridInitialized = false
    this.densityGridSampler = null

    this.eigenCachePass?.dispose()
    this.eigenCachePass = null
    this.eigenCacheInitialized = false

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
