/**
 * Focused tests for schrodingerFrameUpdate helpers and low-GPU frame state.
 *
 * `quantizeBoundingRadius` drives geometry-rebuild thresholds. The temporal
 * Bayer tests use a minimal WebGPURenderContext because phase order is a
 * CPU-side contract between the renderer and temporal reconstruction pass.
 */
import { describe, expect, it } from 'vitest'

import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import { quantizeBoundingRadius } from '@/rendering/webgpu/renderers/boundingRadiusQuantize'
import {
  computeCameraUpdate,
  computeSchroedingerUpdate,
  type SchrodingerFrameState,
} from '@/rendering/webgpu/renderers/schrodingerFrameUpdate'
import { SCHROEDINGER_LAYOUT } from '@/rendering/webgpu/renderers/schroedingerLayout'
import type { QuantumModeStrategy } from '@/rendering/webgpu/renderers/strategies/types'
import { advanceTemporalBayerCycle } from '@/rendering/webgpu/shaders/schroedinger/temporalJitter'

const IDENTITY_4X4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

function makeTemporalFrameState(): SchrodingerFrameState {
  return {
    versions: {} as SchrodingerFrameState['versions'],
    temporalBayerIndex: 0,
    prevTemporalAnimTime: Number.NaN,
    prevTemporalVPMatrix: new Float32Array(16),
    prevTemporalWidth: 0,
    prevTemporalHeight: 0,
    completedTemporalCycle: false,
    cachedPreset: null,
    cachedPresetConfig: null,
    flattenedPreset: null,
    canonicalDensityCompensation: 1,
    cachedPeakDensity: 0.1,
    boundingRadius: 2,
  }
}

function makeTemporalCtx(
  accumulatedTime: number,
  size = { width: 64, height: 64 }
): WebGPURenderContext {
  return {
    size,
    frame: {
      frameNumber: Math.round(accumulatedTime * 60),
      delta: 1 / 60,
      time: accumulatedTime,
      size,
      stores: {
        camera: {
          viewProjectionMatrix: { elements: IDENTITY_4X4 },
          position: { x: 0, y: 0, z: 4 },
        },
        animation: { accumulatedTime },
      },
    },
  } as unknown as WebGPURenderContext
}

function makeAnalyticStrategy(): QuantumModeStrategy {
  return {
    isComputeMode: false,
    configureShader: () => undefined,
    setup: () => ({
      initPromises: [],
      additionalLayoutEntries: [],
      getBindGroupEntries: () => [],
    }),
    computeBoundingRadius: () => null,
    executeFrame: () => undefined,
    dispose: () => undefined,
  } as QuantumModeStrategy
}

describe('quantizeBoundingRadius', () => {
  // Quant step = 0.05; rebuild threshold = 0.05.
  it('returns null when the change is below the rebuild threshold', () => {
    // Same value → ceil(2.0 / 0.05)*0.05 = 2.0; |2.0 − 2.0| = 0 < 0.05.
    expect(quantizeBoundingRadius(2.0, 2.0)).toBeNull()
    // raw 1.99 → ceil quantizes to 2.0; current 2.0 → diff 0 → null.
    expect(quantizeBoundingRadius(1.99, 2.0)).toBeNull()
  })

  it('returns the quantized value when |Δ| meets the rebuild threshold', () => {
    // 2.05 - 2.0 = 0.05 → exactly threshold → rebuild
    expect(quantizeBoundingRadius(2.05, 2.0)).toBeCloseTo(2.05, 6)
  })

  it('rounds the raw value UP to the next 0.05 step (Math.ceil)', () => {
    // 2.06 ceil to 0.05 → 2.10
    expect(quantizeBoundingRadius(2.06, 1.0)).toBeCloseTo(2.1, 6)
    // 2.001 ceil to 0.05 → 2.05
    expect(quantizeBoundingRadius(2.001, 1.0)).toBeCloseTo(2.05, 6)
  })

  it('returns null when the quantized result is within threshold of current', () => {
    // raw 2.001 → quantized 2.05; current 2.05 → diff 0 → no rebuild.
    expect(quantizeBoundingRadius(2.001, 2.05)).toBeNull()
  })

  it('handles a downward shrink: smaller raw than current, rebuild only if outside threshold', () => {
    // raw 1.95 ceil → 1.95; current 2.10 → diff 0.15 ≥ 0.05 → rebuild.
    expect(quantizeBoundingRadius(1.95, 2.1)).toBeCloseTo(1.95, 6)
  })
})

