/**
 * Schrödinger renderer per-frame state computations.
 *
 * Pure-computation functions extracted from WebGPUSchrodingerRenderer.
 * These functions mutate pre-allocated typed arrays and state objects
 * but perform no GPU buffer writes — the caller handles GPU operations.
 *
 * @module rendering/webgpu/renderers/schrodingerFrameUpdate
 */

import { computeBoundingRadius } from '@/lib/geometry/extended/schroedinger/boundingRadius'
import {
  flattenPresetForUniforms,
  generateQuantumPreset,
  getNamedPreset,
  type QuantumPreset,
} from '@/lib/geometry/extended/schroedinger/presets'
import type { SchroedingerConfig } from '@/lib/geometry/extended/types'
import { isUniformComputeGridQuantumType } from '@/lib/geometry/registry'
import { computeTdseEffectiveSpacing } from '@/lib/physics/tdse/effectiveSpacing'

import type { WebGPURenderContext } from '../core/types'
import { advanceTemporalBayerCycle } from '../shaders/schroedinger/temporalJitter'
import {
  type AnimationState,
  type AppearanceStoreState,
  BAYER_OFFSETS,
  type CameraSnapshot,
  COLOR_ALGORITHM_MAP,
  type ExtendedStoreSnapshot,
  type GeometryState,
  getStoreSnapshot,
  type PBRSliceState,
  type PerformanceSnapshot,
  QUANTUM_MODE_MAP,
  type RotationState,
  type SchrodingerRendererConfig,
  type TransformSnapshot,
} from './schrodingerRendererTypes'
import { SCHROEDINGER_LAYOUT } from './schroedingerLayout'
import {
  isBasisDirty,
  isSchroedingerDirty,
  type SchroedingerVersions,
  updateBasisVersions,
  updateSchroedingerVersions,
  type VersionTracker,
} from './stateDiffing'
import { computeLatticeBoundingRadius } from './strategies/computeGridUtils'
import type { QuantumModeStrategy, SchroedingerSnapshot } from './strategies/types'
import {
  applyHOMomentumTransform,
  computeCanonicalCompensation,
  packBasisVectors,
  packCameraUniforms,
  packPrecomputedHOTerms,
  packSchroedingerUniforms,
} from './uniformPacking'

/**
 * Four-decimal integer key for `qualityMultiplier` dirty checks. Avoids
 * per-frame `toFixed()` allocations while preserving the previous tolerance.
 */
const QUALITY_SIGNATURE_SCALE = 10000

/** Convert `qualityMultiplier` to a stable four-decimal dirty-check key. */
export function qualitySignatureKey(qualityMultiplier: number): number {
  return Math.round(qualityMultiplier * QUALITY_SIGNATURE_SCALE)
}

/** Byte offset of the time field in the SchroedingerUniforms buffer. */
export const TIME_FIELD_OFFSET = SCHROEDINGER_LAYOUT.byteOffset.time

/** Byte offset of the uncertainty log-rho threshold in SchroedingerUniforms. */
export const UNCERTAINTY_THRESHOLD_OFFSET =
  SCHROEDINGER_LAYOUT.byteOffset.uncertaintyLogRhoThreshold

/** Byte offset of the host-precomputed HO term array (array<vec4f, 8>). */
export const PRECOMPUTED_TERM_BYTE_OFFSET = SCHROEDINGER_LAYOUT.byteOffset.precomputedTerm

/**
 * Total byte size of the host-precomputed HO term region. Derived from the
 * shared SCHROEDINGER_LAYOUT so partial uniform uploads stay correct if the
 * HO term capacity (MAX_TERMS) or vec4f layout ever changes.
 */
export const PRECOMPUTED_TERM_BYTE_SIZE = SCHROEDINGER_LAYOUT.byteSize.precomputedTerm

import { quantizeBoundingRadius } from './boundingRadiusQuantize'

/** Mutable per-frame state shared across update functions. */
export interface SchrodingerFrameState {
  versions: VersionTracker

