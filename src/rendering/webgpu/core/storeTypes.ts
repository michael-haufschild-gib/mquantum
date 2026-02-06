/**
 * Type-safe store access for WebGPU renderers
 *
 * This module provides typed interfaces for accessing Zustand store state
 * in WebGPU renderers, eliminating the need for `as any` casts.
 *
 * @module rendering/webgpu/core/storeTypes
 */

import type { WebGPUFrameContext } from './types'

// =============================================================================
// Store State Types (read-only subsets used by renderers)
// =============================================================================

/**
 * Camera store state accessible to renderers.
 *
 * Note: The camera data is flattened when passed to passes via frame context.
 * This interface reflects the actual structure received by WebGPU passes.
 */
export interface CameraStoreState {
  // Position data
  position?: { x: number; y: number; z: number } | [number, number, number]

  // Matrices with elements array (Three.js Matrix4 format)
  viewMatrix?: { elements: number[] }
  projectionMatrix?: { elements: number[] }
  inverseViewMatrix?: { elements: number[] }
  inverseProjectionMatrix?: { elements: number[] }
  viewProjectionMatrix?: { elements: number[] }
  matrixWorldInverse?: { elements: number[] }

  // Camera parameters
  near?: number
  far?: number
  fov?: number
  aspect?: number
  isPerspective?: boolean

  // Legacy controls structure (if still used in some places)
  controls?: {
    object?: {
      position?: { x: number; y: number; z: number }
      projectionMatrix?: { elements: number[] }
      matrixWorldInverse?: { elements: number[] }
    }
    target?: { x: number; y: number; z: number }
  } | null
}

/**
 * Extended object store state accessible to renderers.
 */
export interface ExtendedStoreState {
  // Common extended properties
  power?: number
  iterations?: number
  bailout?: number
  timeScale?: number
  animationSpeed?: number
  colorShift?: number
  // Black hole specific
  mass?: number
  spinParameter?: number
  accretionDiskEnabled?: boolean
  accretionInnerRadius?: number
  accretionOuterRadius?: number
  // Julia set specific
  juliaC?: [number, number, number, number]
  // Schrodinger specific
  potentialType?: string
  energyLevel?: number
}

/**
 * PBR store state accessible to renderers.
 */
export interface PBRStoreState {
  roughness: number
  metalness: number
  clearcoat: number
  clearcoatRoughness: number
  specularIntensity: number
  specularColor: string
  faceRoughness: number
  faceMetalness: number
  edgeRoughness: number
  edgeMetalness: number
}

/**
 * Appearance store state accessible to renderers.
 */
export interface AppearanceStoreState {
  colorAlgorithm: string
  cosineCoefficients: {
    a: [number, number, number]
    b: [number, number, number]
    c: [number, number, number]
    d: [number, number, number]
  }
  faceColor: string
  edgeColor: string
  opacity: number
}

/**
 * Transform store state accessible to renderers.
 */
export interface TransformStoreState {
  scale: number
  position: [number, number, number]
}

/**
 * Lighting store state accessible to renderers.
 */
export interface LightingStoreState {
  lightEnabled: boolean
  lightColor: string
  lightStrength: number
  lightHorizontalAngle: number
  lightVerticalAngle: number
  ambientEnabled: boolean
  ambientColor: string
  ambientIntensity: number
  exposure: number
  toneMappingEnabled: boolean
  toneMappingAlgorithm: string
}

/**
 * Rotation store state accessible to renderers.
 */
export interface RotationStoreState {
  rotationXY: number
  rotationXZ: number
  rotationXW: number
  rotationYZ: number
  rotationYW: number
  rotationZW: number
}

/**
 * Quality store state accessible to renderers.
 */
export interface QualityStoreState {
  rayMarchSteps: number
}

/**
 * Performance store state accessible to renderers.
 */
export interface PerformanceStoreState {
  renderResolutionScale: number
  sampleQuality: string
}

// =============================================================================
// Store Map Type
// =============================================================================

/**
 * Typed store map for WebGPU frame context.
 */
export interface WebGPUStoreMap {
  camera: CameraStoreState
  extended: ExtendedStoreState
  pbr: PBRStoreState
  appearance: AppearanceStoreState
  transform: TransformStoreState
  lighting: LightingStoreState
  rotation: RotationStoreState
  quality: QualityStoreState
  performance: PerformanceStoreState
  // Additional stores (passthrough for now)
  environment: unknown
  postProcessing: unknown
  animation: unknown
}

// =============================================================================
// Type-Safe Store Access Helper
// =============================================================================

/**
 * Get typed store state from frame context.
 *
 * @param ctx
 * @param ctx.frame
 * @param key
 * @example
 * ```typescript
 * const camera = getStore(ctx, 'camera')
 * // camera is typed as CameraStoreState | undefined
 * const position = camera?.controls?.object.position
 * ```
 */
export function getStore<K extends keyof WebGPUStoreMap>(
  ctx: { frame: WebGPUFrameContext | null },
  key: K
): WebGPUStoreMap[K] | undefined {
  return ctx.frame?.stores?.[key] as WebGPUStoreMap[K] | undefined
}

/**
 * Get typed store state with default fallback.
 *
 * @param ctx
 * @param ctx.frame
 * @param key
 * @param defaultValue
 * @example
 * ```typescript
 * const extended = getStoreOrDefault(ctx, 'extended', { power: 8, iterations: 100 })
 * ```
 */
export function getStoreOrDefault<K extends keyof WebGPUStoreMap>(
  ctx: { frame: WebGPUFrameContext | null },
  key: K,
  defaultValue: Partial<WebGPUStoreMap[K]>
): WebGPUStoreMap[K] {
  const store = ctx.frame?.stores?.[key] as WebGPUStoreMap[K] | undefined
  return (store ?? defaultValue) as WebGPUStoreMap[K]
}
