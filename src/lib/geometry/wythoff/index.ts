/**
 * Wythoff Polytope Generation - Main Module
 *
 * Generalization of Wythoff construction to n dimensions (3-11D)
 *
 * The Wythoff construction creates uniform polytopes by reflecting a seed point
 * through a system of mirrors (hyperplanes) arranged according to a Coxeter-Dynkin diagram.
 *
 * This implementation supports:
 * - Simplex symmetry group (A_n): Regular and truncated simplices
 * - Hypercube/Cross-polytope symmetry group (B_n): Hypercubes, cross-polytopes, and rectifications
 * - Demihypercube symmetry group (D_n): Half-hypercubes and related forms
 *
 * @see https://en.wikipedia.org/wiki/Wythoff_construction
 * @see https://en.wikipedia.org/wiki/Uniform_polytope
 */

import type { VectorND } from '@/lib/math'
import { getMaxVerticesForDimension } from '../config'
import type { PolytopeGeometry } from '../types'

// Types - import locally and re-export
import {
  type PolytopeData,
  type WythoffGenerationResult,
  type WythoffPolytopeConfig,
  type WythoffPreset,
  type WythoffSymbol,
  type WythoffSymmetryGroup,
  DEFAULT_WYTHOFF_POLYTOPE_CONFIG,
  DEFAULT_WYTHOFF_SCALES,
  WarningCollector,
  getWythoffPresetName,
} from './types'

export {
  DEFAULT_WYTHOFF_POLYTOPE_CONFIG,
  DEFAULT_WYTHOFF_SCALES,
  WarningCollector,
  getWythoffPresetName,
  type PolytopeData,
  type WythoffGenerationResult,
  type WythoffPolytopeConfig,
  type WythoffPreset,
  type WythoffSymbol,
  type WythoffSymmetryGroup,
}

import {
  centerAndScale,
  generateCantellatedHypercubeVertices,
  generateDemihypercubeVertices,
  generateHypercubeData,
  generateOmnitruncatedHypercubeVertices,
  generateRectifiedHypercubeVertices,
  generateRuncinatedHypercubeVertices,
  generateSimplexData,
  generateTruncatedHypercubeVertices,
} from './vertices'

import { generateEdgesByMinDistance } from './edges'

import { cachePolytope, getCacheKey, getCachedPolytope, getFromMemoryCache } from './cache'

/**
 * Calculate maximum vertices based on dimension and preset.
 * Delegates to centralized config for maintainability.
 * @param dimension - The dimension
 * @param preset - The Wythoff preset
 * @returns Maximum vertex count
 */
function getMaxVertices(dimension: number, preset?: WythoffPreset): number {
  return getMaxVerticesForDimension(dimension, preset === 'omnitruncated')
}

/**
 * Generate generic polytope data with lazy face generation.
 *
 * Optimization: Faces are NOT computed during initial generation.
 * They're computed lazily via useFaceDetection when needed for rendering.
 * @param vertices - Array of vertices
 * @returns PolytopeData with vertices, edges, and empty faces array
 */
function generateGenericPolytopeData(vertices: VectorND[]): PolytopeData {
  const edges = generateEdgesByMinDistance(vertices)
  // Lazy face generation: faces computed on demand by useFaceDetection
  const faces: number[][] = []

  return { vertices, edges, faces }
}

/**
 * Generates a Wythoff polytope in n-dimensional space.
 *
 * The Wythoff construction creates uniform polytopes using the symmetry groups:
 * - A_n: Generates simplex-family polytopes
 * - B_n: Generates hypercube/cross-polytope family
 * - D_n: Generates demihypercube family
 *
 * IMPORTANT: Geometry is always generated at UNIT SCALE (±1.0).
 * Visual scaling is applied post-projection via the uUniformScale shader uniform.
 * The scale property in config is preserved in metadata but not applied to vertices.
 *
 * @param dimension - Dimensionality of the space (3-11)
 * @param config - Configuration options (scale is stored in metadata but not applied to vertices)
 * @param warnings - Optional warning collector for thread-safe warning collection
 * @returns PolytopeGeometry at unit scale (visual scale applied via shader)
 * @throws {Error} If dimension is out of range
 *
 * @example
 * ```typescript
 * // Generate a truncated 4D hypercube
 * const polytope = generateWythoffPolytope(4, {
 *   symmetryGroup: 'B',
 *   preset: 'truncated',
 * });
 * // Visual scale is applied via uUniformScale shader uniform
 * ```
 */
