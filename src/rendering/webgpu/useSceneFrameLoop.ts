/**
 * Frame loop hook for the WebGPU scene.
 *
 * Manages the requestAnimationFrame loop, animation state advancement
 * (rotation planes, basis vectors, Schrödinger origin), scene frame
 * execution (size sync, metrics collection), and FPS throttling.
 *
 * @module rendering/webgpu/useSceneFrameLoop
 */

import type { RefObject } from 'react'
import { useCallback, useEffect, useRef } from 'react'

import { getPlaneMultiplier } from '@/lib/animation/biasCalculation'
import type { ObjectType } from '@/lib/geometry/types'
import { getRotationPlanes } from '@/lib/math/rotation'
import type { UseRotationUpdatesResult } from '@/rendering/renderers/base'
import { useAnimationStore } from '@/stores/animationStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { useRotationStore } from '@/stores/rotationStore'
import { useUIStore } from '@/stores/uiStore'

import type { WebGPURenderGraph } from './graph/WebGPURenderGraph'
import { type ExportRuntimeState, isExportRuntimeActive } from './sceneExportRuntime'
import { executeFrameAndCollectMetrics } from './scenePassSetup'
import { evaluateFpsLimit } from './utils/fpsLimiter'
import { WebGPUStatsCollector } from './WebGPUPerformanceCollector'

// Stable empty array to avoid new reference on every render when parameterValues is undefined
const EMPTY_PARAM_VALUES: number[] = []

// ============================================================================
// Scene frame callbacks (needed by both the frame loop and the export runtime)
// ============================================================================

/** Dependencies for the scene frame callbacks. */
export interface SceneFrameCallbackDeps {
  graph: WebGPURenderGraph
  canvas: HTMLCanvasElement
  size: { width: number; height: number }
  objectType: ObjectType
  dimension: number
  schroedingerRotation: UseRotationUpdatesResult
  schroedingerBasisCacheRef: RefObject<{
    basisX: Float32Array
    basisY: Float32Array
    basisZ: Float32Array
    origin: Float32Array
  }>
  exportRuntimeRef: RefObject<ExportRuntimeState>
  onFrame?: (deltaTime: number) => void
}

/** Stable callbacks for advancing scene state and executing a frame. */
export interface SceneFrameCallbacks {
  advanceSceneStateByDelta: (deltaTime: number) => void
  executeSceneFrame: (deltaTime: number) => void
}

/**
 * Hook that produces stable callbacks for per-frame scene work.
 *
 * These callbacks are consumed by both the frame loop (normal rendering)
 * and the export runtime (fixed-timestep recording). They are separated
 * from the frame loop so the scene component can wire them to both consumers.
 */
