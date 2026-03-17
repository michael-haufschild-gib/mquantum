/**
 * WebGPU Scene Component
 *
 * Main scene component for WebGPU rendering that sets up render passes
 * and manages the rendering pipeline. Mirrors the WebGL scene setup.
 *
 * @module rendering/webgpu/WebGPUScene
 */

import React, { useEffect, useRef, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useWebGPU } from './WebGPUContext'
// WebGPURenderGraph type flows through useWebGPU() and scenePassSetup imports
import { WebGPUCamera } from './core/WebGPUCamera'
import { WebGPUStatsCollector } from './WebGPUPerformanceCollector'

// Stores
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useEnvironmentStore } from '@/stores/environmentStore'
import { useLightingStore } from '@/stores/lightingStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { usePostProcessingStore } from '@/stores/postProcessingStore'
import { useAnimationStore } from '@/stores/animationStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useRotationStore } from '@/stores/rotationStore'
import { useTransformStore } from '@/stores/transformStore'
import { usePBRStore } from '@/stores/pbrStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useUIStore } from '@/stores/uiStore'
import { useScreenshotCaptureStore } from '@/stores/screenshotCaptureStore'
import { useCameraStore } from '@/stores/cameraStore'

// Pass imports removed — now in scenePassSetup.ts
import { evaluateFpsLimit } from './utils/fpsLimiter'
import { WebGPUCanvasCapture } from './utils/WebGPUCanvasCapture'
import { VideoRecorder } from '@/lib/export/video'
import {
  computeRenderDimensions,
  computeSegmentDurationFrames,
  ensureEvenDimensions,
  resolveExportDimensions,
} from '@/lib/export/videoExportPlanning'
import { useExportStore, type ExportSettings } from '@/stores/exportStore'

// Export runtime types and helpers extracted to sceneExportRuntime.ts
import {
  type ExportRuntimeState,
  isExportRuntimeActive,
  createInitialExportLoopState,
  createInitialExportRuntimeState,
  cloneExportSettings,
  resolveRuntimeExportMode,
  waitForPaint,
} from './sceneExportRuntime'
// Re-export for backward compat (tests import from this module path)
export { isExportRuntimeActive }

import type { ObjectType } from '@/lib/geometry/types'
import type { SkyboxMode } from '@/stores/defaults/visualDefaults'

// Rotation hooks for Schroedinger basis vectors
import { useRotationUpdates } from '@/rendering/renderers/base'

// Light direction utilities for gizmo interaction
import { directionToRotation } from '@/rendering/lights/types'

// Animation bias
import { getRotationPlanes } from '@/lib/math/rotation'
import { getPlaneMultiplier } from '@/lib/animation/biasCalculation'

// Math utilities extracted to utils/sceneMath.ts
import { multiplyMat4, invertMat4, transformPoint } from './utils/sceneMath'

// Gizmo interaction helpers extracted to utils/gizmoHitTesting.ts
import {
  type GizmoDragState,
  gizmoScale,
  computeMouseRay,
  rayAxisClosest,
  rayPlaneIntersect,
  testGizmoHit,
  testGroundTargetHit,
} from './utils/gizmoHitTesting'

// ============================================================================
// Types
// ============================================================================

/**
 *
 */
export interface WebGPUSceneProps {
  /** Current object type to render */
  objectType: ObjectType
  /** Current dimension */
  dimension: number
  /** Optional callback when frame renders */
  onFrame?: (deltaTime: number) => void
}

// ============================================================================
// Store Selectors
// ============================================================================

const appearanceSelector = (state: ReturnType<typeof useAppearanceStore.getState>) => ({
  colorAlgorithm: state.colorAlgorithm,
})

const environmentSelector = (state: ReturnType<typeof useEnvironmentStore.getState>) => ({
  skyboxEnabled: state.skyboxEnabled,
  skyboxMode: state.skyboxMode,
  backgroundColor: state.backgroundColor,
})

const performanceSelector = (state: ReturnType<typeof usePerformanceStore.getState>) => ({
  maxFps: state.maxFps,
  temporalReprojectionEnabled: state.temporalReprojectionEnabled,
  eigenfunctionCacheEnabled: state.eigenfunctionCacheEnabled,
  analyticalGradientEnabled: state.analyticalGradientEnabled,
  fastEigenInterpolationEnabled: state.fastEigenInterpolationEnabled,
})

const postProcessingSelector = (state: ReturnType<typeof usePostProcessingStore.getState>) => ({
  bloomEnabled: state.bloomEnabled,
  antiAliasingMethod: state.antiAliasingMethod,
  // Paper texture
  paperEnabled: state.paperEnabled,
  // Frame blending
  frameBlendingEnabled: state.frameBlendingEnabled,
})

// Schrodinger isosurface selector (compile-time shader flag, triggers renderer recreation)
const schroedingerIsoSelector = (state: ReturnType<typeof useExtendedObjectStore.getState>) =>
  state.schroedinger?.isoEnabled ?? false

