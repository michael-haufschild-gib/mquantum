/**
 * Tests for UniformManager.
 *
 * Tests registration, update propagation, version tracking,
 * and material application functionality.
 *
 * @module tests/rendering/uniforms/UniformManager.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as THREE from 'three'
import { UniformManager } from '@/rendering/uniforms/UniformManager'
import {
  BaseUniformSource,
  type IUniform,
  type UniformUpdateState,
} from '@/rendering/uniforms/UniformSource'

// Test uniform source implementation
class TestSource extends BaseUniformSource {
  readonly id: string
  private testValue = 1.0
  private updateCount = 0

  constructor(id: string) {
    super()
    this.id = id
  }

  getUniforms(): Record<string, IUniform> {
    return {
      uTestValue: { value: this.testValue },
      uUpdateCount: { value: this.updateCount },
    }
  }

  update(_state: UniformUpdateState): void {
    this.updateCount++
    this.incrementVersion()
  }

  setTestValue(value: number): void {
    if (value !== this.testValue) {
      this.testValue = value
      this.incrementVersion()
    }
  }

  getUpdateCount(): number {
    return this.updateCount
  }
}

// Mock uniform update state
const mockUpdateState: UniformUpdateState = {
  time: 1.0,
  delta: 0.016,
  camera: new THREE.PerspectiveCamera(),
  scene: new THREE.Scene(),
  gl: new THREE.WebGLRenderer(),
  size: { width: 1920, height: 1080 },
}

describe('UniformManager', () => {
  beforeEach(() => {
    // Reset manager before each test
    UniformManager.reset()
  })

  afterEach(() => {
    UniformManager.reset()
  })

  describe('register/unregister', () => {
    it('should register a source', () => {
      const source = new TestSource('test')
      UniformManager.register(source)

      expect(UniformManager.hasSource('test')).toBe(true)
      expect(UniformManager.getSource('test')).toBe(source)
    })

    it('should unregister a source', () => {
      const source = new TestSource('test')
      UniformManager.register(source)

      const result = UniformManager.unregister('test')

      expect(result).toBe(true)
      expect(UniformManager.hasSource('test')).toBe(false)
    })

    it('should return false when unregistering non-existent source', () => {
      const result = UniformManager.unregister('non-existent')
      expect(result).toBe(false)
    })

    it('should warn when replacing existing source', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const source1 = new TestSource('test')
      const source2 = new TestSource('test')

      UniformManager.register(source1)
      UniformManager.register(source2)

      expect(consoleWarn).toHaveBeenCalledWith("UniformManager: Replacing existing source 'test'")
      expect(UniformManager.getSource('test')).toBe(source2)

      consoleWarn.mockRestore()
    })

    it('should list registered sources', () => {
      UniformManager.register(new TestSource('a'))
      UniformManager.register(new TestSource('b'))
      UniformManager.register(new TestSource('c'))

      const sources = UniformManager.getRegisteredSources()

      expect(sources).toContain('a')
      expect(sources).toContain('b')
      expect(sources).toContain('c')
      expect(sources.length).toBe(3)
    })
  })

  describe('update', () => {
    it('should update all registered sources', () => {
      const source1 = new TestSource('test1')
      const source2 = new TestSource('test2')

      UniformManager.register(source1)
      UniformManager.register(source2)

      UniformManager.update(mockUpdateState)

      expect(source1.getUpdateCount()).toBe(1)
      expect(source2.getUpdateCount()).toBe(1)
    })

    it('should update specific sources', () => {
      const source1 = new TestSource('test1')
      const source2 = new TestSource('test2')

      UniformManager.register(source1)
      UniformManager.register(source2)

      UniformManager.updateSources(['test1'], mockUpdateState)

      expect(source1.getUpdateCount()).toBe(1)
      expect(source2.getUpdateCount()).toBe(0)
    })

    it('should handle non-existent source IDs gracefully', () => {
      const source1 = new TestSource('test1')
      UniformManager.register(source1)

      // Should not throw
      UniformManager.updateSources(['test1', 'non-existent'], mockUpdateState)

      expect(source1.getUpdateCount()).toBe(1)
    })
  })

  describe('version tracking', () => {
    it('should detect changes via version', () => {
      const source = new TestSource('test')
      UniformManager.register(source)

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTestValue: { value: 0 },
        },
      })

      // First call - should have changes
      expect(UniformManager.hasChanges(material, ['test'])).toBe(true)

      // Apply uniforms (caches version)
      UniformManager.applyToMaterial(material, ['test'])

      // No changes now
      expect(UniformManager.hasChanges(material, ['test'])).toBe(false)

      // Modify source
      source.setTestValue(2.0)

      // Now has changes again
      expect(UniformManager.hasChanges(material, ['test'])).toBe(true)
    })

    it('should report changes for new materials', () => {
      const source = new TestSource('test')
      UniformManager.register(source)

      const material = new THREE.ShaderMaterial({
        uniforms: {},
      })

      // New material always has changes (never applied before)
      expect(UniformManager.hasChanges(material, ['test'])).toBe(true)
    })
  })

  describe('applyToMaterial', () => {
    it('should apply uniforms to material', () => {
      const source = new TestSource('test')
      UniformManager.register(source)

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTestValue: { value: 0 },
          uUpdateCount: { value: -1 },
        },
      })

      UniformManager.applyToMaterial(material, ['test'])

      expect(material.uniforms.uTestValue!.value).toBe(1.0)
      expect(material.uniforms.uUpdateCount!.value).toBe(0)
    })

    it('should skip unchanged sources', () => {
      const source = new TestSource('test')
      UniformManager.register(source)

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTestValue: { value: 0 },
        },
      })

      // First apply
      UniformManager.applyToMaterial(material, ['test'])

      // Modify material value directly (not via source)
      material.uniforms.uTestValue!.value = 999

      // Second apply - should skip since source version unchanged
      UniformManager.applyToMaterial(material, ['test'])

      // Value should still be 999 (skipped update)
      expect(material.uniforms.uTestValue!.value).toBe(999)
    })

    it('should apply when forced', () => {
      const source = new TestSource('test')
      UniformManager.register(source)

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTestValue: { value: 0 },
        },
      })

      // First apply
      UniformManager.applyToMaterial(material, ['test'])

      // Modify material value directly
      material.uniforms.uTestValue!.value = 999

      // Force apply
      UniformManager.applyToMaterial(material, ['test'], true)

      // Value should be from source (forced update)
      expect(material.uniforms.uTestValue!.value).toBe(1.0)
    })

    it('should warn for non-existent sources', () => {
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const material = new THREE.ShaderMaterial({
        uniforms: {},
      })

      UniformManager.applyToMaterial(material, ['non-existent'])

      expect(consoleWarn).toHaveBeenCalledWith("UniformManager: Source 'non-existent' not found")

      consoleWarn.mockRestore()
    })
  })

  describe('getCombinedUniforms', () => {
    it('should combine uniforms from multiple sources', () => {
      const source1 = new TestSource('source1')
      const source2 = new TestSource('source2')

      UniformManager.register(source1)
      UniformManager.register(source2)

      const combined = UniformManager.getCombinedUniforms(['source1', 'source2'])

      // Both sources have same uniform names, so last one wins
      expect(combined.uTestValue).toBeDefined()
      expect(combined.uUpdateCount).toBeDefined()
    })

    it('should skip non-existent sources', () => {
      const source = new TestSource('test')
      UniformManager.register(source)

      const combined = UniformManager.getCombinedUniforms(['test', 'non-existent'])

      expect(combined.uTestValue!.value).toBe(1.0)
    })
  })

  describe('cache management', () => {
    it('should clear cache for specific material', () => {
      const source = new TestSource('test')
      UniformManager.register(source)

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uTestValue: { value: 0 },
        },
      })

      // Apply to cache version
      UniformManager.applyToMaterial(material, ['test'])
      expect(UniformManager.hasChanges(material, ['test'])).toBe(false)

      // Clear cache
      UniformManager.clearMaterialCache(material)

      // Now has changes again
      expect(UniformManager.hasChanges(material, ['test'])).toBe(true)
    })

    it('should clear all caches', () => {
      const source = new TestSource('test')
      UniformManager.register(source)

      const material1 = new THREE.ShaderMaterial({
        uniforms: { uTestValue: { value: 0 } },
      })
      const material2 = new THREE.ShaderMaterial({
        uniforms: { uTestValue: { value: 0 } },
      })

      // Apply to both
      UniformManager.applyToMaterial(material1, ['test'])
      UniformManager.applyToMaterial(material2, ['test'])

      expect(UniformManager.hasChanges(material1, ['test'])).toBe(false)
      expect(UniformManager.hasChanges(material2, ['test'])).toBe(false)

      // Clear all
      UniformManager.clearAllCaches()

      // Both have changes now
      expect(UniformManager.hasChanges(material1, ['test'])).toBe(true)
      expect(UniformManager.hasChanges(material2, ['test'])).toBe(true)
    })
  })

  describe('reset', () => {
    it('should reset all state', () => {
      UniformManager.register(new TestSource('test'))

      const material = new THREE.ShaderMaterial({
        uniforms: { uTestValue: { value: 0 } },
      })
      UniformManager.applyToMaterial(material, ['test'])

      UniformManager.reset()

      expect(UniformManager.hasSource('test')).toBe(false)
      expect(UniformManager.getRegisteredSources().length).toBe(0)
    })
  })
})

describe('BaseUniformSource', () => {
  it('should track version correctly', () => {
    const source = new TestSource('test')

    expect(source.version).toBe(0)

    source.setTestValue(2.0)
    expect(source.version).toBe(1)

    // Same value - should not increment
    source.setTestValue(2.0)
    expect(source.version).toBe(1)

    source.setTestValue(3.0)
    expect(source.version).toBe(2)
  })

  it('should apply uniforms to material correctly', () => {
    const source = new TestSource('test')

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTestValue: { value: 0 },
        uMissingUniform: { value: 'original' },
      },
    })

    source.applyToMaterial(material)

    // Should update existing uniform
    expect(material.uniforms.uTestValue!.value).toBe(1.0)

    // Should not touch uniforms not in source
    expect(material.uniforms.uMissingUniform!.value).toBe('original')
  })

  it('should handle Vector3 uniforms with copy method', () => {
    class VectorSource extends BaseUniformSource {
      readonly id = 'vector'
      private vec = new THREE.Vector3(1, 2, 3)

      getUniforms(): Record<string, IUniform> {
        return {
          uVector: { value: this.vec },
        }
      }

      update(): void {
        // No-op
      }
    }

    const source = new VectorSource()
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uVector: { value: new THREE.Vector3(0, 0, 0) },
      },
    })

    source.applyToMaterial(material)

    expect(material.uniforms.uVector!.value.x).toBe(1)
    expect(material.uniforms.uVector!.value.y).toBe(2)
    expect(material.uniforms.uVector!.value.z).toBe(3)
  })

  it('should handle Float32Array uniforms', () => {
    class ArraySource extends BaseUniformSource {
      readonly id = 'array'
      private arr = new Float32Array([1, 2, 3, 4])

      getUniforms(): Record<string, IUniform> {
        return {
          uArray: { value: this.arr },
        }
      }

      update(): void {
        // No-op
      }
    }

    const source = new ArraySource()
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uArray: { value: new Float32Array([0, 0, 0, 0]) },
      },
    })

    source.applyToMaterial(material)

    expect(material.uniforms.uArray!.value[0]).toBe(1)
    expect(material.uniforms.uArray!.value[1]).toBe(2)
    expect(material.uniforms.uArray!.value[2]).toBe(3)
    expect(material.uniforms.uArray!.value[3]).toBe(4)
  })
})
