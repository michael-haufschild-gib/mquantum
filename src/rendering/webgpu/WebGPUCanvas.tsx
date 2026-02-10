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

// ============================================================================
// Types
// ============================================================================

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

export interface WebGPUCanvasContext {
  /** The WebGPU device manager */
  device: WebGPUDevice
  /** The render graph */
  graph: WebGPURenderGraph
  /** Canvas element */
  canvas: HTMLCanvasElement
  /** Current canvas size */
  size: { width: number; height: number }
}

// ============================================================================
// Context
// ============================================================================

export const WebGPUContext = React.createContext<WebGPUCanvasContext | null>(null)

/**
 * Hook to access WebGPU context from child components.
 */
export function useWebGPU(): WebGPUCanvasContext {
  const context = React.useContext(WebGPUContext)
  if (!context) {
    throw new Error('useWebGPU must be used within a WebGPUCanvas')
  }
  return context
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
  const frameIdRef = useRef<number>(0)

  const [context, setContext] = useState<WebGPUCanvasContext | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [initError, setInitError] = useState<Error | null>(null)

  const handleDeviceLost = useRendererStore((state) => state.handleDeviceLost)

  // Initialize WebGPU
  useEffect(() => {
    console.warn('[WebGPUCanvas] INIT EFFECT RUNNING — deps changed')
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false

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
          const devicePixelRatio = dpr ?? window.devicePixelRatio
          const width = Math.floor(container.clientWidth * devicePixelRatio)
          const height = Math.floor(container.clientHeight * devicePixelRatio)

          canvas.width = width
          canvas.height = height
          graph.setSize(width, height)
        }

        // Initialize graph
        await graph.initialize()

        graphRef.current = graph

        // Register device lost handler
        deviceManager.onDeviceLost((reason) => {
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
        console.error('[WebGPUCanvas] Initialization failed:', error)
        const err = error instanceof Error ? error : new Error(String(error))
        setInitError(err)
        onError?.(err)
      }
    }

    initialize()

    return () => {
      cancelled = true
      if (graphRef.current) {
        graphRef.current.dispose()
        graphRef.current = null
      }
      if (frameIdRef.current) {
        cancelAnimationFrame(frameIdRef.current)
      }
    }
  }, [dpr, onReady, onError, handleDeviceLost])

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
      console.warn(`[WebGPUCanvas] RESIZE: canvas ${canvas.width}×${canvas.height} → ${width}×${height}, container ${container.clientWidth}×${container.clientHeight}, dpr=${devicePixelRatio}`)
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
          color: 'var(--color-error, #ff4444)',
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
