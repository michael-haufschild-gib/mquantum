/**
 * Async Face Detection Hook
 *
 * Provides React state management for asynchronous face detection
 * using the geometry Web Worker.
 *
 * For convex-hull face detection (used by root-system and wythoff-polytope),
 * computation happens in the worker thread.
 * For other face detection methods, falls back to synchronous detection.
 *
 * @example
 * ```tsx
 * function FaceViewer({ geometry, objectType }) {
 *   const { faces, isLoading } = useAsyncFaceDetection(geometry, objectType)
 *
 *   if (isLoading) {
 *     return <div>Computing faces...</div>
 *   }
 *
 *   return <FaceRenderer faces={faces} />
 * }
 * ```
 */

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useGeometryWorker, generateRequestId } from './useGeometryWorker'
import { inflateFaces, flattenVerticesOnly, flattenEdges } from '@/lib/geometry/transfer'
import { detectFaces, getFaceDetectionMethod } from '@/lib/geometry'
import { OBJECT_TYPE_REGISTRY } from '@/lib/geometry/registry/registry'
import type { Face } from '@/lib/geometry/faces'
import type { NdGeometry, ObjectType } from '@/lib/geometry/types'
import type { WorkerFaceMethod, GridFaceProps } from '@/workers/types'
import type { FaceDetectionMethod } from '@/lib/geometry/registry/types'

// ============================================================================
// Constants
// ============================================================================

/** Timeout for worker requests in milliseconds (30 seconds) */
const WORKER_REQUEST_TIMEOUT_MS = 30000

// ============================================================================
// Helpers
// ============================================================================

/**
 * Maps registry face detection method to worker method.
 * Returns undefined for methods that should run synchronously.
 *
 * Worker methods: convex-hull, triangles, grid (potentially expensive)
 * Sync methods: analytical-quad, metadata (fast O(1) or O(n) operations)
 * @param faceMethod - The face detection method from registry
 * @returns Worker method or undefined for sync methods
 */
function getWorkerMethod(faceMethod: FaceDetectionMethod): WorkerFaceMethod | undefined {
  switch (faceMethod) {
    case 'convex-hull':
      return 'convex-hull'
    case 'triangles':
      return 'triangles'
    case 'grid':
      return 'grid'
    default:
      // analytical-quad, metadata, none - run sync
      return undefined
  }
}

/**
 * Validates that all face indices are within bounds of vertex count.
 * @param faces - Array of triangle faces as [v0, v1, v2] tuples
 * @param vertexCount - Number of vertices in the geometry
 * @returns True if all indices are valid
 */
function validateFaceIndices(faces: [number, number, number][], vertexCount: number): boolean {
  for (const [v0, v1, v2] of faces) {
    if (v0 >= vertexCount || v1 >= vertexCount || v2 >= vertexCount) {
      return false
    }
    if (v0 < 0 || v1 < 0 || v2 < 0) {
      return false
    }
  }
  return true
}

/**
 * Builds and validates grid properties for worker request.
 * Returns undefined if required properties are missing.
 * @param objectType - The type of geometry object
 * @param metadata - The geometry metadata
 * @returns Grid properties or undefined if invalid
 */
function buildGridProps(
  objectType: ObjectType,
  metadata: NdGeometry['metadata']
): GridFaceProps | undefined {
  const registryEntry = OBJECT_TYPE_REGISTRY.get(objectType)
  const configKey = registryEntry?.configStoreKey

  // Only cliffordTorus and nestedTorus are valid grid types
  if (configKey !== 'cliffordTorus' && configKey !== 'nestedTorus') {
    return undefined
  }

  if (!metadata?.properties) {
    return undefined
  }

  const props = metadata.properties

  // Build the grid props with runtime validation
  const gridProps: GridFaceProps = {
    configKey,
    visualizationMode: props.visualizationMode as string | undefined,
    mode: props.mode as string | undefined,
    resolutionU: props.resolutionU as number | undefined,
    resolutionV: props.resolutionV as number | undefined,
    resolutionXi1: props.resolutionXi1 as number | undefined,
    resolutionXi2: props.resolutionXi2 as number | undefined,
    k: props.k as number | undefined,
    stepsPerCircle: props.stepsPerCircle as number | undefined,
    intrinsicDimension: props.intrinsicDimension as number | undefined,
    torusCount: props.torusCount as number | undefined,
  }

  // Validate that at least some resolution parameters exist
  const hasResolution =
    (gridProps.resolutionU !== undefined && gridProps.resolutionV !== undefined) ||
    (gridProps.resolutionXi1 !== undefined && gridProps.resolutionXi2 !== undefined) ||
    (gridProps.k !== undefined && gridProps.stepsPerCircle !== undefined)

  if (!hasResolution) {
    return undefined
  }

  return gridProps
}

// ============================================================================
// Types
// ============================================================================

