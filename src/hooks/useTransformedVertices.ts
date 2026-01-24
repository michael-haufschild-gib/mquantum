import { useMemo, useRef } from 'react'
import type { VectorND, MatrixND } from '@/lib/math/types'
import { multiplyMatrixVector } from '@/lib/math/matrix'
import { addVectors } from '@/lib/math/vector'

/**
 * Hook that applies shear and translation transformations to vertices
 * Optimized for performance using object pooling
 *
 * @param vertices - Input vertices (e.g. from rotation)
 * @param shearMatrix - Shear transformation matrix
 * @param translation - Translation vector
 * @returns Transformed vertices
 */
export function useTransformedVertices(
  vertices: VectorND[],
  shearMatrix: MatrixND,
  translation: VectorND
): VectorND[] {
  const cacheRef = useRef<VectorND[]>([])
  const lastWarnedMismatchRef = useRef<string | null>(null)

  return useMemo(() => {
    if (vertices.length === 0) {
      return []
    }

    // Rebuild cache if size or dimension changes
    const numVertices = vertices.length
    // Safe: we've verified vertices.length > 0 above
    const firstVertex = vertices[0]
    if (!firstVertex) {
      return []
    }
    const dimension = firstVertex.length

    if (
      cacheRef.current.length !== numVertices ||
      (numVertices > 0 && cacheRef.current[0]?.length !== dimension)
    ) {
      cacheRef.current = vertices.map((v) => new Array(v.length).fill(0))
    }

    const cache = cacheRef.current

    // Apply transformations
    for (let i = 0; i < numVertices; i++) {
      // 1. Apply Shear: v' = M * v
      // Write result directly into cache
      multiplyMatrixVector(shearMatrix, vertices[i]!, cache[i])

      // 2. Apply Translation: v'' = v' + t
      // Update cache in-place
      // Note: translation might have different length if dimension changed but store update is pending
      // We assume translation matches dimension or treat missing as 0

      // Apply translation - dimensions must match for correct transformation
      if (translation.length === dimension) {
        addVectors(cache[i]!, translation, cache[i])
      } else if (translation.length > 0 && translation.some((v) => v !== 0)) {
        // Only warn once per dimension mismatch to avoid console spam
        const mismatchKey = `${translation.length}-${dimension}`
        if (lastWarnedMismatchRef.current !== mismatchKey) {
          console.warn(
            `useTransformedVertices: Translation dimension (${translation.length}) does not match vertex dimension (${dimension}). Translation skipped.`
          )
          lastWarnedMismatchRef.current = mismatchKey
        }
      }
    }

    // Return a new array reference each time to trigger downstream re-renders.
    // The inner arrays (cache[i]) are mutated in place for memory efficiency,
    // but we need a new outer array reference so React components with
    // useEffect([vertices, ...]) dependencies properly re-run.
    // Note: FaceRenderer uses useLayoutEffect and reads values imperatively,
    // but VertexInstances and wireframes use useEffect with array dependencies.
    return [...cache]
  }, [vertices, shearMatrix, translation])
}
