import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { WebGPUCanvas } from '@/rendering/webgpu/WebGPUCanvas'

type MockGraphInstance = {
  setSize: ReturnType<typeof vi.fn>
  initialize: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
}

const { initializeMock, onDeviceLostMock, graphInstances } = vi.hoisted(() => {
  const instances: MockGraphInstance[] = []
  return {
    initializeMock: vi.fn(),
    onDeviceLostMock: vi.fn(),
    graphInstances: instances,
  }
})

vi.mock('@/rendering/webgpu/core/WebGPUDevice', () => ({
  WebGPUDevice: {
    getInstance: () => ({
      initialize: initializeMock,
      onDeviceLost: onDeviceLostMock,
    }),
  },
}))

vi.mock('@/rendering/webgpu/graph/WebGPURenderGraph', () => ({
  WebGPURenderGraph: class MockWebGPURenderGraph {
    setSize = vi.fn()
    initialize = vi.fn().mockResolvedValue(undefined)
    dispose = vi.fn()

    constructor() {
      graphInstances.push(this as unknown as MockGraphInstance)
    }
  },
}))

describe('WebGPUCanvas', () => {
  const clientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
  const clientHeightDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')

  beforeEach(() => {
    initializeMock.mockReset()
    onDeviceLostMock.mockReset()
    graphInstances.length = 0

    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 200,
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 100,
    })
  })

  afterEach(() => {
    if (clientWidthDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidthDescriptor)
    }
    if (clientHeightDescriptor) {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientHeightDescriptor)
    }
  })

  it('does not reinitialize WebGPU when dpr changes', async () => {
    initializeMock.mockImplementation(() => new Promise(() => {}))
    const onError = vi.fn()

    const { rerender } = render(<WebGPUCanvas dpr={1} onError={onError} />)

    await waitFor(() => {
      expect(initializeMock).toHaveBeenCalledTimes(1)
    })

    rerender(<WebGPUCanvas dpr={0.5} onError={onError} />)

    await Promise.resolve()
    await Promise.resolve()

    expect(initializeMock).toHaveBeenCalledTimes(1)
  })

  it('applies dpr updates by resizing existing graph', async () => {
    initializeMock.mockResolvedValue({ success: true })
    const onError = vi.fn()

    const { rerender } = render(<WebGPUCanvas dpr={1} onError={onError} />)

    await waitFor(() => {
      expect(initializeMock).toHaveBeenCalledTimes(1)
      expect(graphInstances).toHaveLength(1)
      expect(graphInstances[0]!.setSize).toHaveBeenCalledWith(200, 100)
    })

    rerender(<WebGPUCanvas dpr={0.5} onError={onError} />)

    await waitFor(() => {
      expect(graphInstances).toHaveLength(1)
      expect(graphInstances[0]!.setSize).toHaveBeenCalledWith(100, 50)
      expect(initializeMock).toHaveBeenCalledTimes(1)
    })
  })
})
