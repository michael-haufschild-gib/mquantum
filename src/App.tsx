/**
 * Main Application Component
 * N-Dimensional Object Visualizer
 *
 * Renders Schroedinger quantum objects using WebGPU.
 */

import { PerformanceMonitor } from '@/components/canvas/PerformanceMonitor'
import { RefinementIndicator } from '@/components/canvas/RefinementIndicator'
import { EditorLayout } from '@/components/layout/EditorLayout'
import { MsgBox } from '@/components/overlays/MsgBox'
import { ScreenshotModal } from '@/components/overlays/ScreenshotModal'
import { ShaderCompilationOverlay } from '@/components/overlays/ShaderCompilationOverlay'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { ToastProvider } from '@/contexts/ToastContext'
import { useCachePrewarming } from '@/hooks/useCachePrewarming'
import { useDeviceCapabilities } from '@/hooks/useDeviceCapabilities'
import { useDynamicFavicon } from '@/hooks/useDynamicFavicon'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useUrlState } from '@/hooks/useUrlState'
import { useWebGPUSupport } from '@/hooks/useWebGPUSupport'
import { WebGPUCanvas, WebGPUScene } from '@/rendering/webgpu'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { useUIStore } from '@/stores/uiStore'
import { domMax, LazyMotion } from 'motion/react'
import { useCallback, useMemo } from 'react'

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

  // Detect device capabilities (GPU tier) and apply mobile defaults
  useDeviceCapabilities()

  // Detect WebGPU support
  const { isSupported, isComplete } = useWebGPUSupport()

  // Get current geometry for WebGPU scene
  const objectType = useGeometryStore((state) => state.objectType)
  const dimension = useGeometryStore((state) => state.dimension)

  // Get background color from visual store
  const backgroundColor = useAppearanceStore((state) => state.backgroundColor)

  // Get performance monitor state
  const showPerfMonitor = useUIStore((state) => state.showPerfMonitor)
  const renderResolutionScale = usePerformanceStore((state) => state.renderResolutionScale)

  const baseDpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio
  const scaledDpr = baseDpr * renderResolutionScale

  // Stable callback to prevent WebGPUCanvas init effect from re-running on every render
  const handleWebGPUError = useCallback((error: Error) => {
    console.error('[App] WebGPU error:', error)
  }, [])

  const canvasStyle = useMemo(() => ({ background: backgroundColor }), [backgroundColor])

  return (
    <EditorLayout>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {/* Performance indicators */}
        <RefinementIndicator position="bottom-right" />

        {!isComplete ? (
          // Detection in progress
          <div className="flex h-full w-full items-center justify-center text-neutral-400 bg-black/90">
            Detecting WebGPU support...
          </div>
        ) : isSupported ? (
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
              style={canvasStyle}
              dpr={scaledDpr}
              onError={handleWebGPUError}
            >
              <WebGPUScene objectType={objectType} dimension={dimension} />
            </WebGPUCanvas>
          </ErrorBoundary>
        ) : (
          // WebGPU not supported
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-black/90 text-neutral-300">
            <div className="text-xl font-semibold text-red-400">WebGPU Required</div>
            <div className="max-w-md text-center text-sm text-neutral-400">
              This application requires WebGPU support. Please use a browser with WebGPU enabled
              (Chrome 113+, Edge 113+, or Safari 18+).
            </div>
          </div>
        )}

        {/* Global Message Box Overlay */}
        <MsgBox />

        {showPerfMonitor && <PerformanceMonitor />}

        {/* Screenshot Preview Modal */}
        <ScreenshotModal />

        {/* Shader Compilation Overlay */}
        <ShaderCompilationOverlay />
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
