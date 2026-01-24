/**
 * Root System Polytope Generators
 *
 * Generates vertices and edges for root system polytopes:
 * - Type A_{n-1}: e_i - e_j for i != j → n(n-1) roots
 * - Type D_n: ±e_i ± e_j for i < j → 2n(n-1) roots (requires n >= 4)
 * - Type E_8: 240 roots in 8D (requires n = 8)
 *
 * @see docs/research/nd-extended-objects-guide.md Section 2
 */

import type { VectorND } from '@/lib/math/types'
import type { NdGeometry } from '../types'
import { generateE8Roots } from './e8-roots'
import type { RootSystemConfig, RootSystemType } from './types'
import { buildShortEdges } from './utils/short-edges'

/**
 * Generates Type A_{n-1} root system in R^n
 *
 * A_{n-1} roots are vectors e_i - e_j for all i != j
 * This produces n(n-1) roots of length sqrt(2)
 *
 * @param dimension - Ambient dimension n
 * @param scale - Scale factor for the roots
 * @returns Array of n(n-1) root vectors
 *
 * @example
 * ```typescript
 * const roots = generateARoots(4, 1.0);
 * // Returns 12 roots (4*3) for A_3
 * ```
 */
export function generateARoots(dimension: number, scale: number = 1.0): VectorND[] {
  const n = dimension
  const roots: VectorND[] = []
  const normalizer = Math.sqrt(2) // Normalize to unit length

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue

      const v: VectorND = new Array(n).fill(0)
      v[i] = 1
      v[j] = -1

      // Normalize and scale
      for (let k = 0; k < n; k++) {
        v[k] = (v[k]! / normalizer) * scale
      }

      roots.push(v)
    }
  }

  return roots
}

/**
 * Generates Type D_n root system in R^n
 *
 * D_n roots are vectors ±e_i ± e_j for i < j
 * This produces 2n(n-1) roots of length sqrt(2)
 *
 * @param dimension - Ambient dimension n (must be >= 4)
 * @param scale - Scale factor for the roots
 * @returns Array of 2n(n-1) root vectors
 * @throws {Error} If dimension is less than 4
 *
 * @example
 * ```typescript
 * const roots = generateDRoots(4, 1.0);
 * // Returns 24 roots (2*4*3) for D_4
 * ```
 */
export function generateDRoots(dimension: number, scale: number = 1.0): VectorND[] {
  if (dimension < 4) {
    throw new Error('D_n root system requires dimension >= 4')
  }

  const n = dimension
  const roots: VectorND[] = []
  const normalizer = Math.sqrt(2)

  const signPairs: [number, number][] = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (const [si, sj] of signPairs) {
        const v: VectorND = new Array(n).fill(0)
        v[i] = si
        v[j] = sj

        // Normalize and scale
        for (let k = 0; k < n; k++) {
          v[k] = (v[k]! / normalizer) * scale
        }

        roots.push(v)
      }
    }
  }

  return roots
}

/**
 * Generates triangular faces for root system polytopes using 3-cycle detection.
 *
 * Root system 2-faces are always triangular - they are triplets of vertices
 * where all three pairs are connected by edges. This function finds all such
 * triangles in the edge adjacency graph.
 *
 * This approach works for all root system types (A_n, D_n, E_8) because:
 * - The edge graph encodes the polytope skeleton via minimum-distance connectivity
 * - All 2-faces of root system polytopes are triangular
 * - Finding 3-cycles captures exactly the face structure
 *
 * @param edges - Array of edge pairs (vertex indices) from buildShortEdges
 * @param vertices - Array of vertex positions (used for winding order correction)
 * @returns Array of triangular face indices with correct winding order
 *
 * @example
 * ```typescript
 * const roots = generateARoots(4, 1.0);
 * const edges = buildShortEdges(roots);
 * const faces = generateRootSystemFaces(edges, roots);
 * ```
 */
export function generateRootSystemFaces(
  edges: [number, number][],
  vertices: number[][]
): number[][] {
  // Build adjacency map for efficient neighbor lookup
  const adj = new Map<number, Set<number>>()
  for (const [a, b] of edges) {
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a)!.add(b)
    adj.get(b)!.add(a)
  }

  // Find all triangles (3-cycles) in the edge graph
  const faces: number[][] = []
  const seen = new Set<string>()

  for (const [v1, neighbors] of adj) {
    for (const v2 of neighbors) {
      // Only process v2 > v1 to avoid duplicates
      if (v2 <= v1) continue

      const v2Neighbors = adj.get(v2)
      if (!v2Neighbors) continue

      for (const v3 of v2Neighbors) {
        // Only process v3 > v2 to ensure v1 < v2 < v3 ordering
        if (v3 <= v2) continue

        // Check if v3 is also a neighbor of v1 (completing the triangle)
        if (neighbors.has(v3)) {
          const key = `${v1},${v2},${v3}`
          if (!seen.has(key)) {
            seen.add(key)
            // Apply winding order correction for proper face orientation
            const correctedFace = correctTriangleWinding(v1, v2, v3, vertices)
            faces.push(correctedFace)
          }
        }
      }
    }
  }

  return faces
}

/**
 * Corrects winding order of a triangle so its normal points outward from the origin.
 *
 * Root system polytopes are centered at the origin, so we use the triangle's
 * centroid direction to determine outward-facing orientation.
 *
 * @param v0 - First vertex index
 * @param v1 - Second vertex index
 * @param v2 - Third vertex index
 * @param vertices - Array of vertex positions
 * @returns Triangle indices [v0, v1, v2] or [v0, v2, v1] with correct winding
 */
