import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SchroedingerQuantumMode } from '@/lib/geometry/extended/common'
import {
  createInitialExportRuntimeState,
  isExportRuntimeActive,
} from '@/rendering/webgpu/sceneExportRuntime'
import type { UseExportRuntimeParams } from '@/rendering/webgpu/useExportRuntime'
import { resetWaveEvolution, useExportRuntime } from '@/rendering/webgpu/useExportRuntime'
import { useExportStore } from '@/stores/runtime/exportStore'
import { usePerformanceStore } from '@/stores/runtime/performanceStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

type ExtendedObjectStoreState = ReturnType<typeof useExtendedObjectStore.getState>

function installQueuedRaf(): { flushOne: () => void; restore: () => void } {
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame
  const originalCancelAnimationFrame = globalThis.cancelAnimationFrame
  const callbacks: FrameRequestCallback[] = []

  globalThis.requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    callbacks.push(callback)
    return callbacks.length
  })
  globalThis.cancelAnimationFrame = vi.fn()

  return {
    flushOne: () => {
      const callback = callbacks.shift()
      callback?.(performance.now())
    },
    restore: () => {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame
      globalThis.cancelAnimationFrame = originalCancelAnimationFrame
    },
  }
}

describe('WebGPUScene export runtime state', () => {
  beforeEach(() => {
    useGeometryStore.setState(useGeometryStore.getInitialState())
    useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
    useExportStore.setState(useExportStore.getInitialState())
    usePerformanceStore.setState(usePerformanceStore.getInitialState())
  })

  it('treats fully idle runtime state as inactive', () => {
    expect(
      isExportRuntimeActive({
        starting: false,
        started: false,
        processing: false,
        finishing: false,
        canceling: false,
      })
    ).toBe(false)
  })

  it('treats each individual active phase as active', () => {
    const phases = ['starting', 'started', 'processing', 'finishing', 'canceling'] as const

    for (const phase of phases) {
      const runtime = {
        starting: false,
        started: false,
        processing: false,
        finishing: false,
        canceling: false,
      }
      runtime[phase] = true

      expect(isExportRuntimeActive(runtime), `${phase}=true should be active`).toBe(true)
    }
  })

  it('treats multiple simultaneous active phases as active', () => {
    expect(
      isExportRuntimeActive({
        starting: true,
        started: true,
        processing: true,
        finishing: false,
        canceling: false,
      })
    ).toBe(true)
  })
})

describe('useExportRuntime cancellation', () => {
  beforeEach(() => {
    useExportStore.setState(useExportStore.getInitialState())
    usePerformanceStore.setState(usePerformanceStore.getInitialState())
  })

  it('keeps a cancel request visible to an in-flight start after paint resumes', async () => {
    const raf = installQueuedRaf()
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 360
      const graph = { setSize: vi.fn() }
      const camera = {
        getState: vi.fn(() => ({ aspect: 16 / 9 })),
        setAspect: vi.fn(),
      }
      const runtimeRef = { current: createInitialExportRuntimeState() }

      const { result } = renderHook(() =>
        useExportRuntime({
          canvas,
          device: {
            getCapabilities: vi.fn(() => ({ maxTextureDimension2D: 4096 })),
          } as unknown as UseExportRuntimeParams['device'],
          graph: graph as unknown as UseExportRuntimeParams['graph'],
          cameraRef: { current: camera } as unknown as UseExportRuntimeParams['cameraRef'],
          size: { width: 640, height: 360 },
          advanceSceneStateByDelta: vi.fn(),
          executeSceneFrame: vi.fn(),
          exportRuntimeRef: runtimeRef,
        })
      )

      useExportStore.setState({ isExporting: true, status: 'idle' })
      act(() => {
        result.current.tickExport()
      })

      useExportStore.setState({ isExporting: false })
      await act(async () => {
        result.current.tickExport()
        await Promise.resolve()
      })

      expect(runtimeRef.current.abortRequested).toBe(true)

      await act(async () => {
        raf.flushOne()
        raf.flushOne()
        await Promise.resolve()
      })

      expect(graph.setSize).not.toHaveBeenCalledWith(1920, 1080)
    } finally {
      raf.restore()
    }
  })

  it('preserves live performance settings when stream export is canceled before snapshot', async () => {
    const originalShowSaveFilePicker = window.showSaveFilePicker
    let resolvePicker: (handle: FileSystemFileHandle | undefined) => void = () => {}
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: vi.fn(
        () =>
          new Promise<FileSystemFileHandle | undefined>((resolve) => {
            resolvePicker = resolve
          })
      ),
    })

    try {
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 360
      const runtimeRef = { current: createInitialExportRuntimeState() }

      const { result } = renderHook(() =>
        useExportRuntime({
          canvas,
          device: {
            getCapabilities: vi.fn(() => ({ maxTextureDimension2D: 4096 })),
          } as unknown as UseExportRuntimeParams['device'],
          graph: { setSize: vi.fn() } as unknown as UseExportRuntimeParams['graph'],
          cameraRef: {
            current: {
              getState: vi.fn(() => ({ aspect: 16 / 9 })),
              setAspect: vi.fn(),
            },
          } as unknown as UseExportRuntimeParams['cameraRef'],
          size: { width: 640, height: 360 },
          advanceSceneStateByDelta: vi.fn(),
          executeSceneFrame: vi.fn(),
          exportRuntimeRef: runtimeRef,
        })
      )

      usePerformanceStore.setState({
        progressiveRefinementEnabled: false,
        renderResolutionScale: 0.5,
      })
      useExportStore.setState({
        isExporting: true,
        status: 'idle',
        browserType: 'chromium-capable',
        exportMode: 'stream',
        exportModeOverride: 'stream',
      })

      act(() => {
        result.current.tickExport()
      })

      useExportStore.setState({ isExporting: false })
      await act(async () => {
        result.current.tickExport()
        await Promise.resolve()
      })

      expect(usePerformanceStore.getState().progressiveRefinementEnabled).toBe(false)
      expect(usePerformanceStore.getState().renderResolutionScale).toBe(0.5)

      await act(async () => {
        resolvePicker({} as FileSystemFileHandle)
        await Promise.resolve()
      })

      expect(runtimeRef.current.environmentCaptured).toBe(false)
      expect(usePerformanceStore.getState().progressiveRefinementEnabled).toBe(false)
      expect(usePerformanceStore.getState().renderResolutionScale).toBe(0.5)
    } finally {
      Object.defineProperty(window, 'showSaveFilePicker', {
        configurable: true,
        value: originalShowSaveFilePicker,
      })
    }
  })
})

