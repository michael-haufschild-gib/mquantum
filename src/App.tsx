/**
 * Main Application Component
 * N-Dimensional Object Visualizer
 *
 * Supports both traditional polytopes and extended objects:
 * - Standard: Hypercube, Simplex, Cross-polytope
 * - Extended: Root System, Clifford Torus, Mandelbulb
 *
 * Unified Architecture:
 * All rendering uses useFrame-based high-performance pipelines that bypass React
 * re-renders during animation. UnifiedRenderer routes to the appropriate renderer:
 * - MandelbulbMesh: For raymarched 3D/4D surfaces (Mandelbulb/Mandelbulb)
 * - PolytopeScene: For 3D+ projected wireframes and faces
 */

import { PerformanceMonitor } from '@/components/canvas/PerformanceMonitor'
import { RefinementIndicator } from '@/components/canvas/RefinementIndicator'
import { EditorLayout } from '@/components/layout/EditorLayout'
import { ContextLostOverlay } from '@/components/overlays/ContextLostOverlay'
import { MsgBox } from '@/components/overlays/MsgBox'
import { ScreenshotModal } from '@/components/overlays/ScreenshotModal'
import { ShaderCompilationOverlay } from '@/components/overlays/ShaderCompilationOverlay'
import { WebGL2UnsupportedOverlay } from '@/components/overlays/WebGL2UnsupportedOverlay'
import { WebGPUFallbackNotification } from '@/components/overlays/WebGPUFallbackNotification'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { GeometryLoadingIndicator } from '@/components/ui/GeometryLoadingIndicator'
import { ToastProvider } from '@/contexts/ToastContext'
import { ProdDevDiagnostics } from '@/dev-tools/ProdDevDiagnostics'
import { useAnimationLoop } from '@/hooks/useAnimationLoop'
import { useCachePrewarming } from '@/hooks/useCachePrewarming'
import { useDeviceCapabilities } from '@/hooks/useDeviceCapabilities'
import { useDynamicFavicon } from '@/hooks/useDynamicFavicon'
import { useFaceDepths } from '@/hooks/useFaceDepths'
import { useFaceDetection } from '@/hooks/useFaceDetection'
import { useGeometryGenerator } from '@/hooks/useGeometryGenerator'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useSyncedDimension } from '@/hooks/useSyncedDimension'
import { useToast } from '@/hooks/useToast'
import { useUrlState } from '@/hooks/useUrlState'
import { useWebGPUSupport } from '@/hooks/useWebGPUSupport'
import type { Vector3D, VectorND } from '@/lib/math/types'
import { FpsController } from '@/rendering/controllers/FpsController'
import { PerformanceStatsCollector } from '@/rendering/controllers/PerformanceStatsCollector'
import { ScreenshotCaptureController } from '@/rendering/controllers/ScreenshotCaptureController'
import { VideoExportController } from '@/rendering/controllers/VideoExportController'
import { ContextEventHandler } from '@/rendering/core/ContextEventHandler'
import { UniformLifecycleController } from '@/rendering/core/UniformLifecycleController'
import { VisibilityHandler } from '@/rendering/core/VisibilityHandler'
import { initializeGlobalMRT } from '@/rendering/graph/MRTStateManager'
import { Scene } from '@/rendering/Scene'
import { WebGPUCanvas, WebGPUScene } from '@/rendering/webgpu'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useLightingStore } from '@/stores/lightingStore'
import { useUIStore } from '@/stores/uiStore'
import { RECOVERY_STATE_KEY, RECOVERY_STATE_MAX_AGE } from '@/stores/webglContextStore'
import { Html } from '@react-three/drei'
import { Canvas, events as createDomEvents, type RootState } from '@react-three/fiber'
import type { ComputeFunction } from '@react-three/fiber/dist/declarations/src/core/events'
import { domMax, LazyMotion } from 'motion/react'
import { useCallback, useEffect, useMemo } from 'react'
import * as THREE from 'three'

/**
 * Custom compute function that only sets up raycasting on click/pointer-down events.
 * This dramatically reduces CPU usage by skipping raycasting on every mouse move.
 *
 * Default R3F behavior: Raycasts on EVERY pointermove to detect hover states.
 * Our behavior: Only raycast when user actually clicks/presses.
 *
 * This is safe because our only interactive 3D element (LightGizmo) only needs
 * click events, not hover states.
 */
const clickOnlyCompute: ComputeFunction = (event, state) => {
  // Skip raycasting setup for move events - this is the key optimization
  // By not updating pointer/raycaster, the expensive intersectObjects() call is avoided
  if (event.type === 'pointermove' || event.type === 'mousemove') {
    return
  }

  // For click/pointerdown/pointerup events, compute normally
  const { width, height, top, left } = state.size
  const x = event.clientX - left
  const y = event.clientY - top

  state.pointer.set((x / width) * 2 - 1, -(y / height) * 2 + 1)
  state.raycaster.setFromCamera(state.pointer, state.camera)
}

