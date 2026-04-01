/**
 * Store wiring hook for the WebGPU scene.
 *
 * Registers all Zustand store getters on the render graph so that
 * render passes can access store state via `getStore(ctx, 'storeName')`.
 * Also manages the camera matrix cache and extended store merge.
 *
 * @module rendering/webgpu/useSceneStoreWiring
 */

import type { RefObject } from 'react'
import { useEffect, useRef } from 'react'

import type { ObjectType } from '@/lib/geometry/types'
import { useAnimationStore } from '@/stores/animationStore'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useLightingStore } from '@/stores/lightingStore'
import { useMeasurementStore } from '@/stores/measurementStore'
import { usePBRStore } from '@/stores/pbrStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { usePostProcessingStore } from '@/stores/postProcessingStore'
import { useRotationStore } from '@/stores/rotationStore'
import { useTransformStore } from '@/stores/transformStore'
import { useUIStore } from '@/stores/uiStore'

import type { WebGPUCamera } from './core/WebGPUCamera'
import type { WebGPURenderGraph } from './graph/WebGPURenderGraph'

/** Dependencies injected from the scene component. */
export interface SceneStoreWiringDeps {
  graph: WebGPURenderGraph
  objectType: ObjectType
  cameraRef: RefObject<WebGPUCamera | null>
  /** Pre-allocated basis cache for Schrödinger mode. */
  schroedingerBasisCacheRef: RefObject<{
    basisX: Float32Array
    basisY: Float32Array
    basisZ: Float32Array
    origin: Float32Array
  }>
}

/**
 * Hook that wires all Zustand stores to the render graph's store getter system.
 *
 * Each registered getter is called per-frame by render passes that need
 * store state (via `getStore(ctx, 'storeName')`). The camera getter
 * uses a pre-allocated cache to avoid per-frame object allocation.
 */
export function useSceneStoreWiring(deps: SceneStoreWiringDeps): void {
  const { graph, objectType, cameraRef, schroedingerBasisCacheRef } = deps

  // Pre-allocated cache for camera matrices (avoids per-frame object creation)
  const cameraStoreCacheRef = useRef({
    viewMatrix: { elements: new Float32Array(16) },
    projectionMatrix: { elements: new Float32Array(16) },
    viewProjectionMatrix: { elements: new Float32Array(16) },
    inverseViewMatrix: { elements: new Float32Array(16) },
    inverseProjectionMatrix: { elements: new Float32Array(16) },
    position: { x: 0, y: 0, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    near: 0.1,
    far: 10000,
    fov: 60,
  })

  // Cache for extended store merge (only rebuild when source reference changes)
  const extendedStoreCacheRef = useRef<{
    sourceState: ReturnType<typeof useExtendedObjectStore.getState> | null
    mergedState: unknown
  }>({
    sourceState: null,
    mergedState: null,
  })

  useEffect(() => {
    graph.setStoreGetter('appearance', () => useAppearanceStore.getState())
    graph.setStoreGetter('environment', () => useEnvironmentStore.getState())
    graph.setStoreGetter('lighting', () => useLightingStore.getState())
    graph.setStoreGetter('performance', () => usePerformanceStore.getState())
    graph.setStoreGetter('postProcessing', () => usePostProcessingStore.getState())

    // Camera: provide actual matrices from WebGPUCamera (not OrbitControls state)
    // Sync camera aspect with graph render dimensions every frame.
    graph.setStoreGetter('camera', () => {
      if (!cameraRef.current) return null
      const graphW = graph.getWidth()
      const graphH = graph.getHeight()
      if (graphW > 0 && graphH > 0) {
        cameraRef.current.setAspect(graphW / graphH)
      }
      const matrices = cameraRef.current.getMatrices()
      const cache = cameraStoreCacheRef.current
      cache.viewMatrix.elements.set(matrices.viewMatrix)
      cache.projectionMatrix.elements.set(matrices.projectionMatrix)
      cache.viewProjectionMatrix.elements.set(matrices.viewProjectionMatrix)
      cache.inverseViewMatrix.elements.set(matrices.inverseViewMatrix)
      cache.inverseProjectionMatrix.elements.set(matrices.inverseProjectionMatrix)
      cache.position.x = matrices.cameraPosition.x
      cache.position.y = matrices.cameraPosition.y
      cache.position.z = matrices.cameraPosition.z
      const cameraState = cameraRef.current.getState()
      cache.target.x = cameraState.target[0]
      cache.target.y = cameraState.target[1]
      cache.target.z = cameraState.target[2]
      cache.near = matrices.cameraNear
      cache.far = matrices.cameraFar
      cache.fov = matrices.fov
      return cache
    })

    graph.setStoreGetter('animation', () => useAnimationStore.getState())

    // Extended store with computed basis vectors for Schrödinger
    graph.setStoreGetter('extended', () => {
      const state = useExtendedObjectStore.getState()
      if (objectType !== 'schroedinger' && objectType !== 'pauliSpinor') {
        return state
      }

      const extendedCache = extendedStoreCacheRef.current
      if (extendedCache.sourceState !== state || !extendedCache.mergedState) {
        extendedCache.sourceState = state
        extendedCache.mergedState = {
          ...state,
          schroedinger: {
            ...state.schroedinger,
            basisX: schroedingerBasisCacheRef.current.basisX,
            basisY: schroedingerBasisCacheRef.current.basisY,
            basisZ: schroedingerBasisCacheRef.current.basisZ,
            origin: schroedingerBasisCacheRef.current.origin,
          },
        }
      }

      return extendedCache.mergedState
    })

    graph.setStoreGetter('rotation', () => useRotationStore.getState())
    graph.setStoreGetter('transform', () => useTransformStore.getState())
    graph.setStoreGetter('pbr', () => usePBRStore.getState())
    graph.setStoreGetter('geometry', () => useGeometryStore.getState())
    graph.setStoreGetter('measurement', () => useMeasurementStore.getState())

    // Buffer preview: maps UI toggle flags to pass configuration
    graph.setStoreGetter('bufferPreview', () => {
      const ui = useUIStore.getState()
      if (ui.showDepthBuffer)
        return {
          bufferType: 'depth' as const,
          bufferInput: 'depth-buffer',
          depthMode: 'linear' as const,
        }
      if (ui.showTemporalDepthBuffer)
        return { bufferType: 'temporalDepth' as const, bufferInput: 'quarter-position' }
      return null
    })
  }, [graph, objectType, cameraRef, schroedingerBasisCacheRef])
}
