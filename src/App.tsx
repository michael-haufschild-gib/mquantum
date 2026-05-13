/**
 * Main Application Component
 * N-Dimensional Quantum Physics Visualizer
 *
 * Renders Schroedinger quantum wavefunctions using WebGPU.
 */

import { domMax, LazyMotion, MotionConfig } from 'motion/react'
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react'

import { RefinementIndicator } from '@/components/canvas/RefinementIndicator'
import { EditorLayout } from '@/components/layout/EditorLayout'
import { MsgBox } from '@/components/overlays/MsgBox'
import { ShaderCompilationOverlay } from '@/components/overlays/ShaderCompilationOverlay'

// Lazy-load components not needed on first render
const PerformanceMonitor = React.lazy(() =>
  import('@/components/canvas/PerformanceMonitor').then((m) => ({ default: m.PerformanceMonitor }))
)
const ScreenshotModal = React.lazy(() =>
  import('@/components/overlays/ScreenshotModal').then((m) => ({ default: m.ScreenshotModal }))
)
const HudPanelGates = React.lazy(() =>
  import('@/components/canvas/HudPanelGates').then((m) => ({ default: m.HudPanelGates }))
)
const Analytics = React.lazy(() =>
  import('@vercel/analytics/react').then((m) => ({ default: m.Analytics }))
)
import { Button } from '@/components/ui/Button'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { Modal } from '@/components/ui/Modal'
import { ToastProvider } from '@/contexts/ToastContext'
import { useDeviceCapabilities } from '@/hooks/useDeviceCapabilities'
import { useDynamicFavicon } from '@/hooks/useDynamicFavicon'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { useUrlState } from '@/hooks/useUrlState'
import { useWebGPUSupport } from '@/hooks/useWebGPUSupport'
import { logger } from '@/lib/logger'
import { WebGPUCanvas } from '@/rendering/webgpu/WebGPUCanvas'
import { WebGPUScene } from '@/rendering/webgpu/WebGPUScene'
import { usePerformanceStore } from '@/stores/runtime/performanceStore'
import { useScreenshotStore } from '@/stores/runtime/screenshotStore'
import { useEnvironmentStore } from '@/stores/scene/environmentStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'
import { useUIStore } from '@/stores/ui/uiStore'

/**
 * Detect Safari — includes Safari on iOS (Chrome/Firefox on iOS also use WebKit).
 *
 * WHY Safari is hard-blocked (not degraded):
 * WebKit's WGSL shader compiler (as of Safari 18.x / WebKit r292839) cannot handle
 * the complex quantum wavefunction shaders this app uses. The shaders contain deep
 * nested loops, large constant arrays (Hermite coefficients, Laguerre recurrences),
 * and per-dimension branching that exceeds WebKit's compiler time/memory budget.
 * The result is not a graceful fallback — the shader compiler hangs indefinitely,
 * freezing the entire browser process (not just the tab). This happens on all hardware
 * including M3 Max with 128GB RAM.
 *
 * A reduced-quality mode is not feasible because the fundamental issue is shader
 * compilation, not runtime performance. Even the simplest quantum mode (HO 1D)
 * uses Hermite polynomial evaluation that triggers the hang. Stripping the physics
 * to avoid the compiler bug would produce a non-functional app.
 *
 * This decision should be revisited when WebKit ships an updated WGSL compiler
 * (tracked: WebKit bug 263444). Chrome and Firefox compile the same shaders in <50ms.
 */
function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // All iOS browsers use WebKit and share Safari's WebGPU backend.
  // Desktop Chrome/Edge/Firefox include "Safari" in UA but also "Chrome"/"Edg"/"Firefox".
  return /Safari/.test(ua) && !/Chrome|Chromium|Firefox|Edg/.test(ua)
}

/**
 * Safari rendering gate.
 * - 'pending': modal shown, awaiting user acknowledgement
 * - 'stop': user acknowledged, rendering permanently disabled for session
 * - 'continue': non-Safari browser, rendering proceeds normally
 */