/**
 * Result of the useAsyncFaceDetection hook
 */
export interface AsyncFaceDetectionResult {
  /** Detected faces */
  faces: Face[]
  /** Whether face detection is in progress */
  isLoading: boolean
  /** Error if detection failed */
  error: Error | null
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for asynchronous face detection.
 *
 * Uses Web Worker for convex-hull method to prevent UI blocking.
 * Falls back to synchronous detection for other methods.
 *
 * @param geometry - The geometry to detect faces for
 * @param objectType - The type of object (determines detection method)
 * @returns Async face detection result with loading state
 */
export function useAsyncFaceDetection(
  geometry: NdGeometry | null,
  objectType: ObjectType
): AsyncFaceDetectionResult {
  const { sendRequest, cancelRequest } = useGeometryWorker()

  // State
  const [faces, setFaces] = useState<Face[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Track current request for cancellation and race condition prevention
  const currentRequestId = useRef<string | null>(null)
  // Track geometry key associated with current request to prevent stale responses
  const currentGeometryKey = useRef<string>('empty')

  // Stable geometry reference for dependency tracking
  // Use vertex count, dimension, and first vertex hash as proxy for geometry identity
  const geometryKey = useMemo(() => {
    if (!geometry || geometry.vertices.length === 0) return 'empty'
    const firstVertex = geometry.vertices[0]
    // Include a hash of more vertex data for better uniqueness
    const vertexHash = firstVertex
      ? firstVertex
          .slice(0, 3)
          .map((v) => v.toFixed(6))
          .join(',')
      : ''
    return `${geometry.vertices.length}-${geometry.dimension}-${vertexHash}`
  }, [geometry])

  /**
   * Detect faces synchronously (for non-worker methods or as fallback)
   */
  const detectSync = useCallback(
    (geo: NdGeometry) => {
      setIsLoading(true)
      setError(null)

      try {
        // Use the existing synchronous detector
        const detected = detectFaces(
          geo.vertices as number[][],
          geo.edges,
          objectType,
          geo.metadata
        )

        setFaces(detected)
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        setFaces([])
      } finally {
        setIsLoading(false)
      }
    },
    [objectType]
  )

  /**
   * Detect faces via Web Worker (async)
   * Falls back to synchronous detection if worker is unavailable or on error.
   */
  const detectViaWorker = useCallback(
    async (geo: NdGeometry, method: WorkerFaceMethod, geoKey: string) => {
      const requestId = generateRequestId('faces')
      currentRequestId.current = requestId
      currentGeometryKey.current = geoKey
      const vertexCount = geo.vertices.length

      // Reset state
      setIsLoading(true)
      setError(null)

      // Timeout promise for worker requests
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Worker request timed out after ${WORKER_REQUEST_TIMEOUT_MS}ms`))
        }, WORKER_REQUEST_TIMEOUT_MS)
      })

      try {
        // For grid method, validate we have proper grid props
        // If not, fall back to sync detection immediately
        if (method === 'grid') {
          const gridProps = buildGridProps(objectType, geo.metadata)
          if (!gridProps) {
            if (import.meta.env.DEV) {
              console.warn('[useAsyncFaceDetection] Missing grid properties, using sync fallback')
            }
            // Fall back to sync detection
            const detected = detectFaces(
              geo.vertices as number[][],
              geo.edges,
              objectType,
              geo.metadata
            )
            setFaces(detected)
            setIsLoading(false)
            currentRequestId.current = null
            return
          }
        }

        // Flatten vertices for transfer
        const { flatVertices, buffer: vertexBuffer } = flattenVerticesOnly(
          geo.vertices as number[][],
          geo.dimension
        )

        // Prepare transfer buffers
        const transferBuffers: ArrayBuffer[] = [vertexBuffer]

        // Build request based on method
        let flatEdges: Uint32Array | undefined
        let gridProps: GridFaceProps | undefined

        if (method === 'triangles') {
          // Triangle detection needs edges - validate we have some
          if (geo.edges.length === 0) {
            if (import.meta.env.DEV) {
              console.warn(
                '[useAsyncFaceDetection] No edges for triangle detection, returning empty'
              )
            }
            setFaces([])
            setIsLoading(false)
            currentRequestId.current = null
            return
          }
          const { flatEdges: edges, buffer: edgeBuffer } = flattenEdges(geo.edges)
          flatEdges = edges
          transferBuffers.push(edgeBuffer)
        } else if (method === 'grid') {
          gridProps = buildGridProps(objectType, geo.metadata)
          // Already validated above, but TypeScript needs this
          if (!gridProps) {
            setFaces([])
            setIsLoading(false)
            currentRequestId.current = null
            return
          }
        } else if (method === 'convex-hull') {
          // Convex hull needs at least 4 vertices (for 3D)
          if (geo.vertices.length < 4) {
            if (import.meta.env.DEV) {
              console.warn('[useAsyncFaceDetection] Insufficient vertices for convex hull')
            }
            setFaces([])
            setIsLoading(false)
            currentRequestId.current = null
            return
          }
        }

        // Race between actual request and timeout
        const response = await Promise.race([
          sendRequest(
            {
              type: 'compute-faces',
              id: requestId,
              method,
              vertices: flatVertices,
              dimension: geo.dimension,
              objectType,
              edges: flatEdges,
              gridProps,
            },
            undefined, // no progress callback
            transferBuffers // zero-copy transfer
          ),
          timeoutPromise,
        ])

        // Check if this response is for the current request AND current geometry
        // This prevents stale responses from being applied to new geometry
        if (currentRequestId.current !== requestId || currentGeometryKey.current !== geoKey) {
          if (import.meta.env.DEV) {
            console.debug('[useAsyncFaceDetection] Discarding stale response')
          }
          return // Stale response, ignore
        }

        if (response.type === 'result' && response.faces) {
          // Inflate the face data
          const inflated = inflateFaces(response.faces)

          // CRITICAL: Validate face indices against current vertex count
          // This prevents crashes if response arrives for old geometry
          if (!validateFaceIndices(inflated, vertexCount)) {
            if (import.meta.env.DEV) {
              console.error('[useAsyncFaceDetection] Face indices out of bounds, discarding')
            }
            setError(new Error('Face indices out of bounds - geometry mismatch'))
            setFaces([])
            return
          }

          // Convert to Face objects
          const faceObjects: Face[] = inflated.map(([v0, v1, v2]) => ({
            vertices: [v0, v1, v2],
          }))

          setFaces(faceObjects)
        } else if (response.type === 'cancelled') {
          // Request was cancelled, don't update state
          return
        }
      } catch (err) {
        // Only handle if this is still the current request
        if (currentRequestId.current === requestId && currentGeometryKey.current === geoKey) {
          const errorMessage = err instanceof Error ? err.message : String(err)

          // Fallback to sync detection if worker is unavailable or timed out
          const shouldFallback =
            errorMessage.includes('Worker not available') || errorMessage.includes('timed out')

          if (shouldFallback) {
            if (import.meta.env.DEV) {
              console.warn(`[useAsyncFaceDetection] ${errorMessage}, using sync fallback`)
            }
            // Use sync detection as fallback
            try {
              const detected = detectFaces(
                geo.vertices as number[][],
                geo.edges,
                objectType,
                geo.metadata
              )
              setFaces(detected)
              setError(null)
            } catch (syncErr) {
              setError(syncErr instanceof Error ? syncErr : new Error(String(syncErr)))
              setFaces([])
            } finally {
              setIsLoading(false)
              currentRequestId.current = null
            }
            return
          }

          // For other errors, set error state
          setError(err instanceof Error ? err : new Error(errorMessage))
          setFaces([])
        }
      } finally {
        // Only update loading state if this is still the current request
        if (currentRequestId.current === requestId) {
          setIsLoading(false)
          currentRequestId.current = null
        }
      }
    },
    [objectType, sendRequest]
  )

  // Detect faces when geometry changes
  // NOTE: This effect must be defined AFTER all callbacks it uses
  useEffect(() => {
    // Cancel any previous request
    if (currentRequestId.current) {
      cancelRequest(currentRequestId.current)
      currentRequestId.current = null
    }

    // Handle null geometry
    if (!geometry || geometry.vertices.length === 0) {
      setFaces([])
      setIsLoading(false)
      setError(null)
      currentGeometryKey.current = 'empty'
      return
    }

    // CRITICAL: Clear stale faces immediately when geometry changes
    // This prevents rendering old faces (with invalid vertex indices) against new geometry
    setFaces([])

    // Update geometry key for race condition detection
    currentGeometryKey.current = geometryKey

    // Get face detection method from registry
    const faceMethod = getFaceDetectionMethod(objectType)

    // If no face detection needed, return empty
    if (faceMethod === 'none') {
      setFaces([])
      setIsLoading(false)
      return
    }

    // Map registry face method to worker method
    // Worker handles: convex-hull, triangles, grid
    // Sync handles: analytical-quad, metadata (fast operations)
    const workerMethod = getWorkerMethod(faceMethod)

    if (workerMethod) {
      // Async path via worker - pass geometry key for race condition detection
      detectViaWorker(geometry, workerMethod, geometryKey)
    } else {
      // Sync path for fast detection methods (analytical-quad, metadata)
      detectSync(geometry)
    }

    // Cleanup on unmount or param change
    return () => {
      if (currentRequestId.current) {
        cancelRequest(currentRequestId.current)
        currentRequestId.current = null
      }
    }
  }, [geometryKey, objectType, geometry, detectViaWorker, detectSync, cancelRequest])

  return {
    faces,
    isLoading,
    error,
  }
}
