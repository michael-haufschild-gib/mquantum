/**
 * Tests for ResourcePool.
 *
 * Tests resource allocation, resizing, and ping-pong buffer management.
 * Note: These tests use actual THREE.js objects since mocking is complex.
 * Resource creation is tested at a logical level.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import * as THREE from 'three'

import { ResourcePool } from '@/rendering/graph/ResourcePool'

describe('ResourcePool', () => {
  let pool: ResourcePool

  beforeEach(() => {
    pool = new ResourcePool()
  })

  describe('registration', () => {
    it('should register resources', () => {
      pool.register({
        id: 'test',
        type: 'renderTarget',
        size: { mode: 'screen' },
      })

      expect(pool.has('test')).toBe(true)
    })

    it('should unregister resources', () => {
      pool.register({
        id: 'test',
        type: 'renderTarget',
        size: { mode: 'screen' },
      })

      const result = pool.unregister('test')

      expect(result).toBe(true)
      expect(pool.has('test')).toBe(false)
    })

    it('should return false when unregistering non-existent resource', () => {
      const result = pool.unregister('nonexistent')
      expect(result).toBe(false)
    })

    it('should replace existing resource with same ID', () => {
      pool.register({
        id: 'test',
        type: 'renderTarget',
        size: { mode: 'fixed', width: 100, height: 100 },
      })

      pool.register({
        id: 'test',
        type: 'renderTarget',
        size: { mode: 'fixed', width: 200, height: 200 },
      })

      expect(pool.has('test')).toBe(true)
      const config = pool.getConfig('test')
      expect(config?.size).toEqual({ mode: 'fixed', width: 200, height: 200 })
    })
  })

  describe('resource access', () => {
    it('should return null for non-existent resource', () => {
      const result = pool.get('nonexistent')
      expect(result).toBeNull()
    })

    it('should return null texture for non-existent resource', () => {
      const texture = pool.getTexture('nonexistent')
      expect(texture).toBeNull()
    })

    it('should return null read target for non-existent resource', () => {
      const target = pool.getReadTarget('nonexistent')
      expect(target).toBeNull()
    })

    it('should return null write target for non-existent resource', () => {
      const target = pool.getWriteTarget('nonexistent')
      expect(target).toBeNull()
    })
  })

  describe('depth textures and attachments', () => {
    it('should return depth texture when textureRole is depth', () => {
      pool.register({
        id: 'depthTarget',
        type: 'renderTarget',
        size: { mode: 'screen' },
        depthBuffer: true,
        depthTexture: true,
        textureRole: 'depth',
      })

      pool.updateSize(128, 128)

      const texture = pool.getTexture('depthTarget')
      expect(texture).toBeInstanceOf(THREE.DepthTexture)
    })

    it('should return MRT attachment texture by index', () => {
      pool.register({
        id: 'mrtTarget',
        type: 'mrt',
        size: { mode: 'screen' },
        attachmentCount: 2,
        attachmentFormats: [THREE.RGBAFormat, THREE.RGBAFormat],
        dataType: THREE.HalfFloatType,
        depthBuffer: true,
      })

      pool.updateSize(64, 64)

      const attachment0 = pool.getTexture('mrtTarget', 0)
      const attachment1 = pool.getTexture('mrtTarget', 1)

      expect(attachment0).toBeTruthy()
      expect(attachment1).toBeTruthy()
      expect(attachment0).not.toBe(attachment1)
    })

    it('should return depth attachment when requested explicitly', () => {
      pool.register({
        id: 'mrtDepth',
        type: 'mrt',
        size: { mode: 'screen' },
        attachmentCount: 2,
        attachmentFormats: [THREE.RGBAFormat, THREE.RGBAFormat],
        dataType: THREE.HalfFloatType,
        depthBuffer: true,
        depthTexture: true,
      })

      pool.updateSize(32, 32)

      const depthTexture = pool.getTexture('mrtDepth', 'depth')
      expect(depthTexture).toBeInstanceOf(THREE.DepthTexture)
    })
  })

  describe('configuration retrieval', () => {
    it('should return resource config', () => {
      const config = {
        id: 'test',
        type: 'renderTarget' as const,
        size: { mode: 'screen' as const },
      }
      pool.register(config)

      const retrieved = pool.getConfig('test')

      expect(retrieved).toEqual(config)
    })

    it('should return undefined for non-existent config', () => {
      const config = pool.getConfig('nonexistent')
      expect(config).toBeUndefined()
    })

    it('should return all resource IDs', () => {
      pool.register({
        id: 'a',
        type: 'renderTarget',
        size: { mode: 'screen' },
      })
      pool.register({
        id: 'b',
        type: 'renderTarget',
        size: { mode: 'screen' },
      })

      const ids = pool.getResourceIds()

      expect(ids).toContain('a')
      expect(ids).toContain('b')
      expect(ids).toHaveLength(2)
    })
  })

  describe('lifecycle', () => {
    it('should dispose and clear all resources', () => {
      pool.register({
        id: 'a',
        type: 'renderTarget',
        size: { mode: 'fixed', width: 256, height: 256 },
      })
      pool.register({
        id: 'b',
        type: 'renderTarget',
        size: { mode: 'fixed', width: 256, height: 256 },
      })

      pool.dispose()

      expect(pool.has('a')).toBe(false)
      expect(pool.has('b')).toBe(false)
      expect(pool.getResourceIds()).toHaveLength(0)
    })

    it('should keep registrations after context loss invalidation', () => {
      pool.register({
        id: 'test',
        type: 'renderTarget',
        size: { mode: 'fixed', width: 256, height: 256 },
      })

      pool.invalidateForContextLoss()

      // Resource should still be registered
      expect(pool.has('test')).toBe(true)
      expect(pool.getConfig('test')).toBeDefined()
    })

    it('should allow reinitialization after context loss', () => {
      pool.register({
        id: 'test',
        type: 'renderTarget',
        size: { mode: 'screen' },
      })

      pool.invalidateForContextLoss()
      pool.reinitialize()

      // Should be able to get resource after reinit
      expect(pool.has('test')).toBe(true)
    })
  })

  describe('VRAM estimation', () => {
    it('should return 0 for empty pool', () => {
      expect(pool.getVRAMUsage()).toBe(0)
    })

    it('should return 0 when resources are registered but not allocated', () => {
      pool.register({
        id: 'test',
        type: 'renderTarget',
        size: { mode: 'fixed', width: 256, height: 256 },
      })

      // Resources are lazily allocated, so VRAM should be 0
      expect(pool.getVRAMUsage()).toBe(0)
    })
  })

  describe('endFrame', () => {
    it('should mark resize check complete', () => {
      pool.updateSize(1920, 1080)
      pool.endFrame()
      // No assertion - just verify it doesn't throw
    })
  })

  describe('getResourceDimensions', () => {
    it('should return empty map for empty pool', () => {
      const dims = pool.getResourceDimensions()
      expect(dims.size).toBe(0)
    })

    it('should return empty map when resources registered but not allocated', () => {
      pool.register({
        id: 'test',
        type: 'renderTarget',
        size: { mode: 'fixed', width: 256, height: 256 },
      })

      // Resources are lazily allocated, so dimensions should be empty
      const dims = pool.getResourceDimensions()
      expect(dims.size).toBe(0)
    })

    it('should return dimensions for allocated resources', () => {
      pool.updateSize(1920, 1080)
      pool.register({
        id: 'sceneColor',
        type: 'renderTarget',
        size: { mode: 'screen' },
      })

      // Trigger allocation by getting the resource
      pool.get('sceneColor')

      const dims = pool.getResourceDimensions()
      expect(dims.size).toBe(1)
      expect(dims.get('sceneColor')).toEqual({ width: 1920, height: 1080 })
    })

    it('should return correct dimensions for fixed-size resources', () => {
      pool.register({
        id: 'fixedBuffer',
        type: 'renderTarget',
        size: { mode: 'fixed', width: 512, height: 512 },
      })

      // Trigger allocation
      pool.get('fixedBuffer')

      const dims = pool.getResourceDimensions()
      expect(dims.get('fixedBuffer')).toEqual({ width: 512, height: 512 })
    })

    it('should return correct dimensions for fractional resources', () => {
      pool.updateSize(1920, 1080)
      pool.register({
        id: 'halfRes',
        type: 'renderTarget',
        size: { mode: 'fraction', fraction: 0.5 },
      })

      // Trigger allocation
      pool.get('halfRes')

      const dims = pool.getResourceDimensions()
      expect(dims.get('halfRes')).toEqual({ width: 960, height: 540 })
    })

    it('should return dimensions for multiple resources', () => {
      pool.updateSize(1920, 1080)
      pool.register({
        id: 'screen',
        type: 'renderTarget',
        size: { mode: 'screen' },
      })
      pool.register({
        id: 'depth',
        type: 'renderTarget',
        size: { mode: 'screen' },
        depthBuffer: true,
      })
      pool.register({
        id: 'temporal',
        type: 'renderTarget',
        size: { mode: 'fraction', fraction: 0.5 },
      })

      // Trigger allocation for all
      pool.get('screen')
      pool.get('depth')
      pool.get('temporal')

      const dims = pool.getResourceDimensions()
      expect(dims.size).toBe(3)
      expect(dims.get('screen')).toEqual({ width: 1920, height: 1080 })
      expect(dims.get('depth')).toEqual({ width: 1920, height: 1080 })
      expect(dims.get('temporal')).toEqual({ width: 960, height: 540 })
    })
  })
})
