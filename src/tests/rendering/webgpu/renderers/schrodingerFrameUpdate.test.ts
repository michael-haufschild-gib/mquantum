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

  it('rebuilds on every one-bucket growth despite inexact 0.05 multiples', () => {
    // Regression: 2.1 − 2.0500000000000003 = 0.04999999999999982 < 0.05, so
    // roughly half of all one-bucket transitions were ignored and the sphere
    // stayed one bucket smaller than the physics radius.
    let current = 2.0
    for (let bucket = 41; bucket < 400; bucket++) {
      const raw = bucket * 0.05 - 0.01
      const next = quantizeBoundingRadius(raw, current)
      expect(next).toBeCloseTo(bucket * 0.05, 9)
      expect(next!).toBeGreaterThanOrEqual(raw)
      current = next!
    }
  })

  it('ignores non-finite or non-positive raw radii', () => {
    expect(quantizeBoundingRadius(Number.NaN, 2.0)).toBeNull()
    expect(quantizeBoundingRadius(Number.POSITIVE_INFINITY, 2.0)).toBeNull()
    expect(quantizeBoundingRadius(0, 2.0)).toBeNull()
    expect(quantizeBoundingRadius(-3, 2.0)).toBeNull()
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
          performance: {},
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

describe('computeSchroedingerUpdate canonical compensation scope', () => {
  function packedDensityGain(quantumMode: string, presetName: string): number {
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
          performance: {},
          pbr: { pbrVersion: 0 },
          extended: {
            schroedingerVersion: 1,
            schroedinger: { quantumMode, presetName, densityGain: 2 },
          },
        },
      },
    } as unknown as WebGPURenderContext

    computeSchroedingerUpdate(
      ctx,
      { dimension: 3, quantumMode: quantumMode as 'harmonicOscillator' },
      makeAnalyticStrategy(),
      state,
      floatView,
      intView
    )
    return floatView[SCHROEDINGER_LAYOUT.index.densityGain]!
  }

  it('keeps non-HO analytic density gain independent of the hidden HO preset', () => {
    // Regression: hydrogen (and every other non-compute analytic mode) folded
    // the HO superposition's compensation into densityGain, so an HO preset
    // left in the store changed hydrogen brightness by up to ~10x.
    const reference = packedDensityGain('hydrogenND', 'groundState')
    expect(packedDensityGain('hydrogenND', 'richSuperposition')).toBeCloseTo(reference, 3)
    expect(packedDensityGain('hydrogenND', 'nodalStructure')).toBeCloseTo(reference, 3)
  })

  it('still derives HO density gain from the rendered HO preset', () => {
    const ground = packedDensityGain('harmonicOscillator', 'groundState')
    const rich = packedDensityGain('harmonicOscillator', 'richSuperposition')
    // Richer superpositions have a lower dominant-term peak → larger gain.
    expect(rich).toBeGreaterThan(ground * 2)
  })
})

