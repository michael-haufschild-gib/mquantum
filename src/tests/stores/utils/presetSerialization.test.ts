import { describe, expect, it } from 'vitest'
import { sanitizeLoadedState } from '@/stores/utils/presetSerialization'

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