describe('computeCameraUpdate temporal Bayer phase', () => {
  it('advances static scenes through one full Bayer cycle and then freezes', () => {
    let index = 0
    let completedFullCycle = false

    for (const expected of [1, 2, 3, 0]) {
      const next = advanceTemporalBayerCycle(index, completedFullCycle, false)
      index = next.index
      completedFullCycle = next.completedFullCycle
      expect(index).toBe(expected)
    }

    expect(completedFullCycle).toBe(true)
    expect(advanceTemporalBayerCycle(index, completedFullCycle, false)).toEqual({
      index: 0,
      completedFullCycle: true,
    })
    expect(advanceTemporalBayerCycle(index, completedFullCycle, true)).toEqual({
      index: 1,
      completedFullCycle: false,
    })
  })

  it('packs the current Bayer phase before advancing state for the next frame', () => {
    const state = makeTemporalFrameState()
    const data = new Float32Array(132)
    const dataView = new DataView(data.buffer)

    computeCameraUpdate(makeTemporalCtx(0), { dimension: 4 }, state, data, dataView)

    expect([data[124], data[125]]).toEqual([0, 0])
    expect(state.temporalBayerIndex).toBe(1)

    computeCameraUpdate(makeTemporalCtx(1 / 60), { dimension: 4 }, state, data, dataView)

    expect([data[124], data[125]]).toEqual([1, 1])
    expect(state.temporalBayerIndex).toBe(2)
  })

  it('restarts Bayer cycling when render resolution changes after a completed static cycle', () => {
    const state = makeTemporalFrameState()
    const data = new Float32Array(132)
    const dataView = new DataView(data.buffer)

    computeCameraUpdate(makeTemporalCtx(0), { dimension: 4 }, state, data, dataView)
    computeCameraUpdate(makeTemporalCtx(0), { dimension: 4 }, state, data, dataView)
    computeCameraUpdate(makeTemporalCtx(0), { dimension: 4 }, state, data, dataView)
    computeCameraUpdate(makeTemporalCtx(0), { dimension: 4 }, state, data, dataView)
    expect([data[124], data[125]]).toEqual([0, 1])
    expect(state.completedTemporalCycle).toBe(true)

    computeCameraUpdate(makeTemporalCtx(0), { dimension: 4 }, state, data, dataView)
    expect([data[124], data[125]]).toEqual([0, 0])

    computeCameraUpdate(
      makeTemporalCtx(0, { width: 96, height: 64 }),
      { dimension: 4 },
      state,
      data,
      dataView
    )
    expect([data[124], data[125]]).toEqual([0, 0])

    computeCameraUpdate(
      makeTemporalCtx(0, { width: 96, height: 64 }),
      { dimension: 4 },
      state,
      data,
      dataView
    )
    expect([data[124], data[125]]).toEqual([1, 1])
  })
})

describe('computeSchroedingerUpdate preset invariants', () => {
  it('canonicalizes named preset cache metadata before packing uniforms', () => {
    const state = makeTemporalFrameState()
    const buffer = new ArrayBuffer(SCHROEDINGER_LAYOUT.totalSize)
    const floatView = new Float32Array(buffer)
    const intView = new Int32Array(buffer)
    const ctx = {
      frame: {
        time: 0,
        stores: {
          geometry: { dimension: 3 },
          animation: { accumulatedTime: 0 },
          appearance: { colorAlgorithm: 'radialDistance', appearanceVersion: 1 },
          performance: { qualityMultiplier: 1 },
          pbr: { pbrVersion: 0 },
          extended: {
            schroedingerVersion: 1,
            schroedinger: {
              quantumMode: 'harmonicOscillator',
              presetName: 'groundState',
              seed: 999,
              termCount: 8,
              maxQuantumNumber: 6,
              frequencySpread: 0.5,
            },
          },
        },
      },
    } as unknown as WebGPURenderContext

    computeSchroedingerUpdate(
      ctx,
      { dimension: 3, quantumMode: 'harmonicOscillator', termCount: 8 },
      makeAnalyticStrategy(),
      state,
      floatView,
      intView
    )

    expect(state.cachedPreset?.termCount).toBe(1)
    expect(state.cachedPresetConfig?.termCount).toBe(1)
    expect(intView[SCHROEDINGER_LAYOUT.index.termCount]).toBe(1)
  })
})
