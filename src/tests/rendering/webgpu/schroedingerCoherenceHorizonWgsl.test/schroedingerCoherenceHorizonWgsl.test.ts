import { describe, expect, it } from 'vitest'

import {
  buildShaderConfig,
  computePipelineCacheKey,
} from '@/rendering/webgpu/renderers/rendererConfigUtils'
import {
  SCHROEDINGER_LAYOUT,
  SCHROEDINGER_UNIFORM_SIZE,
} from '@/rendering/webgpu/renderers/schroedingerLayout'
import { packCoherenceHorizon } from '@/rendering/webgpu/renderers/uniformPackingBackreaction'
import { composeSchroedingerShader } from '@/rendering/webgpu/shaders/schroedinger/compose'

const I = SCHROEDINGER_LAYOUT.index

function chConfig(dimension = 3) {
  return buildShaderConfig({ quantumMode: 'coherenceHorizon', dimension })
}

describe('buildShaderConfig — coherenceHorizon', () => {
  it('selects the dedicated geodesic configuration', () => {
    const config = chConfig()
    expect(config.isCoherenceHorizon).toBe(true)
    expect(config.useDensityGrid).toBe(false)
    expect(config.useEigenfunctionCache).toBe(false)
    expect(config.temporalAccumulation).toBe(false)
    expect(config.isosurface).toBe(false)
    expect(config.isWigner).toBe(false)
    expect(config.nodal).toBe(false)
    expect(config.crossSectionEnabled).toBe(false)
    expect(config.probabilityCurrentEnabled).toBe(false)
    expect(config.useDensityMatrix).toBe(false)
    expect(config.isFreeScalar).toBe(false)
  })

  it('never enters the 2D/temporal pipeline even with stale wigner/temporal config', () => {
    const config = buildShaderConfig({
      quantumMode: 'coherenceHorizon',
      dimension: 3,
      representation: 'wigner',
      temporal: true,
    })
    expect(config.isWigner).toBe(false)
    expect(config.temporalAccumulation).toBe(false)
  })

  it('produces a cache key distinct from harmonic oscillator', () => {
    const ch = chConfig()
    const ho = buildShaderConfig({ quantumMode: 'harmonicOscillator', dimension: 3 })
    expect(computePipelineCacheKey(ch, { quantumMode: 'coherenceHorizon', dimension: 3 })).not.toBe(
      computePipelineCacheKey(ho, { quantumMode: 'harmonicOscillator', dimension: 3 })
    )
  })
})

describe('composeSchroedingerShader — coherenceHorizon', () => {
  it('composes the geodesic main block with the CH define and feature tag', () => {
    const { wgsl, features } = composeSchroedingerShader(chConfig())
    expect(wgsl).toContain('const IS_COHERENCE_HORIZON: bool = true;')
    expect(wgsl).toContain('Coherence Horizon — Geodesic Raymarch Main')
    expect(wgsl).toContain('fn chEmissionColor')
    expect(wgsl).toContain('fn fragmentMain')
    expect(features).toContain('Coherence Horizon Geodesics')
  })

  it('excludes the volume raymarch and quantum-math chains entirely', () => {
    const { wgsl } = composeSchroedingerShader(chConfig())
    expect(wgsl).not.toContain('fn volumeRaymarch')
    expect(wgsl).not.toContain('fn computeEmissionLit')
    expect(wgsl).not.toContain('fn evaluateCrossSectionSample')
    // No density-grid or eigencache bindings — the strategy declares none.
    expect(wgsl).not.toContain('@group(2) @binding(4)')
    expect(wgsl).not.toContain('@group(2) @binding(2)')
  })

  it('keeps the required support blocks (uniforms, basis, HSL, sphere intersect)', () => {
    const { wgsl } = composeSchroedingerShader(chConfig())
    expect(wgsl).toContain('struct SchroedingerUniforms')
    expect(wgsl).toContain('fn transformToND')
    expect(wgsl).toContain('fn hsl2rgb')
    expect(wgsl).toContain('fn intersectSphere')
  })

  it('bakes the spatial dimension into ACTUAL_DIM across 3..11', () => {
    for (const dimension of [3, 7, 11]) {
      const { wgsl } = composeSchroedingerShader(chConfig(dimension))
      expect(wgsl).toContain(`const ACTUAL_DIM: i32 = ${dimension};`)
    }
  })
})

describe('packCoherenceHorizon', () => {
  function makeViews() {
    const buffer = new ArrayBuffer(SCHROEDINGER_UNIFORM_SIZE)
    return { floatView: new Float32Array(buffer) }
  }

  const config = {
    coherenceHorizon: {
      decoherence: 0.5,
      separation: 1.6,
      width: 0.45,
      waveNumber: 5,
      horizonScale: 0.5,
      ringGain: 2.2,
      glow: 1.2,
      preset: 'custom' as const,
    },
  }

  it('zeroes every field when another mode is active', () => {
    const { floatView } = makeViews()
    floatView.fill(123)
    packCoherenceHorizon(floatView, config, false, 3)
    expect(floatView[I.coherenceHorizonDecoherence]).toBe(0)
    expect(floatView[I.coherenceHorizonSeparation]).toBe(0)
    expect(floatView[I.coherenceHorizonWidth]).toBe(0)
    expect(floatView[I.coherenceHorizonWaveNumber]).toBe(0)
    expect(floatView[I.coherenceHorizonRadius]).toBe(0)
    expect(floatView[I.coherenceHorizonMetricExponent]).toBe(0)
    expect(floatView[I.coherenceHorizonRingGain]).toBe(0)
    expect(floatView[I.coherenceHorizonGlow]).toBe(0)
  })

  it('packs the CPU-precomputed Tangherlini radius and metric exponent', () => {
    const { floatView } = makeViews()
    packCoherenceHorizon(floatView, config, true, 3)
    // d=3: r_h = 0.5 * (1 - 0.5) = 0.25; exponent d-2 = 1.
    expect(floatView[I.coherenceHorizonRadius]).toBeCloseTo(0.25, 6)
    expect(floatView[I.coherenceHorizonMetricExponent]).toBe(1)
    expect(floatView[I.coherenceHorizonDecoherence]).toBeCloseTo(0.5, 6)
    expect(floatView[I.coherenceHorizonRingGain]).toBeCloseTo(2.2, 6)
  })

  it('packs a zero radius at full decoherence (evaporated horizon)', () => {
    const { floatView } = makeViews()
    packCoherenceHorizon(
      floatView,
      { coherenceHorizon: { ...config.coherenceHorizon, decoherence: 1 } },
      true,
      5
    )
    expect(floatView[I.coherenceHorizonRadius]).toBe(0)
    expect(floatView[I.coherenceHorizonMetricExponent]).toBe(3)
  })

  it('clamps non-finite and out-of-range values to the documented ranges', () => {
    const { floatView } = makeViews()
    packCoherenceHorizon(
      floatView,
      {
        coherenceHorizon: {
          ...config.coherenceHorizon,
          decoherence: Number.NaN,
          separation: 99,
          width: -1,
          waveNumber: 50,
          ringGain: -2,
          glow: 100,
        },
      },
      true,
      3
    )
    expect(floatView[I.coherenceHorizonDecoherence]).toBe(0)
    expect(floatView[I.coherenceHorizonSeparation]).toBe(3)
    expect(floatView[I.coherenceHorizonWidth]).toBeCloseTo(0.15, 6)
    expect(floatView[I.coherenceHorizonWaveNumber]).toBe(12)
    expect(floatView[I.coherenceHorizonRingGain]).toBe(0)
    expect(floatView[I.coherenceHorizonGlow]).toBe(4)
  })
})
