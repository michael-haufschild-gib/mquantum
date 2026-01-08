/**
 * Shadow Map Uniform Utilities
 *
 * TypeScript utilities for creating and updating shadow map uniforms
 * used by mesh-based objects (Polytope, TubeWireframe) to receive shadows.
 *
 * Supports:
 * - 2D shadow maps for directional and spot lights
 * - 2D packed shadow maps for point lights (6 cube faces packed into 2D texture)
 * - PCF (Percentage Closer Filtering) for soft shadow edges
 *
 * Point light shadows use Three.js's approach: packing 6 cube faces into a 2D texture
 * with a 4:2 aspect ratio. This avoids the "bindTexture: textures can not be used
 * with multiple targets" WebGL error that occurs with cube textures.
 *
 * @see https://github.com/mrdoob/three.js/blob/dev/src/renderers/shaders/ShaderChunk/shadowmap_pars_fragment.glsl.js
 */

import type { Matrix4, Texture } from 'three'
import * as THREE from 'three'

import { LIGHT_TYPE_TO_INT, MAX_LIGHTS, type LightSource } from '@/rendering/lights/types'

import type { ShadowQuality } from './types'

// =============================================================================
// Placeholder Textures
// =============================================================================

/**
 * Create a 1x1 placeholder 2D texture for shadow maps.
 * Prevents WebGL errors when no shadow map is bound.
 * Returns depth of 1.0 (max distance = no shadow).
 * @returns A placeholder DataTexture
 */
function createPlaceholder2DTexture(): THREE.DataTexture {
  const data = new Uint8Array([255]) // 1.0 = max depth = fully lit
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RedFormat, THREE.UnsignedByteType)
  texture.needsUpdate = true
  return texture
}

/**
 * Create a placeholder RGBA texture for point light shadow maps.
 * Three.js packs depth as RGBA for precision, so we need an RGBA placeholder.
 * @returns A placeholder RGBA DataTexture
 */
function createPlaceholderRGBATexture(): THREE.DataTexture {
  // RGBA: all 255 = max depth = fully lit (when unpacked)
  const data = new Uint8Array([255, 255, 255, 255])
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType)
  texture.needsUpdate = true
  return texture
}

// Cached placeholder textures - created once and reused
let cachedPlaceholder2D: THREE.DataTexture | null = null
let cachedPlaceholderRGBA: THREE.DataTexture | null = null

/**
 * Get the cached placeholder 2D shadow map texture
 * @returns The cached placeholder 2D texture
 */
function getPlaceholder2D(): THREE.DataTexture {
  if (!cachedPlaceholder2D) {
    cachedPlaceholder2D = createPlaceholder2DTexture()
  }
  return cachedPlaceholder2D
}

/**
 * Get the cached placeholder RGBA texture for point shadows
 * @returns The cached placeholder RGBA texture
 */
function getPlaceholderRGBA(): THREE.DataTexture {
  if (!cachedPlaceholderRGBA) {
    cachedPlaceholderRGBA = createPlaceholderRGBATexture()
  }
  return cachedPlaceholderRGBA
}

// =============================================================================
// Types
// =============================================================================

/** Shadow data collected from a single light */
export interface ShadowLightData {
  /** Light type: 0=point, 1=directional, 2=spot */
  lightType: number
  /** Shadow map texture (2D for directional/spot) */
  shadowMap: Texture | null
  /** Point shadow map texture (2D packed cube faces for point lights) */
  pointShadowMap: Texture | null
  /** Shadow matrix (world to light clip space) */
  shadowMatrix: Matrix4
  /** Whether this light casts shadows */
  castsShadow: boolean
  /** Shadow camera near plane */
  cameraNear: number
  /** Shadow camera far plane */
  cameraFar: number
}

