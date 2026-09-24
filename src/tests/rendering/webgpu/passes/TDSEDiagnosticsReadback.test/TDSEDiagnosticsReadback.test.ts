/**
 * TDSE diagnostics readback — drift and R/T reference norm.
 *
 * Regression: normDrift ("from t=0") and the R/T denominator ("norm at t=0",
 * so R + T < 1 exposes absorbed probability) were computed against the oldest
 * entry of a 300-sample rolling history. Once the buffer rolled (~25 s), the
 * reference slid forward and an absorbing run's R + T crept back toward 1.
 * The captured initial norm (as Pauli/Dirac use) is now the reference.
 *
 * @module tests/rendering/webgpu/passes/TDSEDiagnosticsReadback
 */

import { describe, expect, it } from 'vitest'

import { TdseDiagnosticsHistory } from '@/lib/physics/tdse/diagnostics'
import {
  type DiagReadbackState,
  scheduleNormReadback,
} from '@/rendering/webgpu/passes/TDSEDiagnosticsReadback'

function makeState(readback: number[]): DiagReadbackState {
  const staging = {
    mapState: 'unmapped' as GPUBufferMapState,
    mapAsync() {
      this.mapState = 'mapped'
      return Promise.resolve()
    },
    getMappedRange: () => new Float32Array(readback).buffer,
    unmap() {
      this.mapState = 'unmapped'
    },
  }
  const history = new TdseDiagnosticsHistory(300)
  // A long absorbing run: the rolling buffer only holds late samples (norm 0.5).
  for (let i = 0; i < 300; i++) {
    history.push({
      simTime: i,
      totalNorm: 0.5,
      maxDensity: 1,
      normDrift: -0.5,
      normLeft: 0.25,
      normRight: 0.25,
      R: 0.25,
      T: 0.25,
      ipr: 1,
    })
  }
  return {
    diagResultBuffer: {} as GPUBuffer,
    diagStagingBuffer: staging as unknown as GPUBuffer,
    diagMappingInFlight: false,
    diagGeneration: 0,
    maxDensity: 1,
    properMaxDensity: 1,
    initialNorm: 1,
    currentAutoLoop: false,
    pendingAutoReset: false,
    simTime: 400,
    diagHistory: history,
    prevNorm: 0.5,
    stagnationCount: 0,
    initialMaxDensity: 1,
    initialProperMaxDensity: 1,
  }
}

describe('scheduleNormReadback', () => {
  it('measures drift and R/T against the initial norm, not the rolling history head', async () => {
    // [totalNorm, maxDens, normLeft, normRight, Σ|ψ|⁴, properMaxDens]
    const s = makeState([0.4, 0.8, 0.1, 0.3, 0.02, 0.8])
    const encoder = { copyBufferToBuffer: () => undefined } as unknown as GPUCommandEncoder
    const device = { queue: { writeBuffer: () => undefined } } as unknown as GPUDevice

    scheduleNormReadback(device, encoder, s, null, true)
    await new Promise((resolve) => setTimeout(resolve, 0))

    const latest = s.diagHistory.getLatest()
    if (!latest) throw new Error('expected a recorded snapshot')
    expect(latest.normDrift).toBeCloseTo(-0.6, 6)
    expect(latest.R).toBeCloseTo(0.1, 6)
    expect(latest.T).toBeCloseTo(0.3, 6)
    expect(latest.R + latest.T).toBeCloseTo(0.4, 6) // absorbed 60 % stays visible
  })
})
