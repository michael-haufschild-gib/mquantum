/**
 * WebGPU Canvas Component
 *
 * React component that manages WebGPU canvas initialization and rendering.
 * Handles device setup, render graph lifecycle, and resize events.
 *
 * @module rendering/webgpu/WebGPUCanvas
 */

import React, { useEffect, useRef, useCallback, useState } from 'react'
import { WebGPUDevice } from './core/WebGPUDevice'
import { WebGPURenderGraph } from './graph/WebGPURenderGraph'
import { useRendererStore } from '@/stores/rendererStore'
import { WebGPUContext, type WebGPUCanvasContext } from './WebGPUContext'

// ============================================================================
// Types
// ============================================================================

/**
 *
 */
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

  const [context, setContext] = useState<WebGPUCanvasContext | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [initError, setInitError] = useState<Error | null>(null)

  const handleDeviceLost = useRendererStore((state) => state.handleDeviceLost)

  // Initialize WebGPU
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
          throw new Error(result.error || 'Failed to initialize WebGPU')
        }

        // Create render graph
        const graph = new WebGPURenderGraph()

        // Set initial size
        const container = containerRef.current
        if (container) {
          const devicePixelRatio = dprRef.current ?? window.devicePixelRatio
          const width = Math.floor(container.clientWidth * devicePixelRatio)
          const height = Math.floor(container.clientHeight * devicePixelRatio)

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
          console.error('[WebGPUCanvas] Device lost:', reason)
          handleDeviceLost(reason)
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
        onReady?.(graph)
      } catch (error) {
        if (cancelled) return
        console.error('[WebGPUCanvas] Initialization failed:', error)
        const err = error instanceof Error ? error : new Error(String(error))
        setInitError(err)
        onError?.(err)
      }
    }

    initialize()

    return () => {
      cancelled = true
      unsubDeviceLost?.()
      if (graphRef.current) {
        graphRef.current.dispose()
        graphRef.current = null
      }
    }
  }, [onReady, onError, handleDeviceLost])

  // Handle resize
  const handleResize = useCallback(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    const graph = graphRef.current

    if (!container || !canvas || !graph) return

    const devicePixelRatio = dpr ?? window.devicePixelRatio
    const width = Math.floor(container.clientWidth * devicePixelRatio)
    const height = Math.floor(container.clientHeight * devicePixelRatio)

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
      graph.setSize(width, height)

      // Update context size
      setContext((prev) =>
        prev ? { ...prev, size: { width, height } } : null
      )
    }
  }, [dpr])

  // Set up resize observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

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
  }, [handleResize])

  // Render error state
  if (initError) {
    return (
      <div
        ref={containerRef}
        className={className}
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
          <p style={{ fontSize: '0.875rem', opacity: 0.7 }}>
            {initError.message}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
        }}
      />
      {isInitialized && context && (
        <WebGPUContext.Provider value={context}>
          {children}
        </WebGPUContext.Provider>
      )}
    </div>
  )
}

export default WebGPUCanvas