  // Temporal Bayer tracking (camera)
  temporalBayerIndex: number
  prevTemporalAnimTime: number
  prevTemporalVPMatrix: Float32Array
  prevTemporalWidth: number
  prevTemporalHeight: number
  completedTemporalCycle: boolean

  // Quantum preset caching
  cachedPreset: QuantumPreset | null
  cachedPresetConfig: {
    presetName: string
    seed: number
    termCount: number
    maxQuantumNumber: number
    frequencySpread: number
    dimension: number
  } | null
  flattenedPreset: {
    omega: Float32Array
    quantum: Int32Array
    coeff: Float32Array
    energy: Float32Array
  } | null

  // Auto-compensation
  canonicalDensityCompensation: number
  cachedPeakDensity: number

  // Bounding geometry
  boundingRadius: number
}

/**
 * Compute camera uniform data and advance temporal Bayer tracking.
 * Mutates `state` (temporal fields) and `data` (uniform array).
 */
export function computeCameraUpdate(
  ctx: WebGPURenderContext,
  config: SchrodingerRendererConfig,
  state: SchrodingerFrameState,
  data: Float32Array,
  dataView: DataView
): void {
  const camera = getStoreSnapshot<CameraSnapshot>(ctx, 'camera')
  if (!camera) return

  const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
  const animationTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0
  const is2D = (config.dimension ?? 3) === 2 || config.representation === 'wigner'

  // Pack the phase used by this draw, then advance state for the next frame.
  // WebGPUTemporalCloudPass follows the same use-then-advance contract; changing
  // this order makes reconstruction interpret quarter-res samples with stale phase.
  const bayerOffset = BAYER_OFFSETS[state.temporalBayerIndex]!

  // Temporal Bayer offset: advance only when scene content changes
  const animTimeChanged = animationTime !== state.prevTemporalAnimTime
  let cameraChanged = false
  if (camera.viewProjectionMatrix?.elements) {
    const vpElems = camera.viewProjectionMatrix.elements
    for (let i = 0; i < 16; i++) {
      if (vpElems[i] !== state.prevTemporalVPMatrix[i]) {
        cameraChanged = true
        break
      }
    }
    state.prevTemporalVPMatrix.set(vpElems)
  }
  const resolutionChanged =
    ctx.size.width !== state.prevTemporalWidth || ctx.size.height !== state.prevTemporalHeight
  state.prevTemporalWidth = ctx.size.width
  state.prevTemporalHeight = ctx.size.height

  const sceneChanged = animTimeChanged || cameraChanged || resolutionChanged

  const nextBayer = advanceTemporalBayerCycle(
    state.temporalBayerIndex,
    state.completedTemporalCycle,
    sceneChanged
  )
  state.temporalBayerIndex = nextBayer.index
  state.completedTemporalCycle = nextBayer.completedFullCycle
  state.prevTemporalAnimTime = animationTime

  const transform = is2D ? undefined : getStoreSnapshot<TransformSnapshot>(ctx, 'transform')

  packCameraUniforms(data, dataView, {
    camera,
    animationTime,
    is2D,
    transform,
    bayerOffset,
    size: ctx.size,
    frameDelta: ctx.frame?.delta || 0.016,
    frameNumber: ctx.frame?.frameNumber || 0,
  })
}

/**
 * Compute basis vector data if dirty.
 * @returns true if the buffer should be written to GPU.
 */
