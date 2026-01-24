/**
 * Tests for Shadow URL Serialization
 */

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SHADOW_ENABLED,
  DEFAULT_SHADOW_QUALITY,
  DEFAULT_SHADOW_SOFTNESS,
  DEFAULT_SHADOW_ANIMATION_MODE,
  SHADOW_SOFTNESS_RANGE,
  URL_KEY_SHADOW_ENABLED,
  URL_KEY_SHADOW_QUALITY,
  URL_KEY_SHADOW_SOFTNESS,
  URL_KEY_SHADOW_ANIMATION_MODE,
} from '@/rendering/shadows/constants'
import { deserializeState, serializeState, type ShareableState } from '@/lib/url/state-serializer'

describe('Shadow URL Serialization', () => {
  describe('serializeState', () => {
    it('should not serialize default shadow values', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'mandelbulb',
        shadowEnabled: DEFAULT_SHADOW_ENABLED,
        shadowQuality: DEFAULT_SHADOW_QUALITY,
        shadowSoftness: DEFAULT_SHADOW_SOFTNESS,
        shadowAnimationMode: DEFAULT_SHADOW_ANIMATION_MODE,
      }

      const result = serializeState(state)
      expect(result).not.toContain(URL_KEY_SHADOW_ENABLED)
      expect(result).not.toContain(URL_KEY_SHADOW_QUALITY)
      expect(result).not.toContain(URL_KEY_SHADOW_SOFTNESS)
      expect(result).not.toContain(URL_KEY_SHADOW_ANIMATION_MODE)
    })

    it('should serialize shadowEnabled when true', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'mandelbulb',
        shadowEnabled: true,
      }

      const result = serializeState(state)
      expect(result).toContain(`${URL_KEY_SHADOW_ENABLED}=1`)
    })

    it('should serialize non-default shadow quality as string', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'mandelbulb',
        shadowQuality: 'high',
      }

      const result = serializeState(state)
      expect(result).toContain(`${URL_KEY_SHADOW_QUALITY}=high`)
    })

    it('should serialize all shadow quality levels correctly', () => {
      const qualities: Array<ShareableState['shadowQuality']> = ['low', 'high', 'ultra']

      for (const quality of qualities) {
        const state: ShareableState = {
          dimension: 4,
          objectType: 'mandelbulb',
          shadowQuality: quality,
        }

        const result = serializeState(state)
        expect(result).toContain(`${URL_KEY_SHADOW_QUALITY}=${quality}`)
      }
    })

    it('should serialize non-default shadow softness with 1 decimal precision', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'mandelbulb',
        shadowSoftness: 1.5,
      }

      const result = serializeState(state)
      expect(result).toContain(`${URL_KEY_SHADOW_SOFTNESS}=1.5`)
    })

    it('should serialize non-default animation mode correctly', () => {
      // 'low' is the default and won't be serialized
      // Only 'full' should appear in URL since it's non-default
      const state: ShareableState = {
        dimension: 4,
        objectType: 'mandelbulb',
        shadowAnimationMode: 'full',
      }

      const result = serializeState(state)
      expect(result).toContain(`${URL_KEY_SHADOW_ANIMATION_MODE}=full`)
    })

    it('should not serialize default animation mode (low)', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'mandelbulb',
        shadowAnimationMode: 'low',
      }

      const result = serializeState(state)
      expect(result).not.toContain(URL_KEY_SHADOW_ANIMATION_MODE)
    })

    it('should serialize complete shadow configuration', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'mandelbulb',
        shadowEnabled: true,
        shadowQuality: 'ultra',
        shadowSoftness: 1.8,
        shadowAnimationMode: 'full',
      }

      const result = serializeState(state)
      expect(result).toContain(`${URL_KEY_SHADOW_ENABLED}=1`)
      expect(result).toContain(`${URL_KEY_SHADOW_QUALITY}=ultra`)
      expect(result).toContain(`${URL_KEY_SHADOW_SOFTNESS}=1.8`)
      expect(result).toContain(`${URL_KEY_SHADOW_ANIMATION_MODE}=full`)
    })
  })

  describe('deserializeState', () => {
    it('should deserialize shadowEnabled', () => {
      const params = `d=4&t=mandelbulb&${URL_KEY_SHADOW_ENABLED}=1`
      const result = deserializeState(params)

      expect(result.shadowEnabled).toBe(true)
    })

    it('should deserialize shadowEnabled as false when 0', () => {
      const params = `d=4&t=mandelbulb&${URL_KEY_SHADOW_ENABLED}=0`
      const result = deserializeState(params)

      expect(result.shadowEnabled).toBe(false)
    })

    it('should deserialize shadow quality from string', () => {
      const qualities: Array<ShareableState['shadowQuality']> = ['low', 'medium', 'high', 'ultra']

      for (const quality of qualities) {
        const params = `d=4&t=mandelbulb&${URL_KEY_SHADOW_QUALITY}=${quality}`
        const result = deserializeState(params)
        expect(result.shadowQuality).toBe(quality)
      }
    })

    it('should deserialize shadow softness', () => {
      const params = `d=4&t=mandelbulb&${URL_KEY_SHADOW_SOFTNESS}=1.5`
      const result = deserializeState(params)

      expect(result.shadowSoftness).toBe(1.5)
    })

    it('should deserialize shadow animation mode from string', () => {
      const modes: Array<ShareableState['shadowAnimationMode']> = ['pause', 'low', 'full']

      for (const mode of modes) {
        const params = `d=4&t=mandelbulb&${URL_KEY_SHADOW_ANIMATION_MODE}=${mode}`
        const result = deserializeState(params)
        expect(result.shadowAnimationMode).toBe(mode)
      }
    })

    it('should handle invalid shadow quality gracefully', () => {
      const params = `d=4&t=mandelbulb&${URL_KEY_SHADOW_QUALITY}=invalid`
      const result = deserializeState(params)

      expect(result.shadowQuality).toBeUndefined()
    })

    it('should handle invalid shadow animation mode gracefully', () => {
      const params = `d=4&t=mandelbulb&${URL_KEY_SHADOW_ANIMATION_MODE}=invalid`
      const result = deserializeState(params)

      expect(result.shadowAnimationMode).toBeUndefined()
    })

    it('should validate shadow softness minimum', () => {
      const params = `d=4&t=mandelbulb&${URL_KEY_SHADOW_SOFTNESS}=-0.5`
      const result = deserializeState(params)

      expect(result.shadowSoftness).toBeUndefined()
    })

    it('should validate shadow softness maximum', () => {
      const params = `d=4&t=mandelbulb&${URL_KEY_SHADOW_SOFTNESS}=${SHADOW_SOFTNESS_RANGE.max + 1}`
      const result = deserializeState(params)

      expect(result.shadowSoftness).toBeUndefined()
    })

    it('should deserialize complete shadow configuration', () => {
      const params = `d=4&t=mandelbulb&${URL_KEY_SHADOW_ENABLED}=1&${URL_KEY_SHADOW_QUALITY}=ultra&${URL_KEY_SHADOW_SOFTNESS}=1.8&${URL_KEY_SHADOW_ANIMATION_MODE}=full`
      const result = deserializeState(params)

      expect(result.shadowEnabled).toBe(true)
      expect(result.shadowQuality).toBe('ultra')
      expect(result.shadowSoftness).toBe(1.8)
      expect(result.shadowAnimationMode).toBe('full')
    })
  })

  describe('Round-trip serialization', () => {
    it('should preserve shadowEnabled through round-trip', () => {
      const original: ShareableState = {
        dimension: 4,
        objectType: 'mandelbulb',
        shadowEnabled: true,
      }

      const serialized = serializeState(original)
      const deserialized = deserializeState(serialized)

      expect(deserialized.shadowEnabled).toBe(true)
    })

    it('should preserve shadow quality through round-trip', () => {
      const qualities: Array<ShareableState['shadowQuality']> = ['low', 'medium', 'high', 'ultra']

      for (const quality of qualities) {
        const original: ShareableState = {
          dimension: 4,
          objectType: 'mandelbulb',
          shadowQuality: quality,
        }

        const serialized = serializeState(original)
        const deserialized = deserializeState(serialized)

        // Default values aren't serialized, so they won't be in the result
        if (quality === DEFAULT_SHADOW_QUALITY) {
          expect(deserialized.shadowQuality).toBeUndefined()
        } else {
          expect(deserialized.shadowQuality).toBe(quality)
        }
      }
    })

    it('should preserve shadow softness through round-trip (1 decimal precision)', () => {
      // Use value that rounds to 1 decimal cleanly
      const original: ShareableState = {
        dimension: 4,
        objectType: 'mandelbulb',
        shadowSoftness: 1.4,
      }

      const serialized = serializeState(original)
      const deserialized = deserializeState(serialized)

      expect(deserialized.shadowSoftness).toBe(1.4)
    })

    it('should preserve shadow animation mode through round-trip', () => {
      const modes: Array<ShareableState['shadowAnimationMode']> = ['pause', 'low', 'full']

      for (const mode of modes) {
        const original: ShareableState = {
          dimension: 4,
          objectType: 'mandelbulb',
          shadowAnimationMode: mode,
        }

        const serialized = serializeState(original)
        const deserialized = deserializeState(serialized)

        // Default values aren't serialized, so they won't be in the result
        if (mode === DEFAULT_SHADOW_ANIMATION_MODE) {
          expect(deserialized.shadowAnimationMode).toBeUndefined()
        } else {
          expect(deserialized.shadowAnimationMode).toBe(mode)
        }
      }
    })

    it('should preserve complete shadow configuration through round-trip', () => {
      // Use values that serialize cleanly with 1 decimal precision
      // Note: 'full' is used instead of 'low' because 'low' is now the default
      // and default values are not serialized
      const original: ShareableState = {
        dimension: 4,
        objectType: 'mandelbulb',
        shadowEnabled: true,
        shadowQuality: 'high',
        shadowSoftness: 0.8,
        shadowAnimationMode: 'full',
      }

      const serialized = serializeState(original)
      const deserialized = deserializeState(serialized)

      expect(deserialized.shadowEnabled).toBe(true)
      expect(deserialized.shadowQuality).toBe('high')
      expect(deserialized.shadowSoftness).toBe(0.8)
      expect(deserialized.shadowAnimationMode).toBe('full')
    })
  })
})
