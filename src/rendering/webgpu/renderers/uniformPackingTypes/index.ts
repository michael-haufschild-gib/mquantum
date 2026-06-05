/**
 * Shared parameter types for the Schrodinger uniform packing modules.
 *
 * Extracted into its own file so sibling packers
 * (`uniformPacking.ts`, `uniformPackingColorOverlays.ts`,
 *  `uniformPackingBackreaction.ts`, ...) can share the contract without
 * forming a circular import. Keep this file type-only.
 *
 * @module rendering/webgpu/renderers/uniformPackingTypes
 */

import type { SchroedingerConfig } from '@/lib/geometry/extended/types'
import type { AppearanceStoreState } from '@/stores/scene/appearanceStore'
import type { PBRSliceState } from '@/stores/slices/visual/pbrSlice'

/** Flattened preset arrays as produced by `flattenPresetForUniforms`. */
export interface FlattenedPreset {
  omega: Float32Array
  quantum: Int32Array
  coeff: Float32Array
  energy: Float32Array
}

/** All values needed to pack the Schroedinger uniform buffer. */
export interface SchroedingerPackParams {
  // Mode classification
  quantumModeInt: number
  quantumModeStr: string
  isUniformComputeMode: boolean
  isDensityMatrixMode: boolean
  dimension: number

  // Preset data
  presetTermCount: number
  presetData: FlattenedPreset | null

  // Renderer state
  boundingRadius: number
  canonicalDensityCompensation: number
  cachedPeakDensity: number
  colorAlgorithm: number
  effectiveSampleCount: number
  effectiveMomentumScale: number
  hbar: number
  animationTime: number
  uncertaintyLogRhoThreshold: number
  uncertaintyConfidenceMass: number
  uncertaintyBoundaryWidth: number

  // Store snapshots (accessed for individual field reads)
  schroedinger: Partial<SchroedingerConfig> | undefined
  appearance: AppearanceStoreState | undefined
  pbr: PBRSliceState | undefined
  pauliSpinor: { spinUpColor?: number[]; spinDownColor?: number[] } | undefined

  // Renderer config subset
  rendererOpenQuantumEnabled: boolean
  rendererQuantumMode: string
  rendererTermCount: number | undefined

  // Decoherent branching colors [r, g, b] in 0–1 range
  branchColorA?: [number, number, number]
  branchColorB?: [number, number, number]
  /** Branch separation metric: 0 = coherent (equal populations), 1 = fully separated */
  branchSeparation?: number
  /** Branch plane threshold in world-space (for fragment-shader branch fraction) */
  branchPlaneThreshold?: number
  /** Branch transition width in world-space (for fragment-shader smoothstep) */
  branchTransitionWidth?: number
}