const schroedingerCompileSelector = (state: ReturnType<typeof useExtendedObjectStore.getState>) => {
  const quantumMode = state.schroedinger?.quantumMode ?? 'harmonicOscillator'
  const representation = (state.schroedinger?.representation ?? 'position') as
    | 'position'
    | 'momentum'
    | 'wigner'
  const openQuantumEnabled = state.schroedinger?.openQuantum?.enabled ?? false
  const openQuantumSupported =
    (quantumMode === 'harmonicOscillator' || quantumMode === 'hydrogenND') &&
    representation !== 'wigner'

  // Dirac particleAntiparticleSplit field view uses dual-channel grid encoding
  // (R=particle, G=antiparticle) which requires color algorithm 23 at compile time.
  const diracFieldView =
    quantumMode === 'diracEquation'
      ? (state.schroedinger?.dirac?.fieldView ?? 'totalDensity')
      : undefined

  // Pauli field view is now derived from the color algorithm at config build time
  // (kept here for backwards compat but overridden in fullConfig construction)
  const pauliFieldView = state.pauliSpinor?.fieldView ?? 'spinDensity'

  return {
    quantumMode,
    termCount: (state.schroedinger?.termCount ?? 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
    nodalEnabled: state.schroedinger?.nodalEnabled ?? false,
    phaseMaterialityEnabled: state.schroedinger?.phaseMaterialityEnabled ?? false,
    interferenceEnabled: state.schroedinger?.interferenceEnabled ?? false,
    uncertaintyBoundaryEnabled: state.schroedinger?.uncertaintyBoundaryEnabled ?? false,
    representation,
    openQuantumEnabled: openQuantumEnabled && openQuantumSupported,
    diracFieldView,
    pauliFieldView,
  }
}

// Schrodinger selector for rotation updates (like WebGL SchroedingerMesh.tsx line 108)
// Stable empty array to avoid new reference on every render when parameterValues is undefined
const EMPTY_PARAM_VALUES: number[] = []
const schroedingerSelector = (state: ReturnType<typeof useExtendedObjectStore.getState>) =>
  state.schroedinger?.parameterValues ?? EMPTY_PARAM_VALUES

// ============================================================================
// Component
// ============================================================================

/**
 * WebGPU Scene component.
 *
 * Sets up the complete render pipeline with all necessary passes.
 * Connects to Zustand stores for uniforms and settings.
 */
export const WebGPUScene: React.FC<WebGPUSceneProps> = ({ objectType, dimension, onFrame }) => {
  const { graph, size, canvas, device } = useWebGPU()
  const initialFrameTimeRef = useRef<number>(performance.now())
  const animationFrameRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(initialFrameTimeRef.current)
  const fpsThrottleAnchorRef = useRef<number>(initialFrameTimeRef.current)
  const currentObjectTypeRef = useRef<ObjectType | null>(null)
  const setupGenerationRef = useRef(0)
  const setupTaskRef = useRef<Promise<void>>(Promise.resolve())
  const statsCollectorRef = useRef<WebGPUStatsCollector>(new WebGPUStatsCollector())
  const exportRuntimeRef = useRef<ExportRuntimeState>(createInitialExportRuntimeState())

  // Selective pass rebuild tracking
  const lastSchrodingerConfigRef = useRef<SchrodingerPassConfig | null>(null)
  const lastPPConfigRef = useRef<PPPassConfig | null>(null)
  const needsFullRebuildRef = useRef(true)

  // WebGPU camera for view/projection matrices (since we don't have THREE.js camera)
  const cameraRef = useRef<WebGPUCamera | null>(null)
  if (!cameraRef.current) {
    cameraRef.current = new WebGPUCamera({
      position: [0, 3.125, 7.5], // Match WebGL default camera position from App.tsx
      target: [0, 0, 0],
      fov: 60, // Match WebGL camera fov from App.tsx
      near: 0.1,
      far: 1000,
      aspect: size.width / size.height || 1,
    })
  }

  // Register camera with Zustand store so presets/shortcuts can read/write camera state
  useEffect(() => {
    if (cameraRef.current) {
      useCameraStore.getState().registerCamera(cameraRef.current)
    }
    return () => {
      useCameraStore.getState().registerCamera(null)
    }
  }, [])

  // Camera control state
  const isDraggingRef = useRef(false)
  const lastMouseRef = useRef({ x: 0, y: 0 })
  const mouseDownPosRef = useRef({ x: 0, y: 0 })
  const gizmoDragRef = useRef<GizmoDragState | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  // Dimension ref for mouse handlers (avoids stale closure over prop)
  const dimensionRef = useRef(dimension)
  dimensionRef.current = dimension

  // Interaction state for progressive refinement
  const interactionTimerRef = useRef<number | null>(null)
  const INTERACTION_RESTORE_DELAY = 150

  const startInteraction = useCallback(() => {
    if (interactionTimerRef.current !== null) {
      window.clearTimeout(interactionTimerRef.current)
      interactionTimerRef.current = null
    }
    usePerformanceStore.getState().setIsInteracting(true)
  }, [])

  const scheduleEndInteraction = useCallback(() => {
    if (interactionTimerRef.current !== null) {
      window.clearTimeout(interactionTimerRef.current)
    }
    interactionTimerRef.current = window.setTimeout(() => {
      interactionTimerRef.current = null
      usePerformanceStore.getState().setIsInteracting(false)
    }, INTERACTION_RESTORE_DELAY)
  }, [INTERACTION_RESTORE_DELAY])

  // Camera control handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      mouseDownPosRef.current = { x: e.clientX, y: e.clientY }
      lastMouseRef.current = { x: e.clientX, y: e.clientY }

      // Test gizmo hit before entering camera drag
      if (cameraRef.current && overlayRef.current) {
        const lighting = useLightingStore.getState()
        if (lighting.showLightGizmos && lighting.lights.length) {
          const rect = overlayRef.current.getBoundingClientRect()
          const matrices = cameraRef.current.getMatrices()
          const ray = computeMouseRay(e.clientX, e.clientY, rect, matrices)

          if (ray) {
            const cp = matrices.cameraPosition
            const camPos: [number, number, number] = [cp.x, cp.y, cp.z]

            // Test transform gizmo on selected light
            if (lighting.selectedLightId) {
              const selLight = lighting.lights.find((l) => l.id === lighting.selectedLightId)
              if (selLight) {
                const scale = gizmoScale(selLight.position, camPos)
                const mode = lighting.transformMode || 'translate'
                const hit = testGizmoHit(ray, selLight.position, scale, mode)

                if (hit) {
                  gizmoDragRef.current = {
                    kind: hit.kind,
                    lightId: selLight.id,
                    startLightPos: [...selLight.position],
                    startLightRot: [...selLight.rotation],
                    startAxisT: hit.axisT,
                    startAngle: hit.angle,
                    startGroundPos: [0, 0, 0],
                    lightType: selLight.type,
                  }
                  lighting.setIsDraggingLight(true)
                  startInteraction()
                  return // Don't enter camera drag mode
                }
              }
            }

            // Test ground target hit
            const groundHitId = testGroundTargetHit(ray, lighting.lights)
            if (groundHitId) {
              const hitLight = lighting.lights.find((l) => l.id === groundHitId)
              if (hitLight) {
                // Select the light if not already selected
                if (lighting.selectedLightId !== groundHitId) {
                  lighting.selectLight(groundHitId)
                }

                // Compute initial ground intersection
                const groundHit = rayPlaneIntersect(ray.origin, ray.dir, [0, 1, 0], [0, 0, 0])

                gizmoDragRef.current = {
                  kind: 'ground-target',
                  lightId: groundHitId,
                  startLightPos: [...hitLight.position],
                  startLightRot: [...hitLight.rotation],
                  startAxisT: 0,
                  startAngle: 0,
                  startGroundPos: groundHit ?? [0, 0, 0],
                  lightType: hitLight.type,
                }
                lighting.setIsDraggingLight(true)
                startInteraction()
                return // Don't enter camera drag mode
              }
            }
          }
        }
      }

      isDraggingRef.current = true
      startInteraction()
    },
    [startInteraction]
  )

  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      // End gizmo drag if active
      if (gizmoDragRef.current) {
        const wasGizmoClick =
          Math.abs(e.clientX - mouseDownPosRef.current.x) < 5 &&
          Math.abs(e.clientY - mouseDownPosRef.current.y) < 5

        // If it was just a click on a ground target, select the light
        if (wasGizmoClick && gizmoDragRef.current.kind === 'ground-target') {
          useLightingStore.getState().selectLight(gizmoDragRef.current.lightId)
        }

        gizmoDragRef.current = null
        useLightingStore.getState().setIsDraggingLight(false)
        scheduleEndInteraction()
        return
      }

      const wasClick =
        Math.abs(e.clientX - mouseDownPosRef.current.x) < 5 &&
        Math.abs(e.clientY - mouseDownPosRef.current.y) < 5

      isDraggingRef.current = false
      scheduleEndInteraction()

      // Click-to-select light gizmo
      if (wasClick && cameraRef.current && overlayRef.current) {
        const lighting = useLightingStore.getState()
        if (!lighting.showLightGizmos || !lighting.lights.length) return

        const rect = overlayRef.current.getBoundingClientRect()
        const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
        const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1)

        const matrices = cameraRef.current.getMatrices()
        const invVP = invertMat4(multiplyMat4(matrices.projectionMatrix, matrices.viewMatrix))
        if (!invVP) return

        // Unproject near and far points to world space (WebGPU clip z = [0, 1])
        const nearWorld = transformPoint(invVP, [ndcX, ndcY, 0])
        const farWorld = transformPoint(invVP, [ndcX, ndcY, 1])

        const rayDir: [number, number, number] = [
          farWorld[0] - nearWorld[0],
          farWorld[1] - nearWorld[1],
          farWorld[2] - nearWorld[2],
        ]
        const rayLen = Math.sqrt(rayDir[0] ** 2 + rayDir[1] ** 2 + rayDir[2] ** 2)
        if (rayLen < 0.0001) return
        rayDir[0] /= rayLen
        rayDir[1] /= rayLen
        rayDir[2] /= rayLen

        const cp = matrices.cameraPosition
        const camPosX = cp.x,
          camPosY = cp.y,
          camPosZ = cp.z

        // Test ray-sphere intersection against each light
        let closestDist = Infinity
        let closestId: string | null = null
        const hitRadius = 0.5 // World-space hit radius (generous for easy clicking)

        for (const light of lighting.lights) {
          const lp = light.position
          // Vector from ray origin to sphere center
          const ocX = lp[0] - camPosX
          const ocY = lp[1] - camPosY
          const ocZ = lp[2] - camPosZ
          // Project onto ray direction
          const tca = ocX * rayDir[0] + ocY * rayDir[1] + ocZ * rayDir[2]
          if (tca < 0) continue // Behind camera
          // Perpendicular distance squared
          const ocLenSq = ocX ** 2 + ocY ** 2 + ocZ ** 2
          const d2 = ocLenSq - tca * tca
          // Scale hit radius by camera distance
          const dist = Math.sqrt(ocLenSq)
          const scaledRadius = Math.max(hitRadius, dist * 0.05)
          if (d2 > scaledRadius * scaledRadius) continue // Miss
          if (tca < closestDist) {
            closestDist = tca
            closestId = light.id
          }
        }

        if (closestId) {
          lighting.selectLight(closestId)
        } else {
          // Click on empty space deselects
          lighting.selectLight(null)
        }
      }
    },
    [scheduleEndInteraction]
  )

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Handle gizmo dragging
    const drag = gizmoDragRef.current
    if (drag && cameraRef.current && overlayRef.current) {
      // Require minimum mouse movement before actually dragging (prevents accidental drags)
      const movedX = Math.abs(e.clientX - mouseDownPosRef.current.x)
      const movedY = Math.abs(e.clientY - mouseDownPosRef.current.y)
      if (movedX < 3 && movedY < 3) return

      const rect = overlayRef.current.getBoundingClientRect()
      const matrices = cameraRef.current.getMatrices()
      const ray = computeMouseRay(e.clientX, e.clientY, rect, matrices)
      if (!ray) return

      const lighting = useLightingStore.getState()
      if (drag.kind.startsWith('translate-')) {
        // Translate axis drag
        const axisIdx = drag.kind === 'translate-x' ? 0 : drag.kind === 'translate-y' ? 1 : 2
        const axisDir: [number, number, number] = [0, 0, 0]
        axisDir[axisIdx] = 1

        const [currentT] = rayAxisClosest(ray.origin, ray.dir, drag.startLightPos, axisDir)
        const delta = currentT - drag.startAxisT

        const newPos: [number, number, number] = [...drag.startLightPos]
        newPos[axisIdx] += delta
        lighting.updateLight(drag.lightId, { position: newPos })
      } else if (drag.kind.startsWith('rotate-')) {
        // Rotate ring drag
        const axisIdx = drag.kind === 'rotate-x' ? 0 : drag.kind === 'rotate-y' ? 1 : 2
        const normal: [number, number, number] = [0, 0, 0]
        normal[axisIdx] = 1

        const hit = rayPlaneIntersect(ray.origin, ray.dir, normal, drag.startLightPos)
        if (hit) {
          const dx = hit[0] - drag.startLightPos[0]
          const dy = hit[1] - drag.startLightPos[1]
          const dz = hit[2] - drag.startLightPos[2]

          let currentAngle: number
          if (axisIdx === 0) currentAngle = Math.atan2(dz, dy)
          else if (axisIdx === 1) currentAngle = Math.atan2(dx, dz)
          else currentAngle = Math.atan2(dy, dx)

          // Normalize to [-PI, PI] to avoid discontinuity at atan2 boundary
          const rawDelta = currentAngle - drag.startAngle
          const deltaAngle = Math.atan2(Math.sin(rawDelta), Math.cos(rawDelta))

          const newRot: [number, number, number] = [...drag.startLightRot]
          newRot[axisIdx] += deltaAngle
          lighting.updateLight(drag.lightId, { rotation: newRot })
        }
      } else if (drag.kind === 'ground-target') {
        // Ground target drag
        const groundHit = rayPlaneIntersect(ray.origin, ray.dir, [0, 1, 0], [0, 0, 0])
        if (!groundHit) return

        if (drag.lightType === 'point') {
          // Point light: update X,Z position, keep Y
          lighting.updateLight(drag.lightId, {
            position: [groundHit[0], drag.startLightPos[1], groundHit[2]],
          })
        } else {
          // Spot/directional: compute direction from light to ground point, convert to rotation
          const lp = drag.startLightPos
          const dirX = groundHit[0] - lp[0]
          const dirY = groundHit[1] - lp[1]
          const dirZ = groundHit[2] - lp[2]
          const dirLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ)
          if (dirLen > 0.01) {
            const newRot = directionToRotation([dirX / dirLen, dirY / dirLen, dirZ / dirLen])
            lighting.updateLight(drag.lightId, { rotation: newRot })
          }
        }
      }
      return
    }

    if (!isDraggingRef.current || !cameraRef.current) return

    const dx = e.clientX - lastMouseRef.current.x
    const dy = e.clientY - lastMouseRef.current.y
    lastMouseRef.current = { x: e.clientX, y: e.clientY }

    if (dimensionRef.current === 2) {
      // 2D mode: pan instead of orbit (top-down orthographic view)
      const panSensitivity = 0.01
      cameraRef.current.pan(-dx * panSensitivity, dy * panSensitivity)
    } else {
      // 3D mode: orbit
      const sensitivity = 0.005
      cameraRef.current.orbit(-dx * sensitivity, -dy * sensitivity)
    }
  }, [])

  // Attach wheel listener with { passive: false } to allow preventDefault()
  // React's onWheel uses passive listeners by default, which blocks preventDefault()
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return

    const handleWheel = (e: WheelEvent) => {
      if (!cameraRef.current) return
      e.preventDefault()

      // Zoom sensitivity
      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9
      cameraRef.current.zoom(zoomFactor)

      startInteraction()
      scheduleEndInteraction()
    }

    overlay.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      overlay.removeEventListener('wheel', handleWheel)
    }
  }, [startInteraction, scheduleEndInteraction])

  // Initialize collector with adapter metadata for GPU name.
  useEffect(() => {
    const collector = statsCollectorRef.current
    collector.initialize(device.getAdapter())

    return () => {
      collector.reset()
    }
  }, [device])

  useEffect(() => {
    const capture = new WebGPUCanvasCapture(device.getDevice())

    graph.registerBeforeSubmitHook('screenshot-capture', ({ encoder, canvasTexture, size }) => {
      const state = useScreenshotCaptureStore.getState()
      if (state.status !== 'capturing') return

      capture.queueCapture({
        encoder,
        texture: canvasTexture,
        width: size.width,
        height: size.height,
        format: device.getFormat(),
        requestId: state.requestId,
        onSuccess: (dataUrl, requestId) => {
          useScreenshotCaptureStore.getState().setCapturedImage(dataUrl, requestId)
        },
        onError: (error, requestId) => {
          useScreenshotCaptureStore.getState().setError(error, requestId)
        },
      })
    })

    return () => {
      graph.unregisterBeforeSubmitHook('screenshot-capture')
      capture.dispose()
    }
  }, [device, graph])

  // Store subscriptions with shallow comparison
  const appearance = useAppearanceStore(useShallow(appearanceSelector))
  const environment = useEnvironmentStore(useShallow(environmentSelector))
  const performance_ = usePerformanceStore(useShallow(performanceSelector))
  const renderResolutionScale = usePerformanceStore((state) => state.renderResolutionScale)
  const postProcessing = usePostProcessingStore(useShallow(postProcessingSelector))
  // Schroedinger isosurface flag (compile-time shader selection, triggers renderer recreation)
  const schroedingerIsoEnabled = useExtendedObjectStore(schroedingerIsoSelector)
  const schroedingerCompile = useExtendedObjectStore(useShallow(schroedingerCompileSelector))
  // Schroedinger parameterValues for rotation updates (like WebGL SchroedingerMesh.tsx line 108)
  const schroedingerParamValues = useExtendedObjectStore(schroedingerSelector)

  // Rotation basis vectors for Schrodinger renderer (matches WebGL SchroedingerMesh.tsx lines 111, 912)
  // Computes rotated basis vectors from rotation store for N-D slicing
  const schroedingerRotation = useRotationUpdates({
    dimension,
    parameterValues: schroedingerParamValues,
  })

  // Cache for computed Schrodinger basis vectors and origin - updated in render loop, read by store getter
  // Using Float32Array to avoid creating new arrays every frame
  const schroedingerBasisCacheRef = useRef({
    basisX: new Float32Array(11), // MAX_DIM = 11
    basisY: new Float32Array(11),
    basisZ: new Float32Array(11),
    origin: new Float32Array(11),
  })
  // Pre-allocated work array for origin computation to avoid per-frame allocation
  const originValuesWorkRef = useRef(new Array<number>(11).fill(0))
  const cameraStoreCacheRef = useRef({
    viewMatrix: { elements: new Float32Array(16) },
    projectionMatrix: { elements: new Float32Array(16) },
    viewProjectionMatrix: { elements: new Float32Array(16) },
    inverseViewMatrix: { elements: new Float32Array(16) },
    inverseProjectionMatrix: { elements: new Float32Array(16) },
    position: { x: 0, y: 0, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    near: 0.1,
    far: 1000,
    fov: 60,
  })
  const extendedStoreCacheRef = useRef<{
    sourceState: ReturnType<typeof useExtendedObjectStore.getState> | null
    mergedState: unknown
  }>({
    sourceState: null,
    mergedState: null,
  })

  // Initialize passes - rebuild when dependencies change.
  // Uses selective rebuild: only the pass group whose config changed is rebuilt,
  // avoiding unnecessary GPU pipeline compilations.
  useEffect(() => {
    let cancelled = false
    const setupGeneration = ++setupGenerationRef.current
    const shouldAbortSetup = () => cancelled || setupGeneration !== setupGenerationRef.current
    const previousSetupTask = setupTaskRef.current

    // Build the full PassConfig from current values
    const fullConfig: PassConfig = {
      objectType,
      dimension,
      bloomEnabled: postProcessing.bloomEnabled,
      antiAliasingMethod: postProcessing.antiAliasingMethod,
      paperEnabled: postProcessing.paperEnabled,
      frameBlendingEnabled: postProcessing.frameBlendingEnabled,
      isosurface: schroedingerIsoEnabled,
      quantumMode: schroedingerCompile.quantumMode,
      termCount: schroedingerCompile.termCount,
      nodalEnabled: schroedingerCompile.nodalEnabled,
      phaseMaterialityEnabled: schroedingerCompile.phaseMaterialityEnabled,
      interferenceEnabled: schroedingerCompile.interferenceEnabled,
      uncertaintyBoundaryEnabled: schroedingerCompile.uncertaintyBoundaryEnabled,
      temporalReprojectionEnabled:
        schroedingerCompile.quantumMode === 'freeScalarField' ||
        schroedingerCompile.quantumMode === 'tdseDynamics' ||
        schroedingerCompile.quantumMode === 'becDynamics' ||
        schroedingerCompile.quantumMode === 'diracEquation'
          ? false
          : performance_.temporalReprojectionEnabled,
      eigenfunctionCacheEnabled: performance_.eigenfunctionCacheEnabled,
      analyticalGradientEnabled: performance_.analyticalGradientEnabled,
      fastEigenInterpolationEnabled: performance_.fastEigenInterpolationEnabled,
      renderResolutionScale: usePerformanceStore.getState().renderResolutionScale,
      colorAlgorithm: appearance.colorAlgorithm,
      diracFieldView: schroedingerCompile.diracFieldView,
      // Derive Pauli fieldView from the color algorithm so the writeGrid shader
      // encodes density channels to match the selected emission algorithm.
      pauliFieldView:
        objectType === 'pauliSpinor'
          ? pauliFieldViewForColorAlgorithm(appearance.colorAlgorithm)
          : schroedingerCompile.pauliFieldView,
      representation: schroedingerCompile.representation,
      openQuantumEnabled: schroedingerCompile.openQuantumEnabled,
      skyboxEnabled: environment.skyboxEnabled,
      skyboxMode: environment.skyboxMode as SkyboxMode,
      backgroundColor: environment.backgroundColor,
    }

    // Extract group-level configs for comparison
    const schrodingerConfig = extractSchrodingerConfig(fullConfig)
    const ppConfig = extractPPConfig(fullConfig)

    // Determine which groups changed
    const schrodingerChanged = !shallowEqual(lastSchrodingerConfigRef.current, schrodingerConfig)
    const ppChanged = !shallowEqual(lastPPConfigRef.current, ppConfig)
    const forceFullRebuildForModeTransition = shouldForceFullRebuildForQuantumModeTransition(
      lastSchrodingerConfigRef.current,
      schrodingerConfig
    )
    const isFullRebuild = needsFullRebuildRef.current || forceFullRebuildForModeTransition

    const setupPasses = async () => {
      // Serialize async pass setup to prevent stale setup races creating duplicate passes.
      await previousSetupTask
      if (shouldAbortSetup()) {
        return
      }

      currentObjectTypeRef.current = objectType

      // Always show the compilation overlay so the user knows what is displayed.
      // For a scientific application, deterministic feedback is more important than
      // seamless background swaps — the user must know when the view has updated.
      const perfStore = usePerformanceStore.getState()

      perfStore.setShaderCompiling('pipeline', true)
      await waitForPaint()
      if (shouldAbortSetup()) {
        usePerformanceStore.getState().setShaderCompiling('pipeline', false)
        return
      }
      perfStore.resetRefinement()

      try {
        if (isFullRebuild) {
          // Full rebuild: clear everything, set up from scratch
          graph.clearPasses()
          if (shouldAbortSetup()) return

          setupSharedResources(graph, fullConfig)
          if (shouldAbortSetup()) return

          await setupSchrodingerPasses(graph, fullConfig, shouldAbortSetup)
          if (shouldAbortSetup()) return

          await setupPPPasses(graph, fullConfig, shouldAbortSetup)
        } else if (schrodingerChanged && ppChanged) {
          // Both groups changed — warm swap Schrodinger, then rebuild PP
          // Pre-swap: only ADD temporal resources (old passes keep their resources)
          ensureTemporalResources(graph, fullConfig)
          if (shouldAbortSetup()) return

          // Warm swap: old Schrodinger renders while new one compiles
          await warmSwapSchrodingerPasses(graph, fullConfig, shouldAbortSetup)
          if (shouldAbortSetup()) return

          // Post-swap: safe to remove stale resources — new pass is in place
          removeStaleTemporalResources(graph, fullConfig)
          cleanupSchrodingerPasses(graph, fullConfig)
          cleanupPPPasses(graph, fullConfig)

          await setupPPPasses(graph, fullConfig, shouldAbortSetup)
        } else if (schrodingerChanged) {
          // Only Schrodinger group changed — warm swap (old pass renders during compilation)
          // Pre-swap: only ADD temporal resources (old passes keep their resources)
          ensureTemporalResources(graph, fullConfig)
          if (shouldAbortSetup()) return

          // Warm swap: old Schrodinger renders while new one compiles
          await warmSwapSchrodingerPasses(graph, fullConfig, shouldAbortSetup)
          if (shouldAbortSetup()) return

          // Post-swap: safe to remove stale resources — new pass is in place
          removeStaleTemporalResources(graph, fullConfig)
          cleanupSchrodingerPasses(graph, fullConfig)
        } else if (ppChanged) {
          // Only PP group changed — skip Schrodinger pipeline compilations
          cleanupPPPasses(graph, fullConfig)
          if (shouldAbortSetup()) return

          await setupPPPasses(graph, fullConfig, shouldAbortSetup)
        }
      } catch (err) {
        console.error('[WebGPUScene] CRITICAL: pass setup failed:', err)
        // Recovery: force full rebuild on next attempt.
        // Return early — do NOT update config tracking or compile graph,
        // so the next config change triggers a proper full rebuild.
        needsFullRebuildRef.current = true
        lastSchrodingerConfigRef.current = null
        lastPPConfigRef.current = null
        usePerformanceStore.getState().setShaderCompiling('pipeline', false)
        // Compile the graph to render whatever old passes remain
        graph.compile()
        return
      } finally {
        usePerformanceStore.getState().setShaderCompiling('pipeline', false)
      }

      if (shouldAbortSetup()) {
        // Abort mid-selective-rebuild: clear graph to prevent auto-compile
        // of partially mutated state, then force full rebuild on next attempt.
        if (import.meta.env.DEV) {
          console.warn(`[WebGPUScene] ABORT mid-rebuild (gen=${setupGeneration}), clearing graph`)
        }
        graph.clearPasses()
        needsFullRebuildRef.current = true
        lastSchrodingerConfigRef.current = null
        lastPPConfigRef.current = null
        return
      }

      // Compile the graph
      graph.compile()

      // Update config tracking on success ONLY — not after error
      needsFullRebuildRef.current = false
      lastSchrodingerConfigRef.current = { ...schrodingerConfig }
      lastPPConfigRef.current = { ...ppConfig }

      // Force-sync canvas pixel dimensions and graph/pool size after rebuild.
      if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
        const renderScale = usePerformanceStore.getState().renderResolutionScale
        const effectiveDpr = window.devicePixelRatio * renderScale
        const w = Math.floor(canvas.clientWidth * effectiveDpr)
        const h = Math.floor(canvas.clientHeight * effectiveDpr)
        canvas.width = w
        canvas.height = h
        graph.setSize(w, h)
        if (cameraRef.current) {
          cameraRef.current.setAspect(w / h)
        }
      }
    }

    const setupTask = setupPasses().catch((err) => {
      console.error('[WebGPUScene] setupPasses task failed:', err)
      // Recovery: force full rebuild on next attempt
      needsFullRebuildRef.current = true
      lastSchrodingerConfigRef.current = null
      lastPPConfigRef.current = null
    })
    setupTaskRef.current = setupTask

    return () => {
      cancelled = true
    }
  }, [
    graph,
    objectType,
    dimension,
    postProcessing.bloomEnabled,
    postProcessing.antiAliasingMethod,
    postProcessing.paperEnabled,
    postProcessing.frameBlendingEnabled,
    canvas,
    environment.skyboxEnabled,
    environment.skyboxMode,
    environment.backgroundColor,
    appearance.colorAlgorithm,
    schroedingerIsoEnabled,
    schroedingerCompile.quantumMode,
    schroedingerCompile.termCount,
    schroedingerCompile.nodalEnabled,
    schroedingerCompile.phaseMaterialityEnabled,
    schroedingerCompile.interferenceEnabled,
    schroedingerCompile.uncertaintyBoundaryEnabled,
    schroedingerCompile.representation,
    schroedingerCompile.diracFieldView,
    schroedingerCompile.pauliFieldView,
    performance_.temporalReprojectionEnabled,
    performance_.eigenfunctionCacheEnabled,
    performance_.analyticalGradientEnabled,
    performance_.fastEigenInterpolationEnabled,
    schroedingerCompile.openQuantumEnabled,
  ])

  // Runtime scene clear-color update (avoids full pass rebuild for background color changes).
  useEffect(() => {
    updateScenePassBackgroundColor({
      graph,
      skyboxEnabled: environment.skyboxEnabled,
      backgroundColor: environment.backgroundColor,
    })
  }, [graph, environment.skyboxEnabled, environment.backgroundColor])

  // Runtime CAS sharpening update (avoids full pass rebuild for render resolution changes).
  useEffect(() => {
    updateToScreenPassSharpness({
      graph,
      renderResolutionScale,
    })
  }, [graph, renderResolutionScale])

  // Update camera aspect ratio when canvas size changes
  useEffect(() => {
    if (cameraRef.current && size.width > 0 && size.height > 0) {
      cameraRef.current.setAspect(size.width / size.height)
    }
  }, [size.width, size.height])

  // Reset camera to top-down view when switching to 2D mode
  useEffect(() => {
    if (dimension === 2 && cameraRef.current) {
      // Top-down orthographic-like view: camera looking straight down Z axis
      cameraRef.current.setPosition(0, 0, 8)
      cameraRef.current.setTarget(0, 0, 0)
    }
  }, [dimension])

  // Set up store getters for uniform updates
  useEffect(() => {
    graph.setStoreGetter('appearance', () => useAppearanceStore.getState())
    graph.setStoreGetter('environment', () => useEnvironmentStore.getState())
    graph.setStoreGetter('lighting', () => useLightingStore.getState())
    graph.setStoreGetter('performance', () => usePerformanceStore.getState())
    graph.setStoreGetter('postProcessing', () => usePostProcessingStore.getState())
    // Camera: provide actual matrices from WebGPUCamera (not OrbitControls state)
    // IMPORTANT: Sync camera aspect with graph render dimensions every frame.
    // The React context `size` and graph dimensions can desync (post-rebuild, resize race).
    // The graph width/height are the authoritative render dimensions.
    graph.setStoreGetter('camera', () => {
      if (!cameraRef.current) return null
      // Sync aspect ratio with graph render dimensions (authoritative source of truth)
      const graphW = graph.getWidth()
      const graphH = graph.getHeight()
      if (graphW > 0 && graphH > 0) {
        cameraRef.current.setAspect(graphW / graphH)
      }
      const matrices = cameraRef.current.getMatrices()
      const cameraStoreCache = cameraStoreCacheRef.current
      cameraStoreCache.viewMatrix.elements.set(matrices.viewMatrix)
      cameraStoreCache.projectionMatrix.elements.set(matrices.projectionMatrix)
      cameraStoreCache.viewProjectionMatrix.elements.set(matrices.viewProjectionMatrix)
      cameraStoreCache.inverseViewMatrix.elements.set(matrices.inverseViewMatrix)
      cameraStoreCache.inverseProjectionMatrix.elements.set(matrices.inverseProjectionMatrix)
      cameraStoreCache.position.x = matrices.cameraPosition.x
      cameraStoreCache.position.y = matrices.cameraPosition.y
      cameraStoreCache.position.z = matrices.cameraPosition.z
      // Camera target for 2D pan/zoom model matrix derivation
      const cameraState = cameraRef.current.getState()
      cameraStoreCache.target.x = cameraState.target[0]
      cameraStoreCache.target.y = cameraState.target[1]
      cameraStoreCache.target.z = cameraState.target[2]
      cameraStoreCache.near = matrices.cameraNear
      cameraStoreCache.far = matrices.cameraFar
      cameraStoreCache.fov = matrices.fov
      return cameraStoreCache
    })
    graph.setStoreGetter('animation', () => useAnimationStore.getState())
    // Extended store with computed basis vectors for Schrodinger
    // Cache merged object and only rebuild when source store reference changes.
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
  }, [graph, objectType])

  // Reusable Map for rotation updates (avoid allocating per frame)
  const rotationUpdatesRef = useRef<Map<string, number>>(new Map())

  const resetExportRuntime = useCallback((preserveAbortFlag = false) => {
    const runtime = exportRuntimeRef.current
    const abortRequested = preserveAbortFlag && runtime.abortRequested

    runtime.starting = false
    runtime.started = false
    runtime.processing = false
    runtime.finishing = false
    runtime.canceling = false
    runtime.abortRequested = abortRequested
    runtime.mode = null
    runtime.settings = null
    runtime.recorder = null
    runtime.rotationSnapshot = null
    runtime.originalCanvasWidth = 0
    runtime.originalCanvasHeight = 0
    runtime.originalCameraAspect = 1
    runtime.exportWidth = 0
    runtime.exportHeight = 0
    runtime.renderWidth = 0
    runtime.renderHeight = 0
    runtime.originalPerf = {
      progressiveRefinementEnabled: true,
      fractalAnimationLowQuality: true,
      renderResolutionScale: 1,
    }
    runtime.loop = createInitialExportLoopState()
  }, [])

  const restoreRuntimeState = useCallback(() => {
    const runtime = exportRuntimeRef.current

    const restoreWidth = runtime.originalCanvasWidth > 0 ? runtime.originalCanvasWidth : size.width
    const restoreHeight =
      runtime.originalCanvasHeight > 0 ? runtime.originalCanvasHeight : size.height

    if (restoreWidth > 0 && restoreHeight > 0) {
      canvas.width = restoreWidth
      canvas.height = restoreHeight
      graph.setSize(restoreWidth, restoreHeight)
    }

    if (cameraRef.current && runtime.originalCameraAspect > 0) {
      cameraRef.current.setAspect(runtime.originalCameraAspect)
    }

    const perfStore = usePerformanceStore.getState()
    perfStore.setProgressiveRefinementEnabled(runtime.originalPerf.progressiveRefinementEnabled)
    perfStore.setFractalAnimationLowQuality(runtime.originalPerf.fractalAnimationLowQuality)
    perfStore.setRenderResolutionScale(runtime.originalPerf.renderResolutionScale)
    perfStore.setRefinementStage('final')

    runtime.rotationSnapshot = null
  }, [canvas, graph, size.height, size.width])

  const triggerSegmentDownload = useCallback(
    (blob: Blob, segmentIndex: number, format: ExportSettings['format']) => {
      const ext = format === 'webm' ? 'webm' : 'mp4'
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `mdimension-${Date.now()}-part${segmentIndex}.${ext}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    },
    []
  )

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

        // Compute rotated origin from parameterValues (extra-dimension slice positions)
        // parameterValues[i] maps to dimension i+3 (dimensions 4+)
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
    [objectType, dimension, schroedingerRotation]
  )

  const executeSceneFrame = useCallback(
    (deltaTime: number) => {
      // Per-frame size sync: ensure drawing buffer matches CSS layout before painting.
      // ResizeObserver can lag by one frame on sudden layout changes (e.g. dev-tools toggle),
      // causing the old buffer to be stretched into the new CSS rect. Catching it here
      // guarantees the buffer is correct before every paint.
      // Skip during export — the canvas is sized to export dimensions and must not be overwritten.
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
    [canvas, graph, onFrame, size.height, size.width]
  )

  const handleExportError = useCallback(
    async (error: unknown) => {
      const runtime = exportRuntimeRef.current
      const exportStore = useExportStore.getState()

      if (runtime.recorder) {
        try {
          await runtime.recorder.cancel()
        } catch {
          runtime.recorder.dispose()
        } finally {
          runtime.recorder = null
        }
      }

      restoreRuntimeState()
      resetExportRuntime()

      exportStore.setEta(null)
      exportStore.setError(error instanceof Error ? error.message : 'Video export failed')
      exportStore.setStatus('error')
      exportStore.setIsExporting(false)
    },
    [resetExportRuntime, restoreRuntimeState]
  )

  const finishExport = useCallback(async () => {
    const runtime = exportRuntimeRef.current
    if (runtime.finishing || runtime.canceling || !runtime.mode || !runtime.settings) {
      return
    }

    runtime.finishing = true
    const exportStore = useExportStore.getState()
    let handledError = false
    let cleanedEarly = false

    try {
      if (runtime.abortRequested) {
        if (runtime.recorder) {
          try {
            await runtime.recorder.cancel()
          } catch {
            runtime.recorder.dispose()
          } finally {
            runtime.recorder = null
          }
        }

        restoreRuntimeState()
        resetExportRuntime()
        cleanedEarly = true

        if (!exportStore.isExporting) {
          exportStore.setStatus('idle')
        }
        return
      }

      exportStore.setStatus('encoding')
      const blob = runtime.recorder ? await runtime.recorder.finalize() : null

      if (runtime.mode === 'in-memory') {
        if (!blob) {
          throw new Error('No video output was produced for in-memory export')
        }
        const url = URL.createObjectURL(blob)
        exportStore.setPreviewUrl(url)
        exportStore.setProgress(1)
        exportStore.setCompletionDetails({ type: 'in-memory' })
        exportStore.setStatus('completed')
      } else if (runtime.mode === 'stream') {
        exportStore.setProgress(1)
        exportStore.setCompletionDetails({ type: 'stream' })
        exportStore.setStatus('completed')
      } else {
        if (blob) {
          triggerSegmentDownload(blob, runtime.loop.currentSegment, runtime.settings.format)
        }
        exportStore.setProgress(1)
        exportStore.setCompletionDetails({
          type: 'segmented',
          segmentCount: runtime.loop.currentSegment,
        })
        exportStore.setStatus('completed')
      }
    } catch (error) {
      handledError = true
      await handleExportError(error)
    } finally {
      if (runtime.recorder) {
        runtime.recorder.dispose()
      }
      runtime.recorder = null

      if (!handledError && !cleanedEarly && !runtime.canceling) {
        restoreRuntimeState()
        resetExportRuntime()
        exportStore.setIsExporting(false)
      }
    }
  }, [handleExportError, resetExportRuntime, restoreRuntimeState, triggerSegmentDownload])

  const cancelExport = useCallback(async () => {
    const runtime = exportRuntimeRef.current
    if (runtime.canceling) {
      return
    }

    runtime.abortRequested = true
    runtime.canceling = true

    const exportStore = useExportStore.getState()
    exportStore.setProgress(0)
    exportStore.setEta(null)

    try {
      if (runtime.recorder) {
        try {
          await runtime.recorder.cancel()
        } catch {
          runtime.recorder.dispose()
        } finally {
          runtime.recorder = null
        }
      }
    } finally {
      restoreRuntimeState()
      resetExportRuntime()
      exportStore.setStatus('idle')
    }
  }, [resetExportRuntime, restoreRuntimeState])

  const startExport = useCallback(async () => {
    const runtime = exportRuntimeRef.current
    if (runtime.starting || runtime.started || runtime.canceling || runtime.finishing) {
      return
    }

    const exportStore = useExportStore.getState()
    if (exportStore.status !== 'idle') {
      return
    }

    runtime.starting = true
    runtime.abortRequested = false

    exportStore.setProgress(0)
    exportStore.setEta(null)
    exportStore.setError(null)
    exportStore.setCompletionDetails(null)

    const settings = cloneExportSettings(exportStore.settings)
    const mode = resolveRuntimeExportMode(
      exportStore.exportModeOverride ?? exportStore.exportMode,
      exportStore.browserType,
      settings
    )
    runtime.mode = mode
    runtime.settings = settings

    let streamHandle: FileSystemFileHandle | undefined

    try {
      if (mode === 'stream') {
        if (!('showSaveFilePicker' in window)) {
          throw new Error(
            'File System Access API is not supported in this browser. Use Chrome/Edge or select another export mode.'
          )
        }

        exportStore.setStatus('rendering')

        try {
          const extension = settings.format === 'webm' ? '.webm' : '.mp4'
          const description = settings.format === 'webm' ? 'WebM Video' : 'MP4 Video'
          const mimeType = settings.format === 'webm' ? 'video/webm' : 'video/mp4'

          streamHandle = await window.showSaveFilePicker({
            suggestedName: `mdimension-${Date.now()}${extension}`,
            types: [
              {
                description,
                accept: { [mimeType]: [extension] },
              },
            ],
          })
        } catch (pickerError) {
          const err = pickerError as { name?: string }
          if (err?.name === 'AbortError') {
            exportStore.setIsExporting(false)
            exportStore.setStatus('idle')
            resetExportRuntime()
            return
          }
          throw pickerError
        }
      } else {
        exportStore.setStatus('rendering')
      }

      const perfStore = usePerformanceStore.getState()
      runtime.originalCanvasWidth = canvas.width
      runtime.originalCanvasHeight = canvas.height
      runtime.originalCameraAspect =
        cameraRef.current?.getState().aspect ||
        (size.width > 0 && size.height > 0 ? size.width / size.height : 1)
      runtime.originalPerf = {
        progressiveRefinementEnabled: perfStore.progressiveRefinementEnabled,
        fractalAnimationLowQuality: perfStore.fractalAnimationLowQuality,
        renderResolutionScale: perfStore.renderResolutionScale,
      }

      perfStore.setProgressiveRefinementEnabled(false)
      perfStore.setFractalAnimationLowQuality(false)
      perfStore.setRefinementStage('final')
      perfStore.setRenderResolutionScale(1)

      await waitForPaint()
      if (runtime.abortRequested) {
        restoreRuntimeState()
        resetExportRuntime()
        return
      }

      if (!Number.isFinite(settings.fps) || settings.fps <= 0) {
        throw new Error(`Invalid FPS: ${settings.fps}`)
      }
      if (!Number.isFinite(settings.duration) || settings.duration <= 0) {
        throw new Error(`Invalid duration: ${settings.duration}`)
      }
      if (!Number.isFinite(settings.bitrate) || settings.bitrate <= 0) {
        throw new Error(`Invalid bitrate: ${settings.bitrate}`)
      }

      const resolved = resolveExportDimensions(
        settings.resolution,
        settings.customWidth,
        settings.customHeight
      )
      const exportDimensions = ensureEvenDimensions(resolved.width, resolved.height)
      const maxTextureDimension2D = device.getCapabilities()?.maxTextureDimension2D ?? 4096
      const renderDimensions = computeRenderDimensions({
        exportWidth: exportDimensions.width,
        exportHeight: exportDimensions.height,
        originalAspect: runtime.originalCameraAspect,
        maxTextureDimension2D,
        crop: settings.crop,
      })

      runtime.exportWidth = exportDimensions.width
      runtime.exportHeight = exportDimensions.height
      runtime.renderWidth = renderDimensions.width
      runtime.renderHeight = renderDimensions.height

      canvas.width = renderDimensions.width
      canvas.height = renderDimensions.height
      graph.setSize(renderDimensions.width, renderDimensions.height)

      if (cameraRef.current) {
        if (settings.crop.enabled) {
          cameraRef.current.setAspect(runtime.originalCameraAspect)
        } else {
          cameraRef.current.setAspect(renderDimensions.width / renderDimensions.height)
        }
      }

      await waitForPaint()
      if (runtime.abortRequested) {
        restoreRuntimeState()
        resetExportRuntime()
        return
      }

      const totalFrames = Math.max(1, Math.ceil(settings.duration * settings.fps))
      const segmentDurationFrames =
        mode === 'segmented'
          ? computeSegmentDurationFrames({
              durationSeconds: settings.duration,
              fps: settings.fps,
              bitrateMbps: settings.bitrate,
            })
          : totalFrames

      runtime.loop = {
        phase: 'warmup',
        frameId: 0,
        warmupFrame: 0,
        startTime: performance.now(),
        totalFrames,
        frameDuration: 1 / settings.fps,
        exportStartTime: Date.now(),
        lastEtaUpdate: 0,
        mainStreamHandle: streamHandle,
        segmentDurationFrames,
        currentSegment: 1,
        framesInCurrentSegment: 0,
        segmentStartTimeVideo: 0,
      }

      if (mode !== 'stream') {
        const firstRecorderDuration =
          mode === 'segmented' ? segmentDurationFrames / settings.fps : settings.duration
        const recorder = new VideoRecorder(canvas, {
          width: runtime.exportWidth,
          height: runtime.exportHeight,
          fps: settings.fps,
          duration: firstRecorderDuration,
          totalDuration: settings.duration,
          bitrate: settings.bitrate,
          format: settings.format,
          codec: settings.codec,
          onProgress: (progress) => {
            if (mode !== 'segmented') {
              useExportStore.getState().setProgress(progress)
            }
          },
          hardwareAcceleration: settings.hardwareAcceleration,
          bitrateMode: settings.bitrateMode,
          textOverlay: settings.textOverlay,
          crop: settings.crop,
          rotation: settings.rotation,
        })
        await recorder.initialize()
        runtime.recorder = recorder
      }

      runtime.started = true
    } catch (error) {
      await handleExportError(error)
    } finally {
      runtime.starting = false
    }
  }, [
    canvas,
    device,
    graph,
    handleExportError,
    resetExportRuntime,
    restoreRuntimeState,
    size.height,
    size.width,
  ])

  const processExportBatch = useCallback(async () => {
    const runtime = exportRuntimeRef.current
    if (
      !runtime.started ||
      runtime.processing ||
      runtime.finishing ||
      runtime.canceling ||
      !runtime.mode ||
      !runtime.settings
    ) {
      return
    }

    runtime.processing = true

    try {
      const maxBlockingTimeMs = 30
      const batchStartMs = performance.now()
      const shouldYield = () => performance.now() - batchStartMs > maxBlockingTimeMs

      const loop = runtime.loop
      const settings = runtime.settings
      const mode = runtime.mode
      const exportStore = useExportStore.getState()

      while (loop.phase === 'warmup') {
        if (runtime.abortRequested) {
          await finishExport()
          return
        }

        if (loop.warmupFrame >= settings.warmupFrames) {
          if (mode === 'stream') {
            runtime.rotationSnapshot = new Map(useRotationStore.getState().rotations)

            const previewDuration = Math.min(3, settings.duration)
            loop.phase = 'preview'
            loop.frameId = 0
            loop.totalFrames = Math.max(1, Math.ceil(previewDuration * settings.fps))

            const previewRecorder = new VideoRecorder(canvas, {
              width: runtime.exportWidth,
              height: runtime.exportHeight,
              fps: settings.fps,
              duration: previewDuration,
              bitrate: settings.bitrate,
              format: settings.format,
              codec: settings.codec,
              hardwareAcceleration: settings.hardwareAcceleration,
              bitrateMode: settings.bitrateMode,
              textOverlay: settings.textOverlay,
              crop: settings.crop,
              rotation: settings.rotation,
            })
            await previewRecorder.initialize()
            runtime.recorder = previewRecorder
            exportStore.setStatus('previewing')
          } else {
            loop.phase = 'recording'
            loop.frameId = 0
          }
          continue
        }

        advanceSceneStateByDelta(loop.frameDuration)
        executeSceneFrame(loop.frameDuration)
        loop.warmupFrame++

        if (shouldYield()) {
          return
        }
      }

      while (loop.phase === 'preview') {
        if (runtime.abortRequested) {
          await finishExport()
          return
        }

        if (loop.frameId >= loop.totalFrames) {
          if (runtime.recorder) {
            const previewBlob = await runtime.recorder.finalize()
            if (previewBlob) {
              exportStore.setPreviewUrl(URL.createObjectURL(previewBlob))
            }
            runtime.recorder.dispose()
            runtime.recorder = null
          }

          loop.phase = 'recording'
          loop.frameId = 0
          loop.totalFrames = Math.max(1, Math.ceil(settings.duration * settings.fps))
          loop.startTime = performance.now()
          loop.exportStartTime = Date.now()
          loop.lastEtaUpdate = 0

          if (runtime.rotationSnapshot) {
            useRotationStore.getState().updateRotations(runtime.rotationSnapshot)
          }

          const mainRecorder = new VideoRecorder(canvas, {
            width: runtime.exportWidth,
            height: runtime.exportHeight,
            fps: settings.fps,
            duration: settings.duration,
            totalDuration: settings.duration,
            bitrate: settings.bitrate,
            format: settings.format,
            codec: settings.codec,
            streamHandle: loop.mainStreamHandle,
            onProgress: (progress) => exportStore.setProgress(progress),
            hardwareAcceleration: settings.hardwareAcceleration,
            bitrateMode: settings.bitrateMode,
            textOverlay: settings.textOverlay,
            crop: settings.crop,
            rotation: settings.rotation,
          })
          await mainRecorder.initialize()
          runtime.recorder = mainRecorder
          exportStore.setStatus('rendering')
          continue
        }

        advanceSceneStateByDelta(loop.frameDuration)
        executeSceneFrame(loop.frameDuration)

        if (runtime.recorder) {
          await runtime.recorder.captureFrame(loop.frameId * loop.frameDuration, loop.frameDuration)
        }
        loop.frameId++

        if (shouldYield()) {
          return
        }
      }

      while (loop.phase === 'recording' && loop.frameId < loop.totalFrames) {
        if (runtime.abortRequested) {
          await finishExport()
          return
        }

        if (mode === 'segmented' && loop.framesInCurrentSegment >= loop.segmentDurationFrames) {
          if (runtime.recorder) {
            const segmentBlob = await runtime.recorder.finalize()
            if (segmentBlob) {
              triggerSegmentDownload(segmentBlob, loop.currentSegment, settings.format)
            }
            runtime.recorder.dispose()
            runtime.recorder = null
          }

          loop.currentSegment += 1
          loop.framesInCurrentSegment = 0
          loop.segmentStartTimeVideo = loop.frameId * loop.frameDuration

          const remainingFrames = loop.totalFrames - loop.frameId
          const nextSegmentFrames = Math.min(loop.segmentDurationFrames, remainingFrames)

          const nextRecorder = new VideoRecorder(canvas, {
            width: runtime.exportWidth,
            height: runtime.exportHeight,
            fps: settings.fps,
            duration: nextSegmentFrames / settings.fps,
            totalDuration: settings.duration,
            bitrate: settings.bitrate,
            format: settings.format,
            codec: settings.codec,
            hardwareAcceleration: settings.hardwareAcceleration,
            bitrateMode: settings.bitrateMode,
            textOverlay: settings.textOverlay,
            crop: settings.crop,
            rotation: settings.rotation,
          })
          await nextRecorder.initialize()
          runtime.recorder = nextRecorder
        }

        advanceSceneStateByDelta(loop.frameDuration)
        executeSceneFrame(loop.frameDuration)

        const globalVideoTime = loop.frameId * loop.frameDuration
        const relativeVideoTime = globalVideoTime - loop.segmentStartTimeVideo

        if (runtime.recorder) {
          await runtime.recorder.captureFrame(
            relativeVideoTime,
            loop.frameDuration,
            globalVideoTime
          )
        }

        loop.frameId++
        loop.framesInCurrentSegment++

        if (shouldYield()) {
          break
        }
      }

      if (loop.phase === 'recording') {
        const nowMs = Date.now()
        if (nowMs - loop.lastEtaUpdate > 500) {
          const framesDone = loop.frameId
          const framesTotal = loop.totalFrames
          const progress = framesTotal > 0 ? framesDone / framesTotal : 0
          exportStore.setProgress(progress)

          if (framesDone > 0) {
            const elapsedMs = nowMs - loop.exportStartTime
            const msPerFrame = elapsedMs / framesDone
            const remainingMs = (framesTotal - framesDone) * msPerFrame
            const remainingSec = Math.ceil(remainingMs / 1000)
            exportStore.setEta(`${remainingSec}s`)
          }
          loop.lastEtaUpdate = nowMs
        }

        if (loop.frameId >= loop.totalFrames) {
          await finishExport()
        }
      }
    } catch (error) {
      await handleExportError(error)
    } finally {
      runtime.processing = false
    }
  }, [
    advanceSceneStateByDelta,
    canvas,
    executeSceneFrame,
    finishExport,
    handleExportError,
    triggerSegmentDownload,
  ])

  // Animation loop
  const renderFrame = useCallback(() => {
    const runtime = exportRuntimeRef.current
    const exportStore = useExportStore.getState()
    const runtimeActive = isExportRuntimeActive(runtime)

    if (
      exportStore.isExporting &&
      exportStore.status === 'idle' &&
      !runtime.starting &&
      !runtime.started
    ) {
      void startExport()
    } else if (!exportStore.isExporting && runtimeActive && !runtime.canceling) {
      void cancelExport()
    }

    if (runtimeActive) {
      if (runtime.started && !runtime.processing && !runtime.finishing && !runtime.canceling) {
        void processExportBatch()
      }
      animationFrameRef.current = requestAnimationFrame(renderFrame)
      return
    }

    const now = performance.now()
    const fpsDecision = evaluateFpsLimit({
      nowMs: now,
      throttleAnchorMs: fpsThrottleAnchorRef.current,
      maxFps: performance_.maxFps,
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
  }, [
    advanceSceneStateByDelta,
    cancelExport,
    executeSceneFrame,
    performance_.maxFps,
    processExportBatch,
    startExport,
  ])

  // Start/stop animation loop
  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(renderFrame)
    const runtime = exportRuntimeRef.current

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }

      // Clear interaction debounce timer
      if (interactionTimerRef.current !== null) {
        window.clearTimeout(interactionTimerRef.current)
        interactionTimerRef.current = null
      }

      const shouldRestoreRuntime = isExportRuntimeActive(runtime) || runtime.recorder !== null
      runtime.abortRequested = true
      if (runtime.recorder) {
        runtime.recorder.dispose()
        runtime.recorder = null
      }
      if (shouldRestoreRuntime) {
        restoreRuntimeState()
        resetExportRuntime()
      }
    }
  }, [renderFrame, resetExportRuntime, restoreRuntimeState])

  // Render event capture overlay for camera controls
  return React.createElement('div', {
    ref: overlayRef,
    style: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      cursor: isDraggingRef.current ? 'grabbing' : 'grab',
    },
    onMouseDown: handleMouseDown,
    onMouseUp: handleMouseUp,
    onMouseMove: handleMouseMove,
    onMouseLeave: handleMouseUp,
  })
}

// ============================================================================
// Pass Setup
// ============================================================================

// Pass setup, config types, and lifecycle extracted to scenePassSetup.ts
import {
  type PassConfig,
  type SchrodingerPassConfig,
  type PPPassConfig,
  executeFrameAndCollectMetrics,
  extractSchrodingerConfig,
  extractPPConfig,
  shallowEqual,
  shouldForceFullRebuildForQuantumModeTransition,
  computeCasSharpnessFromRenderScale,
  updateScenePassBackgroundColor,
  updateToScreenPassSharpness,
  setupSharedResources,
  setupSchrodingerPasses,
  setupPPPasses,
  warmSwapSchrodingerPasses,
  cleanupSchrodingerPasses,
  cleanupPPPasses,
  ensureTemporalResources,
  removeStaleTemporalResources,
  setupRenderPasses,
  createObjectRenderer,
  pauliFieldViewForColorAlgorithm,
} from './scenePassSetup'
// Re-export for backward compat (tests import from this module path)
export {
  executeFrameAndCollectMetrics,
  shouldForceFullRebuildForQuantumModeTransition,
  computeCasSharpnessFromRenderScale,
  updateScenePassBackgroundColor,
  updateToScreenPassSharpness,
  setupRenderPasses,
  createObjectRenderer,
}
export type { PassConfig }

export default WebGPUScene
