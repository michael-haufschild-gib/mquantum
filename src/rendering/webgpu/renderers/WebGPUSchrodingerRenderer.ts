/* global GPUBindGroupEntry, GPUBindGroupLayoutEntry, GPUCompareFunction, GPURenderPassColorAttachment, GPUTextureFormat */
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
  composeSchroedingerVertexShader2D,
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
import type { SchroedingerConfig, TdseInitialCondition } from '@/lib/geometry/extended/types'
import { computeBoundingRadius } from '@/lib/geometry/extended/schroedinger/boundingRadius'
import { computeRadialProbabilityNorm } from '@/lib/math/hydrogenRadialProbability'
import { DensityGridComputePass } from '../passes/DensityGridComputePass'
import { EigenfunctionCacheComputePass } from '../passes/EigenfunctionCacheComputePass'
import { FreeScalarFieldComputePass } from '../passes/FreeScalarFieldComputePass'
import { TDSEComputePass } from '../passes/TDSEComputePass'
import { DiracComputePass } from '../passes/DiracComputePass'
import { useBecDiagnosticsStore } from '@/stores/becDiagnosticsStore'
import { thomasFermiMuND } from '@/lib/physics/bec/chemicalPotential'
import { WignerCacheComputePass } from '../passes/WignerCacheComputePass'
import { parseHexColorToLinearRgb } from '../utils/color'
import { packLightingUniforms } from '../utils/lighting'
import type { AppearanceStoreState } from '@/stores/appearanceStore'
import type { AnimationState } from '@/stores/animationStore'
import type { GeometryState } from '@/stores/geometryStore'
import type { DensityMatrix, LindbladChannel } from '@/lib/physics/openQuantum/types'
import type { ComplexMatrix } from '@/lib/physics/openQuantum/complexMatrix'
import type { HydrogenBasisState, TransitionRate } from '@/lib/physics/openQuantum'
import {
  densityMatrixFromCoefficients,
  evolveMultiStep,
} from '@/lib/physics/openQuantum/integrator'
import { buildLindbladChannels } from '@/lib/physics/openQuantum/channels'
import { computeMetrics } from '@/lib/physics/openQuantum/metrics'
import { computeActiveK, createPackedBuffer, packForGPU } from '@/lib/physics/openQuantum/statePacking'
import {
  buildHydrogenBasis,
  basisEnergies,
  basisLabels,
} from '@/lib/physics/openQuantum/hydrogenBasis'
import { buildTransitionRates } from '@/lib/physics/openQuantum/hydrogenRates'
import { buildHydrogenChannels } from '@/lib/physics/openQuantum/hydrogenChannels'
import { buildLiouvillian } from '@/lib/physics/openQuantum/liouvillian'
import { computePropagator, evolvePropagatorStep } from '@/lib/physics/openQuantum/propagator'
import { useOpenQuantumDiagnosticsStore } from '@/stores/openQuantumDiagnosticsStore'
import type { RotationState } from '@/stores/rotationStore'
import type { PBRSliceState } from '@/stores/slices/visual/pbrSlice'

/** Bayer pattern offsets for 4-frame temporal jitter cycle */
const BAYER_OFFSETS: [number, number][] = [
  [0, 0],
  [1, 1],
  [1, 0],
  [0, 1],
]

const SCHROEDINGER_UNIFORM_SIZE = 1488

// PERF: Module-level string→int lookup maps (avoids recreating per-update)
const QUANTUM_MODE_MAP: Record<string, number> = {
  harmonicOscillator: 0,
  hydrogenND: 1,
  freeScalarField: 2,
  tdseDynamics: 3,
  becDynamics: 4,
  diracEquation: 5,
}
const COLOR_ALGORITHM_MAP: Record<string, number> = {
  lch: 0,
  multiSource: 1,
  radial: 2,
  phase: 3,
  mixed: 4,
  blackbody: 5,
  phaseCyclicUniform: 6,
  phaseDiverging: 7,
  domainColoringPsi: 8,
  diverging: 9,
  relativePhase: 10,
  radialDistance: 11,
  hamiltonianDecomposition: 12,
  modeCharacter: 13,
  energyFlux: 14,
  kSpaceOccupation: 15,
  purityMap: 16,
  entropyMap: 17,
  coherenceMap: 18,
  viridis: 19,
  inferno: 20,
  densityContours: 21,
  phaseDensity: 22,
  particleAntiparticle: 23,
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
  wigner: 2,
}
const MOMENTUM_DISPLAY_MODE_MAP: Record<string, number> = {
  k: 0,
  p: 1,
}

/**
 * Pack hydrogen basis states into an ArrayBuffer matching HydrogenBasisUniforms layout.
 *
 * Layout (704 bytes):
 * - quantumNumbers: array<vec4<i32>, 39> (624 bytes) — 14 states × 11 dims packed 4-per-vec
 * - energies: array<vec4f, 4> (64 bytes) — 14 energies packed 4-per-vec
 * - basisCount: u32 + 3×u32 padding (16 bytes)
 */
function packHydrogenBasisForGPU(basis: HydrogenBasisState[], dimension: number): ArrayBuffer {
  const buffer = new ArrayBuffer(704)
  const i32View = new Int32Array(buffer, 0, 156) // 39 vec4i = 156 ints
  const f32View = new Float32Array(buffer, 624, 16) // 4 vec4f = 16 floats
  const u32View = new Uint32Array(buffer, 688, 4) // basisCount + 3 padding

  const maxDims = 11
  for (let k = 0; k < basis.length; k++) {
    const state = basis[k]!
    // dim 0=n, 1=l, 2=m, 3+=extraDimN[i]
    const flatBase = k * maxDims
    i32View[flatBase + 0] = state.n
    i32View[flatBase + 1] = state.l
    i32View[flatBase + 2] = state.m
    const extraCount = Math.min(dimension - 3, state.extraDimN.length)
    for (let d = 0; d < extraCount; d++) {
      i32View[flatBase + 3 + d] = state.extraDimN[d]!
    }

    // Energy
    f32View[k] = state.energy
  }

  u32View[0] = basis.length
  return buffer
}

type CameraMatrix = { elements: ArrayLike<number> }

interface CameraSnapshot {
  viewMatrix?: CameraMatrix
  projectionMatrix?: CameraMatrix
  viewProjectionMatrix?: CameraMatrix
  inverseViewMatrix?: CameraMatrix
  inverseProjectionMatrix?: CameraMatrix
  position?: { x: number; y: number; z: number }
  target?: { x: number; y: number; z: number }
  near?: number
  far?: number
  fov?: number
}

interface ExtendedStoreSnapshot {
  schroedinger?: Partial<SchroedingerConfig>
  schroedingerVersion?: number
  clearFreeScalarNeedsReset?: () => void
  clearTdseNeedsReset?: () => void
  clearBecNeedsReset?: () => void
  clearDiracNeedsReset?: () => void
}

interface TransformSnapshot {
  uniformScale?: number
  position?: number[]
}

interface PerformanceSnapshot {
  qualityMultiplier?: number
  isInteracting?: boolean
  sceneTransitioning?: boolean
  refinementStage?: string
}

type LightingSnapshot = Parameters<typeof packLightingUniforms>[1]

function getStoreSnapshot<T>(ctx: WebGPURenderContext, key: string): T | undefined {
  const snapshot = ctx.frame?.stores?.[key]
  return snapshot as T | undefined
}

/**
 *
 */
export interface SchrodingerRendererConfig {
  dimension?: number
  isosurface?: boolean
  quantumMode?: QuantumModeForShader | 'freeScalarField' | 'tdseDynamics' | 'becDynamics' | 'diracEquation'
  termCount?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  /** Compile-time color module selection (0-11) */
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
  /** Whether analytical gradient path is enabled when cache is active (HO only). */
  analyticalGradientEnabled?: boolean
  /** Whether the fast eigencache interpolation path is enabled (legacy Catmull-Rom). */
  fastEigenInterpolationEnabled?: boolean
  /** Wavefunction representation — triggers pipeline rebuild when changed.
   *  HO momentum uses CPU uniform transform; hydrogen momentum uses shader path.
   *  Wigner uses 2D pipeline for phase-space visualization. */
  representation?: 'position' | 'momentum' | 'wigner'
  /** Open quantum system — density matrix + Lindblad evolution (compile-time shader selection). */
  openQuantumEnabled?: boolean
}

/**
 * WebGPU renderer for quantum wavefunctions.
 */
export class WebGPUSchrodingerRenderer extends WebGPUBasePass {
  /** LRU cache for compiled render pipelines keyed by shader config. */
  private static renderPipelineCache = new Map<string, GPURenderPipeline>()
  private static readonly MAX_CACHE_SIZE = 16

  /**
   * Compute a cache key that uniquely identifies the compiled shader + pipeline descriptor.
   * Two configs producing the same key MUST produce identical shader code and pipeline state.
   */
  private static computePipelineCacheKey(
    config: SchroedingerWGSLShaderConfig,
    rendererConfig: SchrodingerRendererConfig
  ): string {
    const pipelineIs2D =
      (rendererConfig.dimension ?? 3) === 2 || rendererConfig.representation === 'wigner'
    const cacheOn = config.useEigenfunctionCache ? 1 : 0
    return [
      config.dimension,
      rendererConfig.representation ?? 'position',
      config.isosurface ? 1 : 0,
      config.temporalAccumulation ? 1 : 0,
      config.quantumMode ?? 'harmonicOscillator',
      config.termCount ?? -1,
      config.nodal ? 1 : 0,
      config.phaseMateriality ? 1 : 0,
      config.interference ? 1 : 0,
      config.uncertaintyBoundary ? 1 : 0,
      cacheOn,
      cacheOn && config.useAnalyticalGradient ? 1 : 0,
      cacheOn && config.useRobustEigenInterpolation ? 1 : 0,
      config.colorAlgorithm ?? 4,
      config.useDensityGrid ? 1 : 0,
      config.densityGridHasPhase ? 1 : 0,
      config.densityGridSize ?? 64,
      config.isWigner ? 1 : 0,
      config.useWignerCache ? 1 : 0,
      pipelineIs2D ? 1 : 0,
      config.isFreeScalar ? 1 : 0,
      config.freeScalarAnalysis ? 1 : 0,
      config.useDensityMatrix ? 1 : 0,
    ].join(':')
  }

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

  // Density Grid Compute Pass (for uncertainty boundary threshold extraction + grid raymarching)
  private densityGridPass: DensityGridComputePass | null = null
  private densityGridInitialized = false
  private densityGridSampler: GPUSampler | null = null

  // Open Quantum System state (density matrix + Lindblad evolution)
  private openQuantumState: DensityMatrix | null = null
  private openQuantumPackedBuffer: Float32Array = createPackedBuffer()
  private openQuantumFrameCounter = 0
  private openQuantumLastVonNeumann = 0
  private openQuantumInitialized = false
  private openQuantumResetTokenSeen = -1
  private openQuantumUpdateTick = 0
  private openQuantumLastSchroedingerVersion = -1

  // HO open quantum caches to avoid per-frame allocations/rebuilds
  private hoOpenQuantumCacheKey = ''
  private hoOpenQuantumChannels: LindbladChannel[] = []
  private hoOpenQuantumEnergies: Float64Array | null = null

  // Hydrogen open quantum: cached basis, rates, propagator
  private hydrogenBasis: HydrogenBasisState[] | null = null
  private hydrogenRates: TransitionRate[] | null = null
  private hydrogenChannels: LindbladChannel[] | null = null
  private hydrogenPropagator: ComplexMatrix | null = null
  private hydrogenBasisPackedBuffer: ArrayBuffer | null = null
  private hydrogenBasisLabels: string[] = []
  private hoPopulationLabels: string[] | null = null
  private hydrogenOQConfigHash = ''

  // Free Scalar Field Compute Pass (Klein-Gordon lattice simulation)
  private freeScalarFieldPass: FreeScalarFieldComputePass | null = null

  // TDSE Compute Pass (time-dependent Schroedinger equation dynamics)
  private tdsePass: TDSEComputePass | null = null
  private diracPass: DiracComputePass | null = null

  // Eigenfunction Cache Compute Pass (HO mode acceleration)
  private eigenCachePass: EigenfunctionCacheComputePass | null = null
  private eigenCacheInitialized = false
  private wignerCachePass: WignerCacheComputePass | null = null
  private wignerCacheInitialized = false

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

  // Wigner cache resolution tracking
  private lastWignerCacheResolution = 256

  // FSF diagnostic: throttled per-second state reporting
  private _fsfDiagLastTime = 0
  private _fsfDiagLastCamDist = -1
  private _fsfDiagLastCanvasW = -1
  private _fsfDiagLastCanvasH = -1

