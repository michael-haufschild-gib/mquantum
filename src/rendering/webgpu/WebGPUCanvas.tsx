/**
 * WebGPU Canvas Component
 *
 * React component that manages WebGPU canvas initialization and rendering.
 * Handles device setup, render graph lifecycle, and resize events.
 *
 * @module rendering/webgpu/WebGPUCanvas
 */

import React, { useEffect, useRef, useState } from 'react'

import { logger } from '@/lib/logger'
import { useRendererStore } from '@/stores/runtime/rendererStore'

import type { WebGPUInitErrorCode } from './core/types'
import { WebGPUBasePass } from './core/WebGPUBasePass'
import { WebGPUDevice } from './core/WebGPUDevice'
import { WebGPURenderGraph } from './graph/WebGPURenderGraph'
import { WebGPUSchrodingerRenderer } from './renderers/WebGPUSchrodingerRenderer'
import { resolveCanvasPixelSize } from './utils/sceneMath'
import { type WebGPUCanvasContext, WebGPUContext } from './WebGPUContext'

// ============================================================================
// Types
// ============================================================================

/** Props for the WebGPU canvas component that manages device initialization and the render loop. */
export interface WebGPUCanvasProps {
  /** CSS class name for the canvas container */
  className?: string
  /** CSS style for the canvas container */
  style?: React.CSSProperties
  /** Callback when WebGPU is ready */
  onReady?: (graph: WebGPURenderGraph) => void
  /** Callback when WebGPU initialization fails */
  onError?: (error: Error) => void
  /** Device pixel ratio override (defaults to window.devicePixelRatio) */
  dpr?: number
  /** Children to render (typically WebGPUScene) */
  children?: React.ReactNode
}

// ============================================================================
// Component
// ============================================================================

/**
 * WebGPU Canvas component.
 *
 * Initializes WebGPU and provides context to child components.
 * Handles automatic resize and device loss recovery.
 *
 * @param root0
 * @param root0.className
 * @param root0.style
 * @param root0.onReady
 * @param root0.onError
 * @param root0.dpr
 * @param root0.children
 * @example
 * ```tsx
 * <WebGPUCanvas onReady={(graph) => setupPasses(graph)}>
 *   <WebGPUScene />
 * </WebGPUCanvas>
 * ```
 */
