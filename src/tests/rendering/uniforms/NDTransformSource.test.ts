/**
 * Tests for NDTransformSource uniform source.
 *
 * Tests version tracking, lazy evaluation, rotation matrix computation,
 * and GPU uniform application for N-dimensional transforms.
 *
 * @module tests/rendering/uniforms/NDTransformSource.test
 */

import { NDTransformSource } from '@/rendering/uniforms/sources/NDTransformSource'
import { fcos, fsin } from '@/lib/math/trig'
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('NDTransformSource', () => {
  let source: NDTransformSource

  beforeEach(() => {
    source = new NDTransformSource()
  })

  afterEach(() => {
    source.reset()
  })

  describe('id', () => {
    it('should have correct id', () => {
      expect(source.id).toBe('ndTransform')
    })
  })

  describe('getUniforms', () => {
    it('should return default uniforms', () => {
      const uniforms = source.getUniforms()

      expect(uniforms.uDimension!.value).toBe(4)
      expect(uniforms.uRotationMatrix4D!.value).toBeInstanceOf(THREE.Matrix4)
      expect(uniforms.uExtraRotationCols!.value).toBeInstanceOf(Float32Array)
      expect(uniforms.uDepthRowSums!.value).toBeInstanceOf(Float32Array)
      // Scale is now applied AFTER projection (like camera zoom)
      expect(uniforms.uUniformScale!.value).toBe(1.0)
      expect(uniforms.uProjectionDistance!.value).toBe(10.0)
    })
  })

  describe('updateFromStore', () => {
    it('should update dimension', () => {
      source.updateFromStore({
        dimension: 5,
        rotations: new Map(),
        rotationVersion: 1,
      })

      expect(source.getUniforms().uDimension!.value).toBe(5)
    })

    it('should update uniform scale (applied after projection like camera zoom)', () => {
      source.updateFromStore({
        dimension: 4,
        rotations: new Map(),
        rotationVersion: 1,
        uniformScale: 2.5,
      })

      expect(source.getUniforms().uUniformScale!.value).toBe(2.5)
    })

    it('should update projection distance', () => {
      source.updateFromStore({
        dimension: 4,
        rotations: new Map(),
        rotationVersion: 1,
        projectionDistance: 15.0,
      })

      expect(source.getUniforms().uProjectionDistance!.value).toBe(15.0)
    })

    it('should increment version on rotation change', () => {
      const initialVersion = source.version

      source.updateFromStore({
        dimension: 4,
        rotations: new Map([['XY', 0.5]]),
        rotationVersion: 1,
      })

      expect(source.version).toBe(initialVersion + 1)
    })

    it('should increment version on dimension change', () => {
      source.updateFromStore({
        dimension: 4,
        rotations: new Map(),
        rotationVersion: 1,
      })
      const version = source.version

      source.updateFromStore({
        dimension: 5,
        rotations: new Map(),
        rotationVersion: 1,
      })

      expect(source.version).toBeGreaterThan(version)
    })

    it('should increment version on uniform scale change', () => {
      source.updateFromStore({
        dimension: 4,
        rotations: new Map(),
        rotationVersion: 1,
        uniformScale: 1.0,
      })
      const version = source.version

      source.updateFromStore({
        dimension: 4,
        rotations: new Map(),
        rotationVersion: 1,
        uniformScale: 2.0,
      })

      expect(source.version).toBeGreaterThan(version)
    })

    it('should not increment version when nothing changed', () => {
      source.updateFromStore({
        dimension: 4,
        rotations: new Map(),
        rotationVersion: 1,
        uniformScale: 1.0,
        projectionDistance: 10.0,
      })
      const version = source.version

      source.updateFromStore({
        dimension: 4,
        rotations: new Map(),
        rotationVersion: 1,
        uniformScale: 1.0,
        projectionDistance: 10.0,
      })

      expect(source.version).toBe(version)
    })
  })

  describe('lazy evaluation', () => {
    it('should only recompute rotation matrix when version changes', () => {
      // First update - should compute
      source.updateFromStore({
        dimension: 4,
        rotations: new Map([['XY', 0.5]]),
        rotationVersion: 1,
      })
      const gpuData1 = source.getGPUData()
      const matrix1 = gpuData1.rotationMatrix4D.clone()

      // Same rotations, same version - should not recompute
      source.updateFromStore({
        dimension: 4,
        rotations: new Map([['XY', 0.5]]),
        rotationVersion: 1,
      })
      const gpuData2 = source.getGPUData()

      // Matrices should be identical (same object reference from cache)
      expect(gpuData2.rotationMatrix4D.elements).toEqual(matrix1.elements)

      // Different version - should recompute
      source.updateFromStore({
        dimension: 4,
        rotations: new Map([['XY', 1.0]]),
        rotationVersion: 2,
      })
      const gpuData3 = source.getGPUData()

      // Matrix should be different
      expect(gpuData3.rotationMatrix4D.elements).not.toEqual(matrix1.elements)
    })
  })

  describe('reset', () => {
    it('should reset to initial state', () => {
      source.updateFromStore({
        dimension: 6,
        rotations: new Map([['XW', 1.5]]),
        rotationVersion: 5,
        uniformScale: 2.0,
        projectionDistance: 20.0,
      })

      source.reset()

      expect(source.version).toBe(0)
      expect(source.getUniforms().uDimension!.value).toBe(4)
      expect(source.getUniforms().uProjectionDistance!.value).toBe(10.0)
      // Uniform scale is now applied AFTER projection
      expect(source.getUniforms().uUniformScale!.value).toBe(1.0)
    })
  })

  describe('getGPUData', () => {
    it('should return valid GPU data structure', () => {
      source.updateFromStore({
        dimension: 5,
        rotations: new Map([['XY', 0.5]]),
        rotationVersion: 1,
      })

      const gpuData = source.getGPUData()

      expect(gpuData).toHaveProperty('rotationMatrix4D')
      expect(gpuData).toHaveProperty('extraRotationCols')
      expect(gpuData).toHaveProperty('depthRowSums')
      expect(gpuData.rotationMatrix4D).toBeInstanceOf(THREE.Matrix4)
      expect(gpuData.extraRotationCols).toBeInstanceOf(Float32Array)
      expect(gpuData.depthRowSums).toBeInstanceOf(Float32Array)
    })

    it('should return identity matrix for no rotations', () => {
      source.updateFromStore({
        dimension: 4,
        rotations: new Map(),
        rotationVersion: 1,
      })

      const gpuData = source.getGPUData()

      // Check diagonal elements are 1
      expect(gpuData.rotationMatrix4D.elements[0]).toBeCloseTo(1.0)
      expect(gpuData.rotationMatrix4D.elements[5]).toBeCloseTo(1.0)
      expect(gpuData.rotationMatrix4D.elements[10]).toBeCloseTo(1.0)
      expect(gpuData.rotationMatrix4D.elements[15]).toBeCloseTo(1.0)
    })
  })

  describe('applyToMaterial', () => {
    it('should apply uniforms to material with matching uniform names', () => {
      source.updateFromStore({
        dimension: 5,
        rotations: new Map([['XY', 0.7]]),
        rotationVersion: 1,
        uniformScale: 1.5,
        projectionDistance: 12.0,
      })

      const material = new THREE.ShaderMaterial({
        uniforms: {
          uDimension: { value: 0 },
          uRotationMatrix4D: { value: new THREE.Matrix4() },
          uExtraRotationCols: { value: new Float32Array(28) },
          uDepthRowSums: { value: new Float32Array(11) },
          uUniformScale: { value: 0 },
          uProjectionDistance: { value: 0 },
        },
      })

      source.applyToMaterial(material)

      expect(material.uniforms['uDimension']!.value).toBe(5)
      expect(material.uniforms['uProjectionDistance']!.value).toBe(12.0)
      // Uniform scale is applied after projection (like camera zoom)
      expect(material.uniforms['uUniformScale']!.value).toBe(1.5)
    })

    it('should skip uniforms not present on material', () => {
      source.updateFromStore({
        dimension: 4,
        rotations: new Map(),
        rotationVersion: 1,
      })

      // Material with only some uniforms
      const material = new THREE.ShaderMaterial({
        uniforms: {
          uDimension: { value: 0 },
          // Missing other uniforms
        },
      })

      // Should not throw
      expect(() => source.applyToMaterial(material)).not.toThrow()
      expect(material.uniforms['uDimension']!.value).toBe(4)
    })
  })

  describe('higher dimensions', () => {
    it('should handle 11D (max supported dimension)', () => {
      source.updateFromStore({
        dimension: 11,
        rotations: new Map([
          ['XY', 0.1],
          ['XZ', 0.2],
          ['XW', 0.3],
          ['YZ', 0.4],
          ['YW', 0.5],
          ['ZW', 0.6],
        ]),
        rotationVersion: 1,
        uniformScale: 1.0,
      })

      const gpuData = source.getGPUData()

      expect(source.getUniforms().uDimension!.value).toBe(11)
      expect(gpuData.extraRotationCols.length).toBeGreaterThan(0)
      expect(gpuData.depthRowSums.length).toBeGreaterThanOrEqual(11)
    })

    it('should use uniform scale for all dimensions (applied after projection)', () => {
      source.updateFromStore({
        dimension: 7,
        rotations: new Map(),
        rotationVersion: 1,
        uniformScale: 2.5,
      })

      // Uniform scale is applied after projection, like camera zoom
      expect(source.getUniforms().uUniformScale!.value).toBe(2.5)
    })
  })

  describe('rotation matrix computation', () => {
    it('should compute XY rotation correctly', () => {
      const angle = Math.PI / 4 // 45 degrees
      source.updateFromStore({
        dimension: 4,
        rotations: new Map([['XY', angle]]),
        rotationVersion: 1,
      })

      const gpuData = source.getGPUData()
      const m = gpuData.rotationMatrix4D.elements

      // XY rotation affects the first 2 rows/cols
      // Rotation matrix should have cos at [0,0] and [1,1], sin at [0,1] and -sin at [1,0]
      // Use fcos/fsin to match what the rotation matrix computation uses (fast trig approximations)
      const cos45 = fcos(angle)
      const sin45 = fsin(angle)

      expect(m[0]).toBeCloseTo(cos45, 5)
      expect(m[1]).toBeCloseTo(sin45, 5)
      expect(m[4]).toBeCloseTo(-sin45, 5)
      expect(m[5]).toBeCloseTo(cos45, 5)
    })

    it('should compose multiple rotations', () => {
      source.updateFromStore({
        dimension: 4,
        rotations: new Map([
          ['XY', Math.PI / 4],
          ['XZ', Math.PI / 6],
        ]),
        rotationVersion: 1,
      })

      const gpuData = source.getGPUData()
      const m = gpuData.rotationMatrix4D.elements

      // Matrix should not be identity - check some off-diagonal elements are non-zero
      const identity = new THREE.Matrix4().identity().elements
      let isIdentity = true
      for (let i = 0; i < 16; i++) {
        const mVal = m[i] ?? 0
        const iVal = identity[i] ?? 0
        if (Math.abs(mVal - iVal) > 0.001) {
          isIdentity = false
          break
        }
      }
      expect(isIdentity).toBe(false)
    })
  })
})
