/**
 * Hypercube (n-cube) generation
 * Generalization of a cube to n dimensions
 */

import type { VectorND } from '@/lib/math';
import { createVector } from '@/lib/math';
import type { PolytopeGeometry } from './types';

/**
 * Generates a hypercube in n-dimensional space
 *
 * A hypercube has:
 * - Vertices: 2^n (all combinations of ±1 in each coordinate)
 * - Edges: n * 2^(n-1) (connect vertices differing in exactly 1 coordinate)
 *
 * For 2D, this generates a square with 4 vertices and 4 edges.
 *
 * IMPORTANT: Geometry is always generated at UNIT SCALE (±1.0).
 * Visual scaling is applied post-projection via the uUniformScale shader uniform.
 * This prevents extreme vertex values during rotation animation.
 *
 * @param dimension - Dimensionality of the hypercube (must be >= 2)
 * @param _scale - DEPRECATED: Scale parameter is ignored. Visual scale is applied post-projection.
 * @returns PolytopeGeometry representing the hypercube
 * @throws {Error} If dimension is less than 2
 */
export function generateHypercube(dimension: number, _scale = 1.0): PolytopeGeometry {
  void _scale; // Scale is now applied post-projection via shader uniform

  if (dimension < 2) {
    throw new Error('Hypercube dimension must be at least 2');
  }

  const vertices: VectorND[] = [];
  const vertexCount = Math.pow(2, dimension);

  // Generate all 2^n vertices at UNIT SCALE (±1.0)
  // Visual scale is applied post-projection via uUniformScale uniform
  for (let i = 0; i < vertexCount; i++) {
    const vertex = createVector(dimension);
    for (let j = 0; j < dimension; j++) {
      // Use bit j of i to determine sign (always ±1.0 for unit geometry)
      vertex[j] = (i & (1 << j)) ? 1.0 : -1.0;
    }
    vertices.push(vertex);
  }

  // Generate edges: connect vertices that differ in exactly one coordinate
  // Optimized O(n * 2^n) algorithm: iterate vertices and flip each bit
  const edges: [number, number][] = [];
  
  for (let i = 0; i < vertexCount; i++) {
    for (let k = 0; k < dimension; k++) {
      // Flip the k-th bit to find the neighbor
      const j = i ^ (1 << k);
      
      // Only add edge if j > i to avoid duplicates (and self-loops, though impossible with XOR)
      if (j > i) {
        edges.push([i, j]);
      }
    }
  }

  return {
    vertices,
    edges,
    dimension,
    type: 'hypercube',
  };
}

/**
 * Generates faces for a hypercube analytically.
 * 
 * A hypercube face is formed by varying exactly 2 coordinates while keeping
 * the others fixed. This is much faster and more robust than graph cycle detection.
 * 
 * @param dimension - Dimensionality of the hypercube
 * @returns Array of faces (arrays of 4 vertex indices)
 */
export function generateHypercubeFaces(dimension: number): number[][] {
  const faces: number[][] = [];
  
  // Iterate over all pairs of dimensions that define the face plane
  for (let d1 = 0; d1 < dimension; d1++) {
    for (let d2 = d1 + 1; d2 < dimension; d2++) {
      // Iterate over all combinations of the other (fixed) dimensions
      // There are 2^(dimension - 2) faces for each plane orientation
      const fixedCount = 1 << (dimension - 2);
      
      for (let i = 0; i < fixedCount; i++) {
        // Construct the base vertex index.
        // We map the bits of 'i' to the dimensions that are NOT d1 or d2.
        let baseIndex = 0;
        let currentBit = 0;
        
        for (let bit = 0; bit < dimension; bit++) {
          if (bit === d1 || bit === d2) continue;
          
          if ((i >> currentBit) & 1) {
            baseIndex |= (1 << bit);
          }
          currentBit++;
        }
        
        // The 4 vertices of the face are formed by varying bits d1 and d2.
        // We use Gray code order (00, 10, 11, 01) to ensure correct winding.
        // Note: the order 00 -> 01 -> 11 -> 10 is also valid.
        // Let's use:
        // v1: 00 (base)
        // v2: 01 (add d1 bit - wait, 1 << d1)
        // v3: 11 (add d1 and d2 bits)
        // v4: 10 (add d2 bit)
        
        const v1 = baseIndex;
        const v2 = baseIndex | (1 << d1);
        const v3 = baseIndex | (1 << d1) | (1 << d2);
        const v4 = baseIndex | (1 << d2);
        
        // Calculate winding order adjustment
        // 1. Permutation parity of (d1, d2, ...fixedDims)
        const permIndices = [d1, d2];
        for (let k = 0; k < dimension; k++) {
          if (k !== d1 && k !== d2) permIndices.push(k);
        }
        
        let inversions = 0;
        for (let a = 0; a < permIndices.length; a++) {
          for (let b = a + 1; b < permIndices.length; b++) {
            if (permIndices[a]! > permIndices[b]!) inversions++;
          }
        }
        const isEvenPerm = (inversions % 2 === 0);
        
        // 2. Count "negative" fixed coordinates (bits of i that are 0)
        // i has (dimension - 2) bits
        let setBitCount = 0;
        let tempI = i;
        while (tempI > 0) {
          if (tempI & 1) setBitCount++;
          tempI >>= 1;
        }
        const zeroCount = (dimension - 2) - setBitCount;
        
        // 3. Determine flip
        // Even Permutation: Normal aligns with basis. Flip if odd number of negatives (reflections).
        // Odd Permutation: Normal anti-aligns. Flip if even number of negatives.
        let flip = false;
        if (isEvenPerm) {
          if (zeroCount % 2 !== 0) flip = true;
        } else {
          if (zeroCount % 2 === 0) flip = true;
        }
        
        if (flip) {
          faces.push([v1, v4, v3, v2]);
        } else {
          faces.push([v1, v2, v3, v4]);
        }
      }
    }
  }
  return faces;
}