export const WebGPUCanvas: React.FC<WebGPUCanvasProps> = ({
  className,
  style,
  onReady,
  onError,
  dpr,
  children,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<WebGPURenderGraph | null>(null)
  const dprRef = useRef<number | undefined>(dpr)
  dprRef.current = dpr

  // Stable refs for callbacks — prevents re-initializing the entire WebGPU
  // device + render graph when a parent re-renders with new function references.
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const handleDeviceLostRef = useRef(useRendererStore.getState().handleDeviceLost)

  const [context, setContext] = useState<WebGPUCanvasContext | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [initError, setInitError] = useState<Error | null>(null)
  const [initErrorCode, setInitErrorCode] = useState<WebGPUInitErrorCode | null>(null)

  // Derive renderer state for e2e test automation.
  // Tests use data-renderer-state to wait for "ready" deterministically.
  const rendererState = initError ? 'error' : isInitialized ? 'ready' : 'initializing'

  // Initialize WebGPU — runs once on mount, not on prop/callback changes.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false
    let unsubDeviceLost: (() => void) | null = null

    const initialize = async () => {
      try {
        const deviceManager = WebGPUDevice.getInstance()

        // Initialize device with canvas
        const result = await deviceManager.initialize(canvas)

        if (cancelled) {
          return
        }

        if (!result.success) {
          // Surface the structured failure code to the test/telemetry
          // boundary via state so the error overlay can emit it as a
          // dedicated DOM attribute.
          setInitErrorCode(result.code)
          throw new Error(result.error || 'Failed to initialize WebGPU')
        }

        // Create render graph
        const graph = new WebGPURenderGraph()

        // Set initial size
        const container = containerRef.current
        if (container) {
          const devicePixelRatio = dprRef.current ?? window.devicePixelRatio
          const { width, height } = resolveCanvasPixelSize(
            container.clientWidth,
            container.clientHeight,
            devicePixelRatio
          )

          canvas.width = width
          canvas.height = height
          graph.setSize(width, height)
        }

        // Initialize graph
        await graph.initialize()

        // Guard against unmount during async initialization
        if (cancelled) {
          graph.dispose()
          return
        }

        graphRef.current = graph

        // Register device lost handler (store unsubscribe for cleanup)
        unsubDeviceLost = deviceManager.onDeviceLost((reason) => {
          logger.error('[WebGPUCanvas] Device lost:', reason)
          // Clear static GPU resources that hold references to the destroyed device
          WebGPUBasePass.clearStaticResources()
          WebGPUSchrodingerRenderer.clearPipelineCache()
          handleDeviceLostRef.current(reason)
        })

        // Create context
        const ctx: WebGPUCanvasContext = {
          device: deviceManager,
          graph,
          canvas,
          size: { width: canvas.width, height: canvas.height },
        }

        setContext(ctx)
        setIsInitialized(true)
        onReadyRef.current?.(graph)
      } catch (error) {
        if (cancelled) return
        logger.error('[WebGPUCanvas] Initialization failed:', error)
        const err = error instanceof Error ? error : new Error(String(error))
        setInitError(err)
        onErrorRef.current?.(err)
      }
    }

    void initialize()

    return () => {
      cancelled = true
      unsubDeviceLost?.()
      if (graphRef.current) {
        graphRef.current.dispose()
        graphRef.current = null
      }
    }
  }, [])

  // Set up resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleResize = () => {
      const canvas = canvasRef.current
      const graph = graphRef.current

      if (!canvas || !graph) return

      const devicePixelRatio = dpr ?? window.devicePixelRatio
      const { width, height } = resolveCanvasPixelSize(
        container.clientWidth,
        container.clientHeight,
        devicePixelRatio
      )

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        graph.setSize(width, height)

        // Update context size
        setContext((prev) => (prev ? { ...prev, size: { width, height } } : null))
      }
    }

    // Apply current size immediately (including DPR changes) without
    // tearing down and reinitializing WebGPU resources.
    handleResize()

    const resizeObserver = new ResizeObserver(() => {
      handleResize()
    })

    resizeObserver.observe(container)

    return () => {
      resizeObserver.disconnect()
    }
  }, [dpr])

  // Render error state
  if (initError) {
    return (
      <div
        ref={containerRef}
        className={className}
        data-testid="webgpu-container"
        data-renderer-state="error"
        data-renderer-error={initError.message}
        // `data-renderer-error-code` carries the structured failure code
        // (NO_NAVIGATOR_GPU / ADAPTER_REQUEST_FAILED / DEVICE_REQUEST_FAILED /
        // CONTEXT_CONFIGURE_FAILED / INTERNAL_ERROR) so e2e tests and
        // telemetry can branch on the failure mode without parsing the
        // human-readable message.
        {...(initErrorCode ? { 'data-renderer-error-code': initErrorCode } : {})}
        style={{
          ...style,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-danger)',
        }}
      >
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <p>WebGPU initialization failed</p>
          <p style={{ fontSize: '0.875rem', opacity: 0.7 }}>{initError.message}</p>
          {initErrorCode ? (
            // Surface the structured failure code so a user copy-pasting
            // into a support ticket carries the diagnostic identifier
            // alongside the human-readable message. Same code that lands
            // in `data-renderer-error-code` for e2e + telemetry.
            <p style={{ fontSize: '0.75rem', opacity: 0.55, marginTop: '8px' }}>
              code: <code>{initErrorCode}</code>
            </p>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={className}
      data-testid="webgpu-container"
      data-renderer-state={rendererState}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        data-testid="webgpu-canvas"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
      />
      {isInitialized && context && (
        <WebGPUContext.Provider value={context}>{children}</WebGPUContext.Provider>
      )}
    </div>
  )
}
