import React from 'react'
import { WebGPUDevice } from './core/WebGPUDevice'
import { WebGPURenderGraph } from './graph/WebGPURenderGraph'

/**
 *
 */
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