function correctTriangleWinding(
  v0: number,
  v1: number,
  v2: number,
  vertices: number[][]
): number[] {
  const p0 = vertices[v0]!
  const p1 = vertices[v1]!
  const p2 = vertices[v2]!

  // Get first 3 coordinates for cross product (project to 3D)
  const get3D = (v: number[]): [number, number, number] => [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0]

  const a = get3D(p0)
  const b = get3D(p1)
  const c = get3D(p2)

  // Compute edge vectors
  const edge1: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const edge2: [number, number, number] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]

  // Cross product for normal
  const normal: [number, number, number] = [
    edge1[1] * edge2[2] - edge1[2] * edge2[1],
    edge1[2] * edge2[0] - edge1[0] * edge2[2],
    edge1[0] * edge2[1] - edge1[1] * edge2[0],
  ]

  // Triangle centroid (in 3D)
  const centroid: [number, number, number] = [
    (a[0] + b[0] + c[0]) / 3,
    (a[1] + b[1] + c[1]) / 3,
    (a[2] + b[2] + c[2]) / 3,
  ]

  // Dot product of normal with centroid direction (centroid points outward from origin)
  const dot = normal[0] * centroid[0] + normal[1] * centroid[1] + normal[2] * centroid[2]

  // If dot > 0, normal points outward (correct winding); otherwise flip
  return dot >= 0 ? [v0, v1, v2] : [v0, v2, v1]
}

/**
 * Edge builder function type for dependency injection
 * Allows WASM edge building to be injected by the worker
 */
export type EdgeBuilder = (vertices: number[][]) => [number, number][]

/**
 * Generates a root system geometry
 *
 * @param dimension - Dimensionality of the ambient space (3-11)
 * @param config - Root system configuration options
 * @param edgeBuilder - Optional edge builder function (defaults to JS buildShortEdges)
 * @returns NdGeometry representing the root system polytope
 * @throws {Error} If dimension constraints are violated
 *
 * @example
 * ```typescript
 * const rootSystem = generateRootSystem(4, {
 *   rootType: 'A',
 *   scale: 1.0,
 *   edgeMode: 'short-edges',
 * });
 * ```
 */
export function generateRootSystem(
  dimension: number,
  config: RootSystemConfig,
  edgeBuilder?: EdgeBuilder
): NdGeometry {
  if (dimension < 3) {
    throw new Error('Root system dimension must be at least 3')
  }

  const { rootType, scale } = config

  // Generate roots based on type
  let vertices: VectorND[]
  let rootTypeName: string
  let rootFormula: string
  let expectedCount: number

  switch (rootType) {
    case 'E8':
      if (dimension !== 8) {
        throw new Error('E8 root system requires dimension = 8')
      }
      vertices = generateE8Roots(scale)
      rootTypeName = 'E₈'
      rootFormula = '240 roots'
      expectedCount = 240
      break

    case 'D':
      if (dimension < 4) {
        throw new Error('D_n root system requires dimension >= 4')
      }
      vertices = generateDRoots(dimension, scale)
      rootTypeName = `D_${dimension}`
      rootFormula = `2n(n-1) = ${2 * dimension * (dimension - 1)}`
      expectedCount = 2 * dimension * (dimension - 1)
      break

    case 'A':
    default:
      vertices = generateARoots(dimension, scale)
      rootTypeName = `A_${dimension - 1}`
      rootFormula = `n(n-1) = ${dimension * (dimension - 1)}`
      expectedCount = dimension * (dimension - 1)
      break
  }

  // Always generate edges (root systems behave like polytopes)
  // Use injected edge builder if provided, otherwise default to JS implementation
  const edges: [number, number][] = edgeBuilder ? edgeBuilder(vertices) : buildShortEdges(vertices)

  // Generate faces analytically using 3-cycle detection in edge graph
  // This ensures all vertices are covered by faces, not just convex hull boundary
  const faces: number[][] = generateRootSystemFaces(edges, vertices)

  return {
    dimension,
    type: 'root-system',
    vertices,
    edges,
    metadata: {
      name: `${rootTypeName} Root System`,
      formula: rootFormula,
      properties: {
        rootType,
        scale,
        rootCount: vertices.length,
        expectedCount,
        edgeCount: edges.length,
        faceCount: faces.length,
        analyticalFaces: faces,
      },
    },
  }
}

/**
 * Gets the root count for a given root system type and dimension
 *
 * @param rootType - Type of root system
 * @param dimension - Ambient dimension
 * @returns Expected number of roots
 */
export function getRootCount(rootType: RootSystemType, dimension: number): number {
  switch (rootType) {
    case 'E8':
      return 240
    case 'D':
      return 2 * dimension * (dimension - 1)
    case 'A':
    default:
      return dimension * (dimension - 1)
  }
}

/**
 * Checks if a root system type is valid for a given dimension
 *
 * @param rootType - Type of root system
 * @param dimension - Ambient dimension
 * @returns Object with valid flag and error message if invalid
 */
export function validateRootSystemType(
  rootType: RootSystemType,
  dimension: number
): { valid: boolean; message?: string } {
  if (rootType === 'E8' && dimension !== 8) {
    return {
      valid: false,
      message: 'E₈ is only defined in 8 dimensions',
    }
  }

  if (rootType === 'D' && dimension < 4) {
    return {
      valid: false,
      message: 'D_n requires dimension >= 4',
    }
  }

  return { valid: true }
}
