import { describe, expect, it } from 'vitest'
import {
  sanitizeLoadedState,
  sanitizeExtendedLoadedState,
  serializeExtendedState,
} from '@/stores/utils/presetSerialization'

describe('sanitizeLoadedState', () => {
  it('removes legacy faceOpacity fields from appearance payloads', () => {
    const sanitized = sanitizeLoadedState({
      faceOpacity: 0.5,
      shaderSettings: {
        wireframe: { lineThickness: 1 },
        surface: {
          faceOpacity: 0.25,
          specularIntensity: 0.8,
        },
      },
    })
    const shaderSettings = sanitized.shaderSettings as {
      surface: Record<string, unknown> & { specularIntensity: number }
    }

    expect('faceOpacity' in sanitized).toBe(false)
    expect('faceOpacity' in shaderSettings.surface).toBe(false)
    expect(shaderSettings.surface.specularIntensity).toBe(0.8)
  })
})

describe('sanitizeExtendedLoadedState', () => {
  it('strips sqLayer transient fields from nested schroedinger config', () => {
    const input = {
      schroedinger: {
        quantumMode: 'harmonicOscillator',
        termCount: 3,
        sqLayerEnabled: true,
        sqLayerMode: 'coherent',
        sqLayerCoherentAlphaRe: 2.5,
        sqLayerSelectedModeIndex: 1,
      },
    }
    const sanitized = sanitizeExtendedLoadedState(input)
    const config = sanitized.schroedinger as Record<string, unknown>

    // Non-transient fields preserved
    expect(config.quantumMode).toBe('harmonicOscillator')
    expect(config.termCount).toBe(3)

    // Transient sqLayer fields stripped
    expect('sqLayerEnabled' in config).toBe(false)
    expect('sqLayerMode' in config).toBe(false)
    expect('sqLayerCoherentAlphaRe' in config).toBe(false)
    expect('sqLayerSelectedModeIndex' in config).toBe(false)
  })
})

describe('serializeExtendedState', () => {
  it('excludes sqLayer transient fields from serialized schroedinger config', () => {
    const state = {
      schroedinger: {
        quantumMode: 'harmonicOscillator',
        termCount: 3,
        sqLayerEnabled: true,
        sqLayerMode: 'coherent',
        sqLayerCoherentAlphaRe: 2.5,
        sqLayerCoherentAlphaIm: 0,
        sqLayerSqueezeR: 0.5,
        sqLayerSqueezeTheta: 0,
        sqLayerSelectedModeIndex: 1,
        sqLayerShowOccupation: true,
        sqLayerShowUncertainty: false,
      },
    }
    const serialized = serializeExtendedState(state, 'schroedinger')
    const config = serialized.schroedinger as Record<string, unknown>

    // Non-transient fields preserved
    expect(config.quantumMode).toBe('harmonicOscillator')
    expect(config.termCount).toBe(3)

    // All sqLayer transient fields excluded
    expect('sqLayerEnabled' in config).toBe(false)
    expect('sqLayerMode' in config).toBe(false)
    expect('sqLayerCoherentAlphaRe' in config).toBe(false)
    expect('sqLayerCoherentAlphaIm' in config).toBe(false)
    expect('sqLayerSqueezeR' in config).toBe(false)
    expect('sqLayerSqueezeTheta' in config).toBe(false)
    expect('sqLayerSelectedModeIndex' in config).toBe(false)
    expect('sqLayerShowOccupation' in config).toBe(false)
    expect('sqLayerShowUncertainty' in config).toBe(false)
  })
})