  constructor(config?: SchrodingerRendererConfig) {
    // Determine outputs based on mode
    // Write to 'object-color' like other renderers (Mandelbulb, Julia, Polytope)
    // EnvironmentCompositePass will composite object-color over environment to produce hdr-color
    // Isosurface mode uses color + depth
    // Volumetric mode uses color + depth (alpha blending handled by EnvironmentCompositePass)
    // Temporal mode uses quarter-res outputs that get accumulated by WebGPUTemporalCloudPass
    // Temporal takes priority: isosurface+temporal uses quarter-res (no depth buffer)
    const isWigner = config?.representation === 'wigner'
    // Free scalar field requires volumetric 3D rendering — override 2D pipeline even if dimension=2
    const isFreeScalarEarly = config?.quantumMode === 'freeScalarField'
    // TDSE / BEC / Dirac dynamics also require volumetric 3D rendering via density grid
    const isTdseEarly = config?.quantumMode === 'tdseDynamics' || config?.quantumMode === 'becDynamics'
    const isDiracEarly = config?.quantumMode === 'diracEquation'
    const isComputeEarly = isFreeScalarEarly || isTdseEarly || isDiracEarly
    // Compute modes do not support temporal reprojection (no world position output)
    const isTemporal = (config?.temporal ?? false) && !isComputeEarly
    const is2D = !isComputeEarly && (config?.dimension ?? 3) === 2
    const pipelineIs2D = is2D || (isWigner && !isComputeEarly)
    const outputs = pipelineIs2D
      ? [
          // 2D mode: only color output (no depth, no normal, no temporal)
          { resourceId: 'object-color', access: 'write' as const, binding: 0 },
        ]
      : isTemporal
        ? [
            // Temporal mode (volumetric or isosurface): quarter-res color + position for temporal accumulation
            // No depth buffer needed - all targets are quarter-res, composited in environment pass
            { resourceId: 'quarter-color', access: 'write' as const, binding: 0 },
            { resourceId: 'quarter-position', access: 'write' as const, binding: 1 },
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
      analyticalGradientEnabled: true,
      fastEigenInterpolationEnabled: true,
      ...config,
    }

    // Force-disable 3D-only features for 2D and Wigner modes
    if (pipelineIs2D) {
      this.rendererConfig.temporal = false
      this.rendererConfig.eigenfunctionCacheEnabled = false
      this.rendererConfig.analyticalGradientEnabled = false
      this.rendererConfig.fastEigenInterpolationEnabled = false
    }

    const enableCache = this.rendererConfig.eigenfunctionCacheEnabled ?? !pipelineIs2D

    // Free scalar field mode: uses density grid exclusively, no eigencache or wigner
    const isFreeScalar = this.rendererConfig.quantumMode === 'freeScalarField'
    // TDSE / BEC dynamics mode: also uses density grid exclusively via compute pass
    const isTdse = this.rendererConfig.quantumMode === 'tdseDynamics' || this.rendererConfig.quantumMode === 'becDynamics'
    // Dirac equation mode: spinor field evolution via split-operator, density grid only
    const isDirac = this.rendererConfig.quantumMode === 'diracEquation'
    // Unified flag for all compute-based modes (density grid, no eigencache)
    const isComputeMode = isFreeScalar || isTdse || isDirac

    // Free scalar field: temporal reprojection is unsupported (no world position output).
    // Must be set here (not just in shaderConfig) so pipeline targets and render pass
    // attachment counts match the fragment shader output count.
    // Also force dimension to at least 3 for shader composition (free scalar uses volumetric 3D).
    if (isFreeScalar) {
      this.rendererConfig.temporal = false
      if ((this.rendererConfig.dimension ?? 3) < 3) {
        this.rendererConfig.dimension = 3
      }
    }

    // TDSE / Dirac dynamics: same constraints as free scalar — no temporal, force 3D minimum.
    if (isTdse || isDirac) {
      this.rendererConfig.temporal = false
      if ((this.rendererConfig.dimension ?? 3) < 3) {
        this.rendererConfig.dimension = 3
      }
    }

    // Density grid raymarching: ALL 3D+ volumetric modes sample from a precomputed 3D texture
    // instead of evaluating evalPsi inline per raymarch step. This includes standard HO, hydrogen,
    // open-quantum, and compute-based modes (TDSE/BEC/Dirac/freeScalar).
    // Adaptive grid resolution: 96^3 for 3D, 96^3 for 4-5D, 128^3 for 6-11D.
    // Isosurface mode must NOT use the density grid: voxel-aligned rectangle artifacts
    // at threshold crossings between lobes/nodal surfaces.
    // 2D/Wigner excluded: no volumetric raymarching.
    const isHydrogen = this.rendererConfig.quantumMode === 'hydrogenND'
    const dim = this.rendererConfig.dimension ?? 3
    const isosurface = this.rendererConfig.isosurface ?? false
    const openQuantumEnabled = this.rendererConfig.openQuantumEnabled ?? false
    // Use density grid for: all 3D+ volumetric modes (compute, HO, hydrogen, open-quantum).
    // Excluded: isosurface (voxel artifacts), 2D/Wigner (no volumetric raymarching).
    const useDensityGrid = isComputeMode || (!isosurface && !pipelineIs2D)
    const baseDensityGridSize = isComputeMode
      ? 96
      : !useDensityGrid
        ? 64
        : dim <= 3
          ? 96
          : dim <= 5
            ? 96
            : 128
    // Open quantum mode: reduce grid when K is large to control O(K²) per-voxel cost.
    // For HO, K = termCount (known at construction). For hydrogen, K depends on runtime
    // maxN — use termCount as conservative fallback (typically 1-8 vs hydrogen K up to 14).
    const estimatedK = openQuantumEnabled
      ? (isHydrogen ? 10 : (this.rendererConfig.termCount ?? 4))
      : 0
    const densityGridSize = openQuantumEnabled
      ? WebGPUSchrodingerRenderer.computeOpenQuantumGridSize(baseDensityGridSize, estimatedK)
      : baseDensityGridSize

    // Eigenfunction cache is only supported on 3D pipelines.
    // 2D/Wigner reuses group(2) bindings 2/3 for the Wigner cache texture + sampler.
    // For HO momentum (3D), the uniform buffer contains 1/ω → cache produces k-space functions automatically.
    const useEigenfunctionCache = (useDensityGrid || pipelineIs2D) ? false : enableCache
    const useAnalyticalGradient = isComputeMode
      ? false
      : (this.rendererConfig.analyticalGradientEnabled ?? true)
    // Fast toggle semantics:
    // - ON  => fast legacy interpolation (robust mode OFF)
    // - OFF => robust interpolation/extrapolation (higher quality, slower)
    const useRobustEigenInterpolation = isComputeMode
      ? false
      : !(this.rendererConfig.fastEigenInterpolationEnabled ?? true)

    // For shader composition, compute-based modes map to 'harmonicOscillator' since
    // they only use the density grid sampling path (no inline wavefunction evaluation).
    const shaderQuantumMode: QuantumModeForShader = isComputeMode
      ? 'harmonicOscillator'
      : (this.rendererConfig.quantumMode as QuantumModeForShader)

    this.shaderConfig = {
      dimension: this.rendererConfig.dimension!,
      isosurface: this.rendererConfig.isosurface,
      quantumMode: shaderQuantumMode,
      termCount: isComputeMode ? 1 : this.rendererConfig.termCount,
      nodal: isComputeMode ? false : (this.rendererConfig.nodalEnabled ?? true),
      colorAlgorithm: this.rendererConfig.colorAlgorithm,
      temporalAccumulation: isComputeMode ? false : this.rendererConfig.temporal,
      phaseMateriality: isComputeMode
        ? false
        : (this.rendererConfig.phaseMaterialityEnabled ?? true),
      interference: isComputeMode ? false : (this.rendererConfig.interferenceEnabled ?? true),
      uncertaintyBoundary: isComputeMode
        ? false
        : (this.rendererConfig.uncertaintyBoundaryEnabled ?? true),
      useEigenfunctionCache,
      useAnalyticalGradient,
      useRobustEigenInterpolation,
      useDensityGrid,
      densityGridSize,
      densityGridHasPhase: isComputeMode ? true : undefined,
      isWigner: isComputeMode ? false : isWigner,
      useWignerCache: isComputeMode ? false : isWigner,
      isFreeScalar: isComputeMode,
      freeScalarAnalysis:
        isFreeScalar &&
        this.rendererConfig.colorAlgorithm !== undefined &&
        this.rendererConfig.colorAlgorithm >= 12 &&
        this.rendererConfig.colorAlgorithm <= 15,
      useDensityMatrix: this.rendererConfig.openQuantumEnabled ?? false,
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
    try {
      await this.createPipelineImpl(ctx)
    } catch (err) {
      // On ANY error, clear all static pipeline caches to prevent stale/bad entries
      // from persisting across rebuild attempts.
      console.error('[SchrodingerRenderer] Pipeline creation failed, clearing all caches:', err)
      WebGPUSchrodingerRenderer.renderPipelineCache.clear()
      DensityGridComputePass.clearPipelineCache()
      EigenfunctionCacheComputePass.clearPipelineCache()
      throw err
    }
  }

  private async createPipelineImpl(ctx: WebGPUSetupContext): Promise<void> {
    const { device } = ctx
    // Force full uniform buffer writes on first frame after (re)initialization.
    // All version trackers must be reset because uniform buffers are recreated empty.
    this.lastLightingVersion = -1
    this.lastQualitySignature = ''
    this.lastBasisRotationVersion = -1
    this.lastBasisSchroedingerVersion = -1
    this.lastBasisDimension = -1
    this.lastBasisAnimationTime = Number.NaN
    this.lastPbrVersion = -1
    this.lastSchrodingerPbrVersion = -1
    this.lastSchroedingerVersion = -1
    this.lastSchrodingerAppearanceVersion = -1
    this.lastAppearanceVersion = -1

    const dim = this.rendererConfig.dimension ?? 3
    const isFreeScalar = this.rendererConfig.quantumMode === 'freeScalarField'
    const isTdse = this.rendererConfig.quantumMode === 'tdseDynamics' || this.rendererConfig.quantumMode === 'becDynamics'
    const isDirac = this.rendererConfig.quantumMode === 'diracEquation'
    const isHydrogen = this.rendererConfig.quantumMode === 'hydrogenND'
    const openQuantumEnabled = this.rendererConfig.openQuantumEnabled ?? false
    const isComputeMode = isFreeScalar || isTdse || isDirac
    // Compute-based modes require volumetric 3D rendering — override 2D pipeline
    const pipelineIs2D = !isComputeMode && (dim === 2 || this.rendererConfig.representation === 'wigner')
    const forceRgba = this.shaderConfig.useDensityGrid || dim > 3 || openQuantumEnabled || isHydrogen

    // =====================================================================
    // Phase 1: Construct compute passes and start parallel initialization
    // =====================================================================

    // Density grid compute pass provides uncertainty boundary threshold extraction.
    // Skip for 2D mode (no volumetric raymarching).
    // Free scalar field mode uses its own compute pass instead.
    this.densityGridPass?.dispose()
    this.densityGridPass = null
    this.densityGridInitialized = false
    this.freeScalarFieldPass?.dispose()
    this.freeScalarFieldPass = null
    this.tdsePass?.dispose()
    this.tdsePass = null
    this.diracPass?.dispose()
    this.diracPass = null

    // Reset open quantum state on pipeline rebuild (new shader variant)
    this.openQuantumState = null
    this.openQuantumInitialized = false
    this.openQuantumFrameCounter = 0
    this.openQuantumResetTokenSeen = -1
    this.openQuantumUpdateTick = 0
    this.openQuantumLastSchroedingerVersion = -1
    this.hoOpenQuantumCacheKey = ''
    this.hoOpenQuantumChannels = []
    this.hoOpenQuantumEnergies = null
    // Reset hydrogen-specific open quantum caches
    this.hydrogenBasis = null
    this.hydrogenRates = null
    this.hydrogenChannels = null
    this.hydrogenPropagator = null
    this.hydrogenBasisPackedBuffer = null
    this.hydrogenBasisLabels = []
    this.hoPopulationLabels = null
    this.hydrogenOQConfigHash = ''

    let densityPromise: Promise<void> | null = null
    if (!pipelineIs2D && !isComputeMode) {
      const isHydrogenOQ = openQuantumEnabled && isHydrogen
      this.densityGridPass = new DensityGridComputePass({
        dimension: dim,
        quantumMode: this.rendererConfig.quantumMode as 'harmonicOscillator' | 'hydrogenND',
        termCount: this.rendererConfig.termCount,
        gridSize: this.shaderConfig.densityGridSize,
        forceRgba,
        useDensityMatrix: openQuantumEnabled,
        useHydrogenBasis: isHydrogenOQ,
      })
      densityPromise = this.densityGridPass.initialize(ctx)
    }

    // Free scalar field: create its own compute pass
    if (isFreeScalar) {
      this.freeScalarFieldPass = new FreeScalarFieldComputePass()
      // Eagerly create density texture so it's available for bind group creation below.
      // Field buffers and pipelines are built lazily on first executeField().
      this.freeScalarFieldPass.initializeDensityTexture(device)
    }

    // TDSE dynamics: create its own compute pass
    if (isTdse) {
      this.tdsePass = new TDSEComputePass()
      this.tdsePass.initializeDensityTexture(device)
    }

    // Dirac equation: create its own compute pass
    if (isDirac) {
      this.diracPass = new DiracComputePass()
      this.diracPass.initializeDensityTexture(device)
    }

    // Eigenfunction cache compute pass (HO mode + hydrogen ND extra dims)
    // Skip for 2D mode (direct evaluation is fast enough).
    this.eigenCachePass?.dispose()
    this.eigenCachePass = null
    this.eigenCacheInitialized = false

    let eigenPromise: Promise<void> | null = null
    if (!pipelineIs2D && this.shaderConfig.useEigenfunctionCache) {
      this.eigenCachePass = new EigenfunctionCacheComputePass({
        dimension: dim,
        isHydrogenND: this.rendererConfig.quantumMode === 'hydrogenND',
      })
      eigenPromise = this.eigenCachePass.initialize(ctx)
    }

    // Wigner cache compute pass (pre-computes W(x,p) on a 2D grid)
    this.wignerCachePass?.dispose()
    this.wignerCachePass = null
    this.wignerCacheInitialized = false

    let wignerPromise: Promise<void> | null = null
    if (this.shaderConfig.isWigner) {
      this.wignerCachePass = new WignerCacheComputePass({
        dimension: dim,
        quantumMode: this.shaderConfig.quantumMode,
        termCount: this.rendererConfig.termCount,
      })
      wignerPromise = this.wignerCachePass.initialize(ctx)
    }

    // =====================================================================
    // Phase 2: Determine density grid format for shader composition
    // forceRgba is always true for hydrogen (phase data needed for color
    // algorithms) and for dim > 3 / openQuantum, so format is known early.
    // =====================================================================

    if (this.shaderConfig.useDensityGrid && this.densityGridPass) {
      this.shaderConfig.densityGridHasPhase = true
    }

    // =====================================================================
    // Phase 3: Render pipeline — check cache or start async compilation
    // =====================================================================

    const cacheKey = WebGPUSchrodingerRenderer.computePipelineCacheKey(
      this.shaderConfig,
      this.rendererConfig
    )
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

    // Group 2: Object (Schroedinger + Basis + optional Cache)
    const objectBindGroupEntries: GPUBindGroupLayoutEntry[] = [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Schroedinger uniforms
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } }, // Basis vectors
    ]
    // Eigenfunction cache: storage buffer + metadata uniform
    if (this.eigenCachePass) {
      objectBindGroupEntries.push(
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: { type: 'read-only-storage' as const },
        }, // eigenCache
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' as const } } // eigenMeta
      )
    }
    // Wigner cache: pre-computed 2D texture + bilinear sampler (same slots as eigencache, mutually exclusive)
    if (this.wignerCachePass) {
      objectBindGroupEntries.push(
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: 'float' as const, viewDimension: '2d' as const },
        }, // wignerCacheTexture
        {
          binding: 3,
          visibility: GPUShaderStage.FRAGMENT,
          sampler: { type: 'filtering' as const },
        } // wignerCacheSampler
      )
    }
    // Density grid texture + sampler for grid-based raymarching (hydrogen, free scalar, TDSE, or Dirac)
    if (this.shaderConfig.useDensityGrid && (this.densityGridPass || this.freeScalarFieldPass || this.tdsePass || this.diracPass)) {
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
        } // densityGridSampler
      )
    }
    // Analysis texture for free-scalar educational color modes (binding 6)
    if (this.shaderConfig.freeScalarAnalysis && this.freeScalarFieldPass) {
      objectBindGroupEntries.push({
        binding: 6,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float' as const, viewDimension: '3d' as const },
      }) // analysisTexture (reuses densityGridSampler at binding 5)
    }
    const objectBindGroupLayout = device.createBindGroupLayout({
      label: 'schroedinger-object-bgl',
      entries: objectBindGroupEntries,
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
                ? [
                    { format: 'rgba16float' as GPUTextureFormat },
                  ]
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

    const pendingWork: Promise<void>[] = []

    // Remaining compute pass initializations (some may already be resolved)
    if (densityPromise) {
      pendingWork.push(
        densityPromise.then(() => {
          this.densityGridInitialized = true
        })
      )
    }
    if (eigenPromise) {
      pendingWork.push(
        eigenPromise.then(() => {
          this.eigenCacheInitialized = true
        })
      )
    }
    if (wignerPromise) {
      pendingWork.push(
        wignerPromise.then(() => {
          this.wignerCacheInitialized = true
        })
      )
    }

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
      console.log(
        `[SchrodingerRenderer] Phase 4 complete: pipeline=${!!this.renderPipeline}`,
        `density=${this.densityGridInitialized} eigen=${this.eigenCacheInitialized} wigner=${this.wignerCacheInitialized}`
      )
    }

    // =====================================================================
    // Phase 5: Create uniform buffers, bind groups, geometry (always fresh)
    // These are per-instance and cheap to create (~1ms total).
    // =====================================================================

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
          { binding: 3, resource: { buffer: metaBuffer } }
        )
      }
    }
    // Wigner cache: pre-computed 2D texture + bilinear sampler
    if (this.wignerCachePass) {
      const cacheView = this.wignerCachePass.getCacheTextureView()
      const cacheSampler = this.wignerCachePass.getCacheSampler()
      if (cacheView && cacheSampler) {
        objectBindGroupEntries2.push(
          { binding: 2, resource: cacheView },
          { binding: 3, resource: cacheSampler }
        )
      }
    }
    // Density grid texture + sampler for grid-based raymarching
    // Used by hydrogen density grid mode, free scalar field mode, and TDSE mode
    const densityView = this.freeScalarFieldPass
      ? this.freeScalarFieldPass.getDensityTextureView()
      : this.tdsePass
        ? this.tdsePass.getDensityTextureView()
        : this.diracPass
          ? this.diracPass.getDensityTextureView()
          : (this.densityGridPass?.getDensityTextureView() ?? null)
    if (this.shaderConfig.useDensityGrid && densityView) {
      // Create trilinear-filtering sampler for smooth grid interpolation
      this.densityGridSampler = device.createSampler({
        label: 'density-grid-sampler',
        magFilter: 'linear',
        minFilter: 'linear',
      })
      objectBindGroupEntries2.push(
        { binding: 4, resource: densityView },
        { binding: 5, resource: this.densityGridSampler }
      )
    }
    // Analysis texture for free-scalar educational color modes
    if (this.shaderConfig.freeScalarAnalysis && this.freeScalarFieldPass) {
      const analysisView = this.freeScalarFieldPass.getAnalysisTextureView()
      if (analysisView) {
        objectBindGroupEntries2.push({ binding: 6, resource: analysisView })
      }
    }
    this.objectBindGroup = device.createBindGroup({
      label: 'schroedinger-object-bg',
      layout: objectBindGroupLayout,
      entries: objectBindGroupEntries2,
    })

    // Create bounding geometry (sphere for volume) — not needed for 2D fullscreen triangle
    if (!pipelineIs2D) {
      this.createBoundingGeometry(device)
    }
  }

  private createBoundingGeometry(device: GPUDevice): void {
    // Destroy old buffers to prevent GPU memory leaks during dynamic bounding radius changes
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

    // Get animation time (respects pause state)
    const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
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
    const is2D =
      (this.rendererConfig.dimension ?? 3) === 2 || this.rendererConfig.representation === 'wigner'
    let scale: number
    let posX: number
    let posY: number
    let posZ: number

    if (is2D) {
      // 2D mode: derive model matrix from camera state (pan + zoom)
      // Camera target XY = pan offset, camera distance = zoom level
      const camPos = camera.position ?? { x: 0, y: 0, z: 8 }
      const camTarget = camera.target ?? { x: 0, y: 0, z: 0 }
      // Distance from camera to target (default = 8)
      const dx = camPos.x - (camTarget.x ?? 0)
      const dy = camPos.y - (camTarget.y ?? 0)
      const dz = camPos.z - (camTarget.z ?? 0)
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
      const defaultDistance = 8.0
      // Zoom: farther = see more (scale up), closer = see less (scale down)
      scale = distance > 0 ? distance / defaultDistance : 1.0
      // Pan: camera target XY determines view center
      posX = camTarget.x ?? 0
      posY = camTarget.y ?? 0
      posZ = 0
    } else {
      // 3D mode: read transform from store for position/scale
      const transform = getStoreSnapshot<TransformSnapshot>(ctx, 'transform')
      scale = transform?.uniformScale ?? 1.0
      const position = transform?.position ?? [0, 0, 0]
      posX = position[0] ?? 0
      posY = position[1] ?? 0
      posZ = position[2] ?? 0
    }

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
    data[92] = posX
    data[93] = posY
    data[94] = posZ
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
    data[108] = -posX * invScale
    data[109] = -posY * invScale
    data[110] = -posZ * invScale
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

    // DIAGNOSTIC: Detect aspect ratio mismatch between projection matrix and ctx.size
    if (import.meta.env.DEV && camera.projectionMatrix?.elements) {
      // Projection matrix element [0] = 1/(aspect*tan(fov/2)), element [5] = 1/tan(fov/2)
      // So projAspect = element[5] / element[0]
      const projAspect = camera.projectionMatrix.elements[5]! / camera.projectionMatrix.elements[0]!
      const ctxAspect = ctx.size.width / ctx.size.height
      if (Math.abs(projAspect - ctxAspect) > 0.01) {
        console.warn(
          `[Schrodinger] ASPECT MISMATCH! projection: ${projAspect.toFixed(4)}, ctx.size: ${ctxAspect.toFixed(4)} (${ctx.size.width}×${ctx.size.height})`
        )
      }
    }
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
      [1], // H_0
      [0, 2], // H_1
      [-2, 0, 4], // H_2
      [0, -12, 0, 8], // H_3
      [12, 0, -48, 0, 16], // H_4
      [0, 120, 0, -160, 0, 32], // H_5
      [-120, 0, 720, 0, -480, 0, 64], // H_6
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
      const peak1D = (Math.sqrt(omega / Math.PI) / twoN_nFact) * maxHermiteSq
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

    const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
    const schroedinger = extended?.schroedinger
    const schroedingerVersion = extended?.schroedingerVersion ?? 0
    // Get PBR data for roughness (WebGL uses 'pbr-face' source via UniformManager)
    const pbr = getStoreSnapshot<PBRSliceState>(ctx, 'pbr')
    // Get appearance data for SSS/Fresnel (global appearance controls)
    const appearance = getStoreSnapshot<AppearanceStoreState>(ctx, 'appearance')
    // Get animation time (respects pause state)
    const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
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
    const geometry = getStoreSnapshot<GeometryState>(ctx, 'geometry')
    const dimension = geometry?.dimension ?? this.rendererConfig.dimension ?? 3

    // --- Quantum mode mapping (string to int, like WebGL) ---
    const quantumModeStr = schroedinger?.quantumMode ?? 'harmonicOscillator'
    const quantumModeInt = QUANTUM_MODE_MAP[quantumModeStr] ?? 0
    // Compute modes (FSF/TDSE) use density grids; analytic-only features must be disabled
    // even if stale store state still holds incompatible values (e.g. from preset loading).
    const isUniformComputeMode = quantumModeStr === 'freeScalarField' || quantumModeStr === 'tdseDynamics' || quantumModeStr === 'becDynamics'

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

    // UI slider step is 1e-4, so use a much smaller epsilon to avoid regeneration dead zones.
    const frequencySpreadChanged =
      !this.cachedPresetConfig ||
      Math.abs(this.cachedPresetConfig.frequencySpread - currentConfig.frequencySpread) > 1e-6

    const needsPresetRegen =
      !this.cachedPresetConfig ||
      this.cachedPresetConfig.presetName !== currentConfig.presetName ||
      this.cachedPresetConfig.seed !== currentConfig.seed ||
      this.cachedPresetConfig.termCount !== currentConfig.termCount ||
      this.cachedPresetConfig.maxQuantumNumber !== currentConfig.maxQuantumNumber ||
      frequencySpreadChanged ||
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
      // Reset open quantum state so density matrix re-initializes from new coefficients
      this.openQuantumInitialized = false
      this.openQuantumLastSchroedingerVersion = -1
      this.hoOpenQuantumCacheKey = ''
      this.hoOpenQuantumChannels = []
      this.hoOpenQuantumEnergies = null
    }

    // Compute effective momentum scale incorporating display units.
    // p-space (p = ħk) requires dividing the zoom by ħ so the shader evaluates at k = p/ħ.
    // For normalized/k-space (ħ=1 by definition), this is a no-op.
    const isPSpace = schroedinger?.momentumDisplayUnits === 'p'
    const hbar = isPSpace ? Math.max(schroedinger?.momentumHbar ?? 1.0, 1e-4) : 1.0
    const effectiveMomentumScale = (schroedinger?.momentumScale ?? 1.0) / hbar

    // Compute bounding radius for free scalar field mode (lattice extent)
    if (schroedinger?.quantumMode === 'freeScalarField' && schroedinger?.freeScalar) {
      const fs = schroedinger.freeScalar
      // Use max extent over ALL active dimensions (not just 0..2) so that
      // after N-D rotation, the density texture covers the full lattice.
      let maxExtent = 0
      for (let d = 0; d < (fs.latticeDim ?? 3); d++) {
        const Ld = (fs.gridSize?.[d] ?? 32) * (fs.spacing?.[d] ?? 0.1)
        if (Ld > maxExtent) maxExtent = Ld
      }
      if (maxExtent <= 0) maxExtent = 3.2
      // 1.15x margin so the field doesn't fill the entire cube edge-to-edge
      const newBoundR = maxExtent / 2 * 1.15
      const quantStep = WebGPUSchrodingerRenderer.BOUND_RADIUS_QUANT_STEP
      const quantizedBoundR = Math.ceil(newBoundR / quantStep) * quantStep
      if (
        Math.abs(quantizedBoundR - this.boundingRadius) >=
          WebGPUSchrodingerRenderer.BOUND_RADIUS_REBUILD_THRESHOLD &&
        this.device
      ) {
        if (import.meta.env.DEV) {
          console.log(
            `[FSF-DIAG] boundingRadius: ${this.boundingRadius.toFixed(3)} → ${quantizedBoundR.toFixed(3)}` +
              ` (maxExtent=${maxExtent.toFixed(2)}, dim=${fs.latticeDim})`
          )
        }
        this.boundingRadius = quantizedBoundR
        this.createBoundingGeometry(this.device)
      }
    }

    // Compute bounding radius for TDSE dynamics mode (lattice extent + margin)
    // 2x multiplier gives the wavepacket ample room to propagate outward
    // from the lattice centre without clipping at the render volume boundary.
    const isTdseBound = schroedinger?.quantumMode === 'tdseDynamics' || schroedinger?.quantumMode === 'becDynamics'
    const latticeConfig = schroedinger?.quantumMode === 'becDynamics' ? schroedinger?.bec : schroedinger?.tdse
    if (isTdseBound && latticeConfig) {
      const td = latticeConfig
      // Use max extent over ALL active dimensions (not just 0..2) so that
      // after N-D rotation, the density texture covers the full lattice.
      let maxExtent = 0
      for (let d = 0; d < (td.latticeDim ?? 3); d++) {
        const Ld = (td.gridSize?.[d] ?? 32) * (td.spacing?.[d] ?? 0.1)
        if (Ld > maxExtent) maxExtent = Ld
      }
      if (maxExtent <= 0) maxExtent = 3.2
      const newBoundR = maxExtent / 2 * 2.0
      const quantStep = WebGPUSchrodingerRenderer.BOUND_RADIUS_QUANT_STEP
      const quantizedBoundR = Math.ceil(newBoundR / quantStep) * quantStep
      if (
        Math.abs(quantizedBoundR - this.boundingRadius) >=
          WebGPUSchrodingerRenderer.BOUND_RADIUS_REBUILD_THRESHOLD &&
        this.device
      ) {
        if (import.meta.env.DEV) {
          console.log(
            `[TDSE-DIAG] boundingRadius: ${this.boundingRadius.toFixed(3)} → ${quantizedBoundR.toFixed(3)}` +
              ` (maxExtent=${maxExtent.toFixed(2)}, dim=${td.latticeDim})`
          )
        }
        this.boundingRadius = quantizedBoundR
        this.createBoundingGeometry(this.device)
      }
    }

    // Compute bounding radius for Dirac mode from actual lattice extent
    const isDiracBound = schroedinger?.quantumMode === 'diracEquation'
    const diracConfig = schroedinger?.dirac
    if (isDiracBound && diracConfig) {
      let maxExtent = 0
      for (let d = 0; d < (diracConfig.latticeDim ?? 3); d++) {
        const Ld = (diracConfig.gridSize?.[d] ?? 32) * (diracConfig.spacing?.[d] ?? 0.15)
        if (Ld > maxExtent) maxExtent = Ld
      }
      if (maxExtent <= 0) maxExtent = 3.2
      const newBoundR = maxExtent / 2 * 1.15
      const quantStep = WebGPUSchrodingerRenderer.BOUND_RADIUS_QUANT_STEP
      const quantizedBoundR = Math.ceil(newBoundR / quantStep) * quantStep
      if (
        Math.abs(quantizedBoundR - this.boundingRadius) >=
          WebGPUSchrodingerRenderer.BOUND_RADIUS_REBUILD_THRESHOLD &&
        this.device
      ) {
        this.boundingRadius = quantizedBoundR
        this.createBoundingGeometry(this.device)
      }
    }

    // Compute physics-based bounding radius for this state.
    // Must run on EVERY full update (not just preset regen) because hydrogen n/l/m
    // changes affect bounding radius but don't trigger HO preset regeneration.
    if (this.cachedPreset && schroedinger?.quantumMode !== 'freeScalarField' && schroedinger?.quantumMode !== 'tdseDynamics' && schroedinger?.quantumMode !== 'becDynamics' && schroedinger?.quantumMode !== 'diracEquation') {
      const quantumModeStr = schroedinger?.quantumMode ?? 'harmonicOscillator'
      const extraDimQuantumNumbers = schroedinger?.extraDimQuantumNumbers as number[] | undefined
      const extraDimOmega = schroedinger?.extraDimOmega as number[] | undefined
      // Open quantum hydrogen uses basis states up to maxN — bounding radius must
      // cover the largest orbital in the basis, not just the current UI selection.
      const oqCfg = schroedinger?.openQuantum
      const effectiveN = (this.rendererConfig.openQuantumEnabled && oqCfg?.enabled && quantumModeStr === 'hydrogenND')
        ? Math.max(schroedinger?.principalQuantumNumber ?? 2, oqCfg.hydrogenBasisMaxN ?? 2)
        : (schroedinger?.principalQuantumNumber ?? 2)
      const rawBoundR = computeBoundingRadius(
        quantumModeStr,
        this.cachedPreset,
        dimension,
        effectiveN,
        schroedinger?.bohrRadiusScale ?? 1.0,
        extraDimQuantumNumbers,
        extraDimOmega,
        (schroedinger?.representation === 'momentum' ? 'momentum' : 'position'),
        effectiveMomentumScale
      )
      // Convert from physical to model-space: fieldScale rescales coordinates
      // via mapPosToND, so the bounding sphere must shrink accordingly.
      const fieldScale = schroedinger?.fieldScale ?? 1.0
      const newBoundR = rawBoundR / Math.max(fieldScale, 1e-4)
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

    // Compute auto-compensation AFTER bounding radius update so stepLen estimate is correct.
    // Free scalar field and TDSE use density grids with normalized [0,1] values, so the HO
    // canonical compensation factor is irrelevant and must remain 1.0.
    // This guard runs unconditionally for grid-based modes to prevent stale compensation
    // from a previous mode (e.g., HO) carrying over after a mode switch.
    if (schroedinger?.quantumMode === 'freeScalarField' || schroedinger?.quantumMode === 'tdseDynamics' || schroedinger?.quantumMode === 'becDynamics' || schroedinger?.quantumMode === 'diracEquation') {
      this.canonicalDensityCompensation = 1.0
      this.cachedPeakDensity = 1.0
    } else if (needsPresetRegen && this.cachedPreset) {
      this.canonicalDensityCompensation = this.computeCanonicalCompensation(
        this.cachedPreset,
        dimension
      )
    }

    // Use cached flattened preset data
    const presetData = this.flattenedPreset
    const presetTermCount = this.cachedPreset?.termCount ?? 1

    // Density matrix mode flag: features that depend on inline single-wavefunction
    // evaluation (evalPsi) are physically incorrect for mixed states and must be
    // disabled. The density grid computes Tr(ρ|x⟩⟨x|) from the full density matrix;
    // inline evalPsi evaluates only one wavefunction from the superposition.
    const isDensityMatrixMode = this.rendererConfig.openQuantumEnabled ?? false

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

    // hydrogenNDBoost: compensate for HO normalization in extra dimensions.
    // Each extra dim's ho1D includes alphaNorm = (ω/π)^{1/4}, giving density
    // factor (ω/π)^{1/2} per dim. This compounds exponentially and makes
    // high-D orbitals invisible. Invert the normalization: Π sqrt(π/ω_i).
    const numExtraDims = Math.max(0, dimension - 3)
    let normCompensation = 1.0
    for (let i = 0; i < numExtraDims; i++) {
      const baseOmega = (schroedinger?.extraDimOmega as number[] | undefined)?.[i] ?? 1.0
      const spread = 1.0 + (i - 3.5) * (schroedinger?.extraDimFrequencySpread ?? 0)
      const effectiveOmega = Math.max(baseOmega * spread, 0.01)
      normCompensation *= Math.sqrt(Math.PI / effectiveOmega)
    }
    const hydrogenNDBoost = hydrogenBoost * normCompensation
    floatView[600 / 4] = hydrogenNDBoost

    // hydrogenRadialThreshold = 25 * n * a0 * (1 + 0.1*l) * fieldScale
    // Shader compares against length(ndPos) which is already scaled by fieldScale,
    // so the threshold must be in the same scaled coordinate space.
    const hydrogenFieldScale = schroedinger?.fieldScale ?? 1.0
    const hydrogenRadialThreshold =
      25.0 * validN * bohrRadius * (1.0 + 0.1 * validL) * hydrogenFieldScale
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

    // Reserved padding at offset 720-756 (formerly SSS — shader reads from MaterialUniforms)
    intView[720 / 4] = 0
    floatView[724 / 4] = 0.0
    floatView[736 / 4] = 0.0
    floatView[740 / 4] = 0.0
    floatView[744 / 4] = 0.0
    floatView[748 / 4] = 0.0
    floatView[752 / 4] = 0.0
    floatView[756 / 4] = 0.0

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

    // Nodal fields — disabled in density matrix mode (mixed states have no nodal surfaces)
    intView[864 / 4] = (!isDensityMatrixMode && schroedinger?.nodalEnabled) ? 1 : 0

    // nodalColor (vec3f at offset 880 after padding) - WebGL default: cyan (#00ffff)
    const nodalColor = this.parseColor(schroedinger?.nodalColor ?? '#00ffff')
    floatView[880 / 4] = nodalColor[0]
    floatView[884 / 4] = nodalColor[1]
    floatView[888 / 4] = nodalColor[2]
    floatView[892 / 4] = schroedinger?.nodalStrength ?? 1.0 // WebGL default: 1.0

    // More fields
    intView[896 / 4] = 0 // _padEnergy (unused)
    intView[900 / 4] = schroedinger?.uncertaintyBoundaryEnabled ? 1 : 0
    floatView[904 / 4] = schroedinger?.uncertaintyBoundaryStrength ?? 0.5
    floatView[908 / 4] = animationTime // time (respects animation pause state)
    intView[912 / 4] = schroedinger?.isoEnabled ? 1 : 0
    floatView[916 / 4] = schroedinger?.isoThreshold ?? -3.0 // WebGL default: -3.0
    // HQ mode (quality >= 0.75) uses 64 samples, fast mode uses 32
    // Scale sample count by bounding radius ratio to maintain step density
    const performance = getStoreSnapshot<PerformanceSnapshot>(ctx, 'performance')
    const qualityMultiplier = performance?.qualityMultiplier ?? 1.0
    const fastMode = qualityMultiplier < 0.75
    const defaultSampleCount = fastMode ? 32 : 64
    const baseSampleCount = schroedinger?.sampleCount ?? defaultSampleCount
    const radiusScale = this.boundingRadius / 2.0
    const effectiveSampleCount = Math.min(Math.max(8, Math.ceil(baseSampleCount * radiusScale)), 96)
    intView[920 / 4] = effectiveSampleCount

    // Reserved padding at offset 924-936 (formerly phase shift, removed)
    intView[924 / 4] = 0
    floatView[928 / 4] = 0.0
    floatView[932 / 4] = 0.0
    floatView[936 / 4] = 0.0

    // Color algorithm system (offset 940+)
    // Use canonical mapping shared with WebGL (palette/types.ts COLOR_ALGORITHM_TO_INT)
    const colorAlgorithm =
      this.rendererConfig.colorAlgorithm ??
      COLOR_ALGORITHM_MAP[appearance?.colorAlgorithm ?? 'radialDistance'] ??
      11
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

    // Reserved padding at offset 1024-1036 (formerly fog + erosionHQ, removed)
    intView[1024 / 4] = 0
    floatView[1028 / 4] = 0.0
    floatView[1032 / 4] = 0.0
    intView[1036 / 4] = 0

    // Dynamic bounding radius (offset 1040+)
    floatView[1040 / 4] = this.boundingRadius
    floatView[1044 / 4] = 1.0 / this.boundingRadius
    // Phase materiality — disabled in DM mode (coherenceFraction ≠ complex phase)
    intView[1048 / 4] = (!isDensityMatrixMode && schroedinger?.phaseMaterialityEnabled) ? 1 : 0
    floatView[1052 / 4] = schroedinger?.phaseMaterialityStrength ?? 1.0

    // Interference fringing (offset 1056+) — disabled in DM mode (phase channel mismatch)
    intView[1056 / 4] = (!isDensityMatrixMode && schroedinger?.interferenceEnabled) ? 1 : 0
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

    intView[1216 / 4] = (!isUniformComputeMode && schroedinger?.crossSectionEnabled) ? 1 : 0
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

    const crossSectionPlaneColor = this.parseColor(
      schroedinger?.crossSectionPlaneColor ?? '#66ccff'
    )
    floatView[1264 / 4] = crossSectionPlaneColor[0]
    floatView[1268 / 4] = crossSectionPlaneColor[1]
    floatView[1272 / 4] = crossSectionPlaneColor[2]
    floatView[1276 / 4] = 0.0

    // Physical probability current controls (offset 1280-1328)
    // Disabled in DM mode: j(x) = Im(ψ*∇ψ) is meaningless for mixed states;
    // correct expression is j(x) = Im(Σ_{kl} ρ_{kl} ψ_k*∇ψ_l), not implemented.
    const probabilityCurrentEnabled = !isDensityMatrixMode && (schroedinger?.probabilityCurrentEnabled ?? false)
    intView[1280 / 4] = probabilityCurrentEnabled ? 1 : 0
    intView[1284 / 4] =
      PROBABILITY_CURRENT_STYLE_MAP[schroedinger?.probabilityCurrentStyle ?? 'magnitude'] ?? 0
    intView[1288 / 4] =
      PROBABILITY_CURRENT_PLACEMENT_MAP[
        schroedinger?.probabilityCurrentPlacement ?? 'isosurface'
      ] ?? 0
    intView[1292 / 4] =
      PROBABILITY_CURRENT_COLOR_MODE_MAP[
        schroedinger?.probabilityCurrentColorMode ?? 'magnitude'
      ] ?? 0

    floatView[1296 / 4] = schroedinger?.probabilityCurrentScale ?? 1.0
    floatView[1300 / 4] = schroedinger?.probabilityCurrentSpeed ?? 1.0
    floatView[1304 / 4] = schroedinger?.probabilityCurrentDensityThreshold ?? 0.01
    floatView[1308 / 4] = schroedinger?.probabilityCurrentMagnitudeThreshold ?? 0.0
    const lineDensity = schroedinger?.probabilityCurrentLineDensity ?? 8.0
    const stepSize = schroedinger?.probabilityCurrentStepSize ?? 0.04
    const integrationSteps = schroedinger?.probabilityCurrentSteps ?? 20
    // Probability current in momentum space uses broader stencil deltas and heavier evaluation;
    // cap line density and integration steps to keep the overlay responsive.
    const isMomentum = !isUniformComputeMode && schroedinger?.representation === 'momentum'
    floatView[1312 / 4] = isMomentum ? Math.min(lineDensity, 3.0) : lineDensity
    floatView[1316 / 4] = isMomentum ? Math.max(stepSize, 0.02) : stepSize
    intView[1320 / 4] = isMomentum ? Math.min(integrationSteps, 8) : integrationSteps
    floatView[1324 / 4] = schroedinger?.probabilityCurrentOpacity ?? 0.7

    // Representation + momentum controls (offset 1328-1344)
    // effectiveMomentumScale already incorporates ħ for p-space (computed above).
    // The shader reads momentumScale and applies it directly as kScale.
    // Force position-space in density matrix mode: the OQ basis evaluator (singleBasis)
    // only implements position-space hydrogen radial functions.
    const forcePosition = isUniformComputeMode || (isDensityMatrixMode && quantumModeStr === 'hydrogenND')
    intView[1328 / 4] = forcePosition ? 0 : (REPRESENTATION_MODE_MAP[schroedinger?.representation ?? 'position'] ?? 0)
    intView[1332 / 4] = MOMENTUM_DISPLAY_MODE_MAP[schroedinger?.momentumDisplayUnits ?? 'k'] ?? 0
    floatView[1336 / 4] = effectiveMomentumScale
    floatView[1340 / 4] = schroedinger?.momentumHbar ?? 1.0

    // Radial probability overlay (offset 1344-1376)
    // Disabled in momentum representation: the overlay evaluates position-space R_nl(r)
    const isMomentumRep = !isUniformComputeMode && schroedinger?.representation === 'momentum'
    const radialProbEnabled = (schroedinger?.radialProbabilityEnabled ?? false) && !isMomentumRep
    intView[1344 / 4] = radialProbEnabled ? 1 : 0
    floatView[1348 / 4] = schroedinger?.radialProbabilityOpacity ?? 0.6
    floatView[1352 / 4] =
      radialProbEnabled && quantumModeStr !== 'harmonicOscillator'
        ? computeRadialProbabilityNorm(validN, validL, bohrRadius)
        : 1.0
    floatView[1356 / 4] = 0.0 // padding
    const rpColor = this.parseColor(schroedinger?.radialProbabilityColor ?? '#44aaff')
    floatView[1360 / 4] = rpColor[0]
    floatView[1364 / 4] = rpColor[1]
    floatView[1368 / 4] = rpColor[2]
    floatView[1372 / 4] = 0.0 // padding

    // Domain coloring controls (offset 1376-1408)
    const domainColoring = appearance?.domainColoring
    floatView[1376 / 4] = domainColoring?.modulusMode === 'logPsiAbs' ? 1.0 : 0.0
    floatView[1380 / 4] = domainColoring?.contoursEnabled ? 1.0 : 0.0
    floatView[1384 / 4] = domainColoring?.contourDensity ?? 8.0
    floatView[1388 / 4] = domainColoring?.contourWidth ?? 0.08
    floatView[1392 / 4] = domainColoring?.contourStrength ?? 0.45
    floatView[1396 / 4] = 0.0
    floatView[1400 / 4] = 0.0
    floatView[1404 / 4] = 0.0

    // Diverging color controls (offset 1408-1456).
    // Algorithm 7 (phaseDiverging) uses the palette colors only.
    // Algorithm 9 (diverging Re/Im) uses palette + intensity floor + component toggle.
    const usePhaseDivergingPalette = appearance?.colorAlgorithm === 'phaseDiverging'
    const phaseDiverging = appearance?.phaseDiverging
    const divergingPsi = appearance?.divergingPsi
    const divergingNeutral = this.parseColor(
      usePhaseDivergingPalette
        ? (phaseDiverging?.neutralColor ?? '#ebebeb')
        : (divergingPsi?.neutralColor ?? '#d9d9d9')
    )
    const divergingPositive = this.parseColor(
      usePhaseDivergingPalette
        ? (phaseDiverging?.positiveColor ?? '#eb3d38')
        : (divergingPsi?.positiveColor ?? '#e83b3b')
    )
    const divergingNegative = this.parseColor(
      usePhaseDivergingPalette
        ? (phaseDiverging?.negativeColor ?? '#3866f2')
        : (divergingPsi?.negativeColor ?? '#3166f5')
    )
    floatView[1408 / 4] = divergingNeutral[0]
    floatView[1412 / 4] = divergingNeutral[1]
    floatView[1416 / 4] = divergingNeutral[2]
    floatView[1420 / 4] = usePhaseDivergingPalette
      ? 0.2
      : Math.max(0, Math.min(1, divergingPsi?.intensityFloor ?? 0.2))

    floatView[1424 / 4] = divergingPositive[0]
    floatView[1428 / 4] = divergingPositive[1]
    floatView[1432 / 4] = divergingPositive[2]
    floatView[1436 / 4] = usePhaseDivergingPalette
      ? 0.0
      : divergingPsi?.component === 'imag'
        ? 1.0
        : 0.0

    floatView[1440 / 4] = divergingNegative[0]
    floatView[1444 / 4] = divergingNegative[1]
    floatView[1448 / 4] = divergingNegative[2]
    floatView[1452 / 4] = 0.0

    // ============================================
    // HO MOMENTUM: CPU UNIFORM TRANSFORMATION
    // ============================================
    // Physics: HO eigenfunctions are eigenfunctions of the Fourier transform.
    // φ̃_n(k, ω) = (-i)^n · φ_n(k, 1/ω) — same function, reciprocal ω, phase rotation.
    // For p-space (p = ħk), the transform becomes ω → 1/(ħ²ω) so the shader evaluates
    // the correct function in p-coordinates: φ_n(p, 1/(ħ²ω)).
    // Transform the uniform buffer so the GPU shader runs the normal position-mode path
    // and produces correct momentum-space wavefunctions automatically.
    // All optimizations (eigencache, analytical gradient, temporal reprojection) work at 60 FPS.
    // Exception: Hydrogen momentum has genuinely different functional form (Gegenbauer polynomials),
    // so it keeps representationMode=1 and its own shader path in psiBlockHydrogenND.
    const isHOMomentum =
      !isUniformComputeMode && schroedinger?.representation === 'momentum' && quantumModeStr !== 'hydrogenND'

    if (isHOMomentum) {
      // 1. Invert omegas: ω_j → 1/(ħ²·ω_j)
      // For normalized/k-space (hbar=1), this reduces to the standard 1/ω.
      // For p-space, the ħ² factor maps coordinates from p to the correct k = p/ħ.
      const hbar2 = hbar * hbar
      const omegaOff = 16 / 4
      for (let j = 0; j < MAX_DIM; j++) {
        const omega = floatView[omegaOff + j]!
        floatView[omegaOff + j] = 1.0 / (hbar2 * Math.max(omega, 0.01))
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
          case 0:
            break // ×1
          case 1:
            floatView[coeffOff + k * 4] = im
            floatView[coeffOff + k * 4 + 1] = -re
            break // ×(-i)
          case 2:
            floatView[coeffOff + k * 4] = -re
            floatView[coeffOff + k * 4 + 1] = -im
            break // ×(-1)
          case 3:
            floatView[coeffOff + k * 4] = -im
            floatView[coeffOff + k * 4 + 1] = re
            break // ×(i)
        }
      }

      // 3. Force representationMode = 0 (position) — shader runs normal path
      intView[1328 / 4] = 0
    }

    // Wigner phase-space controls (offset 1456-1488)
    const wignerDimIdx = schroedinger?.wignerDimensionIndex ?? 0
    intView[1456 / 4] = Math.max(0, Math.min(wignerDimIdx, dimension - 1))
    intView[1460 / 4] = schroedinger?.wignerCrossTermsEnabled ? 1 : 0

    // Wigner axis ranges: auto-compute from physics or use manual values
    const wignerAutoRange = schroedinger?.wignerAutoRange ?? true
    if (wignerAutoRange) {
      const isHydrogenMode = this.rendererConfig.quantumMode === 'hydrogenND'
      if (isHydrogenMode && wignerDimIdx < 3) {
        // Hydrogen radial Wigner: centered on rCenter = n²a₀ (most probable radius)
        // wignerXRange = half-extent around rCenter; visible range is
        // [max(0, rCenter - halfExtent*aspect), rCenter + halfExtent*aspect]
        const n = schroedinger?.principalQuantumNumber ?? 2
        const a0 = schroedinger?.bohrRadiusScale ?? 1.0
        const rCenter = n * n * a0
        const rMax = rCenter * 2.5
        const halfExtent = Math.max(rCenter, rMax - rCenter)
        const prMax = 3.0 / (n * a0)
        floatView[1464 / 4] = halfExtent
        floatView[1468 / 4] = prMax
      } else {
        // HO mode or hydrogen ND extra dim: physics-based range from quantum number and omega
        // Characteristic HO scale: x_rms = sqrt((2n+1) / omega), p_rms = sqrt((2n+1) * omega)
        // Show ~3.5 standard deviations for comfortable viewing
        let selectedOmega: number
        let maxN: number
        if (isHydrogenMode && wignerDimIdx >= 3) {
          // Hydrogen ND extra dimension
          const extraIdx = wignerDimIdx - 3
          selectedOmega = floatView[640 / 4 + extraIdx] ?? 1.0
          maxN = intView[608 / 4 + extraIdx] ?? 0
        } else {
          // Pure HO mode: find max quantum number for this dimension across all terms
          selectedOmega = floatView[16 / 4 + Math.min(wignerDimIdx, 10)] ?? 1.0
          maxN = 0
          const tc = this.rendererConfig.termCount ?? 1
          for (let k = 0; k < tc; k++) {
            const qn = intView[64 / 4 + k * 11 + Math.min(wignerDimIdx, 10)] ?? 0
            if (qn > maxN) maxN = qn
          }
        }
        const xScale = Math.sqrt(Math.max(2 * maxN + 1, 1) / Math.max(selectedOmega, 0.01))
        const pScale = Math.sqrt(Math.max(2 * maxN + 1, 1) * Math.max(selectedOmega, 0.01))
        floatView[1464 / 4] = xScale * 3.5
        floatView[1468 / 4] = pScale * 3.5
      }
    } else {
      floatView[1464 / 4] = schroedinger?.wignerXRange ?? 6.0
      floatView[1468 / 4] = schroedinger?.wignerPRange ?? 6.0
    }
    intView[1472 / 4] = schroedinger?.wignerQuadPoints ?? 32
    intView[1476 / 4] = schroedinger?.wignerClassicalOverlay ? 1 : 0
    floatView[1480 / 4] = 0.0 // padding
    floatView[1484 / 4] = 0.0 // padding

    this.writeUniformBuffer(this.device, this.schroedingerUniformBuffer, floatView)
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

    const lighting = getStoreSnapshot<LightingSnapshot>(ctx, 'lighting')
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

  /**
   * Compute open-quantum update stride based on current performance stage.
   * Stride > 1 intentionally reduces simulation/render update cadence in
   * interaction/low-quality phases to recover frame rate.
   */

  /**
   * Reduce density grid resolution when basis count K is large.
   * O(K²) cross-terms per voxel make 64³ prohibitive for K > 6.
   */
  private static computeOpenQuantumGridSize(baseSize: number, basisK: number): number {
    if (basisK <= 6) return baseSize
    if (basisK <= 10) return Math.min(baseSize, 48)
    return Math.min(baseSize, 32)
  }

  private computeOpenQuantumFrameStride(
    performance: PerformanceSnapshot | undefined,
    basisK: number
  ): number {
    const qualityMultiplier = performance?.qualityMultiplier ?? 1.0
    const interacting = performance?.isInteracting ?? false
    const sceneTransitioning = performance?.sceneTransitioning ?? false
    const heavyBasis = basisK >= 10

    if (sceneTransitioning) {
      return heavyBasis ? 5 : 4
    }
    if (interacting) {
      return heavyBasis ? 4 : 3
    }
    if (qualityMultiplier < 0.5) {
      return heavyBasis ? 4 : 3
    }
    if (qualityMultiplier < 0.75) {
      return 3
    }
    // Full quality: minimum stride 2 to maintain FPS
    // Physics timestep ~0.04s/step; skipping 1 visual frame (16ms) is imperceptible
    return heavyBasis ? 3 : 2
  }

  /**
   * Decide whether open-quantum state/render buffers should be updated on this frame.
   * Forced updates bypass cadence throttling and reset the cadence clock.
   */
  private shouldUpdateOpenQuantumThisFrame(
    performance: PerformanceSnapshot | undefined,
    basisK: number,
    forceUpdate: boolean
  ): boolean {
    if (forceUpdate) {
      this.openQuantumUpdateTick = 0
      return true
    }

    const stride = this.computeOpenQuantumFrameStride(performance, basisK)
    if (stride <= 1) {
      this.openQuantumUpdateTick = 0
      return true
    }

    this.openQuantumUpdateTick = (this.openQuantumUpdateTick + 1) % stride
    return this.openQuantumUpdateTick === 0
  }

  /**
   * Adaptive rendering basis cap for density-matrix grid compute.
   * Keeps full basis at final quality; truncates only in low-quality phases.
   */
  private getOpenQuantumRenderBasisLimit(
    performance: PerformanceSnapshot | undefined,
    basisK: number
  ): number {
    if (basisK <= 8) return basisK

    const qualityMultiplier = performance?.qualityMultiplier ?? 1.0
    const interacting = performance?.isInteracting ?? false
    const sceneTransitioning = performance?.sceneTransitioning ?? false

    if (sceneTransitioning) return Math.min(basisK, 6)
    if (interacting || qualityMultiplier < 0.5) return Math.min(basisK, 8)
    if (qualityMultiplier < 0.75) return Math.min(basisK, 10)
    return basisK
  }

  updateMaterialUniforms(ctx: WebGPURenderContext): void {
    if (!this.device || !this.materialUniformBuffer) return

    const pbr = getStoreSnapshot<PBRSliceState>(ctx, 'pbr')
    const appearance = getStoreSnapshot<AppearanceStoreState>(ctx, 'appearance')

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

    const performance = getStoreSnapshot<PerformanceSnapshot>(ctx, 'performance')

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
        console.warn(
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
    if (appearanceVersion !== this.lastAppearanceVersion || pbrVersion !== this.lastPbrVersion) {
      this.updateMaterialUniforms(ctx)
      this.lastAppearanceVersion = appearanceVersion
      this.lastPbrVersion = pbrVersion
    }

    // ALWAYS update: Quality (cheap, needed for fast/slow toggle responsiveness)
    this.updateQualityUniforms(ctx)

    // ============================================
    // FREE SCALAR FIELD COMPUTE PASS (if in freeScalarField mode)
    // ============================================
    const freeScalarPass = this.freeScalarFieldPass
    if (freeScalarPass) {
      const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
      const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
      const freeScalarConfig = extended?.schroedinger?.freeScalar
      const isPlaying = animation?.isPlaying ?? false
      const fsfSpeed = animation?.speed ?? 1.0

      if (freeScalarConfig) {
        const schroedinger = extended?.schroedinger
        freeScalarPass.executeField(
          ctx,
          freeScalarConfig,
          isPlaying,
          fsfSpeed,
          schroedinger?.basisX as Float32Array | undefined,
          schroedinger?.basisY as Float32Array | undefined,
          schroedinger?.basisZ as Float32Array | undefined,
          this.boundingRadius,
          this.rendererConfig.colorAlgorithm
        )
        // Clear needsReset after processing (targeted mutation, no version bump)
        if (freeScalarConfig.needsReset) {
          extended?.clearFreeScalarNeedsReset?.()
        }

        // FSF diagnostic: log state changes once per second (dev only)
        if (import.meta.env.DEV) {
          const now = performance.now()
          if (now - this._fsfDiagLastTime > 1000) {
            this._fsfDiagLastTime = now
            const camera = getStoreSnapshot<CameraSnapshot>(ctx, 'camera')
            const camPos = camera?.position
            const camDist = camPos
              ? Math.sqrt(camPos.x * camPos.x + camPos.y * camPos.y + camPos.z * camPos.z)
              : -1
            const canvasW = ctx.size.width
            const canvasH = ctx.size.height
            const camChanged = Math.abs(camDist - this._fsfDiagLastCamDist) > 0.01
            const sizeChanged =
              canvasW !== this._fsfDiagLastCanvasW || canvasH !== this._fsfDiagLastCanvasH
            if (camChanged || sizeChanged) {
              console.log(
                `[FSF-DIAG] cam=${camDist.toFixed(2)} canvas=${canvasW}x${canvasH}` +
                  ` bound=${this.boundingRadius.toFixed(2)}` +
                  ` hash=${freeScalarPass.getConfigHash()}` +
                  ` maxPhi=${freeScalarPass.getMaxFieldValue().toFixed(4)}` +
                  ` dim=${freeScalarConfig.latticeDim} grid=${freeScalarConfig.gridSize}` +
                  ` vtx=${!!this.vertexBuffer} idx=${!!this.indexBuffer}` +
                  ` idxCount=${this.indexCount}`
              )
              this._fsfDiagLastCamDist = camDist
              this._fsfDiagLastCanvasW = canvasW
              this._fsfDiagLastCanvasH = canvasH
            }
          }
        }
      }
    }

    // ============================================
    // TDSE / BEC DYNAMICS COMPUTE PASS
    // ============================================
    const tdsePass = this.tdsePass
    if (tdsePass) {
      const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
      const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
      const quantumMode = extended?.schroedinger?.quantumMode
      const isBecMode = quantumMode === 'becDynamics'
      const isPlaying = animation?.isPlaying ?? false
      const speed = animation?.speed ?? 1.0

      // Build the config for the shared TDSE compute pass
      let tdseConfig = extended?.schroedinger?.tdse
      let clearReset: (() => void) | undefined = extended?.clearTdseNeedsReset

      if (isBecMode && extended?.schroedinger?.bec) {
        const bec = extended.schroedinger.bec
        let initCond = bec.initialCondition ?? 'thomasFermi'
        const g = bec.interactionStrength ?? 500
        const omega = bec.trapOmega ?? 1.0
        const latDim = bec.latticeDim ?? 3
        // initTrapOmega enables quench scenarios: init TF at one ω, evolve at another
        const initOmega = bec.initTrapOmega ?? omega

        // For attractive BEC (g < 0), Thomas-Fermi doesn't apply — force Gaussian init.
        // The condensate will collapse dynamically, which is the desired behavior.
        if (g < 0 && (initCond === 'thomasFermi' || initCond === 'vortexImprint'
          || initCond === 'vortexLattice' || initCond === 'darkSoliton')) {
          initCond = 'gaussianPacket'
        }

        // Map vortexLattice to vortexImprint (same shader, different count)
        const mappedInit = initCond === 'vortexLattice' ? 'vortexImprint' : initCond

        // Use anisotropic BEC trap (type 9) — reads trap ratios from trapAnisotropy uniform
        const anisotropy = bec.trapAnisotropy ?? new Array(latDim).fill(1.0)

        // Compute chemical potential for init shader (dimension-dependent TF formula).
        // Uses initOmega for the TF profile — when different from omega, this creates a
        // quench: the condensate starts at equilibrium for initOmega, then evolves under omega.
        // For anisotropic traps, thomasFermiMuND needs the geometric mean frequency
        // ω̄ = ω₀ · (Π anisotropy_d)^(1/D) to account for the volume distortion.
        // For g > 0: proper D-dimensional Thomas-Fermi μ
        // For g < 0: Gaussian amplitude = (2πσ²)^(-D/4) (unit-normalized, σ=packetWidth=1)
        //   ∫|ψ|² d^Dx = A² · (2πσ²)^(D/2) = 1  ⟹  A = (2π)^(-D/4)
        let effectiveInitOmega = initOmega
        if (g > 0 && anisotropy.length > 0) {
          let anisotropyProduct = 1.0
          for (let d = 0; d < latDim; d++) {
            anisotropyProduct *= anisotropy[d] ?? 1.0
          }
          effectiveInitOmega = initOmega * Math.pow(anisotropyProduct, 1 / latDim)
        }
        const mu = g > 0
          ? thomasFermiMuND(latDim, g, effectiveInitOmega)
          : Math.pow(1 / (2 * Math.PI), latDim / 4)

        // Build momentum vector — encode BEC-specific params:
        // [0] = vortex charge (for vortex inits)
        // [1] = soliton depth 0-1 (for darkSoliton)
        // [2] = soliton velocity fraction of c_s (for darkSoliton)
        // [3] = vortex lattice count (for vortexLattice → multi-vortex init)
        // [4] = vortex alternate charge flag (1.0 = dipole ±charge pattern)
        const mom = new Array(Math.max(latDim, 5)).fill(0) as number[]
        if (initCond === 'vortexImprint' || initCond === 'vortexLattice') {
          mom[0] = bec.vortexCharge ?? 1
          if (initCond === 'vortexLattice') {
            mom[3] = bec.vortexLatticeCount ?? 4
            mom[4] = bec.vortexAlternateCharge ? 1.0 : 0.0
          }
        }
        if (initCond === 'darkSoliton') {
          mom[1] = bec.solitonDepth ?? 1.0
          mom[2] = bec.solitonVelocity ?? 0.0
        }

        tdseConfig = {
          latticeDim: latDim,
          gridSize: bec.gridSize ?? new Array(latDim).fill(8),
          spacing: bec.spacing ?? new Array(latDim).fill(0.15),
          mass: bec.mass ?? 1.0,
          hbar: bec.hbar ?? 1.0,
          dt: bec.dt ?? 0.002,
          stepsPerFrame: bec.stepsPerFrame ?? 4,
          // BEC init names map to TDSE initMap integers (thomasFermi→3, vortexImprint→4, darkSoliton→5)
          initialCondition: mappedInit as TdseInitialCondition,
          packetCenter: new Array(latDim).fill(0),
          packetWidth: 1.0,
          packetAmplitude: mu,
          packetMomentum: mom,
          potentialType: 'becTrap',
          barrierHeight: 0, barrierWidth: 0, barrierCenter: 0,
          wellDepth: 0, wellWidth: 0, stepHeight: 0,
          harmonicOmega: omega,
          harmonicOmegaInit: initOmega !== omega ? initOmega : undefined,
          slitSeparation: 0, slitWidth: 0, wallThickness: 0, wallHeight: 0,
          latticeDepth: 0, latticePeriod: 1,
          doubleWellLambda: 0, doubleWellSeparation: 1, doubleWellAsymmetry: 0,
          radialWellInner: 0.6, radialWellOuter: 1.8, radialWellDepth: 50, radialWellTilt: 0.5,
          driveEnabled: false, driveWaveform: 'sine',
          driveFrequency: 0, driveAmplitude: 0,
          trapAnisotropy: anisotropy,
          absorberEnabled: bec.absorberEnabled ?? false,
          absorberWidth: bec.absorberWidth ?? 0.1,
          absorberStrength: bec.absorberStrength ?? 5.0,
          fieldView: bec.fieldView ?? 'density',
          autoScale: bec.autoScale ?? true,
          showPotential: false,
          autoLoop: false,
          diagnosticsEnabled: bec.diagnosticsEnabled ?? true,
          diagnosticsInterval: bec.diagnosticsInterval ?? 5,
          needsReset: bec.needsReset ?? false,
          slicePositions: bec.slicePositions ?? [],
          interactionStrength: g,
        }
        clearReset = extended?.clearBecNeedsReset
      }

      if (tdseConfig) {
        const schroedinger = extended?.schroedinger
        tdsePass.executeTDSE(
          ctx,
          tdseConfig,
          isPlaying,
          speed,
          schroedinger?.basisX as Float32Array | undefined,
          schroedinger?.basisY as Float32Array | undefined,
          schroedinger?.basisZ as Float32Array | undefined,
          this.boundingRadius,
        )
        // Clear needsReset after processing (targeted mutation, no version bump)
        if (tdseConfig.needsReset) {
          clearReset?.()
        }

        // BEC diagnostics: compute derived quantities from TDSE readback
        if (isBecMode) {
          const diag = tdsePass.getDiagnostics()
          if (diag) {
            const bec = extended?.schroedinger?.bec
            const g = bec?.interactionStrength ?? 500
            const mass = bec?.mass ?? 1.0
            const hbar = bec?.hbar ?? 1.0
            const omega = bec?.trapOmega ?? 1.0
            const aniso = bec?.trapAnisotropy ?? []
            const latDim = bec?.latticeDim ?? 3
            // Geometric mean of effective trap frequencies for anisotropic R_TF
            let omegaProd = 1.0
            for (let d = 0; d < latDim; d++) {
              omegaProd *= omega * (aniso[d] ?? 1.0)
            }
            const omegaEff = Math.pow(omegaProd, 1 / latDim)
            const peakN = diag.maxDensity
            const mu = g * peakN
            const xiDenom = 2 * mass * g * peakN
            const xi = xiDenom > 0 ? hbar / Math.sqrt(xiDenom) : Infinity
            const csVal = (g * peakN) / mass
            const cs = csVal > 0 ? Math.sqrt(csVal) : 0
            const rtfDenom = mass * omegaEff * omegaEff
            const rtf = rtfDenom > 0 && mu > 0 ? Math.sqrt((2 * mu) / rtfDenom) : 0

            useBecDiagnosticsStore.getState().update({
              totalNorm: diag.totalNorm,
              maxDensity: peakN,
              normDrift: diag.normDrift,
              chemicalPotential: mu,
              healingLength: xi,
              soundSpeed: cs,
              thomasFermiRadius: rtf,
            })
          }
        }
      }
    }

    // ============================================
    // DIRAC EQUATION COMPUTE PASS
    // ============================================
    const diracPass = this.diracPass
    if (diracPass) {
      const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
      const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
      const isPlaying = animation?.isPlaying ?? false
      const speed = animation?.speed ?? 1.0
      const diracConfig = extended?.schroedinger?.dirac

      if (diracConfig) {
        const schroedinger = extended?.schroedinger
        diracPass.executeDirac(
          ctx,
          diracConfig as import('@/lib/geometry/extended/types').DiracConfig,
          isPlaying,
          speed,
          schroedinger?.basisX as Float32Array | undefined,
          schroedinger?.basisY as Float32Array | undefined,
          schroedinger?.basisZ as Float32Array | undefined,
          this.boundingRadius,
        )
        // Clear needsReset after processing (targeted mutation, no version bump)
        if (diracConfig.needsReset) {
          extended?.clearDiracNeedsReset?.()
        }
        // Diagnostics are updated internally by DiracComputePass.dispatchDiagnostics()
      }
    }

    // ============================================
    // DENSITY GRID COMPUTE PASS (if enabled)
    // ============================================
    // Run compute shader to pre-compute density texture before rendering
    // Store local reference before check to prevent TOCTOU race condition
    const gridPass = this.densityGridPass
    if (gridPass && this.densityGridInitialized) {
      // Get versions for dirty tracking - prevents unnecessary grid recomputation
      const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
      const rotation = getStoreSnapshot<RotationState>(ctx, 'rotation')
      const geometry = getStoreSnapshot<GeometryState>(ctx, 'geometry')
      const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
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

      // Open quantum system: evolve density matrix and upload to GPU
      const performance = getStoreSnapshot<PerformanceSnapshot>(ctx, 'performance')
      if (this.rendererConfig.openQuantumEnabled && this.cachedPreset) {
        const oqConfig = extended?.schroedinger?.openQuantum
        if (oqConfig?.enabled) {
          const resetToken = oqConfig.resetToken ?? 0
          let forceOpenQuantumUpdate =
            schroedingerVersion !== this.openQuantumLastSchroedingerVersion
          if (resetToken !== this.openQuantumResetTokenSeen) {
            this.openQuantumInitialized = false
            this.openQuantumResetTokenSeen = resetToken
            forceOpenQuantumUpdate = true
          }

          const isHydrogenOQ = this.rendererConfig.quantumMode === 'hydrogenND'

          if (isHydrogenOQ) {
            // ── Hydrogen mode: physics-rigorous propagator-based evolution ──
            const dim = this.rendererConfig.dimension ?? 3
            const maxN = oqConfig.hydrogenBasisMaxN ?? 2
            const schCfg = extended?.schroedinger
            const extraDimOmega = (schCfg?.extraDimOmega as number[] | undefined) ?? []
            const dt = oqConfig.dt ?? 0.01
            const substeps = oqConfig.substeps ?? 4

            // User's selected orbital — used as OQ initial state
            const userN = schCfg?.principalQuantumNumber ?? 1
            const userL = schCfg?.azimuthalQuantumNumber ?? 0
            const userM = schCfg?.magneticQuantumNumber ?? 0

            // Config hash for cache invalidation (includes user orbital for ρ re-init)
            const hash = `h:${maxN}:${dim}:${oqConfig.bathTemperature}:${oqConfig.couplingScale}:${oqConfig.dephasingRate}:${oqConfig.dephasingModel}:${dt}:${substeps}:${extraDimOmega.join(',')}:${userN}:${userL}:${userM}`
            const configChanged = hash !== this.hydrogenOQConfigHash

            if (configChanged) {
              // Rebuild basis, rates, channels, Liouvillian, propagator
              this.hydrogenBasis = buildHydrogenBasis(maxN, dim, extraDimOmega)
              const K = this.hydrogenBasis.length
              const energies = basisEnergies(this.hydrogenBasis)
              this.hydrogenRates = buildTransitionRates(
                this.hydrogenBasis, oqConfig.bathTemperature ?? 300, oqConfig.couplingScale ?? 1.0,
              )
              this.hydrogenChannels = buildHydrogenChannels(
                this.hydrogenBasis, this.hydrogenRates,
                oqConfig.dephasingRate ?? 0.5,
                (oqConfig.dephasingModel ?? 'uniform') !== 'none',
              )
              const liouvillian = buildLiouvillian(energies, this.hydrogenChannels, K)
              this.hydrogenPropagator = computePropagator(liouvillian, dt * substeps, K)

              // Pack hydrogen basis data for GPU upload
              this.hydrogenBasisPackedBuffer = packHydrogenBasisForGPU(this.hydrogenBasis, dim)
              this.hydrogenBasisLabels = basisLabels(this.hydrogenBasis)

              this.hydrogenOQConfigHash = hash
              // Force ρ re-initialization with new basis size
              this.openQuantumInitialized = false
              forceOpenQuantumUpdate = true
            }

            const basis = this.hydrogenBasis!
            const K = basis.length

            // Initialize ρ as the user's selected orbital |n,l,m⟩⟨n,l,m|
            let stateReinitialized = false
            if (!this.openQuantumState || this.openQuantumState.K !== K || !this.openQuantumInitialized) {
              const matchIdx = basis.findIndex(s => s.n === userN && s.l === userL && s.m === userM)
              const initialIdx = matchIdx >= 0 ? matchIdx : 0
              const coeffsRe = new Float64Array(K)
              coeffsRe[initialIdx] = 1.0
              this.openQuantumState = densityMatrixFromCoefficients(coeffsRe, new Float64Array(K), K)
              this.openQuantumInitialized = true
              this.openQuantumFrameCounter = 0
              this.openQuantumLastVonNeumann = 0
              stateReinitialized = true
            }

            const shouldUpdateOpenQuantum = this.shouldUpdateOpenQuantumThisFrame(
              performance,
              K,
              forceOpenQuantumUpdate || stateReinitialized
            )
            if (shouldUpdateOpenQuantum) {
              // Evolve via cached propagator (single matvec per update)
              evolvePropagatorStep(this.hydrogenPropagator!, this.openQuantumState)

              // Compute metrics
              this.openQuantumFrameCounter++
              const includeVonNeumann = (this.openQuantumFrameCounter % 4) === 0
              const metrics = computeMetrics(
                this.openQuantumState, includeVonNeumann, this.openQuantumLastVonNeumann,
              )
              if (includeVonNeumann) {
                this.openQuantumLastVonNeumann = metrics.vonNeumannEntropy
              }
              const diagStore = useOpenQuantumDiagnosticsStore.getState()
              diagStore.pushMetrics(metrics)

              // Extract per-state populations ρ_{kk} and push to diagnostics
              const pops = new Float32Array(K)
              const el = this.openQuantumState.elements
              for (let k = 0; k < K; k++) {
                pops[k] = el[2 * (k * K + k)]!
              }
              diagStore.setPopulations(pops, this.hydrogenBasisLabels.length ? this.hydrogenBasisLabels : basisLabels(basis))

              // Adaptive basis cap: min of performance-based limit and population trimming
              const renderBasisK = this.getOpenQuantumRenderBasisLimit(performance, K)
              const populationK = computeActiveK(this.openQuantumState!)
              const effectiveK = Math.min(renderBasisK, populationK)
              packForGPU(this.openQuantumState, metrics, this.openQuantumPackedBuffer, effectiveK)
              gridPass.updateOpenQuantumUniforms(ctx.device, this.openQuantumPackedBuffer)

              // Upload hydrogen basis quantum numbers for per-basis GPU evaluation
              gridPass.updateHydrogenBasisUniforms(ctx.device, this.hydrogenBasisPackedBuffer!)
              this.openQuantumLastSchroedingerVersion = schroedingerVersion
            }
          } else {
            // ── HO mode: split-step Lindblad integration ──
            const K = this.cachedPreset.termCount

            // Initialize ρ from pure-state coefficients on first frame or preset change
            let stateReinitialized = false
            if (!this.openQuantumState || this.openQuantumState.K !== K || !this.openQuantumInitialized) {
              const coeffsRe = new Float64Array(K)
              const coeffsIm = new Float64Array(K)
              for (let k = 0; k < K; k++) {
                const pair = this.cachedPreset.coefficients[k]
                coeffsRe[k] = pair?.[0] ?? 0
                coeffsIm[k] = pair?.[1] ?? 0
              }
              this.openQuantumState = densityMatrixFromCoefficients(coeffsRe, coeffsIm, K)
              this.openQuantumInitialized = true
              this.openQuantumFrameCounter = 0
              this.openQuantumLastVonNeumann = 0
              stateReinitialized = true
            }

            const presetKey = this.cachedPresetConfig
              ? `${this.cachedPresetConfig.presetName}:${this.cachedPresetConfig.seed}:${this.cachedPresetConfig.termCount}:${this.cachedPresetConfig.dimension}`
              : `k:${K}`
            const hoCacheKey = [
              presetKey,
              oqConfig.dephasingRate ?? 0,
              oqConfig.relaxationRate ?? 0,
              oqConfig.thermalUpRate ?? 0,
              oqConfig.dephasingEnabled ? 1 : 0,
              oqConfig.relaxationEnabled ? 1 : 0,
              oqConfig.thermalEnabled ? 1 : 0,
            ].join(':')

            if (
              hoCacheKey !== this.hoOpenQuantumCacheKey ||
              !this.hoOpenQuantumEnergies ||
              this.hoOpenQuantumEnergies.length !== K
            ) {
              this.hoOpenQuantumChannels = buildLindbladChannels(oqConfig, K)
              const energies = new Float64Array(K)
              for (let k = 0; k < K; k++) {
                energies[k] = this.cachedPreset.energies[k] ?? 0
              }
              this.hoOpenQuantumEnergies = energies
              this.hoOpenQuantumCacheKey = hoCacheKey
              // Force ρ re-initialization: old density matrix was evolved under the
              // previous Hamiltonian/channels and is stale for the new configuration.
              this.openQuantumInitialized = false
              forceOpenQuantumUpdate = true
            }

            const shouldUpdateOpenQuantum = this.shouldUpdateOpenQuantumThisFrame(
              performance,
              K,
              forceOpenQuantumUpdate || stateReinitialized
            )
            if (shouldUpdateOpenQuantum) {
              // Evolve: split-step integration
              const dt = oqConfig.dt ?? 0.01
              const substeps = oqConfig.substeps ?? 4
              evolveMultiStep(
                this.openQuantumState,
                this.hoOpenQuantumEnergies!,
                this.hoOpenQuantumChannels,
                dt,
                substeps
              )

              // Compute metrics (von Neumann entropy every 4th update)
              this.openQuantumFrameCounter++
              const includeVonNeumann = (this.openQuantumFrameCounter % 4) === 0
              const metrics = computeMetrics(
                this.openQuantumState, includeVonNeumann, this.openQuantumLastVonNeumann,
              )
              if (includeVonNeumann) {
                this.openQuantumLastVonNeumann = metrics.vonNeumannEntropy
              }
              const diagStore = useOpenQuantumDiagnosticsStore.getState()
              diagStore.pushMetrics(metrics)

              // Extract per-state populations ρ_{kk} and push to diagnostics
              const pops = new Float32Array(K)
              const el = this.openQuantumState.elements
              for (let k = 0; k < K; k++) {
                pops[k] = el[2 * (k * K + k)]!
              }
              if (!this.hoPopulationLabels || this.hoPopulationLabels.length !== K) {
                const SUB = ['\u2080','\u2081','\u2082','\u2083','\u2084','\u2085','\u2086','\u2087','\u2088','\u2089']
                this.hoPopulationLabels = Array.from({ length: K }, (_, i) =>
                  `\u03C8${i < 10 ? SUB[i] : String(i)}`)
              }
              diagStore.setPopulations(pops, this.hoPopulationLabels)

              const renderBasisK = this.getOpenQuantumRenderBasisLimit(performance, K)
              const populationK = computeActiveK(this.openQuantumState!)
              const effectiveK = Math.min(renderBasisK, populationK)
              packForGPU(this.openQuantumState, metrics, this.openQuantumPackedBuffer, effectiveK)
              gridPass.updateOpenQuantumUniforms(ctx.device, this.openQuantumPackedBuffer)
              this.openQuantumLastSchroedingerVersion = schroedingerVersion
            }
          }
        }
      }

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
      const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
      const geometry = getStoreSnapshot<GeometryState>(ctx, 'geometry')
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

    // ============================================
    // WIGNER CACHE COMPUTE PASS (Wigner mode)
    // ============================================
    // Two-phase pipeline: spatial precompute (expensive, once per param change)
    // + reconstruction (cheap, every animated frame with cross terms)
    const wignerPass = this.wignerCachePass
    if (wignerPass && this.wignerCacheInitialized) {
      const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
      const rotation = getStoreSnapshot<RotationState>(ctx, 'rotation')
      const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
      const schroedingerVersion = extended?.schroedingerVersion ?? 0
      const rotationVersion = rotation?.version ?? 0
      const isAnimating = animation?.isPlaying ?? false

      // Check for cache resolution change (requires texture resize + bind group rebuild)
      const wignerCacheResolution = extended?.schroedinger?.wignerCacheResolution ?? 256
      if (wignerCacheResolution !== this.lastWignerCacheResolution) {
        const didResize = wignerPass.resize(ctx.device, wignerCacheResolution)
        this.lastWignerCacheResolution = wignerCacheResolution
        // Rebuild fragment shader bind group to reference the new cache texture view
        if (
          didResize &&
          this.objectBindGroupLayout &&
          this.schroedingerUniformBuffer &&
          this.basisUniformBuffer
        ) {
          const newCacheView = wignerPass.getCacheTextureView()
          const newCacheSampler = wignerPass.getCacheSampler()
          if (newCacheView && newCacheSampler) {
            this.objectBindGroup = ctx.device.createBindGroup({
              label: 'schroedinger-object-bg',
              layout: this.objectBindGroupLayout,
              entries: [
                { binding: 0, resource: { buffer: this.schroedingerUniformBuffer } },
                { binding: 1, resource: { buffer: this.basisUniformBuffer } },
                { binding: 2, resource: newCacheView },
                { binding: 3, resource: newCacheSampler },
              ],
            })
          }
        }
      }

      // Sync Schroedinger uniforms (version-tracked)
      wignerPass.updateSchroedingerUniforms(
        ctx.device,
        this.schroedingerUniformData,
        schroedingerVersion
      )

      // Sync basis uniforms (version-tracked, include slice animation time for 4D+)
      const wignerGeometry = getStoreSnapshot<GeometryState>(ctx, 'geometry')
      const wignerDimension = wignerGeometry?.dimension ?? this.rendererConfig.dimension ?? 3
      const wignerSliceAnimEnabled = extended?.schroedinger?.sliceAnimationEnabled ?? false
      const wignerAccTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0
      const wignerBasisTimeBucket =
        wignerSliceAnimEnabled && wignerDimension > 3 ? Math.floor(wignerAccTime * 120.0) : 0
      const wignerBasisVersion = rotationVersion * 1000003 + wignerBasisTimeBucket
      wignerPass.updateBasisUniforms(ctx.device, this.basisUniformData.buffer, wignerBasisVersion)

      // Determine mode for grid range and update logic
      const schroedinger = extended?.schroedinger
      const crossTermsEnabled = schroedinger?.wignerCrossTermsEnabled ?? false
      const termCount = this.rendererConfig.termCount ?? 1
      const isHydrogen = this.rendererConfig.quantumMode === 'hydrogenND'
      const wignerDimIdx = this.schroedingerIntView[1456 / 4] ?? 0
      const isHydrogenRadial = isHydrogen && wignerDimIdx < 3

      // Update grid x/p ranges from the already-computed Schroedinger uniform buffer.
      // The fragment shader maps x with aspect correction (x * aspect) for square pixels
      // in phase space, so the cache must cover the same aspect-scaled x range.
      // Hydrogen radial: centered on rCenter = n²a₀, range [max(0, rCenter-halfExt), rCenter+halfExt]
      // HO / extra dims: x-axis is [-xRange * aspect, +xRange * aspect] (symmetric)
      const xRange = this.schroedingerFloatView[1464 / 4]!
      const pRange = this.schroedingerFloatView[1468 / 4]!
      const aspect = ctx.size.width / ctx.size.height
      let xMin: number
      let xMax: number
      if (isHydrogenRadial) {
        const n = schroedinger?.principalQuantumNumber ?? 2
        const a0 = schroedinger?.bohrRadiusScale ?? 1.0
        const rCenter = n * n * a0
        xMin = Math.max(0, rCenter - xRange * aspect)
        xMax = rCenter + xRange * aspect
      } else {
        xMax = xRange * aspect
        xMin = -xMax
      }
      wignerPass.updateGridParams(ctx.device, xMin, xMax, -pRange, pRange)

      // Update time in compute pass buffer for animated HO superpositions.
      // Must happen every frame during animation since version tracking doesn't cover time changes.
      if (isAnimating) {
        const time = ctx.frame?.time ?? 0
        wignerPass.updateTimeOnly(ctx.device, time)
      }

      const updateFlags = wignerPass.needsUpdate(
        isAnimating,
        crossTermsEnabled,
        termCount,
        isHydrogen
      )

      if (wignerPass.isTwoPhaseActive()) {
        // Two-phase pipeline: spatial + reconstruct dispatched independently
        if (updateFlags.spatial) {
          wignerPass.executeSpatial(ctx)
        }
        if (updateFlags.reconstruct) {
          const time = ctx.frame?.time ?? 0
          const timeScale = this.schroedingerFloatView[676 / 4] ?? 0.8
          wignerPass.updateReconstructParams(
            ctx.device,
            this.schroedingerUniformData,
            time,
            timeScale
          )
          wignerPass.executeReconstruct(ctx)
        }
      } else {
        // Legacy single-pass pipeline
        if (updateFlags.spatial) {
          wignerPass.execute(ctx)
        }
      }
    }

    // ============================================
    // RENDER TARGET SETUP
    // ============================================
    if (is2D) {
      // 2D mode: only color output, no depth, no MRT
      const colorView = ctx.getWriteTarget('object-color')
      if (!colorView) {
        console.warn('[WebGPU Schrödinger] Missing color render target for 2D')
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
      console.warn('[WebGPU Schrödinger] Missing color render target')
      return
    }

    if (!isTemporal && !depthView) {
      console.warn('[WebGPU Schrödinger] Missing depth buffer for non-temporal mode')
      return
    }

    // Secondary MRT output is only used by temporal accumulation.
    const secondaryView = isTemporal ? ctx.getWriteTarget('quarter-position') : null

    if (isTemporal && !secondaryView) {
      console.warn('[WebGPU Schrödinger] Temporal mode requires quarter-position target')
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
    // Dispose compute passes
    this.densityGridPass?.dispose()
    this.densityGridPass = null
    this.densityGridInitialized = false
    this.densityGridSampler = null

    // Clean up open quantum state
    this.openQuantumState = null
    this.openQuantumInitialized = false
    this.openQuantumFrameCounter = 0
    this.openQuantumResetTokenSeen = -1
    this.openQuantumUpdateTick = 0
    this.openQuantumLastSchroedingerVersion = -1
    this.hoOpenQuantumCacheKey = ''
    this.hoOpenQuantumChannels = []
    this.hoOpenQuantumEnergies = null
    this.hydrogenBasis = null
    this.hydrogenRates = null
    this.hydrogenChannels = null
    this.hydrogenPropagator = null
    this.hydrogenBasisPackedBuffer = null
    this.hydrogenBasisLabels = []
    this.hoPopulationLabels = null
    this.hydrogenOQConfigHash = ''

    this.freeScalarFieldPass?.dispose()
    this.freeScalarFieldPass = null

    this.tdsePass?.dispose()
    this.tdsePass = null

    this.diracPass?.dispose()
    this.diracPass = null

    this.eigenCachePass?.dispose()
    this.eigenCachePass = null
    this.eigenCacheInitialized = false

    this.wignerCachePass?.dispose()
    this.wignerCachePass = null
    this.wignerCacheInitialized = false

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
