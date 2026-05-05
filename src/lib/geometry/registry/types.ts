/**
 * Object Type Registry - Type Definitions
 *
 * Central type definitions for the object type registry.
 * This file defines interfaces for object capabilities, animation systems,
 * rendering methods, and UI configuration.
 *
 * @see src/lib/geometry/registry/registry.ts for the actual registry data
 */

import type { SchroedingerQuantumMode } from '@/lib/geometry/extended/common'

import type { ObjectType } from '../types'

// ============================================================================
// Quantum Type Key — Flat Identifier for All Modes
// ============================================================================

/**
 * Unified key for every user-visible quantum type.
 *
 * From the user's perspective, "Hydrogen Orbitals" and "Pauli Spinor" are
 * peers — both are types you pick from the same list. This union captures
 * that flat model. The two-level ObjectType + SchroedingerQuantumMode split
 * is an internal implementation detail bridged via {@link QuantumTypeInternal}.
 */
export type QuantumTypeKey = SchroedingerQuantumMode | 'pauliSpinor'

// ============================================================================
// Core Enums and Literal Types
// ============================================================================

/**
 * Category classification for quantum types
 * - analytic: Closed-form wavefunction evaluated inline in the shader
 * - compute: GPU lattice simulation with a dedicated compute pass
 */
export type QuantumTypeCategory = 'analytic' | 'compute'

/**
 * Runtime data path used by rendering and store orchestration.
 * This is narrower than category: several compute modes still differ in
 * texture/channel semantics and strategy ownership.
 */
export type QuantumTypeDataPath = 'analyticWavefunction' | 'densityGrid' | 'spinorGrid'

/**
 * Renderer strategy family for a quantum type. Values are intentionally
 * framework-level names, not class names, so the registry stays decoupled
 * from WebGPU implementation files.
 */
export type QuantumTypeStrategyKind =
  | 'analytic'
  | 'freeScalarField'
  | 'tdseBec'
  | 'dirac'
  | 'quantumWalk'
  | 'wheelerDeWitt'
  | 'antiDeSitter'
  | 'pauli'

/** Analytic shader family used by HO / hydrogen-specific gates. */
export type QuantumTypeAnalyticFamily = 'harmonicOscillator' | 'hydrogen'

/** Store-side evolution reset behavior used by timeline/export orchestration. */
export type QuantumTypeEvolutionResetKind =
  | 'schroedingerAnalytic'
  | 'freeScalarField'
  | 'tdse'
  | 'bec'
  | 'dirac'
  | 'quantumWalk'
  | 'wheelerDeWitt'
  | 'antiDeSitter'
  | 'pauli'

/** Optional compile-time selector fields required by renderer shader config. */
export type QuantumTypeCompileContextField = 'diracFieldView' | 'freeScalarInitialCondition'

/**
 * Category classification for object types
 */
export type ObjectCategory = 'quantum'

/**
 * Render method determines which renderer handles the object
 * - raymarch: GPU raymarching for volumetric rendering (Schroedinger wavefunction)
 */
export type RenderMethod = 'raymarch'

/**
 * Face detection algorithm used for this object type
 * - none: Raymarched volumes (faces rendered by shader, not geometry)
 */
export type FaceDetectionMethod = 'none'

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
   * Whether faces require raymarching (volumetric rendering).
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
   * e.g., "phaseAnimationEnabled" for schroedinger phase animation
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
   * e.g., "SchroedingerControls", "PauliSpinorControls"
   */
  controlsComponentKey: string
  /**
   * Whether this type has controls in the TimelineControls animation drawer.
   * If true, the SchroedingerAnimationDrawer will render animation panels.
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
   * e.g., "schroedinger" → store.schroedinger
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

// ============================================================================
// Quantum Type Registry — Flat, User-Facing Model
// ============================================================================

/**
 * Bridge to internal runtime plumbing.
 *
 * The renderer and stores still operate on ObjectType + SchroedingerQuantumMode.
 * This mapping lets registry consumers translate a flat QuantumTypeKey to the
 * two-field model the internals expect.
 */
