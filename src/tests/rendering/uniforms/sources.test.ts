/**
 * Tests for uniform sources (QualitySource, TemporalSource, ColorSource, LightingSource).
 *
 * Tests version tracking, update detection, and uniform application.
 *
 * @module tests/rendering/uniforms/sources.test
 */

import { ColorSource } from '@/rendering/uniforms/sources/ColorSource'
import { LightingSource } from '@/rendering/uniforms/sources/LightingSource'
import { QualitySource } from '@/rendering/uniforms/sources/QualitySource'
import { TemporalSource } from '@/rendering/uniforms/sources/TemporalSource'
import type { UniformUpdateState } from '@/rendering/uniforms/UniformSource'
import { useLightingStore } from '@/stores/lightingStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// Mock update state
const createMockState = (): UniformUpdateState => ({
  time: 1.0,
  delta: 0.016,
  camera: new THREE.PerspectiveCamera(),
  scene: new THREE.Scene(),
  gl: new THREE.WebGLRenderer(),
  size: { width: 1920, height: 1080 },
})

describe('QualitySource', () => {
  let source: QualitySource

  beforeEach(() => {
    source = new QualitySource()
  })

  afterEach(() => {
    source.reset()
  })

  describe('id', () => {
    it('should have correct id', () => {
      expect(source.id).toBe('quality')
    })
  })

  describe('getUniforms', () => {
    it('should return default uniforms', () => {
      const uniforms = source.getUniforms()

      expect(uniforms.uQualityMultiplier!.value).toBe(1.0)
      expect(uniforms.uFastMode!.value).toBe(false)
    })
  })

  describe('updateFromStore', () => {
    it('should update quality multiplier', () => {
      source.updateFromStore({ qualityMultiplier: 0.5, fastMode: false })

      expect(source.getQualityMultiplier()).toBe(0.5)
      expect(source.getUniforms().uQualityMultiplier!.value).toBe(0.5)
    })

    it('should update fast mode', () => {
      source.updateFromStore({ qualityMultiplier: 1.0, fastMode: true })

      expect(source.isFastMode()).toBe(true)
      expect(source.getUniforms().uFastMode!.value).toBe(true)
    })

    it('should increment version on change', () => {
      const initialVersion = source.version

      source.updateFromStore({ qualityMultiplier: 0.75, fastMode: false })

      expect(source.version).toBe(initialVersion + 1)
    })

    it('should not increment version when values unchanged', () => {
      source.updateFromStore({ qualityMultiplier: 0.5, fastMode: true })
      const version = source.version

      source.updateFromStore({ qualityMultiplier: 0.5, fastMode: true })

      expect(source.version).toBe(version)
    })
  })

  describe('reset', () => {
    it('should reset to initial state', () => {
      source.updateFromStore({ qualityMultiplier: 0.25, fastMode: true })
      source.reset()

      expect(source.getQualityMultiplier()).toBe(1.0)
      expect(source.isFastMode()).toBe(false)
      expect(source.version).toBe(0)
    })
  })

  describe('applyToMaterial', () => {
    it('should apply uniforms to material', () => {
      source.updateFromStore({ qualityMultiplier: 0.6, fastMode: true })

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uQualityMultiplier: { value: 0 },
          uFastMode: { value: false },
        },
      })

      source.applyToMaterial(material)

      expect(material.uniforms.uQualityMultiplier!.value).toBe(0.6)
      expect(material.uniforms.uFastMode!.value).toBe(true)
    })
  })
})

