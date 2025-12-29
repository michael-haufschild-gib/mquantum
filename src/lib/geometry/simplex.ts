/**
 * Simplex (n-simplex) generation
 * Generalization of a tetrahedron to n dimensions
 */

import type { VectorND } from '@/lib/math';
import { addVectors, createVector, scaleVector, subtractVectors } from '@/lib/math';
import type { PolytopeGeometry } from './types';

/**
 * Generates a regular simplex in n-dimensional space
 *
 * A simplex has:
 * - Vertices: n+1 (forms a complete graph)
 * - Edges: (n+1)*n/2 (all pairs of vertices are connected)
 *
 * Construction uses standard simplex vertices then centers and normalizes:
 * - v_0 = origin
 * - v_i = unit vector along axis i (for i = 1 to n)
 * - Center at origin and normalize to fit in [-1, 1]
 *
 * IMPORTANT: Geometry is always generated at UNIT SCALE (±1.0).
 * Visual scaling is applied post-projection via the uUniformScale shader uniform.
 * This prevents extreme vertex values during rotation animation.
 *
 * For 2D, this generates an equilateral triangle with 3 vertices and 3 edges.
 *
 * @param dimension - Dimensionality of the space (must be >= 2)
 * @param _scale - DEPRECATED: Scale parameter is ignored. Visual scale is applied post-projection.
 * @returns PolytopeGeometry representing the simplex
 * @throws {Error} If dimension is less than 2
 */
export function generateSimplex(dimension: number, _scale = 1.0): PolytopeGeometry {
  void _scale; // Scale is now applied post-projection via shader uniform

  if (dimension < 2) {
    throw new Error('Simplex dimension must be at least 2');
  }

  const vertexCount = dimension + 1;
  const vertices: VectorND[] = [];

  // Generate standard simplex vertices
  // First vertex at origin
  vertices.push(createVector(dimension, 0));

  // Remaining vertices along each axis
  for (let i = 0; i < dimension; i++) {
    const vertex = createVector(dimension, 0);
    vertex[i] = 1;
    vertices.push(vertex);
  }

  // Calculate centroid using library functions
  let centroid = createVector(dimension, 0);
  for (const vertex of vertices) {
    centroid = addVectors(centroid, vertex);
  }
  centroid = scaleVector(centroid, 1 / vertexCount);

  // Center vertices at origin using library functions
  for (let i = 0; i < vertices.length; i++) {
    vertices[i] = subtractVectors(vertices[i]!, centroid);
  }

  // Find max coordinate value for normalization
  let maxCoord = 0;
  for (const vertex of vertices) {
    for (const coord of vertex) {
      maxCoord = Math.max(maxCoord, Math.abs(coord));
    }
  }

  // Normalize to fit in [-1, 1] (UNIT SCALE)
  // Visual scale is applied post-projection via uUniformScale uniform
  if (maxCoord > 0) {
    const normFactor = 1.0 / maxCoord;
    for (let i = 0; i < vertices.length; i++) {
      vertices[i] = scaleVector(vertices[i]!, normFactor);
    }
  }

  // Generate edges: connect all pairs (complete graph)
  const edges: [number, number][] = [];
  for (let i = 0; i < vertexCount; i++) {
    for (let j = i + 1; j < vertexCount; j++) {
      edges.push([i, j]);
    }
  }

  return {
    vertices,
    edges,
    dimension,
    type: 'simplex',
  };
}
