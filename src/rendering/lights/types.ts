/**
 * Multi-Light System Types
 *
 * Type definitions for the advanced lighting system supporting up to 4
 * dynamic light sources of different types (Point, Directional, Spot).
 *
 * @see docs/prd/advanced-lighting-system.md
 */

/**
 * Light source type enumeration.
 * - point: Radiates light equally in all directions from position
 * - directional: Parallel rays in a fixed direction (like sunlight)
 * - spot: Cone of light from position in a specific direction
 */
export type LightType = 'point' | 'directional' | 'spot'

/**
 * Transform manipulation mode for gizmo controls.
 * - translate: Move light position via XYZ axis arrows
 * - rotate: Rotate light direction via XYZ rotation rings
 */
export type TransformMode = 'translate' | 'rotate'

/**
 * Light source configuration.
 * Represents a single dynamic light in the scene.
 */
export interface LightSource {
  /** Unique identifier for the light */
  id: string
  /** Display name shown in sidebar */
  name: string
  /** Light type (point, directional, spot) */
  type: LightType
  /** Whether the light is currently active */
  enabled: boolean
  /** World-space position [x, y, z] */
  position: [number, number, number]
  /** Euler rotation angles in radians [x, y, z] for direction */
  rotation: [number, number, number]
  /** Light color as hex string (e.g., '#FFFFFF') */
  color: string
  /** Light intensity multiplier (0-3) */
  intensity: number
  /** Spot light cone angle in degrees (1-120) */
  coneAngle: number
  /** Spot light penumbra/softness (0-1, where 0=hard edge, 1=fully soft) */
  penumbra: number
  /**
   * Maximum range/distance for light attenuation (point/spot only).
   * 0 = infinite range (no distance falloff), matching Three.js default.
   * Range: 0-100, where 0 disables attenuation.
   */
  range: number
  /**
   * Rate of light decay over distance (point/spot only).
   * 0 = no decay, 1 = linear, 2 = physically correct inverse square.
   * Range: 0-3, default 2 for physically accurate lighting.
   */
  decay: number
}

/** Maximum number of dynamic lights supported */
export const MAX_LIGHTS = 4

/** Minimum number of lights required (0 = can delete all lights) */
export const MIN_LIGHTS = 0

/**
 * Light type to GLSL shader integer mapping.
 * Must match constants in shader code.
 */
export const LIGHT_TYPE_TO_INT: Record<LightType, number> = {
  point: 0,
  directional: 1,
  spot: 2,
} as const

/**
 * Default values for new lights by type.
 * range: 0 = infinite (no falloff), decay: 2 = physically accurate inverse square
 */
export const DEFAULT_LIGHT_VALUES: Record<LightType, Partial<LightSource>> = {
  point: {
    coneAngle: 30,
    penumbra: 0.5,
    range: 100,
    decay: 2.0, // Physically correct inverse-square falloff
  },
  directional: {
    coneAngle: 30,
    penumbra: 0.5,
    range: 100,
    decay: 2.0, // Physically correct (though directional lights don't attenuate by distance)
  },
  spot: {
    coneAngle: 30,
    penumbra: 0.2,
    range: 100,
    decay: 2.0, // Physically correct inverse-square falloff
  },
} as const

/**
 * Default position offset when adding new lights.
 * Each new light is offset to avoid overlapping.
 */
export const DEFAULT_NEW_LIGHT_POSITIONS: [number, number, number][] = [
  [5, 5, 5],
  [-5, 5, 5],
  [5, 5, -5],
  [-5, 5, -5],
]

/**
 * Create a default light matching the current single-light behavior.
 * Position derived from: horizontal=45deg, vertical=130deg, distance=8
 * @returns A new default light source configuration
 */
export function createDefaultLight(): LightSource {
  // Convert spherical coordinates to Cartesian
  // h=45deg, v=130deg, d=8 => x~-3.64, y~6.13, z~-3.64
  const h = (45 * Math.PI) / 180
  const v = (130 * Math.PI) / 180
  const d = 7

  return {
    id: 'light-default',
    name: 'Main Light',
    type: 'point',
    enabled: true,
    position: [Math.cos(v) * Math.cos(h) * d, Math.sin(v) * d, Math.cos(v) * Math.sin(h) * d],
    rotation: [0, 0, 0],
    color: '#FFFFFF',
    intensity: 1.0,
    coneAngle: 30,
    penumbra: 0.5,
    range: 100,
    decay: 2.0, // Physically correct inverse-square falloff
  }
}

