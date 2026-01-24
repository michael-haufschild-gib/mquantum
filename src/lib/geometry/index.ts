/**
 * N-Dimensional Geometry Library
 *
 * Provides generators for n-dimensional geometric objects:
 *
 * Standard Polytopes:
 * - Hypercube (n-cube): generalization of cube
 * - Simplex (n-simplex): generalization of tetrahedron
 * - Cross-polytope (n-orthoplex): generalization of octahedron
 *
 * Extended Objects:
 * - Root Systems: A, D, and E8 root polytopes
 * - Clifford Torus: flat torus on S³
 * - Mandelbulb: N-dimensional fractal (Mandelbulb/Mandelbulb)
 */

// Type exports from types.ts
export type { CrossSectionResult } from './cross-section'
export type { Face } from './faces'
export { isExtendedObjectType, isPolytopeType } from './types'
export type {
  ExtendedObjectType,
  GeometryMetadata,
  NdGeometry,
  ObjectType,
  PolytopeGeometry,
  PolytopeProperties,
  PolytopeType,
} from './types'

// Registry exports (single source of truth for object type capabilities)
export {
  // Registry data
  OBJECT_TYPE_REGISTRY,
  getAllObjectTypes,
  // Core lookups
  getObjectTypeEntry,
  // Rendering capabilities
  canRenderFaces,
  canRenderEdges,
  isRaymarchingType,
  isRaymarchingFractal,
  getRenderingCapabilities,
  getFaceDetectionMethod,
  determineRenderMode,
  // Dimension constraints
  getDimensionConstraints,
  isAvailableForDimension,
  getAvailableTypesForDimension,
  // Animation
  getAnimationCapabilities,
  hasTypeSpecificAnimations,
  getAvailableAnimationSystems,
  // UI
  getControlsComponentKey,
  hasTimelineControls,
  getControlsComponent,
  // Validation
  getValidObjectTypes,
  isValidObjectType,
  getTypeName,
  getTypeDescription,
  getConfigStoreKey,
} from './registry'
export type {
  AnimationCapabilities,
  AnimationSystemDef,
  AvailableTypeInfo,
  DimensionConstraints,
  ObjectTypeEntry,
  RenderingCapabilities,
} from './registry'

// Extended object type exports (includes PolytopeConfig for unified API)
export type {
  CliffordTorusConfig,
  CliffordTorusEdgeMode,
  ExtendedObjectParams,
  MandelbulbColorMode,
  MandelbulbConfig,
  MandelbulbPalette,
  MandelbulbQualityPreset,
  MandelbulbRenderStyle,
  PolytopeConfig,
  RootSystemConfig,
  RootSystemType,
  WythoffPolytopeConfig,
  WythoffPreset,
  WythoffSymmetryGroup,
} from './extended'

// Default configs for all object types
export {
  DEFAULT_CLIFFORD_TORUS_CONFIG,
  DEFAULT_EXTENDED_OBJECT_PARAMS,
  DEFAULT_MANDELBROT_CONFIG,
  DEFAULT_POLYTOPE_CONFIG,
  DEFAULT_ROOT_SYSTEM_CONFIG,
  DEFAULT_WYTHOFF_POLYTOPE_CONFIG,
  DEFAULT_WYTHOFF_SCALES,
  MANDELBROT_QUALITY_PRESETS,
} from './extended'

// Polytope generator exports
export { generateCrossPolytope } from './cross-polytope'
export { generateHypercube } from './hypercube'
export { generateSimplex } from './simplex'
export { generateWythoffPolytope, getWythoffPolytopeInfo, getWythoffPresetName } from './wythoff'
export type { WythoffSymbol } from './wythoff'

// Extended object generator exports
export {
  buildCliffordTorusGridEdges,
  // Utility exports
  buildKnnEdges,
  buildShortEdges,
  computeConvexHullFaces,
  generateARoots,
  generateCliffordTorus,
  generateCliffordTorusPoints,
  generateDRoots,
  generateE8Roots,
  generateExtendedObject,
  // Mandelbulb (GPU raymarching only)
  generateMandelbulb,
  // Schroedinger (GPU raymarching only)
  generateSchroedinger,
  generateRootSystem,
  getConvexHullStats,
  getRootCount,
  hasValidConvexHull,
  validateRootSystemType,
  verifyCliffordTorusOnSphere,
  verifyE8Roots,
} from './extended'

// Face detection exports
export { detectFaces } from './faces'

// Cross-section exports
export { computeCrossSection, getWRange, projectCrossSectionTo3D } from './cross-section'

import { generateCrossPolytope } from './cross-polytope'
import type { ExtendedObjectParams } from './extended'
import { DEFAULT_EXTENDED_OBJECT_PARAMS, generateExtendedObject } from './extended'
import { generateHypercube } from './hypercube'
import { generateSimplex } from './simplex'
import { generateWythoffPolytope } from './wythoff'
import type {
  NdGeometry,
  ObjectType,
  PolytopeGeometry,
  PolytopeProperties,
  PolytopeType,
} from './types'
import { isPolytopeType } from './types'

