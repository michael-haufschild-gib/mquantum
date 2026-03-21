/**
 * Main Application Component
 * N-Dimensional Quantum Physics Visualizer
 *
 * Renders Schroedinger quantum wavefunctions using WebGPU.
 */

import { domMax, LazyMotion, MotionConfig } from 'motion/react'
import { useMemo } from 'react'

import { PerformanceMonitor } from '@/components/canvas/PerformanceMonitor'
import { QuantumCarpetPanel } from '@/components/canvas/QuantumCarpetPanel'
import { RefinementIndicator } from '@/components/canvas/RefinementIndicator'
import { EditorLayout } from '@/components/layout/EditorLayout'
import { MsgBox } from '@/components/overlays/MsgBox'
import { ScreenshotModal } from '@/components/overlays/ScreenshotModal'
import { ShaderCompilationOverlay } from '@/components/overlays/ShaderCompilationOverlay'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { ToastProvider } from '@/contexts/ToastContext'
import { useDeviceCapabilities } from '@/hooks/useDeviceCapabilities'
import { useDynamicFavicon } from '@/hooks/useDynamicFavicon'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useUrlState } from '@/hooks/useUrlState'
import { useWebGPUSupport } from '@/hooks/useWebGPUSupport'
import { logger } from '@/lib/logger'
import { WebGPUCanvas, WebGPUScene } from '@/rendering/webgpu'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { useUIStore } from '@/stores/uiStore'

/** Stable error handler for WebGPU initialization failures. */
function handleWebGPUErrorStable(error: Error) {
  logger.error('[App] WebGPU error:', error)
}

/**
 * Inner app content that requires ToastProvider context.
 * @returns The main application layout with all UI components
 */
function AppContent() {
  // Initialize state from URL parameters (must be first)
  useUrlState()

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

  const handleWebGPUError = handleWebGPUErrorStable

  const canvasStyle = useMemo(() => ({ background: backgroundColor }), [backgroundColor])

  return (
    <EditorLayout>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {/* Performance indicators */}
        <RefinementIndicator position="bottom-right" />

        {!isComplete ? (
          // Detection in progress
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-black/95">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">MDimension</h1>
            <div className="flex items-center gap-3 text-sm text-text-tertiary">
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="2"
                  opacity="0.25"
                />
                <path
                  d="M12 2a10 10 0 0 1 10 10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              Initializing WebGPU renderer...
            </div>
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
          <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-black/95 text-text-secondary px-6">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">MDimension</h1>
            <div className="max-w-md text-center space-y-4">
              <p className="text-sm text-text-tertiary">
                This application requires{' '}
                <span className="text-text-primary font-medium">WebGPU</span> for real-time quantum
                wavefunction rendering. Your browser does not support WebGPU.
              </p>
              <div className="glass-panel border border-border-default rounded-lg p-4 text-left space-y-2">
                <p className="text-xs font-semibold text-text-primary">Supported browsers:</p>
                <ul className="text-xs text-text-tertiary space-y-1">
                  <li>Chrome 113+ (desktop &amp; Android)</li>
                  <li>Edge 113+</li>
                  <li>Safari 18+ (macOS Sequoia / iOS 18)</li>
                  <li>
                    Firefox — enable via <code className="text-text-secondary">about:config</code>{' '}
                    &rarr; <code className="text-text-secondary">dom.webgpu.enabled</code>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Global Message Box Overlay */}
        <MsgBox />

        {showPerfMonitor && <PerformanceMonitor />}

        {/* Quantum Carpet Panel */}
        <QuantumCarpetPanel />

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
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </MotionConfig>
    </LazyMotion>
  )
}

export default App