export function useSceneFrameCallbacks(deps: SceneFrameCallbackDeps): SceneFrameCallbacks {
  const {
    graph,
    canvas,
    size,
    objectType,
    dimension,
    schroedingerRotation,
    schroedingerBasisCacheRef,
    exportRuntimeRef,
    onFrame,
  } = deps

  const statsCollectorRef = useRef<WebGPUStatsCollector>(new WebGPUStatsCollector())
  const rotationUpdatesRef = useRef<Map<string, number>>(new Map())
  const originValuesWorkRef = useRef(new Array<number>(11).fill(0))

  const advanceSceneStateByDelta = useCallback(
    (deltaTime: number) => {
      const deltaTimeMs = deltaTime * 1000
      const animationState = useAnimationStore.getState()
      const { isPlaying, animatingPlanes, getRotationDelta, updateAccumulatedTime } = animationState

      if (isPlaying && deltaTimeMs > 0 && deltaTimeMs < 100) {
        updateAccumulatedTime(deltaTime)

        if (animatingPlanes.size > 0) {
          const rotationState = useRotationStore.getState()
          const rotationDelta = getRotationDelta(deltaTimeMs)
          const updates = rotationUpdatesRef.current
          updates.clear()

          const bias = useUIStore.getState().animationBias
          const planeList = getRotationPlanes(dimension)
          const totalPlanes = planeList.length

          for (const plane of animatingPlanes) {
            const planeIndex = planeList.findIndex((p) => p.name === plane)
            const multiplier =
              bias > 0 && planeIndex >= 0 ? getPlaneMultiplier(planeIndex, totalPlanes, bias) : 1.0
            const currentAngle = rotationState.rotations.get(plane) ?? 0
            updates.set(plane, currentAngle + rotationDelta * multiplier)
          }

          if (updates.size > 0) {
            rotationState.updateRotations(updates)
          }
        }
      }

      if (objectType === 'schroedinger' || objectType === 'pauliSpinor') {
        const { basisX, basisY, basisZ, changed } = schroedingerRotation.getBasisVectors(false)
        if (changed) {
          schroedingerBasisCacheRef.current.basisX.set(basisX)
          schroedingerBasisCacheRef.current.basisY.set(basisY)
          schroedingerBasisCacheRef.current.basisZ.set(basisZ)
        }

        const paramValues =
          useExtendedObjectStore.getState().schroedinger?.parameterValues ?? EMPTY_PARAM_VALUES
        const originValues = originValuesWorkRef.current
        originValues.fill(0)
        for (let i = 3; i < dimension; i++) {
          originValues[i] = paramValues[i - 3] ?? 0
        }
        const { origin, changed: originChanged } = schroedingerRotation.getOrigin(originValues)
        if (originChanged || changed) {
          schroedingerBasisCacheRef.current.origin.set(origin)
        }
      }
    },
    [objectType, dimension, schroedingerRotation, schroedingerBasisCacheRef]
  )

  const executeSceneFrame = useCallback(
    (deltaTime: number) => {
      const exporting = isExportRuntimeActive(exportRuntimeRef.current)
      if (!exporting) {
        const cw = canvas.clientWidth
        const ch = canvas.clientHeight
        if (cw > 0 && ch > 0) {
          const renderScale = usePerformanceStore.getState().renderResolutionScale
          const dpr = window.devicePixelRatio * renderScale
          const targetW = Math.floor(cw * dpr)
          const targetH = Math.floor(ch * dpr)
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW
            canvas.height = targetH
            graph.setSize(targetW, targetH)
          }
        }
      }

      const frameSize = {
        width: canvas.width > 0 ? canvas.width : size.width,
        height: canvas.height > 0 ? canvas.height : size.height,
      }

      const effectiveDpr =
        canvas.clientWidth > 0
          ? frameSize.width / canvas.clientWidth
          : typeof window !== 'undefined'
            ? window.devicePixelRatio
            : 1

      executeFrameAndCollectMetrics({
        graph,
        collector: statsCollectorRef.current,
        deltaTime,
        size: frameSize,
        dpr: effectiveDpr,
      })

      onFrame?.(deltaTime)
    },
    [canvas, exportRuntimeRef, graph, onFrame, size.height, size.width]
  )

  return { advanceSceneStateByDelta, executeSceneFrame }
}

// ============================================================================
// Frame loop (rAF scheduling, FPS throttling, export yield)
// ============================================================================

/** Dependencies for the frame loop. */
export interface SceneFrameLoopDeps {
  maxFps: number
  advanceSceneStateByDelta: (deltaTime: number) => void
  executeSceneFrame: (deltaTime: number) => void
  tickExport: () => boolean
  cleanupExport: () => void
  /** Interaction timer ref — cleaned up when the loop unmounts. */
  interactionTimerRef: RefObject<number | null>
}

/**
 * Hook that runs the requestAnimationFrame loop.
 *
 * Delegates per-frame work to `advanceSceneStateByDelta` and `executeSceneFrame`
 * (provided by {@link useSceneFrameCallbacks}), yields to the export runtime
 * when active, and applies FPS throttling.
 */
export function useSceneFrameLoop(deps: SceneFrameLoopDeps): void {
  const {
    maxFps,
    advanceSceneStateByDelta,
    executeSceneFrame,
    tickExport,
    cleanupExport,
    interactionTimerRef,
  } = deps

  const initialFrameTimeRef = useRef<number>(performance.now())
  const animationFrameRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(initialFrameTimeRef.current)
  const fpsThrottleAnchorRef = useRef<number>(initialFrameTimeRef.current)

  const renderFrame = useCallback(() => {
    if (tickExport()) {
      animationFrameRef.current = requestAnimationFrame(renderFrame)
      return
    }

    const now = performance.now()
    const fpsDecision = evaluateFpsLimit({
      nowMs: now,
      throttleAnchorMs: fpsThrottleAnchorRef.current,
      maxFps,
    })
    fpsThrottleAnchorRef.current = fpsDecision.nextThrottleAnchorMs

    if (!fpsDecision.shouldRender) {
      animationFrameRef.current = requestAnimationFrame(renderFrame)
      return
    }

    const deltaTime = (now - lastTimeRef.current) / 1000
    lastTimeRef.current = now

    advanceSceneStateByDelta(deltaTime)
    executeSceneFrame(deltaTime)

    animationFrameRef.current = requestAnimationFrame(renderFrame)
  }, [advanceSceneStateByDelta, executeSceneFrame, maxFps, tickExport])

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(renderFrame)

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }

      // Clear interaction debounce timer
      if (interactionTimerRef.current !== null) {
        window.clearTimeout(interactionTimerRef.current)
        interactionTimerRef.current = null
      }

      cleanupExport()
    }
  }, [renderFrame, cleanupExport, interactionTimerRef])
}
