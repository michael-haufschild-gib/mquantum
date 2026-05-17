import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WebGPUCanvas } from '@/rendering/webgpu/WebGPUCanvas'

type MockGraphInstance = {
  setSize: ReturnType<typeof vi.fn>
  initialize: ReturnType<typeof vi.fn>
  dispose: ReturnType<typeof vi.fn>
}

const {
  initializeMock,
  onDeviceLostMock,
  destroyMock,
  getCapabilitiesMock,
  graphInitializeMock,
  graphInstances,
} = vi.hoisted(() => {
  const instances: MockGraphInstance[] = []
  return {
    initializeMock: vi.fn(),
    onDeviceLostMock: vi.fn(),
    destroyMock: vi.fn(),
    getCapabilitiesMock: vi.fn(),
    graphInitializeMock: vi.fn(),
    graphInstances: instances,
  }
})

vi.mock('@/rendering/webgpu/core/WebGPUDevice', () => ({
  WebGPUDevice: {
    getInstance: () => ({
      initialize: initializeMock,
      onDeviceLost: onDeviceLostMock,
      destroy: destroyMock,
      destroyForCanvas: destroyMock,
      getCapabilities: getCapabilitiesMock,
    }),
  },
}))

vi.mock('@/rendering/webgpu/graph/WebGPURenderGraph', () => ({
  WebGPURenderGraph: class MockWebGPURenderGraph {
    setSize = vi.fn()
    initialize = graphInitializeMock
    dispose = vi.fn()

    constructor() {
      graphInstances.push(this as unknown as MockGraphInstance)
    }
  },
}))

describe('WebGPUCanvas', () => {
  const clientWidthDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'clientWidth'
  )
  const clientHeightDescriptor = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'clientHeight'
  )

  beforeEach(() => {
    initializeMock.mockReset()
    onDeviceLostMock.mockReset()
    destroyMock.mockReset()
    getCapabilitiesMock.mockReset()
    getCapabilitiesMock.mockReturnValue({ maxTextureDimension2D: 4096 })
    graphInitializeMock.mockReset()
    graphInitializeMock.mockResolvedValue(undefined)
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

  it('caps DPR-scaled backing size to the device texture limit', async () => {
    getCapabilitiesMock.mockReturnValue({ maxTextureDimension2D: 256 })
    initializeMock.mockResolvedValue({ success: true })
    const onError = vi.fn()

    render(<WebGPUCanvas dpr={4} onError={onError} />)

    await waitFor(() => {
      expect(initializeMock).toHaveBeenCalledTimes(1)
      expect(graphInstances).toHaveLength(1)
      expect(graphInstances[0]!.setSize).toHaveBeenCalledWith(256, 256)
    })

    const canvas = screen.getByTestId('webgpu-canvas') as HTMLCanvasElement
    expect(canvas.width).toBe(256)
    expect(canvas.height).toBe(256)
  })

  it('clamps zero-sized containers and non-finite DPR to a 1x1 backing canvas', async () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => 0,
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get: () => 0,
    })
    initializeMock.mockResolvedValue({ success: true })
    const onError = vi.fn()

    render(<WebGPUCanvas dpr={Number.NaN} onError={onError} />)

    await waitFor(() => {
      expect(initializeMock).toHaveBeenCalledTimes(1)
      expect(graphInstances).toHaveLength(1)
      expect(graphInstances[0]!.setSize).toHaveBeenCalledWith(1, 1)
    })
    const canvas = screen.getByTestId('webgpu-canvas') as HTMLCanvasElement
    expect(canvas.width).toBe(1)
    expect(canvas.height).toBe(1)
  })

  it('disposes graph, unregisters device-loss handler, and destroys device on unmount', async () => {
    initializeMock.mockResolvedValue({ success: true })
    const unsubscribe = vi.fn()
    onDeviceLostMock.mockReturnValue(unsubscribe)

    const { unmount } = render(<WebGPUCanvas dpr={1} />)

    await waitFor(() => {
      expect(graphInstances).toHaveLength(1)
      expect(onDeviceLostMock).toHaveBeenCalledTimes(1)
    })

    unmount()

    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(graphInstances[0]!.dispose).toHaveBeenCalledTimes(1)
    expect(destroyMock).toHaveBeenCalledTimes(1)
  })

  it('destroys a device that finishes initializing after the component unmounts', async () => {
    let resolveInitialize!: (result: { success: true }) => void
    const initializePromise = new Promise<{ success: true }>((resolve) => {
      resolveInitialize = resolve
    })
    initializeMock.mockReturnValue(initializePromise)

    const { unmount } = render(<WebGPUCanvas dpr={1} />)

    await waitFor(() => {
      expect(initializeMock).toHaveBeenCalledTimes(1)
    })

    unmount()
    expect(destroyMock).not.toHaveBeenCalled()

    resolveInitialize({ success: true })
    await Promise.resolve()
    await Promise.resolve()

    expect(destroyMock).toHaveBeenCalledTimes(1)
    expect(graphInstances).toHaveLength(0)
  })

  it('disposes graph and destroys device when graph initialization fails', async () => {
    initializeMock.mockResolvedValue({ success: true })
    graphInitializeMock.mockRejectedValueOnce(new Error('graph init failed'))
    const onError = vi.fn()

    render(<WebGPUCanvas dpr={1} onError={onError} />)

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1)
    })

    expect(onError.mock.calls[0]![0]).toBeInstanceOf(Error)
    expect((onError.mock.calls[0]![0] as Error).message).toBe('graph init failed')
    expect(graphInstances).toHaveLength(1)
    expect(graphInstances[0]!.dispose).toHaveBeenCalledTimes(1)
    expect(destroyMock).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('webgpu-container')).toHaveAttribute('data-renderer-state', 'error')
  })

  it('keeps the error boundary stable when the onError callback throws', async () => {
    initializeMock.mockResolvedValue({
      success: false,
      code: 'NO_NAVIGATOR_GPU',
      error: 'mock webgpu unavailable',
    })
    const onError = vi.fn(() => {
      throw new Error('consumer error handler failed')
    })

    render(<WebGPUCanvas dpr={1} onError={onError} />)

    await waitFor(() => {
      expect(screen.getByTestId('webgpu-container')).toHaveAttribute('data-renderer-state', 'error')
    })

    expect(onError).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('webgpu-container')).toHaveAttribute(
      'data-renderer-error',
      'mock webgpu unavailable'
    )
  })
})