describe('TemporalSource', () => {
  let source: TemporalSource

  beforeEach(() => {
    source = new TemporalSource()
  })

  afterEach(() => {
    source.reset()
  })

  describe('id', () => {
    it('should have correct id', () => {
      expect(source.id).toBe('temporal')
    })
  })

  describe('getUniforms', () => {
    it('should return default uniforms', () => {
      const uniforms = source.getUniforms()

      expect(uniforms.uTemporalEnabled!.value).toBe(false)
      expect(uniforms.uPrevViewProjectionMatrix!.value).toBeInstanceOf(THREE.Matrix4)
      expect(uniforms.uPrevInverseViewProjectionMatrix!.value).toBeInstanceOf(THREE.Matrix4)
      expect(uniforms.uDepthBufferResolution!.value).toBeInstanceOf(THREE.Vector2)
      expect(uniforms.uTemporalSafetyMargin!.value).toBe(0.5)
    })
  })

  describe('updateFromStore', () => {
    it('should enable temporal reprojection', () => {
      source.updateFromStore({ enabled: true })

      expect(source.isEnabled()).toBe(true)
      expect(source.getUniforms().uTemporalEnabled!.value).toBe(true)
    })

    it('should update safety margin', () => {
      source.updateFromStore({ enabled: false, safetyMargin: 0.85 })

      expect(source.getUniforms().uTemporalSafetyMargin!.value).toBe(0.85)
    })

    it('should update depth buffer resolution', () => {
      source.updateFromStore({
        enabled: false,
        depthBufferResolution: { width: 3840, height: 2160 },
      })

      const res = source.getUniforms().uDepthBufferResolution!.value as THREE.Vector2
      expect(res.x).toBe(3840)
      expect(res.y).toBe(2160)
    })

    it('should increment version on change', () => {
      const initialVersion = source.version

      source.updateFromStore({ enabled: true })

      expect(source.version).toBe(initialVersion + 1)
    })
  })

  describe('update', () => {
    it('should not update when disabled', () => {
      // Explicitly disable temporal in the store (default is true)
      usePerformanceStore.getState().setTemporalReprojectionEnabled(false)

      const state = createMockState()
      const initialVersion = source.version

      source.update(state)

      // Version should not change when disabled
      expect(source.version).toBe(initialVersion)

      // Cleanup: reset store to default
      usePerformanceStore.getState().setTemporalReprojectionEnabled(true)
    })

    it('should update matrices when enabled', () => {
      source.updateFromStore({ enabled: true })
      const state = createMockState()

      source.update(state)

      // Version should increment due to matrix updates
      expect(source.version).toBeGreaterThan(0)
    })

    it('should handle first frame correctly', () => {
      source.updateFromStore({ enabled: true })
      const state = createMockState()

      // First update sets up matrices
      source.update(state)

      // Previous and current should be equal on first frame
      const uniforms = source.getUniforms()
      const prevMatrix = uniforms.uPrevViewProjectionMatrix!.value as THREE.Matrix4

      // The matrix should be valid (not all zeros)
      expect(prevMatrix.elements.some((e) => e !== 0)).toBe(true)
    })
  })

  describe('resetHistory', () => {
    it('should mark for reset on next frame', () => {
      // Enable temporal in the store so update() reads correct value
      usePerformanceStore.getState().setTemporalReprojectionEnabled(true)
      const state = createMockState()

      // First update
      source.update(state)

      // Reset history
      source.resetHistory()

      // Next update should behave like first frame
      source.update(state)

      // Should still be enabled
      expect(source.isEnabled()).toBe(true)

      // Cleanup: reset store
      usePerformanceStore.getState().setTemporalReprojectionEnabled(false)
    })
  })

  describe('reset', () => {
    it('should reset to initial state', () => {
      source.updateFromStore({ enabled: true, safetyMargin: 0.8 })
      source.update(createMockState())
      source.reset()

      expect(source.isEnabled()).toBe(false)
      expect(source.getUniforms().uTemporalSafetyMargin!.value).toBe(0.5)
      expect(source.version).toBe(0)
    })
  })
})

