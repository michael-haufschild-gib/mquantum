/**
 * Hook to generate geometry based on current store state.
 *
 * Uses Web Worker for Wythoff polytopes to prevent UI blocking.
 * Falls back to synchronous generation for other object types.
 */

import type { ExtendedObjectParams, NdGeometry, ObjectType } from '@/lib/geometry'
import { generateGeometry } from '@/lib/geometry'
import { generateRootSystem } from '@/lib/geometry/extended/root-system'
import { generateWythoffPolytopeWithWarnings } from '@/lib/geometry/wythoff'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useToast } from '@/hooks/useToast'
import { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import { useGeometryWorker, generateRequestId } from './useGeometryWorker'
import { inflateGeometry } from '@/lib/geometry/transfer'
import type { GenerationStage } from '@/workers/types'
import type { WythoffPolytopeConfig } from '@/lib/geometry/wythoff/types'
import type { RootSystemConfig } from '@/lib/geometry/extended/types'
import { getCachedPolytope, cachePolytope, getCacheKey } from '@/lib/geometry/wythoff/cache'
import type { PolytopeGeometry } from '@/lib/geometry/types'
import { useShallow } from 'zustand/react/shallow'

/**
 * Return type for useGeometryGenerator hook
 */
export interface GeometryGeneratorResult {
  /** Generated geometry (null while loading for async types) */
  geometry: NdGeometry | null
  /** Dimension of the geometry */
  dimension: number
  /** Object type being generated */
  objectType: ObjectType
  /** Whether generation is in progress */
  isLoading: boolean
  /** Current progress (0-100) */
  progress: number
  /** Current generation stage */
  stage: GenerationStage
  /** Warnings from generation */
  warnings: string[]
}

/**
 * Hook to generate geometry based on current store state.
 * Combines geometry store state with extended object configuration.
 *
 * Uses Web Worker for Wythoff polytopes to prevent UI blocking.
 * Falls back to synchronous generation for other object types.
 *
 * @returns The generated geometry object with loading state.
 */
export function useGeometryGenerator(): GeometryGeneratorResult {
  // Grouped geometry store subscription
  const { dimension, objectType } = useGeometryStore(
    useShallow((state) => ({
      dimension: state.dimension,
      objectType: state.objectType,
    }))
  )
  const { addToast } = useToast()
  const { sendRequest, cancelRequest } = useGeometryWorker()

  // Track shown warnings to avoid duplicate toasts
  const shownWarningsRef = useRef<Set<string>>(new Set())

  // Async state for worker-based generation
  const [asyncGeometry, setAsyncGeometry] = useState<NdGeometry | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [stage, setStage] = useState<GenerationStage>('initializing')
  const [warnings, setWarnings] = useState<string[]>([])
  const currentRequestId = useRef<string | null>(null)

  // Generation counter to prevent stale async functions from mutating state
  // Only the most recent generation is allowed to update React state
  const generationRef = useRef(0)

  // Grouped extended object store subscription for all configs
  const {
    polytopeConfig,
    wythoffPolytopeConfig,
    rootSystemConfig,
    cliffordTorusConfig,
    nestedTorusConfig,
    mandelbulbConfig,
    quaternionJuliaConfig,
    schroedingerConfig,
  } = useExtendedObjectStore(
    useShallow((state) => ({
      polytopeConfig: state.polytope,
      wythoffPolytopeConfig: state.wythoffPolytope,
      rootSystemConfig: state.rootSystem,
      cliffordTorusConfig: state.cliffordTorus,
      nestedTorusConfig: state.nestedTorus,
      mandelbulbConfig: state.mandelbulb,
      quaternionJuliaConfig: state.quaternionJulia,
      schroedingerConfig: state.schroedinger,
    }))
  )

  // Optimization: Only subscribe to the config relevant to the current object type
  const relevantConfig = useMemo(() => {
    switch (objectType) {
      case 'hypercube':
      case 'simplex':
      case 'cross-polytope':
        return polytopeConfig
      case 'wythoff-polytope':
        return wythoffPolytopeConfig
      case 'root-system':
        return rootSystemConfig
      case 'clifford-torus':
        return cliffordTorusConfig
      case 'nested-torus':
        return nestedTorusConfig
      case 'mandelbulb':
        return mandelbulbConfig
      case 'quaternion-julia':
        return quaternionJuliaConfig
      case 'schroedinger':
        return schroedingerConfig
      default:
        return polytopeConfig
    }
  }, [
    objectType,
    polytopeConfig,
    wythoffPolytopeConfig,
    rootSystemConfig,
    cliffordTorusConfig,
    nestedTorusConfig,
    mandelbulbConfig,
    quaternionJuliaConfig,
    schroedingerConfig,
  ])

  // Stable config reference for dependency tracking
  const configJson = useMemo(() => JSON.stringify(relevantConfig), [relevantConfig])

  // Generate synchronous geometry for non-worker types
  const syncGeometry = useMemo(() => {
    // These types are handled by async worker path
    if (objectType === 'wythoff-polytope' || objectType === 'root-system') {
      return null
    }

    const params: Partial<ExtendedObjectParams> = {}

    switch (objectType) {
      case 'hypercube':
      case 'simplex':
      case 'cross-polytope':
        params.polytope = relevantConfig as typeof polytopeConfig
        break
      case 'clifford-torus':
        params.cliffordTorus = relevantConfig as typeof cliffordTorusConfig
        break
      case 'nested-torus':
        params.nestedTorus = relevantConfig as typeof nestedTorusConfig
        break
      case 'mandelbulb':
        params.mandelbulb = relevantConfig as typeof mandelbulbConfig
        break
      case 'quaternion-julia':
        params.quaternionJulia = relevantConfig as typeof quaternionJuliaConfig
        break
      case 'schroedinger':
        params.schroedinger = relevantConfig as typeof schroedingerConfig
        break
      default:
        params.polytope = relevantConfig as typeof polytopeConfig
    }

    return generateGeometry(objectType, dimension, params as ExtendedObjectParams)
  }, [objectType, dimension, relevantConfig])

  // Generate Wythoff polytopes via worker
  const generateWythoffAsync = useCallback(async () => {
    // Increment generation - only this generation can mutate state
    const thisGeneration = ++generationRef.current

    // Parse config from stable JSON to avoid dependency on object reference
    const config = JSON.parse(configJson) as Partial<WythoffPolytopeConfig>
    const fullConfig = config as WythoffPolytopeConfig
    // Scale is stored in metadata for shader use - geometry is always unit-scale
    const scale = fullConfig.scale ?? 1

    // Check IndexedDB cache BEFORE triggering worker
    const cacheKey = getCacheKey(dimension, fullConfig)
    const cached = await getCachedPolytope(cacheKey)

    if (cached) {
      // Check generation before state mutation
      if (generationRef.current !== thisGeneration) return

      // Return unit-scale geometry - visual scale is applied post-projection via shader
      // Scale is stored in metadata.properties.scale for the renderer to use
      setAsyncGeometry({
        ...cached,
        type: 'wythoff-polytope',
        metadata: {
          ...cached.metadata,
          properties: {
            ...cached.metadata?.properties,
            scale, // Store for shader uniform usage
          },
        },
      } as NdGeometry)
      setIsLoading(false)
      setProgress(100)
      setStage('complete')
      setWarnings([])

      if (import.meta.env.DEV) {
        console.log('[useGeometryGenerator] Cache hit for Wythoff polytope')
      }
      return // Cache hit - skip worker
    }

    // Cache miss - proceed with worker generation
    // Cancel any previous request
    if (currentRequestId.current) {
      cancelRequest(currentRequestId.current)
    }

    const requestId = generateRequestId('wythoff')
    currentRequestId.current = requestId

    setIsLoading(true)
    setProgress(0)
    setStage('initializing')
    setWarnings([])

    try {
      const response = await sendRequest(
        {
          type: 'generate-wythoff',
          id: requestId,
          dimension,
          config,
        },
        (prog, stg) => {
          // Check generation before updating progress
          if (generationRef.current === thisGeneration && currentRequestId.current === requestId) {
            setProgress(prog)
            setStage(stg)
          }
        }
      )

      // CRITICAL: Check generation before ANY state mutation
      if (generationRef.current !== thisGeneration) {
        return // Stale - newer request is in flight
      }

      // Handle cancelled response explicitly
      if (response.type === 'cancelled') {
        setIsLoading(false)
        return
      }

      if (response.type === 'result' && response.geometry) {
        const inflated = inflateGeometry(response.geometry)

        // Cache the normalized geometry (scale=1.0) for future use
        const normalizedForCache: PolytopeGeometry = {
          vertices: inflated.vertices,
          edges: inflated.edges,
          dimension: inflated.dimension,
          type: 'wythoff-polytope',
          metadata: inflated.metadata,
        }
        cachePolytope(cacheKey, normalizedForCache) // Fire-and-forget

        if (import.meta.env.DEV) {
          console.log('[useGeometryGenerator] Cached Wythoff polytope to IndexedDB')
        }

        setAsyncGeometry({
          ...inflated,
          type: 'wythoff-polytope',
          metadata: {
            ...inflated.metadata,
            properties: {
              ...inflated.metadata?.properties,
              scale,
            },
          },
        } as NdGeometry)

        setWarnings(response.warnings ?? [])
        setIsLoading(false)
      } else {
        // Unexpected response type - log and clear loading
        if (import.meta.env.DEV) {
          console.warn('[useGeometryGenerator] Unexpected response:', response)
        }
        setIsLoading(false)
      }
    } catch (err) {
      // Check generation before error state mutation
      if (generationRef.current !== thisGeneration) {
        return // Stale - newer request is in flight
      }

      setIsLoading(false)

      const errorMessage = err instanceof Error ? err.message : String(err)

      // Fallback to sync generation if worker is unavailable or not initialized
      if (
        errorMessage.includes('Worker not available') ||
        errorMessage.includes('Worker not initialized')
      ) {
        if (import.meta.env.DEV) {
          console.warn('[useGeometryGenerator] Worker unavailable, using sync fallback')
        }
        try {
          const result = generateWythoffPolytopeWithWarnings(
            dimension,
            config as WythoffPolytopeConfig
          )
          const scale = (config as WythoffPolytopeConfig).scale ?? 1

          // Check generation again after sync operation
          if (generationRef.current !== thisGeneration) {
            return
          }

          setAsyncGeometry({
            ...result.geometry,
            type: 'wythoff-polytope',
            metadata: {
              ...result.geometry.metadata,
              properties: {
                ...result.geometry.metadata?.properties,
                scale,
              },
            },
          } as NdGeometry)
          setWarnings(result.warnings)
        } catch (syncErr) {
          if (import.meta.env.DEV) {
            console.error('[useGeometryGenerator] Sync fallback error:', syncErr)
          }
          if (generationRef.current === thisGeneration) {
            setAsyncGeometry(null)
          }
        }
        return
      }

      if (import.meta.env.DEV) {
        console.error('[useGeometryGenerator] Worker error:', err)
      }
      setAsyncGeometry(null)
    } finally {
      // Clear request ID if this was our request and still current generation
      if (generationRef.current === thisGeneration && currentRequestId.current === requestId) {
        currentRequestId.current = null
      }
    }
  }, [dimension, configJson, sendRequest, cancelRequest])

  // Generate root systems via worker
  const generateRootSystemAsync = useCallback(async () => {
    // Increment generation - only this generation can mutate state
    const thisGeneration = ++generationRef.current

    // Parse config from stable JSON to avoid dependency on object reference
    const config = JSON.parse(configJson) as RootSystemConfig

    // Cancel any previous request
    if (currentRequestId.current) {
      cancelRequest(currentRequestId.current)
    }

    const requestId = generateRequestId('root-system')
    currentRequestId.current = requestId

    setIsLoading(true)
    setProgress(0)
    setStage('initializing')
    setWarnings([])

    try {
      const response = await sendRequest(
        {
          type: 'generate-root-system',
          id: requestId,
          dimension,
          config,
        },
        (prog, stg) => {
          // Check generation before updating progress
          if (generationRef.current === thisGeneration && currentRequestId.current === requestId) {
            setProgress(prog)
            setStage(stg)
          }
        }
      )

      // CRITICAL: Check generation before ANY state mutation
      if (generationRef.current !== thisGeneration) {
        return // Stale - newer request is in flight
      }

      // Handle cancelled response explicitly
      if (response.type === 'cancelled') {
        setIsLoading(false)
        return
      }

      if (response.type === 'result' && response.geometry) {
        const inflated = inflateGeometry(response.geometry)

        setAsyncGeometry({
          ...inflated,
          type: 'root-system',
        } as NdGeometry)

        setWarnings(response.warnings ?? [])
        setIsLoading(false)
      } else {
        // Unexpected response type - log and clear loading
        if (import.meta.env.DEV) {
          console.warn('[useGeometryGenerator] Unexpected response:', response)
        }
        setIsLoading(false)
      }
    } catch (err) {
      // Check generation before error state mutation
      if (generationRef.current !== thisGeneration) {
        return // Stale - newer request is in flight
      }

      if (import.meta.env.DEV) {
        console.error('[useGeometryGenerator] Root system generation error:', err)
      }
      setIsLoading(false)

      const errorMessage = err instanceof Error ? err.message : String(err)

      // Fallback to sync generation if worker is unavailable or not initialized
      if (
        errorMessage.includes('Worker not available') ||
        errorMessage.includes('Worker not initialized')
      ) {
        if (import.meta.env.DEV) {
          console.warn('[useGeometryGenerator] Worker unavailable, using sync fallback')
        }
        try {
          const geometry = generateRootSystem(dimension, config)

          // Check generation again after sync operation
          if (generationRef.current !== thisGeneration) {
            return
          }

          setAsyncGeometry(geometry as NdGeometry)
        } catch (syncErr) {
          if (import.meta.env.DEV) {
            console.error('[useGeometryGenerator] Sync fallback error:', syncErr)
          }
          if (generationRef.current === thisGeneration) {
            setAsyncGeometry(null)
          }
        }
        return
      }

      if (import.meta.env.DEV) {
        console.error('[useGeometryGenerator] Worker error:', err)
      }
      setAsyncGeometry(null)
    } finally {
      // Clear request ID if this was our request and still current generation
      if (generationRef.current === thisGeneration && currentRequestId.current === requestId) {
        currentRequestId.current = null
      }
    }
  }, [dimension, configJson, sendRequest, cancelRequest])

  // Reset async state when object type changes (catches ALL type changes including async-to-async)
  // This prevents stale geometry from persisting when switching between types
  useEffect(() => {
    // Always clear async geometry when type changes - prevents stale data
    setAsyncGeometry(null)
    setIsLoading(false)
    setProgress(0)
    setStage('initializing')
    setWarnings([])

    // Increment generation to invalidate any in-flight requests from previous type
    generationRef.current++
  }, [objectType])

  // Trigger async generation for worker-based types
  useEffect(() => {
    if (objectType === 'wythoff-polytope') {
      generateWythoffAsync()
    } else if (objectType === 'root-system') {
      generateRootSystemAsync()
    }

    return () => {
      // Only cancel the request - DO NOT set loading state here
      // The generation counter pattern handles state consistency
      // New effect will set proper loading state when it runs
      if (currentRequestId.current) {
        cancelRequest(currentRequestId.current)
        currentRequestId.current = null
      }
    }
  }, [
    objectType,
    dimension,
    configJson,
    generateWythoffAsync,
    generateRootSystemAsync,
    cancelRequest,
  ])

  // Show warnings via toast (only new warnings, not duplicates)
  useEffect(() => {
    for (const warning of warnings) {
      if (!shownWarningsRef.current.has(warning)) {
        shownWarningsRef.current.add(warning)
        addToast(warning, 'info')
      }
    }
  }, [warnings, addToast])

  // Clear shown warnings when object type or dimension changes
  useEffect(() => {
    shownWarningsRef.current.clear()
  }, [objectType, dimension])

  // Check if this is a worker-based async type
  const isAsyncType = objectType === 'wythoff-polytope' || objectType === 'root-system'

  // Determine which geometry to return
  const geometry = isAsyncType ? asyncGeometry : syncGeometry

  return {
    geometry,
    dimension,
    objectType,
    isLoading: isAsyncType ? isLoading : false,
    progress: isAsyncType ? progress : 100,
    stage: isAsyncType ? stage : 'complete',
    warnings,
  }
}
