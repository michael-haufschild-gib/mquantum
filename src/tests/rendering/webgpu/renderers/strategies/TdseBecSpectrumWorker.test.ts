import { beforeEach, describe, expect, it } from 'vitest'

import { NUM_SPECTRUM_BINS } from '@/lib/physics/bec/incompressibleSpectrum'
import {
  createBecSpectrumWorkerState,
  invalidateBecSpectrumWorkerState,
} from '@/rendering/webgpu/renderers/strategies/TdseBecSpectrumWorker'
import { TdseBecStrategy } from '@/rendering/webgpu/renderers/strategies/TdseBecStrategy'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'

describe('BEC spectrum worker state', () => {
  beforeEach(() => {
    useDiagnosticsStore.getState().resetBec()
  })

  it('invalidates in-flight spectrum work after a field reset', () => {
    const state = createBecSpectrumWorkerState()
    state.inFlight = true
    const epochBefore = state.epoch

    invalidateBecSpectrumWorkerState(state)

    expect(state.epoch).toBe(epochBefore + 1)
    expect(state.inFlight).toBe(false)
  })

  it('clears stale spectrum diagnostics when interaction strength disables spectrum', () => {
    const strategy = new TdseBecStrategy()
    const subject = strategy as unknown as {
      spectrumWorkerState: ReturnType<typeof createBecSpectrumWorkerState>
      maybeComputeSpectrum: (ctx: unknown, pass: unknown, extended: unknown) => void
    }
    const spectrumState = subject.spectrumWorkerState
    spectrumState.inFlight = true
    const epochBefore = spectrumState.epoch
    useDiagnosticsStore
      .getState()
      .setBecIncompressibleSpectrum(new Float32Array([1, 2]), new Float32Array([0.1, 0.2]), 5, 2)

    subject.maybeComputeSpectrum(
      {},
      {},
      {
        interactionStrength: 0,
        needsReset: false,
      }
    )

    const bec = useDiagnosticsStore.getState().bec
    expect(spectrumState.epoch).toBe(epochBefore + 1)
    expect(spectrumState.inFlight).toBe(false)
    expect(bec.incompressibleSpectrum).toHaveLength(NUM_SPECTRUM_BINS)
    expect(bec.incompressibleSpectrum.every((value) => value === 0)).toBe(true)
    expect(bec.spectrumKValues.every((value) => value === 0)).toBe(true)
    expect(bec.totalIncompressibleEnergy).toBe(0)
    expect(bec.totalCompressibleEnergy).toBe(0)
  })

  it('clears in-flight flag when spectrum readback request throws synchronously', () => {
    const strategy = new TdseBecStrategy()
    const subject = strategy as unknown as {
      spectrumWorkerState: ReturnType<typeof createBecSpectrumWorkerState>
      spectrumCounter: number
      maybeComputeSpectrum: (ctx: unknown, pass: unknown, extended: unknown) => void
    }
    subject.spectrumCounter = 3

    subject.maybeComputeSpectrum(
      {},
      {
        requestMeasurementReadback: () => {
          throw new Error('device lost')
        },
      },
      {
        interactionStrength: 1,
        needsReset: false,
        gridSize: [8, 8, 8],
        spacing: [0.5, 0.5, 0.5],
        compactDims: [false, false, false],
        compactRadii: [0.15, 0.15, 0.15],
        latticeDim: 3,
        hbar: 1,
        mass: 1,
      }
    )

    expect(subject.spectrumWorkerState.inFlight).toBe(false)
  })
})