describe('ColorSource', () => {
  let source: ColorSource

  const defaultCosine = {
    a: [0.5, 0.5, 0.5] as [number, number, number],
    b: [0.5, 0.5, 0.5] as [number, number, number],
    c: [1.0, 1.0, 1.0] as [number, number, number],
    d: [0.0, 0.33, 0.67] as [number, number, number],
  }

  const defaultDistribution = { power: 1.0, cycles: 1.0, offset: 0.0 }
  const defaultMultiSource = { depth: 0.5, orbitTrap: 0.3, normal: 0.2 }

  beforeEach(() => {
    source = new ColorSource()
  })

  afterEach(() => {
    source.reset()
  })

  describe('id', () => {
    it('should have correct id', () => {
      expect(source.id).toBe('color')
    })
  })

  describe('getUniforms', () => {
    it('should return default uniforms', () => {
      const uniforms = source.getUniforms()

      expect(uniforms.uColorAlgorithm!.value).toBe(0)
      expect(uniforms.uCosineA!.value).toBeInstanceOf(THREE.Vector3)
      expect(uniforms.uCosineB!.value).toBeInstanceOf(THREE.Vector3)
      expect(uniforms.uCosineC!.value).toBeInstanceOf(THREE.Vector3)
      expect(uniforms.uCosineD!.value).toBeInstanceOf(THREE.Vector3)
      expect(uniforms.uDistPower!.value).toBe(1.0)
      expect(uniforms.uDistCycles!.value).toBe(1.0)
      expect(uniforms.uDistOffset!.value).toBe(0.0)
      expect(uniforms.uLchLightness!.value).toBe(0.65)
      expect(uniforms.uLchChroma!.value).toBe(0.15)
    })
  })

  describe('updateFromStore', () => {
    it('should update color algorithm', () => {
      source.updateFromStore({
        colorAlgorithm: 'cosine',
        cosineCoefficients: defaultCosine,
        distribution: defaultDistribution,
        multiSourceWeights: defaultMultiSource,
        lchLightness: 0.65,
        lchChroma: 0.15,
      })

      expect(source.getColorAlgorithm()).toBe('cosine')
      // cosine = 2 in COLOR_ALGORITHM_TO_INT
      expect(source.getUniforms().uColorAlgorithm!.value).toBe(2)
    })

    it('should update cosine coefficients', () => {
      const newCosine = {
        a: [0.8, 0.8, 0.8] as [number, number, number],
        b: [0.2, 0.2, 0.2] as [number, number, number],
        c: [2.0, 2.0, 2.0] as [number, number, number],
        d: [0.1, 0.5, 0.9] as [number, number, number],
      }

      source.updateFromStore({
        colorAlgorithm: 'cosine',
        cosineCoefficients: newCosine,
        distribution: defaultDistribution,
        multiSourceWeights: defaultMultiSource,
        lchLightness: 0.65,
        lchChroma: 0.15,
      })

      const uniforms = source.getUniforms()
      const a = uniforms.uCosineA!.value as THREE.Vector3
      const b = uniforms.uCosineB!.value as THREE.Vector3
      const c = uniforms.uCosineC!.value as THREE.Vector3
      const d = uniforms.uCosineD!.value as THREE.Vector3

      expect(a.x).toBe(0.8)
      expect(b.y).toBe(0.2)
      expect(c.z).toBe(2.0)
      expect(d.x).toBe(0.1)
    })

    it('should update distribution settings', () => {
      source.updateFromStore({
        colorAlgorithm: 'monochromatic',
        cosineCoefficients: defaultCosine,
        distribution: { power: 2.0, cycles: 3.0, offset: 0.5 },
        multiSourceWeights: defaultMultiSource,
        lchLightness: 0.65,
        lchChroma: 0.15,
      })

      const uniforms = source.getUniforms()
      expect(uniforms.uDistPower!.value).toBe(2.0)
      expect(uniforms.uDistCycles!.value).toBe(3.0)
      expect(uniforms.uDistOffset!.value).toBe(0.5)
    })

    it('should update LCH parameters', () => {
      source.updateFromStore({
        colorAlgorithm: 'monochromatic',
        cosineCoefficients: defaultCosine,
        distribution: defaultDistribution,
        multiSourceWeights: defaultMultiSource,
        lchLightness: 0.8,
        lchChroma: 0.25,
      })

      const uniforms = source.getUniforms()
      expect(uniforms.uLchLightness!.value).toBe(0.8)
      expect(uniforms.uLchChroma!.value).toBe(0.25)
    })

    it('should update multi-source weights', () => {
      source.updateFromStore({
        colorAlgorithm: 'multiSource',
        cosineCoefficients: defaultCosine,
        distribution: defaultDistribution,
        multiSourceWeights: { depth: 0.3, orbitTrap: 0.4, normal: 0.3 },
        lchLightness: 0.65,
        lchChroma: 0.15,
      })

      const weights = source.getUniforms().uMultiSourceWeights!.value as THREE.Vector3
      expect(weights.x).toBe(0.3) // depth
      expect(weights.y).toBe(0.4) // orbitTrap
      expect(weights.z).toBe(0.3) // normal
    })

    it('should increment version on change', () => {
      const initialVersion = source.version

      source.updateFromStore({
        colorAlgorithm: 'cosine',
        cosineCoefficients: defaultCosine,
        distribution: defaultDistribution,
        multiSourceWeights: defaultMultiSource,
        lchLightness: 0.65,
        lchChroma: 0.15,
      })

      expect(source.version).toBe(initialVersion + 1)
    })

    it('should not increment version when values unchanged', () => {
      source.updateFromStore({
        colorAlgorithm: 'cosine',
        cosineCoefficients: defaultCosine,
        distribution: defaultDistribution,
        multiSourceWeights: defaultMultiSource,
        lchLightness: 0.65,
        lchChroma: 0.15,
      })

      const version = source.version

      source.updateFromStore({
        colorAlgorithm: 'cosine',
        cosineCoefficients: defaultCosine,
        distribution: defaultDistribution,
        multiSourceWeights: defaultMultiSource,
        lchLightness: 0.65,
        lchChroma: 0.15,
      })

      expect(source.version).toBe(version)
    })
  })

  describe('reset', () => {
    it('should reset to initial state', () => {
      source.updateFromStore({
        colorAlgorithm: 'lch',
        cosineCoefficients: {
          a: [1, 1, 1] as [number, number, number],
          b: [1, 1, 1] as [number, number, number],
          c: [1, 1, 1] as [number, number, number],
          d: [1, 1, 1] as [number, number, number],
        },
        distribution: { power: 5.0, cycles: 10.0, offset: 1.0 },
        multiSourceWeights: { depth: 1.0, orbitTrap: 0, normal: 0 },
        lchLightness: 1.0,
        lchChroma: 0.4,
      })

      source.reset()

      expect(source.getColorAlgorithm()).toBe('monochromatic')
      expect(source.getUniforms().uDistPower!.value).toBe(1.0)
      expect(source.getUniforms().uLchLightness!.value).toBe(0.65)
      expect(source.version).toBe(0)
    })
  })

  describe('applyToMaterial', () => {
    it('should apply uniforms to material', () => {
      source.updateFromStore({
        colorAlgorithm: 'cosine',
        cosineCoefficients: defaultCosine,
        distribution: { power: 2.0, cycles: 1.5, offset: 0.1 },
        multiSourceWeights: defaultMultiSource,
        lchLightness: 0.7,
        lchChroma: 0.2,
      })

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uColorAlgorithm: { value: -1 },
          uDistPower: { value: 0 },
          uDistCycles: { value: 0 },
          uDistOffset: { value: 0 },
          uLchLightness: { value: 0 },
          uLchChroma: { value: 0 },
        },
      })

      source.applyToMaterial(material)

      expect(material.uniforms.uColorAlgorithm!.value).toBe(2) // cosine
      expect(material.uniforms.uDistPower!.value).toBe(2.0)
      expect(material.uniforms.uDistCycles!.value).toBe(1.5)
      expect(material.uniforms.uDistOffset!.value).toBe(0.1)
      expect(material.uniforms.uLchLightness!.value).toBe(0.7)
      expect(material.uniforms.uLchChroma!.value).toBe(0.2)
    })
  })
})

