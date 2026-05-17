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

/**
 * Per-canvas refcount of "alive" effect instances.
 *
 * React StrictMode runs effects twice (mount → cleanup → mount). Both mounts'
 * async initialize() calls share the singleton's cached init promise; when the
 * promise resolves, BOTH continuations run. The first continuation sees its own
 * `cancelled` flag set and would naively destroy the singleton device — but the
 * second continuation is about to use it. This refcount lets the first
 * continuation observe that another effect on the same canvas is still alive,
 * so the destroy is skipped and deferred to whichever effect leaves last.
 */
const aliveCanvasEffects = new WeakMap<HTMLCanvasElement, number>()
const incrementAliveEffects = (canvas: HTMLCanvasElement): void => {
  aliveCanvasEffects.set(canvas, (aliveCanvasEffects.get(canvas) ?? 0) + 1)
}
const decrementAliveEffects = (canvas: HTMLCanvasElement): void => {
  const next = (aliveCanvasEffects.get(canvas) ?? 0) - 1
  if (next <= 0) {
    aliveCanvasEffects.delete(canvas)
  } else {
    aliveCanvasEffects.set(canvas, next)
  }
}
// After cleanup decrements, the count reflects only OTHER alive effects.
// The cancelled-continuation and cleanup paths both run after decrement,
// so `> 0` correctly detects a peer that would still use the device.
const hasAnyAliveEffects = (canvas: HTMLCanvasElement): boolean =>
  (aliveCanvasEffects.get(canvas) ?? 0) > 0

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

interface WebGPUErrorOverlayProps {
  className?: string
  style?: React.CSSProperties
  error: Error
  errorCode: WebGPUInitErrorCode | null
}

const WebGPUErrorOverlay = React.forwardRef<HTMLDivElement, WebGPUErrorOverlayProps>(
  ({ className, style, error, errorCode }, ref) => (
    <div
      ref={ref}
      className={className}
      data-testid="webgpu-container"
      data-renderer-state="error"
      data-renderer-error={error.message}
      // `data-renderer-error-code` carries the structured failure code
      // so e2e tests and telemetry can branch without parsing message text.
      {...(errorCode ? { 'data-renderer-error-code': errorCode } : {})}
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
        <p style={{ fontSize: '0.875rem', opacity: 0.7 }}>{error.message}</p>
        {errorCode ? (
          <p style={{ fontSize: '0.75rem', opacity: 0.55, marginTop: '8px' }}>
            code: <code>{errorCode}</code>
          </p>
        ) : null}
      </div>
    </div>
  )
)

WebGPUErrorOverlay.displayName = 'WebGPUErrorOverlay'

function applyInitialCanvasSize(
  canvas: HTMLCanvasElement,
  graph: WebGPURenderGraph,
  container: HTMLElement | null,
  dprOverride: number | undefined,
  maxTextureDimension2D: number | undefined
): void {
  if (!container) return
  const pixelRatio = dprOverride ?? window.devicePixelRatio
  const { width, height } = resolveCanvasPixelSize(
    container.clientWidth,
    container.clientHeight,
    pixelRatio,
    maxTextureDimension2D
  )
  canvas.width = width
  canvas.height = height
  graph.setSize(width, height)
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
    let deviceManager: WebGPUDevice | null = null
    let deviceInitialized = false
    let deviceDestroyed = false
    let pendingGraph: WebGPURenderGraph | null = null

    incrementAliveEffects(canvas)

    const forceDestroyDevice = () => {
      deviceDestroyed = true
      deviceManager?.destroyForCanvas(canvas)
      deviceManager = null
    }

    const destroyInitializedDevice = () => {
      if (!deviceInitialized || deviceDestroyed) return
      if (hasAnyAliveEffects(canvas)) {
        deviceDestroyed = true
        deviceManager = null
        return
      }
      forceDestroyDevice()
    }

    const abortIfCancelled = (): boolean => {
      if (!cancelled) return false
      destroyInitializedDevice()
      return true
    }

    const initialize = async () => {
      try {
        deviceManager = WebGPUDevice.getInstance()
        const result = await deviceManager.initialize(canvas)
        if (result.success) deviceInitialized = true
        if (abortIfCancelled()) return
        if (!result.success) {
          setInitErrorCode(result.code)
          throw new Error(result.error || 'Failed to initialize WebGPU')
        }

        const graph = new WebGPURenderGraph()
        pendingGraph = graph

        applyInitialCanvasSize(
          canvas,
          graph,
          containerRef.current,
          dprRef.current,
          deviceManager.getCapabilities()?.maxTextureDimension2D
        )

        await graph.initialize()
        if (abortIfCancelled()) {
          graph.dispose()
          pendingGraph = null
          return
        }

        graphRef.current = graph
        pendingGraph = null

        unsubDeviceLost = deviceManager.onDeviceLost((reason) => {
          logger.error('[WebGPUCanvas] Device lost:', reason)
          WebGPUBasePass.clearStaticResources()
          WebGPUSchrodingerRenderer.clearPipelineCache()
          handleDeviceLostRef.current(reason)
        })

        setContext({
          device: deviceManager,
          graph,
          canvas,
          size: { width: canvas.width, height: canvas.height },
        })
        setIsInitialized(true)
        try {
          onReadyRef.current?.(graph)
        } catch (e) {
          logger.error('[WebGPUCanvas] onReady callback failed:', e)
        }
      } catch (error) {
        pendingGraph?.dispose()
        pendingGraph = null
        if (abortIfCancelled()) return
        if (deviceInitialized && !deviceDestroyed) forceDestroyDevice()
        logger.error('[WebGPUCanvas] Initialization failed:', error)
        const err = error instanceof Error ? error : new Error(String(error))
        setInitError(err)
        try {
          onErrorRef.current?.(err)
        } catch (e) {
          logger.error('[WebGPUCanvas] onError callback failed:', e)
        }
      }
    }

    void initialize()

    return () => {
      cancelled = true
      unsubDeviceLost?.()
      pendingGraph?.dispose()
      pendingGraph = null
      graphRef.current?.dispose()
      graphRef.current = null
      // Decrement before destroy so the count reflects "this effect has left".
      decrementAliveEffects(canvas)
      destroyInitializedDevice()
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
      const maxTextureDimension2D =
        WebGPUDevice.getInstance().getCapabilities()?.maxTextureDimension2D
      const { width, height } = resolveCanvasPixelSize(
        container.clientWidth,
        container.clientHeight,
        devicePixelRatio,
        maxTextureDimension2D
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
      <WebGPUErrorOverlay
        ref={containerRef}
        className={className}
        style={style}
        error={initError}
        errorCode={initErrorCode}
      />
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
