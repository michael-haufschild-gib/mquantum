/**
 * Types, constants, and helper functions for the Schrödinger renderer.
 *
 * Extracted from WebGPUSchrodingerRenderer to reduce file size and
 * isolate the pure-data / pure-function layer from the stateful renderer.
 *
 * @module rendering/webgpu/renderers/schrodingerRendererTypes
 */

import type { SchroedingerQuantumMode } from '@/lib/geometry/extended/common'
import type { SchroedingerConfig } from '@/lib/geometry/extended/types'
import { getQuantumTypeShaderUniformIdMap } from '@/lib/geometry/registry'
import type { HydrogenBasisState } from '@/lib/physics/openQuantum/hydrogenBasis'
import type { AnimationState } from '@/stores/animationStore'
import type { AppearanceStoreState } from '@/stores/appearanceStore'
import type { GeometryState } from '@/stores/geometryStore'
import type { RotationState } from '@/stores/rotationStore'
import type { PBRSliceState } from '@/stores/slices/visual/pbrSlice'

// Re-export shared store access utilities so existing importers keep working.
export type { CameraMatrix, CameraSnapshot } from '../core/storeAccess'
export { getStoreSnapshot } from '../core/storeAccess'
import type { packLightingUniforms } from '../utils/lighting'

// ---------------------------------------------------------------------------
// Uniform buffer size
// ---------------------------------------------------------------------------

/** Total byte size of the SchroedingerUniforms GPU buffer (derived from layout) */
export { SCHROEDINGER_UNIFORM_SIZE } from './schroedingerLayout'

// ---------------------------------------------------------------------------
// Temporal jitter pattern
// ---------------------------------------------------------------------------

/** Bayer pattern offsets for 4-frame temporal jitter cycle */
export const BAYER_OFFSETS: [number, number][] = [
  [0, 0],
  [1, 1],
  [1, 0],
  [0, 1],
]

// ---------------------------------------------------------------------------
// String → integer enum maps for GPU uniform packing
// ---------------------------------------------------------------------------

/** Maps quantum mode names to the integer values expected by WGSL shaders.
 *
 * The integer values are interpreted by the shader's
 * `uniforms.quantumMode == N` guards (e.g. `== 3` for TDSE branch
 * coloring, `!= 8` for AdS relative-phase gating). Each slot must stay
 * unique across modes the shader can ever encounter at runtime, so a
 * missing entry cannot silently collide with another mode's branch.
 *
 * Wheeler–DeWitt takes slot `9` (next free after AdS's `8`) so the
 * shader's AdS `!= 8` guard correctly recognises WdW as non-AdS and
 * the `uniforms.quantumMode` channel stays unambiguous. Earlier
 * revisions omitted WdW from this map — WdW would fall back to `0`
 * (HO), and any shader guard newly keyed to `== 0` would fire
 * spuriously for WdW's density grid.
 */
export const QUANTUM_MODE_MAP: Record<string, number> = getQuantumTypeShaderUniformIdMap()

/** Maps color algorithm names to shader integer constants */
export const COLOR_ALGORITHM_MAP: Record<string, number> = {
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
  pauliSpinDensity: 24,
  pauliSpinExpectation: 25,
  pauliCoherence: 26,
  quantumPotential: 27,
  vortexDensity: 28,
}

/**
 * Check whether a color algorithm integer is in the free scalar field analysis range
 * (hamiltonianDecomposition..kSpaceOccupation, indices 12-15).
 */
export function isFreeScalarAnalysisAlgorithm(algo: number | undefined): boolean {
  if (algo === undefined) return false
  return (
    algo >= COLOR_ALGORITHM_MAP.hamiltonianDecomposition! &&
    algo <= COLOR_ALGORITHM_MAP.kSpaceOccupation!
  )
}

/** Maps nodal line definition names to shader integer constants */
export const NODAL_DEFINITION_MAP: Record<string, number> = {
  psiAbs: 0,
  realPart: 1,
  imagPart: 2,
  complexIntersection: 3,
}

/** Maps nodal family names to shader integer constants */
export const NODAL_FAMILY_MAP: Record<string, number> = {
  all: 0,
  radial: 1,
  angular: 2,
}

/** Maps nodal render mode names to shader integer constants */
export const NODAL_RENDER_MODE_MAP: Record<string, number> = {
  band: 0,
  surface: 1,
}

/** Maps cross-section composite mode names to shader integer constants */
export const CROSS_SECTION_COMPOSITE_MODE_MAP: Record<string, number> = {
  overlay: 0,
  sliceOnly: 1,
}

/** Maps cross-section scalar names to shader integer constants */
export const CROSS_SECTION_SCALAR_MAP: Record<string, number> = {
  density: 0,
  real: 1,
  imag: 2,
}