describe('LightingSource', () => {
  let source: LightingSource

  beforeEach(() => {
    source = new LightingSource()
    // Reset store to default state
    // Note: specularIntensity/specularColor now in PBRSource, not LightingSource
    useLightingStore.setState({
      version: 0,
      lights: [],
      ambientEnabled: true,
      ambientColor: '#FFFFFF',
      ambientIntensity: 0.3,
    })
  })

  afterEach(() => {
    source.reset()
  })

  describe('id', () => {
    it('should have correct id', () => {
      expect(source.id).toBe('lighting')
    })
  })

  describe('getUniforms', () => {
    it('should return default uniforms', () => {
      const uniforms = source.getUniforms()

      expect(uniforms.uNumLights!.value).toBe(0)
      expect(uniforms.uAmbientIntensity!.value).toBe(0.3)
      // Note: uDiffuseIntensity removed - energy conservation derives diffuse from (1-kS)*(1-metallic)
      // Note: uSpecularPower removed - PBR uses roughness instead of Blinn-Phong shininess
      // Note: uSpecularIntensity moved to PBRSource
    })
  })

  describe('updateFromStore', () => {
    it('should update lighting uniforms', () => {
      // Note: specularIntensity/specularColor now in PBRSource
      source.updateFromStore({
        lights: [],
        storeVersion: 1,
        ambientEnabled: true,
        ambientColor: '#FF0000',
        ambientIntensity: 0.5,
      })

      const uniforms = source.getUniforms()
      expect(uniforms.uAmbientIntensity!.value).toBe(0.5)
    })

    it('should increment version on change', () => {
      const initialVersion = source.version

      source.updateFromStore({
        lights: [],
        storeVersion: 1,
        ambientEnabled: true,
        ambientColor: '#FFFFFF',
        ambientIntensity: 0.5,
      })

      expect(source.version).toBe(initialVersion + 1)
    })

    it('should not increment version when store version unchanged', () => {
      // First update
      source.updateFromStore({
        lights: [],
        storeVersion: 1,
        ambientEnabled: true,
        ambientColor: '#FFFFFF',
        ambientIntensity: 0.3,
      })
      const version = source.version

      // Same store version - should not update
      source.updateFromStore({
        lights: [],
        storeVersion: 1,
        ambientEnabled: true,
        ambientColor: '#FFFFFF',
        ambientIntensity: 0.3,
      })

      expect(source.version).toBe(version)
    })
  })

  describe('update', () => {
    it('should access store directly and update uniforms', () => {
      // Set up store with specific values
      // Note: specularIntensity/specularColor now in PBRSource
      useLightingStore.setState({
        version: 5,
        lights: [],
        ambientEnabled: true,
        ambientColor: '#FF0000',
        ambientIntensity: 0.4,
      })

      const state = createMockState()
      source.update(state)

      const uniforms = source.getUniforms()
      expect(uniforms.uAmbientIntensity!.value).toBe(0.4)
    })

    it('should only update when store version changes', () => {
      // Initial update
      useLightingStore.setState({
        version: 1,
        lights: [],
        ambientEnabled: true,
        ambientColor: '#FFFFFF',
        ambientIntensity: 0.3,
      })

      const state = createMockState()
      source.update(state)
      const versionAfterFirstUpdate = source.version

      // Second update with same store version
      source.update(state)

      expect(source.version).toBe(versionAfterFirstUpdate)
    })
  })

  describe('reset', () => {
    it('should reset to initial state', () => {
      // Note: specularIntensity/specularColor now in PBRSource
      source.updateFromStore({
        lights: [],
        storeVersion: 5,
        ambientEnabled: true,
        ambientColor: '#FF0000',
        ambientIntensity: 0.8,
      })

      source.reset()

      expect(source.version).toBe(0)
    })
  })

  describe('applyToMaterial', () => {
    it('should apply uniforms to material', () => {
      // Note: specularIntensity/specularColor now in PBRSource
      source.updateFromStore({
        lights: [],
        storeVersion: 1,
        ambientEnabled: true,
        ambientColor: '#FFFFFF',
        ambientIntensity: 0.6,
      })

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uAmbientEnabled: { value: 0 },
          uAmbientIntensity: { value: 0 },
          // Note: uSpecularIntensity now in PBRSource
          uNumLights: { value: -1 },
        },
      })

      source.applyToMaterial(material)

      expect(material.uniforms.uAmbientIntensity!.value).toBe(0.6)
      // Note: uSpecularIntensity now tested in PBRSource tests
      expect(material.uniforms.uNumLights!.value).toBe(0)
    })
  })
})