export function generateWythoffPolytope(
  dimension: number,
  config: Partial<WythoffPolytopeConfig> = {},
  warnings?: WarningCollector
): PolytopeGeometry {
  if (dimension < 3 || dimension > 11) {
    throw new Error(`Wythoff polytope dimension must be between 3 and 11 (got ${dimension})`)
  }

  const fullConfig: WythoffPolytopeConfig = {
    ...DEFAULT_WYTHOFF_POLYTOPE_CONFIG,
    ...config,
  }

  const { symmetryGroup, preset, snub } = fullConfig
  // Note: scale is intentionally not destructured - geometry is always unit-scale
  // Visual scale is applied post-projection via uUniformScale shader uniform

  // Check memory cache (sync, fastest path)
  const cacheKey = getCacheKey(dimension, fullConfig)
  const memoryCached = getFromMemoryCache(cacheKey)
  if (memoryCached) {
    // Return unit-scale geometry - visual scale applied via shader
    return memoryCached
  }

  // Validate D_n symmetry requires dimension >= 4
  if (symmetryGroup === 'D' && dimension < 4) {
    throw new Error('D_n symmetry requires dimension >= 4')
  }

  let polytopeData: PolytopeData
  const maxVerts = getMaxVertices(dimension, preset)

  // Generate vertices, edges, and faces based on symmetry group and preset
  switch (symmetryGroup) {
    case 'A':
      // Simplex symmetry - use analytical simplex generation
      polytopeData = generateSimplexData(dimension)
      break

    case 'B':
      // Hypercube/cross-polytope symmetry
      switch (preset) {
        case 'regular':
          polytopeData = generateHypercubeData(dimension)
          break
        case 'rectified':
          polytopeData = generateGenericPolytopeData(generateRectifiedHypercubeVertices(dimension))
          break
        case 'truncated':
          polytopeData = generateGenericPolytopeData(generateTruncatedHypercubeVertices(dimension))
          break
        case 'cantellated':
          polytopeData = generateGenericPolytopeData(
            generateCantellatedHypercubeVertices(dimension)
          )
          break
        case 'runcinated':
          polytopeData = generateGenericPolytopeData(generateRuncinatedHypercubeVertices(dimension))
          break
        case 'omnitruncated':
          polytopeData = generateGenericPolytopeData(
            generateOmnitruncatedHypercubeVertices(dimension, maxVerts)
          )
          break
        case 'custom':
        default:
          polytopeData = generateHypercubeData(dimension)
          break
      }
      break

    case 'D':
      // Demihypercube symmetry (requires dimension >= 4)
      polytopeData = generateGenericPolytopeData(generateDemihypercubeVertices(dimension))
      break

    default:
      polytopeData = generateHypercubeData(dimension)
  }

  let { vertices, edges, faces } = polytopeData

  // Limit vertices if needed
  if (vertices.length > maxVerts) {
    const originalCount = vertices.length
    vertices = vertices.slice(0, maxVerts)
    warnings?.add(
      `Vertex count limited from ${originalCount.toLocaleString()} to ${maxVerts.toLocaleString()} for performance. Some geometry detail may be missing.`
    )
    const truncData = generateGenericPolytopeData(vertices)
    edges = truncData.edges
    faces = truncData.faces
  }

  // For snub variants, take alternating vertices
  if (snub && vertices.length > 4) {
    vertices = vertices.filter((_, i) => i % 2 === 0)
    const snubData = generateGenericPolytopeData(vertices)
    edges = snubData.edges
    faces = snubData.faces
  }

  // Center and normalize to scale=1.0 for caching
  vertices = centerAndScale(vertices, 1.0)

  const normalizedResult: PolytopeGeometry = {
    vertices,
    edges,
    dimension,
    type: 'wythoff-polytope' as const,
    metadata: {
      name: getWythoffPresetName(preset, symmetryGroup, dimension),
      properties: {
        ...fullConfig,
        scale: 1.0,
        analyticalFaces: faces,
      },
    },
  }

  // Cache normalized geometry to memory and IndexedDB
  cachePolytope(cacheKey, normalizedResult)

  // Return unit-scale geometry - visual scale is applied post-projection via shader uniform
  return normalizedResult
}

/**
 * Async version of generateWythoffPolytope that checks IndexedDB cache first.
 *
 * Use this version when you can await the result, as it provides better cache
 * utilization by checking IndexedDB for cached polytopes from previous sessions.
 * @param dimension - Number of dimensions
 * @param config - Polytope configuration options
 * @returns Generated polytope geometry
 */
export async function generateWythoffPolytopeAsync(
  dimension: number,
  config: Partial<WythoffPolytopeConfig> = {}
): Promise<PolytopeGeometry> {
  if (dimension < 3 || dimension > 11) {
    throw new Error(`Wythoff polytope dimension must be between 3 and 11 (got ${dimension})`)
  }

  const fullConfig: WythoffPolytopeConfig = {
    ...DEFAULT_WYTHOFF_POLYTOPE_CONFIG,
    ...config,
  }

  // Note: scale is not used - geometry is always unit-scale
  // Visual scale is applied post-projection via uUniformScale shader uniform
  const cacheKey = getCacheKey(dimension, fullConfig)

  // Check memory and IndexedDB caches (getCachedPolytope handles memory cache population)
  const cached = await getCachedPolytope(cacheKey)
  if (cached) {
    // Return unit-scale geometry - visual scale applied via shader
    return cached
  }

  // Generate new polytope (expensive)
  return generateWythoffPolytope(dimension, config)
}

/**
 * Generate Wythoff polytope with warning collection.
 *
 * Use this version when you need to know if any limits were reached
 * during generation (e.g., to show toast notifications to users).
 * @param dimension - Number of dimensions
 * @param config - Polytope configuration options
 * @returns Result object with geometry and warnings
 */
export function generateWythoffPolytopeWithWarnings(
  dimension: number,
  config: Partial<WythoffPolytopeConfig> = {}
): WythoffGenerationResult {
  const warningCollector = new WarningCollector()
  const geometry = generateWythoffPolytope(dimension, config, warningCollector)
  return { geometry, warnings: warningCollector.get() }
}

/**
 * Get information about vertex and edge counts for a Wythoff polytope.
 * @param dimension - Number of dimensions
 * @param config - Polytope configuration options
 * @returns Object with vertex count, edge count, and name
 */
export function getWythoffPolytopeInfo(
  dimension: number,
  config: Partial<WythoffPolytopeConfig> = {}
): { vertexCount: number; edgeCount: number; name: string } {
  const fullConfig = { ...DEFAULT_WYTHOFF_POLYTOPE_CONFIG, ...config }
  const polytope = generateWythoffPolytope(dimension, fullConfig)

  return {
    vertexCount: polytope.vertices.length,
    edgeCount: polytope.edges.length,
    name: getWythoffPresetName(fullConfig.preset, fullConfig.symmetryGroup, dimension),
  }
}
