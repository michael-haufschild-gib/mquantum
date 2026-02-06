/**
 * Object Type Registry - Type Definitions
 *
 * Central type definitions for the object type registry.
 * This file defines interfaces for object capabilities, animation systems,
 * rendering methods, and UI configuration.
 *
 * @see src/lib/geometry/registry/registry.ts for the actual registry data
 */

import type { ObjectType } from '../types'

// ============================================================================
// Core Enums and Literal Types
// ============================================================================

/**
 * Category classification for object types
 */
export type ObjectCategory = 'polytope' | 'extended' | 'fractal'

/**
 * Render method determines which renderer handles the object
 * - polytope: Traditional vertex/edge/face rendering via PolytopeScene
 * - raymarch: GPU raymarching for fractals (Mandelbulb, Quaternion Julia)
 * - point-cloud: Point-based rendering (future use)
 */
export type RenderMethod = 'polytope' | 'raymarch' | 'point-cloud'

/**
 * Face detection algorithm used for this object type
 * - analytical-quad: Hypercube - quad faces generated from dimension formula
 * - triangles: Simplex/Cross-polytope - 3-cycles in adjacency graph
 * - convex-hull: Root system - 3D convex hull projection
 * - grid: Clifford/Nested torus - UV grid structure from metadata
 * - metadata: Pre-computed faces stored in geometry metadata (Wythoff polytopes)
 * - metadata-or-triangles: Try metadata first, fall back to triangles (Wythoff presets)
 * - none: Point clouds, raymarched fractals (faces rendered by shader)
 */
export type FaceDetectionMethod =
  | 'analytical-quad'
  | 'triangles'
  | 'convex-hull'
  | 'grid'
  | 'metadata'
  | 'metadata-or-triangles'
  | 'none'

// ============================================================================
// Dimension Constraints
// ============================================================================

/**
 * Dimension constraints for an object type
 */
export interface DimensionConstraints {
  /** Minimum supported dimension (typically 3) */
  min: number
  /** Maximum supported dimension (typically 11) */
  max: number
  /** Recommended dimension for optimal visualization */
  recommended?: number
  /** Human-readable reason for recommended dimension */
  recommendedReason?: string
}

// ============================================================================
// Rendering Capabilities
// ============================================================================

/**
 * Rendering capabilities for an object type
 */
export interface RenderingCapabilities {
  /** Whether this type supports face/surface rendering */
  supportsFaces: boolean
  /** Whether this type supports edge/wireframe rendering */
  supportsEdges: boolean
  /** Whether this type supports point/vertex rendering */
  supportsPoints: boolean
  /** Primary render method */
  renderMethod: RenderMethod
  /** Face detection algorithm */
  faceDetection: FaceDetectionMethod
  /**
   * Whether faces require raymarching (for fractals).
   * When true, faces are rendered via shader, not geometry.
   */
  requiresRaymarching?: boolean
  /**
   * Whether this type supports volumetric emission controls.
   * Only applicable to types with density-based rendering (e.g., Schroedinger).
   */
  supportsEmission?: boolean
}

// ============================================================================
// Animation System Definitions
// ============================================================================

/**
 * Range definition for an animation parameter
 */
export interface AnimationParamRange {
  /** Minimum allowed value */
  min: number
  /** Maximum allowed value */
  max: number
  /** Default value */
  default: number
  /** Step size for UI sliders (optional, defaults to 0.01) */
  step?: number
  /** Human-readable label for UI (optional, derived from key if not provided) */
  label?: string
  /** Tooltip/description for UI (optional) */
  description?: string
}

/**
 * Animation system definition for a single animation type.
 * Contains all parameters with their ranges for UI generation.
 */
export interface AnimationSystemDef {
  /** Display name for UI (e.g., "Power Animation") */
  name: string
  /** Description shown in tooltips */
  description?: string
  /** Whether enabled by default */
  enabledByDefault: boolean
  /**
   * Minimum dimension required for this animation.
   * If undefined, available for all dimensions.
   * e.g., sliceAnimation requires 4D+
   */
  minDimension?: number
  /**
   * Store key for the enabled flag.
   * e.g., "powerAnimationEnabled" for mandelbulb powerAnimation system
   */
  enabledKey: string
  /**
   * Parameters with their ranges.
   * Keys should match store property names.
   */
  params: Record<string, AnimationParamRange>
}

/**
 * Animation capabilities for an object type.
 * Used by TimelineControls to generate UI.
 */
export interface AnimationCapabilities {
  /**
   * Whether this type has type-specific animations (beyond global rotation).
   * If false, only global rotation is available.
   */
  hasTypeSpecificAnimations: boolean
  /**
   * Animation systems available for this type.
   * Keys are system identifiers (e.g., "powerAnimation", "sliceAnimation")
   */
  systems: Record<string, AnimationSystemDef>
}

// ============================================================================
// URL Serialization
// ============================================================================

/**
 * URL serialization configuration for an object type
 */
export interface UrlSerializationConfig {
  /** URL key for this object type (used in 't=' param) */
  typeKey: string
  /** List of parameter keys that should be serialized to URL */
  serializableParams: string[]
}

// ============================================================================
// UI Configuration
// ============================================================================

/**
 * UI component mapping for an object type
 */
export interface UiComponentMapping {
  /**
   * Key for the controls component.
   * Used by the dynamic component loader to import the right component.
   * e.g., "PolytopeSettings", "MandelbulbControls"
   */
  controlsComponentKey: string
  /**
   * Whether this type has controls in the TimelineControls fractal drawer.
   * If true, the FractalAnimationDrawer will render animation panels.
   */
  hasTimelineControls: boolean
  /**
   * Quality presets if applicable.
   * e.g., ["draft", "standard", "high", "ultra"]
   */
  qualityPresets?: string[]
}

// ============================================================================
// Complete Registry Entry
// ============================================================================

/**
 * Complete Object Type Registry Entry
 *
 * Single source of truth for all metadata and capabilities of an object type.
 * Adding a new object type requires only adding an entry here plus
 * implementation files.
 */
export interface ObjectTypeEntry {
  // === Metadata ===

  /** Object type identifier (matches ObjectType union) */
  type: ObjectType
  /** Display name for UI */
  name: string
  /** User-facing description */
  description: string
  /** Category classification */
  category: ObjectCategory

  // === Constraints ===

  /** Dimension constraints */
  dimensions: DimensionConstraints

  // === Capabilities ===

  /** Rendering capabilities */
  rendering: RenderingCapabilities
  /** Animation capabilities */
  animation: AnimationCapabilities

  // === Configuration ===

  /** URL serialization config */
  urlSerialization: UrlSerializationConfig
  /** UI component mapping */
  ui: UiComponentMapping

  /**
   * Key for the config object in extendedObjectStore.
   * e.g., "mandelbulb" → store.mandelbulb
   * e.g., "polytope" → store.polytope
   */
  configStoreKey: string
}

// ============================================================================
// Registry Type
// ============================================================================

/**
 * The Object Type Registry type.
 * A readonly Map from ObjectType to ObjectTypeEntry.
 */
export type ObjectTypeRegistry = ReadonlyMap<ObjectType, ObjectTypeEntry>

// ============================================================================
// Helper Result Types
// ============================================================================

/**
 * Result type for getAvailableTypesForDimension helper
 */
export interface AvailableTypeInfo {
  type: ObjectType
  name: string
  description: string
  available: boolean
  disabledReason?: string
}
