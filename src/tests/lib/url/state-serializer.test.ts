/**
 * Tests for URL state serializer
 */

import { describe, it, expect } from 'vitest'
import {
  serializeState,
  deserializeState,
  generateShareUrl,
  type ShareableState,
} from '@/lib/url/state-serializer'

describe('state-serializer', () => {
  describe('serializeState', () => {
    it('should serialize basic dimension and objectType', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'hypercube',
      }
      const result = serializeState(state)
      expect(result).toContain('d=4')
      expect(result).toContain('t=hypercube')
    })

    it('should serialize all object types', () => {
      const objectTypes = [
        'hypercube',
        'simplex',
        'cross-polytope',
        'root-system',
        'clifford-torus',
        'mandelbulb',
      ] as const

      for (const type of objectTypes) {
        const state: ShareableState = { dimension: 4, objectType: type }
        const result = serializeState(state)
        expect(result).toContain(`t=${type}`)
      }
    })

    it('should omit uniformScale when it equals 1', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'hypercube',
        uniformScale: 1,
      }
      const result = serializeState(state)
      expect(result).not.toContain('s=')
    })

    it('should include uniformScale when not 1', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'hypercube',
        uniformScale: 1.5,
      }
      const result = serializeState(state)
      expect(result).toContain('s=1.50')
    })

    it('should serialize edgeColor without #', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'hypercube',
        edgeColor: '#FF0000',
      }
      const result = serializeState(state)
      expect(result).toContain('ec=FF0000')
      expect(result).not.toContain('ec=#')
    })

    it('should serialize backgroundColor without #', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'hypercube',
        backgroundColor: '#000000',
      }
      const result = serializeState(state)
      expect(result).toContain('bg=000000')
    })

    it('should serialize edgesVisible=false as ev=0', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'hypercube',
        edgesVisible: false,
      }
      const result = serializeState(state)
      expect(result).toContain('ev=0')
    })

    it('should omit edgesVisible when true (default)', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'hypercube',
        edgesVisible: true,
      }
      const result = serializeState(state)
      expect(result).not.toContain('ev=')
    })

    it('should serialize facesVisible=true as fv=1', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'hypercube',
        facesVisible: true,
      }
      const result = serializeState(state)
      expect(result).toContain('fv=1')
    })

    it('should serialize bloom settings', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'hypercube',
        bloomEnabled: false,
        bloomIntensity: 0.5,
        bloomThreshold: 0.3,
        bloomRadius: 0.2,
      }
      const result = serializeState(state)
      expect(result).toContain('be=0')
      expect(result).toContain('bi=0.50')
      expect(result).toContain('bt=0.30')
      expect(result).toContain('br=0.20')
    })

    it('should serialize tone mapping settings', () => {
      const state: ShareableState = {
        dimension: 4,
        objectType: 'hypercube',
        toneMappingEnabled: false,
        toneMappingAlgorithm: 'reinhard',
        exposure: 1.5,
      }
      const result = serializeState(state)
      expect(result).toContain('tm=0')
      expect(result).toContain('ta=reinhard')
      expect(result).toContain('ex=1.5')
    })

    it('should serialize gravity settings when different from defaults', () => {
      // Use non-default values to ensure they get serialized
      // Defaults: enabled=false, strength=1.0, distortionScale=1.0, falloff=1.5, chromatic=0.0
      const state: ShareableState = {
        dimension: 4,
        objectType: 'hypercube',
        gravityEnabled: true, // different from default (false)
        gravityStrength: 2.5, // different from default (1.0)
        gravityDistortionScale: 2.0, // different from default (1.0)
        gravityFalloff: 2.5, // different from default (1.5)
        gravityChromaticAberration: 0.3, // different from default (0.0)
      }
      const result = serializeState(state)
      expect(result).toContain('ge=1')
      expect(result).toContain('gs=2.50')
      expect(result).toContain('gds=2.00')
      expect(result).toContain('gf=2.5')
      expect(result).toContain('gca=0.30')
    })

    it('should omit gravityEnabled when false (default)', () => {
      // gravityEnabled=false is the default, so it should NOT be serialized
      const state: ShareableState = {
        dimension: 4,
        objectType: 'hypercube',
        gravityEnabled: false,
      }
      const result = serializeState(state)
      // Default values are omitted for shorter URLs
      expect(result).not.toContain('ge=')
    })
  })

  describe('deserializeState', () => {
    it('should deserialize dimension', () => {
      const result = deserializeState('d=5')
      expect(result.dimension).toBe(5)
    })

    it('should clamp dimension to valid range', () => {
      const resultLow = deserializeState('d=1')
      expect(resultLow.dimension).toBeUndefined()

      const resultHigh = deserializeState('d=20')
      expect(resultHigh.dimension).toBeUndefined()
    })

    it('should deserialize objectType', () => {
      const result = deserializeState('t=simplex')
      expect(result.objectType).toBe('simplex')
    })

    it('should deserialize all valid object types', () => {
      const objectTypes = [
        'hypercube',
        'simplex',
        'cross-polytope',
        'root-system',
        'clifford-torus',
        'mandelbulb',
      ]
      for (const type of objectTypes) {
        const result = deserializeState(`t=${type}`)
        expect(result.objectType).toBe(type)
      }
    })

    it('should ignore invalid objectType', () => {
      const result = deserializeState('t=invalid')
      expect(result.objectType).toBeUndefined()
    })

    it('should deserialize uniformScale', () => {
      const result = deserializeState('s=1.50')
      expect(result.uniformScale).toBeCloseTo(1.5)
    })

    it('should ignore invalid uniformScale', () => {
      const result = deserializeState('s=abc')
      expect(result.uniformScale).toBeUndefined()

      const resultNegative = deserializeState('s=-1')
      expect(resultNegative.uniformScale).toBeUndefined()
    })

    it('should deserialize colors with # prefix', () => {
      const result = deserializeState('ec=FF0000&bg=000000')
      expect(result.edgeColor).toBe('#FF0000')
      expect(result.backgroundColor).toBe('#000000')
    })

    it('should ignore invalid hex colors', () => {
      const result = deserializeState('ec=GG0000')
      expect(result.edgeColor).toBeUndefined()
    })

    it('should deserialize edgesVisible', () => {
      expect(deserializeState('ev=0').edgesVisible).toBe(false)
      expect(deserializeState('ev=1').edgesVisible).toBe(true)
    })

    it('should deserialize facesVisible', () => {
      expect(deserializeState('fv=1').facesVisible).toBe(true)
      expect(deserializeState('fv=0').facesVisible).toBe(false)
    })

    it('should deserialize bloom settings', () => {
      const result = deserializeState('be=0&bi=0.50&bt=0.30&br=0.20')
      expect(result.bloomEnabled).toBe(false)
      expect(result.bloomIntensity).toBeCloseTo(0.5)
      expect(result.bloomThreshold).toBeCloseTo(0.3)
      expect(result.bloomRadius).toBeCloseTo(0.2)
    })

    it('should clamp bloom values to valid ranges', () => {
      const result = deserializeState('bi=10&bt=5&br=5')
      // Out of range values should be ignored
      expect(result.bloomIntensity).toBeUndefined()
      expect(result.bloomThreshold).toBeUndefined()
      expect(result.bloomRadius).toBeUndefined()
    })

    it('should deserialize tone mapping settings', () => {
      const result = deserializeState('tm=0&ta=reinhard&ex=1.5')
      expect(result.toneMappingEnabled).toBe(false)
      expect(result.toneMappingAlgorithm).toBe('reinhard')
      expect(result.exposure).toBeCloseTo(1.5)
    })

    it('should deserialize gravity settings', () => {
      const result = deserializeState('ge=1&gs=2.50&gds=1.00&gf=1.5&gca=0.30')
      expect(result.gravityEnabled).toBe(true)
      expect(result.gravityStrength).toBeCloseTo(2.5)
      expect(result.gravityDistortionScale).toBeCloseTo(1.0)
      expect(result.gravityFalloff).toBeCloseTo(1.5)
      expect(result.gravityChromaticAberration).toBeCloseTo(0.3)
    })

    it('should deserialize gravityEnabled', () => {
      expect(deserializeState('ge=0').gravityEnabled).toBe(false)
      expect(deserializeState('ge=1').gravityEnabled).toBe(true)
    })

    it('should clamp gravity values to valid ranges', () => {
      // Out of range values should be ignored
      const resultStrength = deserializeState('gs=100')
      expect(resultStrength.gravityStrength).toBeUndefined()

      const resultDistortion = deserializeState('gds=20')
      expect(resultDistortion.gravityDistortionScale).toBeUndefined()

      const resultFalloff = deserializeState('gf=10')
      expect(resultFalloff.gravityFalloff).toBeUndefined()

      const resultChromatic = deserializeState('gca=5')
      expect(resultChromatic.gravityChromaticAberration).toBeUndefined()
    })

    it('should handle legacy dualOutline shader type', () => {
      const result = deserializeState('sh=dualOutline')
      expect(result.shaderType).toBe('wireframe')
    })

    it('should deserialize specular color', () => {
      const result = deserializeState('sc=FFFFFF')
      expect(result.specularColor).toBe('#FFFFFF')
    })

    // Note: diffuseIntensity was removed in favor of energy-conserved PBR
    // Legacy 'di' params in URLs are now ignored
  })

  describe('roundtrip serialization', () => {
    it('should preserve state through serialize/deserialize cycle', () => {
      const original: ShareableState = {
        dimension: 5,
        objectType: 'simplex',
        uniformScale: 1.5,
        edgeColor: '#00FF00',
        backgroundColor: '#111111',
        edgesVisible: false,
        facesVisible: true,
        bloomEnabled: true,
        bloomIntensity: 0.8,
        toneMappingEnabled: true,
        exposure: 1.2,
      }

      const serialized = serializeState(original)
      const deserialized = deserializeState(serialized)

      expect(deserialized.dimension).toBe(original.dimension)
      expect(deserialized.objectType).toBe(original.objectType)
      expect(deserialized.uniformScale).toBeCloseTo(original.uniformScale!)
      expect(deserialized.edgeColor).toBe(original.edgeColor)
      expect(deserialized.backgroundColor).toBe(original.backgroundColor)
      expect(deserialized.edgesVisible).toBe(original.edgesVisible)
      expect(deserialized.facesVisible).toBe(original.facesVisible)
    })

    it('should preserve gravity settings through serialize/deserialize cycle', () => {
      // Use non-default values to ensure they get serialized and roundtrip correctly
      // Defaults: enabled=false, strength=1.0, distortionScale=1.0, falloff=1.5, chromatic=0.0
      const original: ShareableState = {
        dimension: 4,
        objectType: 'hypercube',
        gravityEnabled: true, // non-default
        gravityStrength: 2.5, // non-default
        gravityDistortionScale: 2.0, // non-default
        gravityFalloff: 2.5, // non-default
        gravityChromaticAberration: 0.3, // non-default
      }

      const serialized = serializeState(original)
      const deserialized = deserializeState(serialized)

      expect(deserialized.gravityEnabled).toBe(original.gravityEnabled)
      expect(deserialized.gravityStrength).toBeCloseTo(original.gravityStrength!)
      expect(deserialized.gravityDistortionScale).toBeCloseTo(original.gravityDistortionScale!)
      expect(deserialized.gravityFalloff).toBeCloseTo(original.gravityFalloff!)
      expect(deserialized.gravityChromaticAberration).toBeCloseTo(
        original.gravityChromaticAberration!
      )
    })
  })

  describe('generateShareUrl', () => {
    it('should generate URL with state params', () => {
      // Mock window.location
      const originalWindow = globalThis.window
      globalThis.window = {
        location: {
          origin: 'https://example.com',
          pathname: '/app',
        },
      } as unknown as Window & typeof globalThis

      const state: ShareableState = {
        dimension: 4,
        objectType: 'hypercube',
      }
      const url = generateShareUrl(state)

      expect(url).toContain('https://example.com/app')
      expect(url).toContain('d=4')
      expect(url).toContain('t=hypercube')

      globalThis.window = originalWindow
    })

    it('should return base URL when no params needed (minimal state)', () => {
      // Mock window.location
      const originalWindow = globalThis.window
      globalThis.window = {
        location: {
          origin: 'https://example.com',
          pathname: '/',
        },
      } as unknown as Window & typeof globalThis

      const state: ShareableState = {
        dimension: 4, // Always required
        objectType: 'hypercube', // Always required
      }
      const url = generateShareUrl(state)

      // Should have params since dimension and objectType are always serialized
      expect(url).toContain('?')

      globalThis.window = originalWindow
    })
  })
})
