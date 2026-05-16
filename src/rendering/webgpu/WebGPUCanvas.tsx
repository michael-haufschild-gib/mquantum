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
// "Other" means: alive effects beyond the current one. The current effect's
// own slot is included in the refcount until cleanup decrements it, so we
// must compare against `> 1` rather than `> 0`. Otherwise the catch-block
// destroy path (which runs while the current effect is still counted)
// would always skip destruction and leak the device.
const hasOtherAliveEffects = (canvas: HTMLCanvasElement): boolean =>
  (aliveCanvasEffects.get(canvas) ?? 0) > 1

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

    // Claim a slot for this effect instance. Decremented in the cleanup
    // function below. The async-initialize destroy path consults this count
    // before destroying the singleton — see `aliveCanvasEffects`.
    incrementAliveEffects(canvas)

    const destroyInitializedDevice = () => {
      if (!deviceInitialized || deviceDestroyed) return
      // StrictMode race: another effect instance for the same canvas may still
      // be using the singleton device. Skip the destroy if any peer is alive;
      // whoever leaves last will run this branch with `hasOtherAliveEffects`
      // false and perform the destroy.
      if (hasOtherAliveEffects(canvas)) {
        deviceDestroyed = true
        deviceManager = null
        return
      }
      deviceDestroyed = true
      deviceManager?.destroyForCanvas(canvas)
      deviceManager = null
    }

    const initialize = async () => {
      try {
        deviceManager = WebGPUDevice.getInstance()

        // Initialize device with canvas
        const result = await deviceManager.initialize(canvas)
        if (result.success) {
          deviceInitialized = true
        }

        if (cancelled) {
          destroyInitializedDevice()
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
        pendingGraph = graph

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
          pendingGraph = null
          destroyInitializedDevice()
          return
        }

        graphRef.current = graph
        pendingGraph = null

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
        try {
          onReadyRef.current?.(graph)
        } catch (callbackError) {
          logger.error('[WebGPUCanvas] onReady callback failed:', callbackError)
        }
      } catch (error) {
        pendingGraph?.dispose()
        pendingGraph = null
        destroyInitializedDevice()
        if (cancelled) return
        logger.error('[WebGPUCanvas] Initialization failed:', error)
        const err = error instanceof Error ? error : new Error(String(error))
        setInitError(err)
        try {
          onErrorRef.current?.(err)
        } catch (callbackError) {
          logger.error('[WebGPUCanvas] onError callback failed:', callbackError)
        }
      }
    }

    void initialize()

    return () => {
      cancelled = true
      unsubDeviceLost?.()
      pendingGraph?.dispose()
      pendingGraph = null
      if (graphRef.current) {
        graphRef.current.dispose()
        graphRef.current = null
      }
      // Decrement BEFORE destroyInitializedDevice so the alive-effect count
      // reflects "this effect has left" at the moment we decide whether to
      // destroy. In a real unmount, count drops to 0 and the destroy proceeds.
      // In a StrictMode remount, the next mount synchronously increments before
      // any async destroy path observes the count.
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
