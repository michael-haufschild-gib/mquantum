import { describe, expect, it } from 'vitest'
import type { WebGPURenderContext } from '@/rendering/webgpu/core/types'
import {
  ToneMappingCinematicPass,
  ToneMappingMode,
} from '@/rendering/webgpu/passes/ToneMappingCinematicPass'

interface ToneMappingInternals {
  toneMapping: ToneMappingMode
  exposure: number
  aberration: number
  vignette: number
  grain: number
  updateFromStores: (ctx: WebGPURenderContext) => void
}

function asInternals(pass: ToneMappingCinematicPass): ToneMappingInternals {
  return pass as unknown as ToneMappingInternals
}

describe('ToneMappingCinematicPass input sanitization', () => {
  it('ignores non-finite values from store synchronization', () => {
    const pass = new ToneMappingCinematicPass({
      colorInput: 'hdr-color',
      outputResource: 'ldr-color',
    })
    const internals = asInternals(pass)

    const before = {
      exposure: internals.exposure,
      aberration: internals.aberration,
      vignette: internals.vignette,
      grain: internals.grain,
      toneMapping: internals.toneMapping,
    }

    internals.updateFromStores({
      frame: {
        stores: {
          lighting: {
            exposure: Number.NaN,
            toneMappingEnabled: true,
            toneMappingAlgorithm: 'aces',
          },
          postProcessing: {
            cinematicEnabled: true,
            cinematicAberration: Number.POSITIVE_INFINITY,
            cinematicVignette: Number.NEGATIVE_INFINITY,
            cinematicGrain: Number.NaN,
          },
        },
      },
    } as unknown as WebGPURenderContext)

    expect(internals.exposure).toBe(before.exposure)
    expect(internals.aberration).toBe(before.aberration)
    expect(internals.vignette).toBe(before.vignette)
    expect(internals.grain).toBe(before.grain)
    expect(internals.toneMapping).toBe(before.toneMapping)
  })

  it('clamps finite out-of-range store values to uniform-safe bounds', () => {
    const pass = new ToneMappingCinematicPass({
      colorInput: 'hdr-color',
      outputResource: 'ldr-color',
    })
    const internals = asInternals(pass)

    internals.updateFromStores({
      frame: {
        stores: {
          lighting: {
            exposure: 999,
            toneMappingEnabled: true,
            toneMappingAlgorithm: 'reinhard',
          },
          postProcessing: {
            cinematicEnabled: true,
            cinematicAberration: -1,
            cinematicVignette: 99,
            cinematicGrain: -5,
          },
        },
      },
    } as unknown as WebGPURenderContext)

    expect(internals.exposure).toBe(3)
    expect(internals.aberration).toBe(0)
    expect(internals.vignette).toBe(3)
    expect(internals.grain).toBe(0)
    expect(internals.toneMapping).toBe(ToneMappingMode.Reinhard)
  })

  it('sanitizes constructor and setter numeric inputs', () => {
    const pass = new ToneMappingCinematicPass({
      colorInput: 'hdr-color',
      outputResource: 'ldr-color',
      exposure: Number.POSITIVE_INFINITY,
      aberration: -2,
      vignette: 99,
      grain: -9,
    })
    const internals = asInternals(pass)

    expect(internals.exposure).toBe(1.0)
    expect(internals.aberration).toBe(0)
    expect(internals.vignette).toBe(3)
    expect(internals.grain).toBe(0)

    pass.setExposure(-10)
    pass.setAberration(10)
    pass.setVignette(-5)
    pass.setGrain(10)

    expect(internals.exposure).toBe(0.1)
    expect(internals.aberration).toBe(0.1)
    expect(internals.vignette).toBe(0)
    expect(internals.grain).toBe(0.2)

    pass.setExposure(Number.NaN)
    pass.setAberration(Number.POSITIVE_INFINITY)
    pass.setVignette(Number.NaN)
    pass.setGrain(Number.NEGATIVE_INFINITY)

    expect(internals.exposure).toBe(0.1)
    expect(internals.aberration).toBe(0.1)
    expect(internals.vignette).toBe(0)
    expect(internals.grain).toBe(0.2)
  })
})