/** Shadow map uniform values */
export interface ShadowMapUniforms {
  // 2D shadow maps (directional/spot)
  uShadowMap0: { value: Texture | null }
  uShadowMap1: { value: Texture | null }
  uShadowMap2: { value: Texture | null }
  uShadowMap3: { value: Texture | null }
  // Shadow matrices
  uShadowMatrix0: { value: Matrix4 }
  uShadowMatrix1: { value: Matrix4 }
  uShadowMatrix2: { value: Matrix4 }
  uShadowMatrix3: { value: Matrix4 }
  // Point shadow maps (2D packed cube faces)
  uPointShadowMap0: { value: Texture | null }
  uPointShadowMap1: { value: Texture | null }
  uPointShadowMap2: { value: Texture | null }
  uPointShadowMap3: { value: Texture | null }
  // Per-light flags
  uLightCastsShadow: { value: boolean[] }
  // Global settings
  uShadowMapBias: { value: number }
  uShadowMapSize: { value: number }
  uShadowPCFSamples: { value: number }
  uShadowCameraNear: { value: number }
  uShadowCameraFar: { value: number }
}

// =============================================================================
// Constants
// =============================================================================

/** Shadow map sizes for each quality level */
export const SHADOW_MAP_SIZES: Record<ShadowQuality, number> = {
  low: 512,
  medium: 1024,
  high: 2048,
  ultra: 4096,
}

/** Default shadow bias to prevent shadow acne */
const DEFAULT_SHADOW_BIAS = 0.001

/** Default shadow map size */
const DEFAULT_SHADOW_MAP_SIZE = 1024

/** Default PCF samples (1 = 3x3 kernel) */
const DEFAULT_PCF_SAMPLES = 1

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create default shadow map uniforms.
 * Call this when creating a new ShaderMaterial that should receive shadows.
 * @returns Default shadow map uniforms object with placeholder textures
 */
export function createShadowMapUniforms(): ShadowMapUniforms {
  // Use placeholder textures to prevent WebGL binding errors when no shadow map is bound
  const placeholder2D = getPlaceholder2D()
  const placeholderRGBA = getPlaceholderRGBA()

  return {
    // 2D shadow maps (use placeholder to avoid WebGL binding errors)
    uShadowMap0: { value: placeholder2D },
    uShadowMap1: { value: placeholder2D },
    uShadowMap2: { value: placeholder2D },
    uShadowMap3: { value: placeholder2D },
    // Shadow matrices
    uShadowMatrix0: { value: new THREE.Matrix4() },
    uShadowMatrix1: { value: new THREE.Matrix4() },
    uShadowMatrix2: { value: new THREE.Matrix4() },
    uShadowMatrix3: { value: new THREE.Matrix4() },
    // Point shadow maps (2D packed - use RGBA placeholder)
    uPointShadowMap0: { value: placeholderRGBA },
    uPointShadowMap1: { value: placeholderRGBA },
    uPointShadowMap2: { value: placeholderRGBA },
    uPointShadowMap3: { value: placeholderRGBA },
    // Per-light flags
    uLightCastsShadow: { value: [false, false, false, false] },
    // Global settings
    uShadowMapBias: { value: DEFAULT_SHADOW_BIAS },
    uShadowMapSize: { value: DEFAULT_SHADOW_MAP_SIZE },
    uShadowPCFSamples: { value: DEFAULT_PCF_SAMPLES },
    uShadowCameraNear: { value: 0.5 },
    uShadowCameraFar: { value: 50 },
  }
}

// =============================================================================
// Update Functions
// =============================================================================

/**
 * Update shadow map uniforms from collected light data.
 *
 * @param uniforms - The uniform object to update (must have shadow map uniforms)
 * @param shadowData - Array of shadow data from scene lights
 * @param bias - Shadow map bias (prevents acne)
 * @param mapSize - Shadow map resolution
 * @param pcfSamples - PCF kernel: 0=hard, 1=3x3, 2=5x5
 */