describe('resetWaveEvolution', () => {
  beforeEach(() => {
    useGeometryStore.setState(useGeometryStore.getInitialState())
    useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
  })

  it.each(['harmonicOscillator', 'hydrogenND', 'hydrogenNDCoupled'] as const)(
    'resets analytic mode parameters and open-quantum state for %s',
    (mode) => {
      useGeometryStore.setState({ objectType: 'schroedinger' })
      const store = useExtendedObjectStore.getState()
      store.setSchroedingerQuantumMode(mode)
      store.setSchroedingerParameterValues([1, -1, 0.5])
      const resetTokenBefore = store.schroedinger.openQuantum.resetToken ?? 0

      resetWaveEvolution()

      const state = useExtendedObjectStore.getState().schroedinger
      expect(state.parameterValues).toEqual([0, 0, 0])
      expect(state.openQuantum.resetToken).toBe(resetTokenBefore + 1)
    }
  )

  it.each([
    {
      mode: 'freeScalarField',
      clear: (state: ExtendedObjectStoreState) => state.clearComputeNeedsReset('freeScalar'),
      read: (state: ExtendedObjectStoreState) => state.schroedinger.freeScalar.needsReset,
    },
    {
      mode: 'tdseDynamics',
      clear: (state: ExtendedObjectStoreState) => state.clearComputeNeedsReset('tdse'),
      read: (state: ExtendedObjectStoreState) => state.schroedinger.tdse.needsReset,
    },
    {
      mode: 'becDynamics',
      clear: (state: ExtendedObjectStoreState) => state.clearComputeNeedsReset('bec'),
      read: (state: ExtendedObjectStoreState) => state.schroedinger.bec.needsReset,
    },
    {
      mode: 'diracEquation',
      clear: (state: ExtendedObjectStoreState) => state.clearComputeNeedsReset('dirac'),
      read: (state: ExtendedObjectStoreState) => state.schroedinger.dirac.needsReset,
    },
    {
      mode: 'quantumWalk',
      clear: (state: ExtendedObjectStoreState) => state.clearComputeNeedsReset('quantumWalk'),
      read: (state: ExtendedObjectStoreState) => state.schroedinger.quantumWalk.needsReset,
    },
    {
      mode: 'wheelerDeWitt',
      clear: (state: ExtendedObjectStoreState) => state.clearComputeNeedsReset('wheelerDeWitt'),
      read: (state: ExtendedObjectStoreState) => state.schroedinger.wheelerDeWitt.needsReset,
    },
    {
      mode: 'antiDeSitter',
      clear: (state: ExtendedObjectStoreState) => state.clearComputeNeedsReset('antiDeSitter'),
      read: (state: ExtendedObjectStoreState) => state.schroedinger.antiDeSitter.needsReset,
    },
  ] satisfies {
    mode: SchroedingerQuantumMode
    clear: (state: ExtendedObjectStoreState) => void
    read: (state: ExtendedObjectStoreState) => boolean
  }[])('sets the mode reset flag for $mode', ({ mode, clear, read }) => {
    useGeometryStore.setState({ objectType: 'schroedinger' })
    useExtendedObjectStore.getState().setSchroedingerQuantumMode(mode)
    clear(useExtendedObjectStore.getState())
    expect(read(useExtendedObjectStore.getState())).toBe(false)

    resetWaveEvolution()

    expect(read(useExtendedObjectStore.getState())).toBe(true)
  })

  it('resets Pauli field when Pauli spinor is the active object type', () => {
    useGeometryStore.setState({ objectType: 'pauliSpinor' })
    const store = useExtendedObjectStore.getState()
    store.clearComputeNeedsReset('pauliSpinor')
    expect(useExtendedObjectStore.getState().pauliSpinor.needsReset).toBe(false)

    resetWaveEvolution()

    expect(useExtendedObjectStore.getState().pauliSpinor.needsReset).toBe(true)
  })
})