/**
 * Create a default spot light positioned opposite to the main point light.
 * Points toward the origin.
 * @returns A new default spot light configuration
 */
export function createDefaultSpotLight(): LightSource {
  const position: [number, number, number] = [-5, 5, 5]
  const rotation = calculateRotationTowardOrigin(position)

  return {
    id: 'light-default-spot',
    name: 'Spot Light',
    type: 'spot',
    enabled: true,
    position,
    rotation,
    color: '#FFFFFF',
    intensity: 1.0,
    coneAngle: 30,
    penumbra: 0.2,
    range: 100,
    decay: 2.0, // Physically correct inverse-square falloff
  }
}

/**
 * Calculate rotation to point from a position toward the origin.
 *
 * @param position - Light position [x, y, z]
 * @returns Rotation that points toward origin
 */
function calculateRotationTowardOrigin(
  position: [number, number, number]
): [number, number, number] {
  const [px, py, pz] = position

  // Direction from position to origin: normalize(-position)
  const length = Math.sqrt(px * px + py * py + pz * pz)

  // If at origin, default to pointing down
  if (length < 0.001) {
    return [-Math.PI / 2, 0, 0]
  }

  const direction: [number, number, number] = [-px / length, -py / length, -pz / length]
  return directionToRotation(direction)
}

/**
 * Create a new light with sensible defaults.
 *
 * @param type - Light type to create
 * @param existingCount - Number of existing lights (for position offset)
 * @returns New light source configuration
 */
export function createNewLight(type: LightType, existingCount: number): LightSource {
  const positionIndex = Math.min(existingCount, DEFAULT_NEW_LIGHT_POSITIONS.length - 1)
  // Fallback to [5,5,5] if somehow index is out of bounds (shouldn't happen)
  const position =
    DEFAULT_NEW_LIGHT_POSITIONS[positionIndex] ?? ([5, 5, 5] as [number, number, number])
  const typeDefaults = DEFAULT_LIGHT_VALUES[type]

  // Generate unique ID
  const id = `light-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  // Generate name based on type
  const typeName = type.charAt(0).toUpperCase() + type.slice(1)
  const name = `${typeName} Light ${existingCount + 1}`

  // For spot and directional lights, calculate rotation to point at origin
  // Point lights radiate in all directions, so rotation doesn't matter
  const rotation: [number, number, number] =
    type === 'point' ? [0, 0, 0] : calculateRotationTowardOrigin(position)

  return {
    id,
    name,
    type,
    enabled: true,
    position: [position[0], position[1], position[2]] as [number, number, number],
    rotation,
    color: '#FFFFFF',
    intensity: 1.0,
    coneAngle: typeDefaults.coneAngle ?? 30,
    penumbra: typeDefaults.penumbra ?? 0.5,
    range: typeDefaults.range ?? 0,
    decay: typeDefaults.decay ?? 2,
  }
}

/**
 * Clone a light source with a new ID and offset position.
 *
 * @param source - Light to clone
 * @returns New light source with offset position
 */
export function cloneLight(source: LightSource): LightSource {
  const id = `light-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  return {
    ...source,
    id,
    name: `${source.name} (Copy)`,
    position: [source.position[0] + 1, source.position[1], source.position[2]],
  }
}

/**
 * Calculate direction vector from Euler rotation angles.
 * Used for directional and spot lights.
 *
 * @param rotation - Euler angles in radians [x, y, z]
 * @returns Normalized direction vector [x, y, z]
 */
export function rotationToDirection(rotation: [number, number, number]): [number, number, number] {
  const [rx, ry] = rotation

  // Start with forward direction (0, 0, -1) and apply rotations
  // Apply Y rotation (yaw) then X rotation (pitch)
  const cosX = Math.cos(rx)
  const sinX = Math.sin(rx)
  const cosY = Math.cos(ry)
  const sinY = Math.sin(ry)

  return [-sinY * cosX, sinX, -cosY * cosX]
}

/**
 * Calculate Euler rotation angles from a direction vector.
 * Inverse of rotationToDirection().
 *
 * @param direction - Normalized direction vector [x, y, z]
 * @returns Euler angles in radians [rx, ry, rz] (rz is always 0)
 */