/**
 * Extract 3D positions from N-D vertices for ground plane bounds calculation.
 * This is much cheaper than full transform + projection pipeline.
 * @param vertices - N-dimensional vertices to extract positions from
 * @returns Array of 3D positions extracted from the first 3 coordinates
 */
function extractBasePositions(vertices: VectorND[]): Vector3D[] {
  return vertices.map((v) => [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0] as Vector3D)
}

/**
 * Main visualization component that handles the render pipeline.
 *
 * Unified architecture: All renderers use useFrame for GPU-based transformations,
 * reading from stores via getState() to bypass React's render cycle.
 * @returns The visualization scene with all renderers and effects
 */
function Visualizer() {
  // 1. Synchronize dimensions across stores
  useSyncedDimension()

  // 2. Run animation loops
  useAnimationLoop()

  // 3. Generate geometry based on store state (async for Wythoff polytopes)
  const {
    geometry,
    dimension,
    objectType,
    isLoading: geometryLoading,
    progress,
    stage,
  } = useGeometryGenerator()

  // 4. Detect faces for surface rendering (polytopes only, async for convex-hull)
  const { faces, isLoading: faceLoading } = useFaceDetection(geometry, objectType)

  // Combined loading state for any async operation
  const isLoading = geometryLoading || faceLoading

  // 5. Extract base 3D positions for ground plane bounds (no transform needed)
  // Ground plane only recalculates on vertex count change, not during animation
  const basePositions = useMemo(
    () => (geometry ? extractBasePositions(geometry.vertices) : []),
    [geometry]
  )

  // 6. Compute per-face depth values for palette color variation (polytopes only)
  const faceDepths = useFaceDepths(geometry?.vertices ?? [], faces, dimension)

  // Minimum bounding radius for ground plane positioning
  // Currently all objects use the same radius for consistent ground placement
  const minBoundingRadius = 1.5

  return (
    <>
      {/* Loading indicator for async geometry or face detection */}
      {isLoading && (
        <Html fullscreen style={{ pointerEvents: 'none' }}>
          <GeometryLoadingIndicator
            isLoading={true}
            progress={geometryLoading ? progress : 100}
            stage={geometryLoading ? stage : 'faces'}
          />
        </Html>
      )}
      {/* Always render Scene to ensure proper WebGL cleanup during transitions.
          When geometry is null, Scene renders environment only (no object). */}
      <Scene
        geometry={geometry}
        dimension={dimension}
        objectType={objectType}
        faces={faces}
        faceDepths={faceDepths}
        projectedVertices={basePositions}
        minBoundingRadius={minBoundingRadius}
      />
    </>
  )
}

/**
 * Hook to restore state after a failed WebGL context recovery.
 * Checks localStorage for saved state and restores it if found.
 * @returns void
 */
function useStateRecovery() {
  const { addToast } = useToast()

  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECOVERY_STATE_KEY)
      if (saved) {
        const state = JSON.parse(saved) as {
          dimension?: number
          savedAt?: number
        }

        // Only restore if saved within the max age window
        if (state.savedAt && Date.now() - state.savedAt < RECOVERY_STATE_MAX_AGE) {
          // Restore state to stores
          if (state.dimension) {
            useGeometryStore.getState().setDimension(state.dimension)
          }

          addToast('Session restored from recovery', 'success')
        }

        // Clean up regardless of whether we restored
        localStorage.removeItem(RECOVERY_STATE_KEY)
      }
    } catch (error) {
      // Recovery is best-effort, but log for debugging
      if (import.meta.env.DEV) {
        console.error('[App] State recovery failed:', error)
      }
      localStorage.removeItem(RECOVERY_STATE_KEY)
    }
  }, [addToast])
}

/**
 * Inner app content that requires ToastProvider context.
 * @returns The main application layout with all UI components
 */