type SafariChoice = 'pending' | 'stop' | 'continue'

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

  // Detect device capabilities (GPU tier) and apply constrained defaults
  useDeviceCapabilities()

  // Detect WebGPU support
  const { isSupported, isComplete } = useWebGPUSupport()

  // Safari WebGPU gate — rendering is always blocked; modal is informational only
  const [safariChoice, setSafariChoice] = useState<SafariChoice>(() =>
    isSafari() ? 'pending' : 'continue'
  )
  const handleSafariAcknowledge = useCallback(() => setSafariChoice('stop'), [])

  // Show Safari warning modal when WebGPU is supported but browser is Safari
  const showSafariWarning = safariChoice === 'pending' && isComplete && isSupported

  // Get current geometry for WebGPU scene
  const objectType = useGeometryStore((state) => state.objectType)
  const dimension = useGeometryStore((state) => state.dimension)

  // Get background color from environment store (single source of truth)
  const backgroundColor = useEnvironmentStore((state) => state.backgroundColor)

  // Get performance monitor state
  const showPerfMonitor = useUIStore((state) => state.showPerfMonitor)
  const renderResolutionScale = usePerformanceStore((state) => state.renderResolutionScale)
  const screenshotModalOpen = useScreenshotStore((state) => state.isOpen)

  const baseDpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio
  const scaledDpr = baseDpr * renderResolutionScale

  const canvasStyle = useMemo(() => ({ background: backgroundColor }), [backgroundColor])

  return (
    <EditorLayout>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {/* Performance indicators */}
        <RefinementIndicator position="bottom-right" />

        {/* Safari WebGPU Warning Modal */}
        <Modal
          isOpen={showSafariWarning}
          onClose={handleSafariAcknowledge}
          title="Safari Not Supported"
          width="max-w-md"
        >
          <div className="space-y-4">
            <p className="text-sm text-text-secondary">
              Safari&apos;s WebGPU shader compiler cannot handle the complex quantum wavefunction
              shaders used by this application.{' '}
              <span className="text-text-primary font-semibold">
                Rendering will freeze your system
              </span>{' '}
              — even on the latest hardware.
            </p>
            <p className="text-sm text-text-secondary">
              This is a WebKit limitation. Please use{' '}
              <span className="text-text-primary font-medium">Chrome</span>,{' '}
              <span className="text-text-primary font-medium">Edge</span>, or{' '}
              <span className="text-text-primary font-medium">Firefox</span> instead.
            </p>
            <div className="flex justify-end pt-2">
              <Button variant="primary" onClick={handleSafariAcknowledge} size="sm">
                Understood
              </Button>
            </div>
          </div>
        </Modal>

        {!isComplete ? (
          // Detection in progress
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-black/95">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">MQuantum</h1>
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
        ) : isSupported && safariChoice === 'stop' ? (
          // Safari user chose to stop — rendering deactivated
          <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-black/95 text-text-secondary px-6">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">MQuantum</h1>
            <div className="max-w-md text-center space-y-4">
              <p className="text-lg font-semibold text-text-primary">Rendering deactivated</p>
              <p className="text-sm text-text-tertiary">
                Safari&apos;s WebGPU performance is not viable for real-time quantum wavefunction
                rendering. Please open this page in{' '}
                <span className="text-text-primary font-medium">Chrome</span>,{' '}
                <span className="text-text-primary font-medium">Edge</span>, or{' '}
                <span className="text-text-primary font-medium">Firefox</span> for full performance.
              </p>
            </div>
          </div>
        ) : isSupported && safariChoice === 'continue' ? (
          // WebGPU Renderer — the normal non-Safari path. `'continue'` is
          // exclusively the initial state for non-Safari browsers; Safari
          // users can only transition `pending → stop` via
          // `handleSafariAcknowledge`, so they never reach this branch.
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
              onError={handleWebGPUErrorStable}
            >
              <WebGPUScene objectType={objectType} dimension={dimension} />
            </WebGPUCanvas>
          </ErrorBoundary>
        ) : isSupported ? (
          // Safari user hasn't chosen yet — show blank while modal is open
          <div className="flex h-full w-full items-center justify-center bg-black/95" />
        ) : (
          // WebGPU not supported
          <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-black/95 text-text-secondary px-6">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">MQuantum</h1>
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
                  <li>
                    Firefox 141+ (Windows); macOS 145+ (Apple Silicon) or 147+ (other Macs);
                    Linux/Android unsupported
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Global Message Box Overlay */}
        <MsgBox />

        {showPerfMonitor && (
          <Suspense fallback={null}>
            <PerformanceMonitor />
          </Suspense>
        )}

        <DeferredHudPanelGates />

        {/* Screenshot Preview Modal */}
        {screenshotModalOpen && (
          <Suspense fallback={null}>
            <ScreenshotModal />
          </Suspense>
        )}

        {/* Shader Compilation Overlay */}
        <ShaderCompilationOverlay />
      </div>
    </EditorLayout>
  )
}

function useIdleEnabled(timeout: number, fallbackMs: number) {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(() => setEnabled(true), { timeout })
      return () => window.cancelIdleCallback(id)
    }

    const id = globalThis.setTimeout(() => setEnabled(true), fallbackMs)
    return () => globalThis.clearTimeout(id)
  }, [fallbackMs, timeout])

  return enabled
}

function DeferredHudPanelGates() {
  const enabled = useIdleEnabled(2500, 1500)

  if (!enabled) return null

  return (
    <Suspense fallback={null}>
      <HudPanelGates />
    </Suspense>
  )
}

function DeferredAnalytics() {
  const enabled = useIdleEnabled(3000, 2000)

  if (!enabled) return null

  return (
    <Suspense fallback={null}>
      <Analytics />
    </Suspense>
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
      <DeferredAnalytics />
    </LazyMotion>
  )
}

export default App