export interface QuantumTypeInternal {
  /** Runtime ObjectType used by geometryStore and the rendering pipeline */
  objectType: ObjectType
  /** Quantum mode within the schroedinger pipeline (undefined for pauliSpinor) */
  quantumMode?: SchroedingerQuantumMode
  /** Top-level key in extendedObjectStore (e.g. 'schroedinger', 'pauliSpinor') */
  configStoreKey: string
  /** Sub-key within SchrodingerConfig for mode-specific state (e.g. 'tdse', 'bec') */
  configSubKey?: string
}

/**
 * Runtime metadata shared by renderer, persistence, and store orchestration.
 *
 * `shaderUniformId` and `stateSaveId` are deliberately separate namespaces:
 * shader IDs are WGSL branch constants, while state IDs are append-only binary
 * serialization IDs. Never infer one from the other.
 */
export interface QuantumTypeRuntimeMetadata {
  /** Data path used by the renderer. */
  dataPath: QuantumTypeDataPath
  /** Strategy family responsible for mode-specific setup/frame behavior. */
  strategy: QuantumTypeStrategyKind
  /** Store-side reset behavior for timeline/export evolution resets. */
  evolutionReset: QuantumTypeEvolutionResetKind
  /** Integer written to WGSL `uniforms.quantumMode` for shader runtime guards. */
  shaderUniformId?: number
  /** Append-only integer stored in `.mqstate` headers. */
  stateSaveId?: number
  /** True for modes whose shared uniform packing follows the legacy grid path. */
  uniformComputeGrid?: boolean
  /** Fallback color algorithm when the current selection is invalid. */
  defaultColorAlgorithm: string
  /** Analytic branch family for HO/hydrogen shader composition. */
  analyticFamily?: QuantumTypeAnalyticFamily
  /** True when this mode can run open-quantum density-matrix evolution. */
  supportsOpenQuantum?: boolean
  /** Optional store fields that participate in shader compile-context keys. */
  compileContextFields?: readonly QuantumTypeCompileContextField[]
  /** True when sample space should rotate with camera/sample transform. */
  sampleSpaceRotation?: boolean
  /** True when the mode provides a precomputed normal texture. */
  hasPrecomputedNormals?: boolean
}

/**
 * A single entry in the flat quantum type registry.
 *
 * Every user-visible type — Harmonic Oscillator, Hydrogen, TDSE, BEC,
 * Dirac, Pauli Spinor, etc. — gets one entry with identical schema.
 */
export interface QuantumTypeEntry {
  /** Flat identifier (matches QuantumTypeKey union) */
  key: QuantumTypeKey
  /** Display name for UI */
  name: string
  /** User-facing description */
  description: string
  /** Analytic (closed-form) or compute (GPU lattice) */
  category: QuantumTypeCategory
  /** Dimension constraints */
  dimensions: DimensionConstraints
  /** Rendering capabilities */
  rendering: RenderingCapabilities
  /** Animation capabilities */
  animation: AnimationCapabilities
  /** URL serialization config */
  urlSerialization: UrlSerializationConfig
  /** UI component mapping */
  ui: UiComponentMapping
  /** Bridge to internal ObjectType + QuantumMode plumbing */
  internal: QuantumTypeInternal
  /** Runtime metadata shared by renderer, persistence, and stores */
  runtime: QuantumTypeRuntimeMetadata
}

/**
 * The flat Quantum Type Registry.
 * A readonly Map from QuantumTypeKey to QuantumTypeEntry.
 */
export type QuantumTypeRegistry = ReadonlyMap<QuantumTypeKey, QuantumTypeEntry>

/**
 * Result type for getAvailableQuantumTypes helper
 */
export interface AvailableQuantumTypeInfo {
  key: QuantumTypeKey
  name: string
  description: string
  category: QuantumTypeCategory
  available: boolean
  disabledReason?: string
}