export function computeBasisUpdate(
  ctx: WebGPURenderContext,
  config: SchrodingerRendererConfig,
  state: SchrodingerFrameState,
  data: Float32Array
): boolean {
  const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
  const schroedinger = extended?.schroedinger
  const schroedingerVersion = extended?.schroedingerVersion ?? 0
  const rotation = getStoreSnapshot<RotationState>(ctx, 'rotation')
  const rotationVersion = rotation?.version ?? 0
  const geometry = getStoreSnapshot<GeometryState>(ctx, 'geometry')
  const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
  const accumulatedTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0
  const dimension = geometry?.dimension ?? config.dimension ?? 4

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

  if (!isBasisDirty(state.versions, basisVersions)) return false

  packBasisVectors(data, {
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

  updateBasisVersions(state.versions, basisVersions)
  return true
}

/** Result of the Schrödinger uniform computation. */
export interface SchroedingerUpdateResult {
  /** 'partial' = only time/uncertainty changed, 'full' = complete rewrite. */
  writeMode: 'partial' | 'full'
  /** For partial: animation time to write at TIME_FIELD_OFFSET. */
  partialTime?: number
  /** For partial: uncertainty threshold to write at UNCERTAINTY_THRESHOLD_OFFSET. */
  partialUncertaintyThreshold?: number
  /** New raw bounding radius requiring geometry rebuild, or undefined if unchanged. */
  newBoundingRadius?: number
}

interface SchrodingerDirtyInputs {
  extended: ExtendedStoreSnapshot | undefined
  schroedinger: ExtendedStoreSnapshot['schroedinger'] | undefined
  pbr: PBRSliceState | undefined
  appearance: AppearanceStoreState | undefined
  performance: PerformanceSnapshot | undefined
  animationTime: number
  uncertaintyLogRhoThreshold: number
  storeVersions: SchroedingerVersions
}

/** Read only data needed to choose the partial-vs-full uniform update path. */
function readDirtyInputs(
  ctx: WebGPURenderContext,
  strategy: QuantumModeStrategy
): SchrodingerDirtyInputs {
  const extended = getStoreSnapshot<ExtendedStoreSnapshot>(ctx, 'extended')
  const schroedinger = extended?.schroedinger
  const pbr = getStoreSnapshot<PBRSliceState>(ctx, 'pbr')
  const appearance = getStoreSnapshot<AppearanceStoreState>(ctx, 'appearance')
  const animation = getStoreSnapshot<AnimationState>(ctx, 'animation')
  const performance = getStoreSnapshot<PerformanceSnapshot>(ctx, 'performance')
  const animationTime = animation?.accumulatedTime ?? ctx.frame?.time ?? 0

  let uncertaintyLogRhoThreshold = -2.0
  if (strategy.setUncertaintyConfidenceMass) {
    const threshold = strategy.setUncertaintyConfidenceMass(
      schroedinger?.uncertaintyConfidenceMass ?? 0.68
    )
    if (threshold !== null) uncertaintyLogRhoThreshold = threshold
  }

  return {
    extended,
    schroedinger,
    pbr,
    appearance,
    performance,
    animationTime,
    uncertaintyLogRhoThreshold,
    storeVersions: {
      schroedingerVersion: extended?.schroedingerVersion ?? 0,
      appearanceVersion: appearance?.appearanceVersion ?? 0,
      pbrVersion: pbr?.pbrVersion ?? 0,
      pauliSpinorVersion: extended?.pauliSpinorVersion ?? 0,
      qualitySignature: qualitySignatureKey(performance?.qualityMultiplier ?? 1.0),
    },
  }
}

/** Read store snapshots and compute derived frame values for full uniform packing. */
function readFrameInputs(
  ctx: WebGPURenderContext,
  config: SchrodingerRendererConfig,
  dirtyInputs: SchrodingerDirtyInputs
) {
  const extended = dirtyInputs.extended
  const schroedinger = dirtyInputs.schroedinger
  const pbr = dirtyInputs.pbr
  const appearance = dirtyInputs.appearance
  const animationTime = dirtyInputs.animationTime
  const geometry = getStoreSnapshot<GeometryState>(ctx, 'geometry')
  const dimension = geometry?.dimension ?? config.dimension ?? 3
  const performance = dirtyInputs.performance

  const quantumModeStr = schroedinger?.quantumMode ?? 'harmonicOscillator'

  // Branch separation: continuous 0..1 metric derived from stochastic γ.
  // Uses 1 - exp(-γ) as a monotonic proxy: γ=0 → 0, γ→∞ → 1.
  // The raymarcher uses > 0.5 as the threshold for branch coloring.
  const tdseConf = schroedinger?.tdse
  const gammaRaw = tdseConf?.stochasticGamma ?? 0
  const stochasticGamma = Number.isFinite(gammaRaw) ? Math.max(0, gammaRaw) : 0
  const branchSeparation =
    tdseConf?.branchingEnabled && tdseConf?.stochasticEnabled
      ? Math.min(1, 1 - Math.exp(-stochasticGamma))
      : 0.0

  return {
    extended,
    schroedinger,
    pbr,
    appearance,
    animationTime,
    dimension,
    performance,
    uncertaintyLogRhoThreshold: dirtyInputs.uncertaintyLogRhoThreshold,
    quantumModeStr,
    quantumModeInt: QUANTUM_MODE_MAP[quantumModeStr] ?? 0,
    uncertaintyConfidenceMass: schroedinger?.uncertaintyConfidenceMass ?? 0.68,
    uncertaintyBoundaryWidth: schroedinger?.uncertaintyBoundaryWidth ?? 0.3,
    branchSeparation,
    isUniformComputeMode: isUniformComputeGridQuantumType(quantumModeStr),
    isDensityMatrixMode: config.openQuantumEnabled ?? false,
  }
}

/** Build the packing parameters object from frame inputs and state. */
function buildPackParams(
  inputs: ReturnType<typeof readFrameInputs>,
  config: SchrodingerRendererConfig,
  state: SchrodingerFrameState,
  effectiveMomentumScale: number,
  hbar: number,
  effectiveSampleCount: number,
  colorAlgorithm: number
) {
  return {
    quantumModeInt: inputs.quantumModeInt,
    quantumModeStr: inputs.quantumModeStr,
    isUniformComputeMode: inputs.isUniformComputeMode,
    isDensityMatrixMode: inputs.isDensityMatrixMode,
    dimension: inputs.dimension,
    presetTermCount: state.cachedPreset?.termCount ?? 1,
    presetData: state.flattenedPreset,
    boundingRadius: state.boundingRadius,
    canonicalDensityCompensation: state.canonicalDensityCompensation,
    cachedPeakDensity: state.cachedPeakDensity,
    colorAlgorithm,
    effectiveSampleCount,
    effectiveMomentumScale,
    hbar,
    animationTime: inputs.animationTime,
    uncertaintyLogRhoThreshold: inputs.uncertaintyLogRhoThreshold,
    uncertaintyConfidenceMass: inputs.uncertaintyConfidenceMass,
    uncertaintyBoundaryWidth: inputs.uncertaintyBoundaryWidth,
    schroedinger: inputs.schroedinger,
    appearance: inputs.appearance,
    pbr: inputs.pbr,
    pauliSpinor: inputs.extended?.pauliSpinor,
    rendererOpenQuantumEnabled: config.openQuantumEnabled ?? false,
    rendererQuantumMode: config.quantumMode ?? 'harmonicOscillator',
    rendererTermCount: config.termCount,
    branchColorA: inputs.schroedinger?.tdse?.branchColorA as [number, number, number] | undefined,
    branchColorB: inputs.schroedinger?.tdse?.branchColorB as [number, number, number] | undefined,
    branchSeparation: inputs.branchSeparation,
    // Branch plane in world-space for fragment-shader branch fraction computation
    // (moved from compute shader density texture alpha to avoid Metal compiler bug)
    // Uses effective spacing to account for compactified dimensions
    ...(() => {
      const tdse = inputs.schroedinger?.tdse
      if (!tdse) return { branchPlaneThreshold: 0, branchTransitionWidth: 0.2 }
      const gridSize = tdse.gridSize ?? [64]
      const effSpacing = computeTdseEffectiveSpacing(tdse)
      const halfExtent = (gridSize[0] ?? 64) * (effSpacing[0] ?? 0.1) * 0.5
      return {
        branchPlaneThreshold: (tdse.branchPlanePosition ?? 0) * halfExtent,
        branchTransitionWidth: (effSpacing[0] ?? 0.1) * 2.0,
      }
    })(),
  }
}

/**
 * Compute Schrödinger uniform data.
 * Mutates `state` (preset cache, compensation, bounding radius) and typed arrays.
 * @returns Information about what GPU buffer writes are needed.
 */
export function computeSchroedingerUpdate(
  ctx: WebGPURenderContext,
  config: SchrodingerRendererConfig,
  strategy: QuantumModeStrategy,
  state: SchrodingerFrameState,
  floatView: Float32Array,
  intView: Int32Array
): SchroedingerUpdateResult {
  const dirtyInputs = readDirtyInputs(ctx, strategy)

  if (!isSchroedingerDirty(state.versions, dirtyInputs.storeVersions)) {
    // Even on the partial-write fast path the time advances every frame, so
    // term_k = c_k * exp(-i * E_k * t) must be recomputed and uploaded — the
    // shader reads it unconditionally for the HO superposition path. Reads
    // post-momentum-rotated coeff[k] from floatView, which is correct because
    // any change to coeff/energy/termCount would have bumped a tracked version
    // and routed us into the full-write branch instead.
    const partialTimeScale = dirtyInputs.schroedinger?.timeScale ?? 0.8
    packPrecomputedHOTerms(floatView, intView, dirtyInputs.animationTime, partialTimeScale)
    return {
      writeMode: 'partial',
      partialTime: dirtyInputs.animationTime,
      partialUncertaintyThreshold: dirtyInputs.uncertaintyLogRhoThreshold,
    }
  }
  updateSchroedingerVersions(state.versions, dirtyInputs.storeVersions)

  const inputs = readFrameInputs(ctx, config, dirtyInputs)

  // Quantum preset generation
  const needsPresetRegen = maybeRegeneratePreset(
    state,
    strategy,
    inputs.schroedinger,
    inputs.dimension
  )

  // Momentum scale
  const isPSpace = inputs.schroedinger?.momentumDisplayUnits === 'p'
  const hbar = isPSpace ? Math.max(inputs.schroedinger?.momentumHbar ?? 1.0, 1e-4) : 1.0
  const effectiveMomentumScale = (inputs.schroedinger?.momentumScale ?? 1.0) / hbar

  // Bounding radius
  const newBoundR = computeNewBoundingRadius(
    state,
    config,
    strategy,
    inputs.schroedinger,
    inputs.extended,
    inputs.dimension,
    inputs.quantumModeStr,
    inputs.isUniformComputeMode,
    effectiveMomentumScale
  )

  // Canonical compensation
  if (strategy.isComputeMode) {
    state.canonicalDensityCompensation = 1.0
    state.cachedPeakDensity = 1.0
  } else if (needsPresetRegen && state.cachedPreset) {
    const result = computeCanonicalCompensation(
      state.cachedPreset,
      inputs.dimension,
      state.boundingRadius
    )
    state.canonicalDensityCompensation = result.compensation
    state.cachedPeakDensity = result.peakDensity
  }

  // Derived values for packing
  const qualityMultiplier = inputs.performance?.qualityMultiplier ?? 1.0
  const fastMode = qualityMultiplier < 0.75
  const baseSampleCount = inputs.schroedinger?.sampleCount ?? (fastMode ? 32 : 64)
  const radiusScale = state.boundingRadius / 2.0
  const effectiveSampleCount = Math.min(Math.max(8, Math.ceil(baseSampleCount * radiusScale)), 96)

  const colorAlgorithm =
    config.colorAlgorithm ??
    COLOR_ALGORITHM_MAP[inputs.appearance?.colorAlgorithm ?? 'radialDistance'] ??
    11

  // Pack uniform buffer
  packSchroedingerUniforms(
    floatView,
    intView,
    buildPackParams(
      inputs,
      config,
      state,
      effectiveMomentumScale,
      hbar,
      effectiveSampleCount,
      colorAlgorithm
    )
  )

  // HO momentum transform (in-place on already-packed buffer)
  if (
    !inputs.isUniformComputeMode &&
    inputs.schroedinger?.representation === 'momentum' &&
    inputs.quantumModeStr !== 'hydrogenND' &&
    inputs.quantumModeStr !== 'hydrogenNDCoupled'
  ) {
    applyHOMomentumTransform(floatView, intView, inputs.dimension, hbar)
  }

  // Host-precompute term_k = c_k * exp(-i * E_k * t) AFTER the momentum
  // transform — applyHOMomentumTransform rotates coeff[k] by (-i)^{Σ n_j} per
  // term, and the precompute must consume the rotated values to stay
  // numerically identical to the original GPU expression.
  const fullTimeScale = inputs.schroedinger?.timeScale ?? 0.8
  packPrecomputedHOTerms(floatView, intView, inputs.animationTime, fullTimeScale)

  return {
    writeMode: 'full',
    newBoundingRadius: newBoundR ?? undefined,
  }
}

function maybeRegeneratePreset(
  state: SchrodingerFrameState,
  strategy: QuantumModeStrategy,
  schroedinger: Partial<SchroedingerConfig> | undefined,
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
    !state.cachedPresetConfig ||
    Math.abs(state.cachedPresetConfig.frequencySpread - currentConfig.frequencySpread) > 1e-6
  const needsRegen =
    !state.cachedPresetConfig ||
    state.cachedPresetConfig.presetName !== currentConfig.presetName ||
    state.cachedPresetConfig.seed !== currentConfig.seed ||
    state.cachedPresetConfig.termCount !== currentConfig.termCount ||
    state.cachedPresetConfig.maxQuantumNumber !== currentConfig.maxQuantumNumber ||
    frequencySpreadChanged ||
    state.cachedPresetConfig.dimension !== currentConfig.dimension

  if (!needsRegen) return false

  let preset: QuantumPreset
  if (presetName === 'custom') {
    preset = generateQuantumPreset(seed, dimension, termCount, maxQuantumNumber, frequencySpread)
  } else {
    preset =
      getNamedPreset(presetName, dimension) ??
      generateQuantumPreset(seed, dimension, termCount, maxQuantumNumber, frequencySpread)
  }
  state.cachedPreset = preset
  state.cachedPresetConfig = { ...currentConfig }
  state.flattenedPreset = flattenPresetForUniforms(preset)
  strategy.resetOpenQuantumState?.()
  return true
}

function computeNewBoundingRadius(
  state: SchrodingerFrameState,
  config: SchrodingerRendererConfig,
  strategy: QuantumModeStrategy,
  schroedinger: Partial<SchroedingerConfig> | undefined,
  extended: ExtendedStoreSnapshot | undefined,
  dimension: number,
  quantumModeStr: string,
  isUniformComputeMode: boolean,
  effectiveMomentumScale: number
): number | null {
  const strategyBoundR = strategy.computeBoundingRadius(
    (schroedinger as SchroedingerSnapshot) ?? {},
    dimension,
    config
  )

  let rawBoundR: number | null = null

  if (strategyBoundR === null && config.isPauli) {
    const pauliCfg = extended?.pauliSpinor
    if (pauliCfg) {
      rawBoundR = computeLatticeBoundingRadius(
        pauliCfg.latticeDim ?? 3,
        pauliCfg.gridSize ?? [64],
        pauliCfg.spacing ?? [0.15]
      )
    }
  } else if (strategyBoundR !== null) {
    rawBoundR = strategyBoundR
  } else if (state.cachedPreset) {
    const oqCfg = schroedinger?.openQuantum
    const effectiveN =
      config.openQuantumEnabled &&
      oqCfg?.enabled &&
      (quantumModeStr === 'hydrogenND' || quantumModeStr === 'hydrogenNDCoupled')
        ? Math.max(schroedinger?.principalQuantumNumber ?? 2, oqCfg.hydrogenBasisMaxN ?? 2)
        : (schroedinger?.principalQuantumNumber ?? 2)
    const rawBR = computeBoundingRadius(
      quantumModeStr,
      state.cachedPreset,
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
    rawBoundR = rawBR / Math.max(fieldScale, 1e-4)
  }

  if (rawBoundR !== null) {
    const quantized = quantizeBoundingRadius(rawBoundR, state.boundingRadius)
    if (quantized !== null) {
      state.boundingRadius = quantized
      return quantized
    }
  }

  return null
}