// Regression: the compensation (∝ 1/boundingRadius) was refreshed only on
// preset regeneration, so changing fieldScale (or momentum scale, ħ, hydrogen
// n …) kept the gain of the old radius — the same state rendered at a
// different brightness depending on how it was reached.
describe('computeSchroedingerUpdate compensation follows the bounding radius', () => {
  function ctxFor(version: number, fieldScale: number): WebGPURenderContext {
    return {
      frame: {
        time: 0,
        stores: {
          geometry: { dimension: 3 },
          animation: { accumulatedTime: 0 },
          appearance: { colorAlgorithm: 'radialDistance', appearanceVersion: 1 },
          performance: {},
          pbr: { pbrVersion: 0 },
          extended: {
            schroedingerVersion: version,
            schroedinger: {
              quantumMode: 'harmonicOscillator',
              presetName: 'groundState',
              densityGain: 2,
              fieldScale,
            },
          },
        },
      },
    } as unknown as WebGPURenderContext
  }

  function run(state: SchrodingerFrameState, ctx: WebGPURenderContext) {
    const buffer = new ArrayBuffer(SCHROEDINGER_LAYOUT.totalSize)
    const floatView = new Float32Array(buffer)
    const intView = new Int32Array(buffer)
    computeSchroedingerUpdate(
      ctx,
      { dimension: 3, quantumMode: 'harmonicOscillator' },
      makeAnalyticStrategy(),
      state,
      floatView,
      intView
    )
    return { gain: floatView[SCHROEDINGER_LAYOUT.index.densityGain]!, radius: state.boundingRadius }
  }

  it('matches a fresh load after a fieldScale change', () => {
    const interactive = makeTemporalFrameState()
    const before = run(interactive, ctxFor(1, 1))
    const after = run(interactive, ctxFor(2, 0.5))
    const fresh = run(makeTemporalFrameState(), ctxFor(1, 0.5))

    expect(after.radius).toBeGreaterThan(before.radius * 1.5)
    expect(fresh.radius).toBe(after.radius)
    expect(after.gain).toBeCloseTo(fresh.gain, 6)
    expect(after.gain).toBeLessThan(before.gain * 0.75)
  })
})

// Regression: in the HO momentum representation the shader draws φ(x; ω_k)
// with ω_k = s²/(ħ²ω), but the density gain and the peakDensity uniform (the
// ρ normaliser of the colour / iso / HQ paths) were calibrated on the position
// ω — at momentum scale 0.1 the calibrated peak was ~500× too high in 3D.
describe('computeSchroedingerUpdate momentum-space calibration', () => {
  function momentumCtx(version: number, representation: string, momentumScale: number) {
    return {
      frame: {
        time: 0,
        stores: {
          geometry: { dimension: 3 },
          animation: { accumulatedTime: 0 },
          appearance: { colorAlgorithm: 'radialDistance', appearanceVersion: 1 },
          performance: {},
          pbr: { pbrVersion: 0 },
          extended: {
            schroedingerVersion: version,
            schroedinger: {
              quantumMode: 'harmonicOscillator',
              presetName: 'groundState',
              densityGain: 2,
              representation,
              momentumScale,
              momentumDisplayUnits: 'k',
            },
          },
        },
      },
    } as unknown as WebGPURenderContext
  }

  function peakOf(state: SchrodingerFrameState, ctx: WebGPURenderContext): number {
    const buffer = new ArrayBuffer(SCHROEDINGER_LAYOUT.totalSize)
    computeSchroedingerUpdate(
      ctx,
      { dimension: 3, quantumMode: 'harmonicOscillator' },
      makeAnalyticStrategy(),
      state,
      new Float32Array(buffer),
      new Int32Array(buffer)
    )
    return new Float32Array(buffer)[SCHROEDINGER_LAYOUT.index.peakDensity]!
  }

  it('calibrates on the rendered frequencies: peak ratio = Π √(ω_k/ω) = Π s/ω', () => {
    const posState = makeTemporalFrameState()
    const position = peakOf(posState, momentumCtx(1, 'position', 1))
    const momentum = peakOf(makeTemporalFrameState(), momentumCtx(1, 'momentum', 0.1))
    const omega = posState.cachedPreset!.omega
    const expected = omega.slice(0, 3).reduce((acc, w) => acc * (0.1 / w), 1)
    expect(momentum / position).toBeCloseTo(expected, 6)
  })

  it('refreshes when the momentum scale changes with the radius pinned at its minimum', () => {
    const interactive = makeTemporalFrameState()
    peakOf(interactive, momentumCtx(1, 'momentum', 3))
    const radiusBefore = interactive.boundingRadius
    const after = peakOf(interactive, momentumCtx(2, 'momentum', 4))
    const fresh = peakOf(makeTemporalFrameState(), momentumCtx(1, 'momentum', 4))

    expect(interactive.boundingRadius).toBe(radiusBefore) // no radius change to key on
    expect(after).toBeCloseTo(fresh, 6)
  })
})