export function directionToRotation(direction: [number, number, number]): [number, number, number] {
  const [dx, dy, dz] = direction

  // Pitch (rotation around X axis) from Y component
  // Clamp to [-1, 1] to avoid NaN from asin
  const rx = Math.asin(Math.max(-1, Math.min(1, dy)))

  // Yaw (rotation around Y axis) from X and Z components
  const ry = Math.atan2(-dx, -dz)

  // Roll is always 0 for this use case
  return [rx, ry, 0]
}

/**
 * Validate light intensity is within bounds.
 *
 * @param intensity - Input intensity value
 * @returns Clamped intensity (0.1-3)
 */
export function clampIntensity(intensity: number): number {
  if (!Number.isFinite(intensity)) {
    return 0.1
  }
  return Math.max(0.1, Math.min(3, intensity))
}

/**
 * Validate cone angle is within bounds.
 *
 * @param angle - Input angle in degrees
 * @returns Clamped angle (1-120)
 */
export function clampConeAngle(angle: number): number {
  if (!Number.isFinite(angle)) {
    return 1
  }
  return Math.max(1, Math.min(120, angle))
}

/**
 * Validate penumbra is within bounds.
 *
 * @param penumbra - Input penumbra value
 * @returns Clamped penumbra (0-1)
 */
export function clampPenumbra(penumbra: number): number {
  if (!Number.isFinite(penumbra)) {
    return 0
  }
  return Math.max(0, Math.min(1, penumbra))
}

/**
 * Validate range is within bounds.
 *
 * @param range - Input range value
 * @returns Clamped range (0 for infinite, otherwise 1-100)
 */
export function clampRange(range: number): number {
  if (!Number.isFinite(range)) {
    return 1
  }
  if (range === 0) {
    return 0
  }
  if (range < 0) {
    return 1
  }
  return Math.max(1, Math.min(100, range))
}

/**
 * Validate decay is within bounds.
 * 1 = linear, 2 = physically correct inverse square.
 *
 * @param decay - Input decay value
 * @returns Clamped decay (0 = no decay, 1 = linear, 2 = inverse square, max 3)
 */
export function clampDecay(decay: number): number {
  if (!Number.isFinite(decay)) {
    return 0.1
  }
  if (decay <= 0) {
    return 0
  }
  return Math.max(0, Math.min(3, decay))
}

/**
 * Normalize a rotation angle to the range [0, 2π) radians.
 *
 * @param angle - Input angle in radians
 * @returns Normalized angle in [0, 2π) radians
 */
export function normalizeRotation(angle: number): number {
  const TWO_PI = Math.PI * 2

  // Fast path: already in valid range
  if (angle >= 0 && angle < TWO_PI) {
    return angle
  }

  // Handle negative angles and angles >= 2π
  const normalized = ((angle % TWO_PI) + TWO_PI) % TWO_PI
  return normalized
}

/**
 * Normalize a rotation tuple to the range [0, 2π) radians for each component.
 *
 * @param rotation - Euler angles in radians [x, y, z]
 * @returns Normalized rotation tuple
 */
export function normalizeRotationTuple(
  rotation: [number, number, number]
): [number, number, number] {
  return [
    normalizeRotation(rotation[0]),
    normalizeRotation(rotation[1]),
    normalizeRotation(rotation[2]),
  ]
}

/**
 * Normalize a rotation angle to the range [-π, π) radians.
 * This range is more intuitive for rotation gizmos and transform controls.
 *
 * @param angle - Input angle in radians
 * @returns Normalized angle in [-π, π) radians
 */
export function normalizeRotationSigned(angle: number): number {
  if (!Number.isFinite(angle)) {
    return 0
  }
  const TWO_PI = Math.PI * 2

  // First normalize to [0, 2π)
  let normalized = ((angle % TWO_PI) + TWO_PI) % TWO_PI

  // Then shift to [-π, π)
  if (normalized >= Math.PI) {
    normalized -= TWO_PI
  }

  return normalized
}

/**
 * Normalize a rotation tuple to the range [-π, π) radians for each component.
 * This range is more intuitive for rotation gizmos and transform controls.
 *
 * @param rotation - Euler angles in radians [x, y, z]
 * @returns Normalized rotation tuple in [-π, π) range
 */
export function normalizeRotationTupleSigned(
  rotation: [number, number, number]
): [number, number, number] {
  return [
    normalizeRotationSigned(rotation[0]),
    normalizeRotationSigned(rotation[1]),
    normalizeRotationSigned(rotation[2]),
  ]
}