/** Maps probability current style names to shader integer constants */
export const PROBABILITY_CURRENT_STYLE_MAP: Record<string, number> = {
  magnitude: 0,
  arrows: 1,
  surfaceLIC: 2,
  streamlines: 3,
}

/** Maps probability current placement names to shader integer constants */
export const PROBABILITY_CURRENT_PLACEMENT_MAP: Record<string, number> = {
  isosurface: 0,
  volume: 1,
}

/** Maps probability current color mode names to shader integer constants */
export const PROBABILITY_CURRENT_COLOR_MODE_MAP: Record<string, number> = {
  magnitude: 0,
  direction: 1,
  circulationSign: 2,
}

/** Maps representation mode names to shader integer constants */
export const REPRESENTATION_MODE_MAP: Record<string, number> = {
  position: 0,
  momentum: 1,
  wigner: 2,
}

/** Maps momentum display mode names to shader integer constants */
export const MOMENTUM_DISPLAY_MODE_MAP: Record<string, number> = {
  k: 0,
  p: 1,
}

// ---------------------------------------------------------------------------
// Snapshot interfaces for store data
// ---------------------------------------------------------------------------

// CameraMatrix and CameraSnapshot are now defined in core/storeAccess.ts
// and re-exported above for backward compatibility.

/** Extended store snapshot (Schrödinger + Pauli config) */
export interface ExtendedStoreSnapshot {
  schroedinger?: Partial<SchroedingerConfig>
  schroedingerVersion?: number
  clearFreeScalarNeedsReset?: () => void
  clearTdseNeedsReset?: () => void
  clearBecNeedsReset?: () => void
  clearDiracNeedsReset?: () => void
  clearQuantumWalkNeedsReset?: () => void
  clearWdwNeedsReset?: () => void
  clearAdsNeedsReset?: () => void
  pauliSpinor?: import('@/lib/geometry/extended/types').PauliConfig
  pauliSpinorVersion?: number
  clearPauliNeedsReset?: () => void
}

/** Object transform snapshot */
export interface TransformSnapshot {
  uniformScale?: number
  position?: number[]
}

/** Performance/quality snapshot */
export interface PerformanceSnapshot {
  qualityMultiplier?: number
  isInteracting?: boolean
  sceneTransitioning?: boolean
  refinementStage?: string
}

/** Lighting snapshot type (inferred from packLightingUniforms) */
export type LightingSnapshot = Parameters<typeof packLightingUniforms>[1]

// Re-export store types used by the renderer for convenience
export type { AnimationState, AppearanceStoreState, GeometryState, PBRSliceState, RotationState }

// ---------------------------------------------------------------------------
// Renderer configuration
// ---------------------------------------------------------------------------

/** Configuration for the Schrödinger quantum renderer */
export interface SchrodingerRendererConfig {
  dimension?: number
  isosurface?: boolean
  quantumMode?: SchroedingerQuantumMode
  termCount?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
  /** Compile-time color module selection (0-28) */
  colorAlgorithm?: number
  /** Enable temporal accumulation for volumetric mode */
  temporal?: boolean
  /** Compile-time specialization flag for nodal calculations. */
  nodalEnabled?: boolean
  /** Compile-time nodal definition specialization. */
  nodalDefinition?: SchroedingerConfig['nodalDefinition']
  /** Compile-time nodal render-mode specialization. */
  nodalRenderMode?: SchroedingerConfig['nodalRenderMode']
  /** Compile-time nodal family-filter specialization. */
  nodalFamilyFilter?: SchroedingerConfig['nodalFamilyFilter']
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
  /** Wavefunction representation — triggers pipeline rebuild when changed. */
  representation?: 'position' | 'momentum' | 'wigner'
  /** Open quantum system — density matrix + Lindblad evolution. */
  openQuantumEnabled?: boolean
  /** Whether this renderer is configured for Pauli Spinor mode. */
  isPauli?: boolean
  /** Compile-time gate for cross-section slice. */
  crossSectionEnabled?: boolean
  /** Compile-time gate for probability current j-field. */
  probabilityCurrentEnabled?: boolean
  /** Density grid resolution per axis (64/96/128/256). */
  densityGridResolution?: number
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

// getStoreSnapshot is now defined in core/storeAccess.ts and re-exported above.

/**
 * Pack hydrogen basis states into an ArrayBuffer matching HydrogenBasisUniforms layout.
 *
 * Layout (704 bytes):
 * - quantumNumbers: array<vec4<i32>, 39> (624 bytes) — 14 states × 11 dims packed 4-per-vec
 * - energies: array<vec4f, 4> (64 bytes) — 14 energies packed 4-per-vec
 * - basisCount: u32 + 3×u32 padding (16 bytes)
 */
export function packHydrogenBasisForGPU(
  basis: HydrogenBasisState[],
  dimension: number
): ArrayBuffer {
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