export function updateShadowMapUniforms(
  uniforms: Record<string, { value: unknown }>,
  shadowData: ShadowLightData[],
  bias: number,
  mapSize: number,
  pcfSamples: number
): void {
  // Get typed uniform references
  const u = uniforms as unknown as ShadowMapUniforms

  // Update per-light shadow data
  const maps = [u.uShadowMap0, u.uShadowMap1, u.uShadowMap2, u.uShadowMap3]
  const pointMaps = [u.uPointShadowMap0, u.uPointShadowMap1, u.uPointShadowMap2, u.uPointShadowMap3]
  const matrices = [u.uShadowMatrix0, u.uShadowMatrix1, u.uShadowMatrix2, u.uShadowMatrix3]

  let pointLightCameraFar = 50 // Default

  for (let i = 0; i < MAX_LIGHTS; i++) {
    const data = shadowData[i]
    const map = maps[i]
    const pointMap = pointMaps[i]
    const matrix = matrices[i]

    if (data && data.castsShadow) {
      if (data.lightType === 0) {
        // Point light - use point shadow map (2D packed)
        if (map) map.value = getPlaceholder2D()
        if (pointMap) pointMap.value = data.pointShadowMap ?? getPlaceholderRGBA()
        pointLightCameraFar = data.cameraFar
      } else {
        // Directional or Spot - use regular 2D shadow map
        if (map) map.value = data.shadowMap ?? getPlaceholder2D()
        if (pointMap) pointMap.value = getPlaceholderRGBA()
      }

      // Update shadow matrix (with null guard)
      if (matrix) matrix.value.copy(data.shadowMatrix)

      // Update per-light flag (with null guard)
      if (u.uLightCastsShadow?.value) {
        u.uLightCastsShadow.value[i] = true
      }
    } else {
      // Clear data for this light - use placeholder instead of null to avoid WebGL binding errors
      if (map) map.value = getPlaceholder2D()
      if (pointMap) pointMap.value = getPlaceholderRGBA()
      if (u.uLightCastsShadow?.value) u.uLightCastsShadow.value[i] = false
    }
  }

  // Update global settings (with null guards for materials without shadow uniforms)
  if (u.uShadowMapBias) u.uShadowMapBias.value = bias
  if (u.uShadowMapSize) u.uShadowMapSize.value = mapSize
  if (u.uShadowPCFSamples) u.uShadowPCFSamples.value = pcfSamples
  if (u.uShadowCameraNear) u.uShadowCameraNear.value = 0.5
  if (u.uShadowCameraFar) u.uShadowCameraFar.value = pointLightCameraFar
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Collect shadow data from a Three.js scene.
 * Traverses the scene to find shadow-casting lights and extracts their shadow maps.
 *
 * Point lights in Three.js use a 2D packed texture for omnidirectional shadows.
 * The shadow.map is a WebGLRenderTarget with a 2D texture containing 6 cube faces.
 *
 * When storeLights is provided, the shadow data is ordered to match the store's
 * light array order. This ensures shadow maps are correctly associated with their
 * corresponding uniform indices.
 *
 * @param scene - The Three.js scene to traverse
 * @param storeLights - Optional array of lights from the lighting store (for ordered matching)
 * @returns Array of shadow data for each light (up to MAX_LIGHTS)
 */
export function collectShadowDataFromScene(
  scene: THREE.Scene,
  storeLights?: LightSource[]
): ShadowLightData[] {
  // Collect all shadow-casting lights from the scene
  const sceneLights: Array<{
    light: THREE.PointLight | THREE.DirectionalLight | THREE.SpotLight
    type: number
    position: THREE.Vector3
  }> = []

  scene.traverse((obj) => {
    if (obj instanceof THREE.DirectionalLight && obj.castShadow) {
      sceneLights.push({ light: obj, type: 1, position: obj.position.clone() })
    } else if (obj instanceof THREE.SpotLight && obj.castShadow) {
      sceneLights.push({ light: obj, type: 2, position: obj.position.clone() })
    } else if (obj instanceof THREE.PointLight && obj.castShadow) {
      sceneLights.push({ light: obj, type: 0, position: obj.position.clone() })
    }
  })

  const shadowData: ShadowLightData[] = []

  if (storeLights && storeLights.length > 0) {
    // Match scene lights to store lights by position and type for correct ordering
    for (let i = 0; i < Math.min(storeLights.length, MAX_LIGHTS); i++) {
      const storeLight = storeLights[i]
      if (!storeLight) continue
      const storeType = LIGHT_TYPE_TO_INT[storeLight.type]
      const storePos = new THREE.Vector3(...storeLight.position)

      // Find matching scene light by type and position (within tolerance)
      const matchIdx = sceneLights.findIndex((sl) => {
        if (sl.type !== storeType) return false
        return sl.position.distanceTo(storePos) < 0.01
      })

      if (matchIdx !== -1) {
        const matched = sceneLights[matchIdx]!
        const light = matched.light

        if (light instanceof THREE.PointLight) {
          const pointShadowTexture = light.shadow.map?.texture ?? null
          shadowData[i] = {
            lightType: 0,
            shadowMap: null,
            pointShadowMap: pointShadowTexture,
            shadowMatrix: light.shadow.matrix,
            castsShadow: pointShadowTexture !== null,
            cameraNear: light.shadow.camera.near,
            cameraFar: light.shadow.camera.far,
          }
        } else {
          shadowData[i] = {
            lightType: matched.type,
            shadowMap: light.shadow.map?.texture ?? null,
            pointShadowMap: null,
            shadowMatrix: light.shadow.matrix,
            castsShadow: light.shadow.map !== null,
            cameraNear: light.shadow.camera.near,
            cameraFar: light.shadow.camera.far,
          }
        }

        // Remove matched light to prevent double-matching
        sceneLights.splice(matchIdx, 1)
      } else {
        // No matching scene light found - fill with empty data
        shadowData[i] = {
          lightType: storeType,
          shadowMap: null,
          pointShadowMap: null,
          shadowMatrix: new THREE.Matrix4(),
          castsShadow: false,
          cameraNear: 0.5,
          cameraFar: 50,
        }
      }
    }
  } else {
    // Fallback: use discovery order (legacy behavior)
    let lightIdx = 0
    for (const sceneLight of sceneLights) {
      if (lightIdx >= MAX_LIGHTS) break

      const light = sceneLight.light

      if (light instanceof THREE.PointLight) {
        const pointShadowTexture = light.shadow.map?.texture ?? null
        shadowData[lightIdx] = {
          lightType: 0,
          shadowMap: null,
          pointShadowMap: pointShadowTexture,
          shadowMatrix: light.shadow.matrix,
          castsShadow: pointShadowTexture !== null,
          cameraNear: light.shadow.camera.near,
          cameraFar: light.shadow.camera.far,
        }
      } else {
        shadowData[lightIdx] = {
          lightType: sceneLight.type,
          shadowMap: light.shadow.map?.texture ?? null,
          pointShadowMap: null,
          shadowMatrix: light.shadow.matrix,
          castsShadow: light.shadow.map !== null,
          cameraNear: light.shadow.camera.near,
          cameraFar: light.shadow.camera.far,
        }
      }
      lightIdx++
    }
  }

  // Fill remaining slots with empty data
  while (shadowData.length < MAX_LIGHTS) {
    shadowData.push({
      lightType: 0,
      shadowMap: null,
      pointShadowMap: null,
      shadowMatrix: new THREE.Matrix4(),
      castsShadow: false,
      cameraNear: 0.5,
      cameraFar: 50,
    })
  }

  return shadowData
}

/**
 * Map shadow blur setting to PCF sample count.
 *
 * @param blur - Shadow blur setting (0-10)
 * @returns PCF sample mode: 0=hard, 1=3x3, 2=5x5
 */
export function blurToPCFSamples(blur: number): number {
  if (blur <= 0) return 0 // Hard shadows
  if (blur <= 5) return 1 // 3x3 PCF
  return 2 // 5x5 PCF
}

// =============================================================================
// Shadow Data Caching
// =============================================================================

/** Cached shadow data to avoid expensive scene traversal every frame */
interface ShadowDataCache {
  /** Cached shadow data array */
  data: ShadowLightData[]
  /** Numeric hash of light configuration for invalidation */
  lightsHash: number
}

/** Global shadow data cache */
let shadowDataCache: ShadowDataCache | null = null

/**
 * Light type to numeric value for hashing.
 * Must match LIGHT_TYPE_TO_INT but we duplicate here to avoid import dependency.
 */
const LIGHT_TYPE_HASH: Record<string, number> = {
  point: 0,
  directional: 1,
  spot: 2,
}

/**
 * Compute a numeric hash from light configuration for cache invalidation.
 * Uses a fast numeric hash instead of string concatenation to avoid
 * per-frame allocations.
 *
 * OPT-HASH-1: Replaced string-based hash with numeric hash.
 *
 * @param lights - Array of light sources
 * @returns Numeric hash uniquely identifying the light configuration
 */
function computeLightsHash(lights: LightSource[]): number {
  // Use a simple polynomial hash
  // FNV-1a inspired approach but simplified for performance
  let hash = 2166136261 // FNV offset basis (32-bit)
  const prime = 16777619 // FNV prime

  for (let i = 0; i < lights.length; i++) {
    const light = lights[i]!
    // Hash light index
    hash = (hash ^ i) * prime
    // Hash type (0, 1, or 2)
    hash = (hash ^ (LIGHT_TYPE_HASH[light.type] ?? 0)) * prime
    // Hash enabled state
    hash = (hash ^ (light.enabled ? 1 : 0)) * prime
    // Hash position (quantized to 3 decimal places for stability)
    const pos = light.position
    hash = (hash ^ Math.round(pos[0] * 1000)) * prime
    hash = (hash ^ Math.round(pos[1] * 1000)) * prime
    hash = (hash ^ Math.round(pos[2] * 1000)) * prime
  }

  // Keep hash as 32-bit integer
  return hash >>> 0
}

/**
 * Collect shadow data with caching.
 * Only recomputes when light configuration changes, avoiding expensive
 * scene traversal on every frame.
 *
 * @param scene - The Three.js scene to traverse
 * @param storeLights - Array of lights from the lighting store
 * @param forceRefresh - Force cache invalidation (e.g., after shadow map render)
 * @returns Cached or freshly computed shadow data
 */
export function collectShadowDataCached(
  scene: THREE.Scene,
  storeLights: LightSource[],
  forceRefresh = false
): ShadowLightData[] {
  const currentHash = computeLightsHash(storeLights)

  // Return cached data if hash matches and not forcing refresh
  if (!forceRefresh && shadowDataCache && shadowDataCache.lightsHash === currentHash) {
    return shadowDataCache.data
  }

  // Recompute shadow data
  const data = collectShadowDataFromScene(scene, storeLights)

  // Update cache
  shadowDataCache = {
    data,
    lightsHash: currentHash,
  }

  return data
}

/**
 * Invalidate the shadow data cache.
 * Call this when shadow maps have been updated (e.g., after a render pass).
 */
export function invalidateShadowDataCache(): void {
  shadowDataCache = null
}

// =============================================================================
// Cleanup
// =============================================================================

/**
 * Dispose of cached placeholder textures.
 * Call this during WebGL context cleanup or module unload to prevent memory leaks.
 * Safe to call multiple times.
 */
export function disposeShadowPlaceholders(): void {
  if (cachedPlaceholder2D) {
    cachedPlaceholder2D.dispose()
    cachedPlaceholder2D = null
  }
  if (cachedPlaceholderRGBA) {
    cachedPlaceholderRGBA.dispose()
    cachedPlaceholderRGBA = null
  }
  // Also clear the shadow data cache
  shadowDataCache = null
}