/**
 * Generates a polytope of the specified type and dimension
 *
 * IMPORTANT: All polytopes are generated at UNIT SCALE (±1.0).
 * Visual scaling is applied post-projection via the uUniformScale shader uniform.
 * This prevents extreme vertex values during rotation animation.
 *
 * @param type - Type of polytope to generate
 * @param dimension - Dimensionality (must be >= 3)
 * @param _scale - DEPRECATED: Scale is ignored. Visual scale is applied via shader.
 * @param wythoffConfig - Configuration for Wythoff polytopes
 * @returns PolytopeGeometry at unit scale
 * @throws {Error} If dimension is less than 3 or type is invalid
 */
export function generatePolytope(
  type: PolytopeType,
  dimension: number,
  _scale = 1.0,
  wythoffConfig?: ExtendedObjectParams['wythoffPolytope']
): PolytopeGeometry {
  void _scale // Scale is now applied post-projection via shader uniform

  switch (type) {
    case 'hypercube':
      return generateHypercube(dimension)
    case 'simplex':
      return generateSimplex(dimension)
    case 'cross-polytope':
      return generateCrossPolytope(dimension)
    case 'wythoff-polytope':
      return generateWythoffPolytope(dimension, wythoffConfig)
    default:
      throw new Error(`Unknown polytope type: ${type}`)
  }
}

/**
 * Generates geometry for any object type (polytope or extended)
 *
 * This is the unified dispatcher that handles all object types with
 * consistent parameter handling. Both polytopes and extended objects
 * can be configured through the params object.
 *
 * IMPORTANT: Polytopes are always generated at UNIT SCALE (±1.0).
 * The scale property in params.polytope is stored in metadata for use
 * by the renderer's uUniformScale shader uniform (post-projection visual scale).
 *
 * @param type - Object type to generate
 * @param dimension - Dimensionality of the ambient space
 * @param params - Parameters for all object types (optional, uses defaults)
 * @returns NdGeometry at unit scale (visual scale stored in metadata.properties.scale)
 * @throws {Error} If type is invalid or dimension constraints are violated
 *
 * @example
 * ```typescript
 * // Generate a hypercube - geometry is unit-scale, visual scale stored in metadata
 * const cube = generateGeometry('hypercube', 4, {
 *   ...DEFAULT_EXTENDED_OBJECT_PARAMS,
 *   polytope: { scale: 1.5 }, // Visual scale, applied via shader
 * });
 * // cube.metadata.properties.scale = 1.5 (for shader uniform)
 * ```
 */
export function generateGeometry(
  type: ObjectType,
  dimension: number,
  params?: ExtendedObjectParams
): NdGeometry {
  const effectiveParams = params ?? DEFAULT_EXTENDED_OBJECT_PARAMS

  if (isPolytopeType(type)) {
    // Convert PolytopeGeometry to NdGeometry, using polytope config for scale
    let scale: number
    let polytope: PolytopeGeometry

    if (type === 'wythoff-polytope') {
      // Use wythoff-polytope specific config
      const wythoffConfig = effectiveParams.wythoffPolytope
      scale = wythoffConfig?.scale ?? 2.0
      polytope = generatePolytope(type, dimension, scale, wythoffConfig)
    } else {
      scale = effectiveParams.polytope?.scale ?? 1.0
      polytope = generatePolytope(type, dimension, scale)
    }

    // Preserve metadata from polytope generation (e.g., analyticalFaces for Wythoff)
    // while adding/overriding standard fields
    return {
      dimension: polytope.dimension,
      type: polytope.type,
      vertices: polytope.vertices,
      edges: polytope.edges,
      metadata: {
        name: polytope.metadata?.name ?? getTypeNameFromRegistry(type),
        properties: {
          ...polytope.metadata?.properties, // Preserve analyticalFaces and other computed properties
          scale,
          ...(type === 'wythoff-polytope' && {
            symmetryGroup: effectiveParams.wythoffPolytope?.symmetryGroup,
            preset: effectiveParams.wythoffPolytope?.preset,
          }),
        },
      },
    }
  } else {
    // Use extended object generator
    return generateExtendedObject(type, dimension, effectiveParams)
  }
}

/**
 * Calculates mathematical properties of a polytope geometry
 *
 * @param geometry - Polytope geometry to analyze
 * @returns Properties including counts and formulas
 */
export function getPolytopeProperties(geometry: PolytopeGeometry): PolytopeProperties {
  let vertexFormula: string
  let edgeFormula: string

  switch (geometry.type) {
    case 'hypercube':
      vertexFormula = '2^n'
      edgeFormula = 'n·2^(n-1)'
      break
    case 'simplex':
      vertexFormula = 'n+1'
      edgeFormula = '(n+1)·n/2'
      break
    case 'cross-polytope':
      vertexFormula = '2n'
      edgeFormula = '2n(n-1)'
      break
    case 'wythoff-polytope':
      // Wythoff polytopes have variable vertex/edge counts based on configuration
      vertexFormula = 'variable'
      edgeFormula = 'variable'
      break
  }

  return {
    vertexCount: geometry.vertices.length,
    edgeCount: geometry.edges.length,
    vertexFormula,
    edgeFormula,
  }
}

// Import getTypeName from registry for local use
import { getTypeName as getTypeNameFromRegistry } from './registry'