function AppContent() {
  // Initialize state from URL parameters (must be first)
  useUrlState()

  // Pre-warm geometry cache from IndexedDB (non-blocking)
  useCachePrewarming()

  // Enable keyboard shortcuts
  useKeyboardShortcuts()

  // Dynamic Favicon
  useDynamicFavicon()

  // Restore state after WebGL context recovery failure
  useStateRecovery()

  // Detect device capabilities (WebGL2 + GPU tier) and apply mobile defaults
  const { webgl2Supported } = useDeviceCapabilities()

  // Detect WebGPU support and manage renderer mode
  const { mode: rendererMode } = useWebGPUSupport()

  // Get current geometry for WebGPU scene
  const objectType = useGeometryStore((state) => state.objectType)
  const dimension = useGeometryStore((state) => state.dimension)

  // Get background color from visual store (PRD Story 6 AC7)
  const backgroundColor = useAppearanceStore((state) => state.backgroundColor)

  // Get selectLight action for click-to-deselect
  const selectLight = useLightingStore((state) => state.selectLight)

  // Get performance monitor state
  const showPerfMonitor = useUIStore((state) => state.showPerfMonitor)

  // Handle clicks on empty space to deselect lights
  const handlePointerMissed = () => {
    selectLight(null)
  }

  // ==========================================================================
  // CRITICAL: Initialize MRT state management on Canvas creation
  // ==========================================================================
  // This runs BEFORE any child component mounts, ensuring the renderer's
  // setRenderTarget is patched before any rendering occurs.
  // Without this, CubeCamera.update() in ProceduralSkyboxCapture would render
  // to MRT targets before drawBuffers is properly configured, causing
  // GL_INVALID_OPERATION: Active draw buffers with missing fragment shader outputs
  const handleCanvasCreated = useCallback((state: RootState) => {
    initializeGlobalMRT(state.gl)

    if (import.meta.env.DEV) {
      console.log('[App] Canvas created, MRT state manager initialized')
    }
  }, [])

  return (
    <EditorLayout>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {/* Performance indicators */}
        <RefinementIndicator position="bottom-right" />

        {webgl2Supported ? (
          rendererMode === 'webgpu' ? (
            // WebGPU Renderer
            <ErrorBoundary
              fallback={
                <div className="flex h-full w-full items-center justify-center text-red-400 bg-black/90">
                  WebGPU Renderer Crashed. Reload page.
                </div>
              }
            >
              <WebGPUCanvas
                className="absolute inset-0"
                style={{ background: backgroundColor }}
                onError={(error) => {
                  console.error('[App] WebGPU error:', error)
                }}
              >
                <WebGPUScene objectType={objectType} dimension={dimension} />
              </WebGPUCanvas>
            </ErrorBoundary>
          ) : (
            // WebGL Renderer (default)
            <ErrorBoundary
              fallback={
                <div className="flex h-full w-full items-center justify-center text-red-400 bg-black/90">
                  Renderer Crashed. Reload page.
                </div>
              }
            >
              <Canvas
                id="main-webgl-canvas"
                frameloop="never"
                camera={{
                  position: [0, 3.125, 7.5], // Closer angled view for prominent Interstellar look (25% further out)
                  fov: 60,
                }}
                // Custom event system: Only raycast on click, not on mouse move.
                // This eliminates expensive per-frame raycasting during mouse movement.
                events={(store) => ({ ...createDomEvents(store), compute: clickOnlyCompute })}
                raycaster={{
                  // Enable DEBUG layer for raycasting so gizmos on layer 4 are interactive.
                  // The raycaster's layers determine which objects receive pointer events.
                  // By default only layer 0 is enabled; we add layer 4 (DEBUG) for gizmo interaction.
                  layers: (() => {
                    const layers = new THREE.Layers()
                    layers.enableAll() // Enable all layers for comprehensive event handling
                    return layers
                  })(),
                }}
                shadows="soft"
                flat
                gl={{ alpha: false, antialias: false, preserveDrawingBuffer: false }}
                style={{ background: backgroundColor }}
                onPointerMissed={handlePointerMissed}
                onCreated={handleCanvasCreated}
              >
                {/* WebGL Context Management */}
                <ContextEventHandler />
                <VisibilityHandler />
                <UniformLifecycleController />

                <FpsController />
                <ScreenshotCaptureController />
                <VideoExportController />
                <Visualizer />
                <PerformanceStatsCollector />
                {import.meta.env.DEV && <ProdDevDiagnostics />}
              </Canvas>
            </ErrorBoundary>
          )
        ) : (
          <WebGL2UnsupportedOverlay />
        )}

        {/* Context Lost Overlay - shown when WebGL context is lost */}
        <ContextLostOverlay />

        {/* Global Message Box Overlay */}
        <MsgBox />

        {/* Shader Compilation Overlay - shown during shader compilation */}
        <ShaderCompilationOverlay />

        {/* WebGPU Fallback Notification - shown when WebGPU isn't available */}
        <WebGPUFallbackNotification />

        {showPerfMonitor && <PerformanceMonitor />}

        {/* Screenshot Preview Modal */}
        <ScreenshotModal />
      </div>
    </EditorLayout>
  )
}

/**
 * Main App Container
 * @returns The root application component wrapped in providers
 */
function App() {
  return (
    <LazyMotion features={domMax} strict>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </LazyMotion>
  )
}

export default App
