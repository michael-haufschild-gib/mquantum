/**
 * Tests for ExternalResourceRegistry
 *
 * Verifies that external resources are captured once at frame start
 * and remain frozen throughout frame execution.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'

import { ExternalResourceRegistry } from '@/rendering/graph/ExternalResourceRegistry'

describe('ExternalResourceRegistry', () => {
  let registry: ExternalResourceRegistry

  beforeEach(() => {
    registry = new ExternalResourceRegistry()
  })

  describe('registration', () => {
    it('should register a resource', () => {
      registry.register({
        id: 'test.resource',
        getter: () => 'value',
      })

      expect(registry.has('test.resource')).toBe(true)
    })

    it('should unregister a resource', () => {
      registry.register({
        id: 'test.resource',
        getter: () => 'value',
      })

      registry.unregister('test.resource')

      expect(registry.has('test.resource')).toBe(false)
    })

    it('should replace existing registration with warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      registry.register({
        id: 'test.resource',
        getter: () => 'first',
      })

      registry.register({
        id: 'test.resource',
        getter: () => 'second',
      })

      registry.captureAll()
      expect(registry.get('test.resource')).toBe('second')
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('already registered'))

      warnSpy.mockRestore()
    })
  })

  describe('capture', () => {
    it('should capture resource value at capture time', () => {
      let value = 'initial'
      registry.register({
        id: 'test.resource',
        getter: () => value,
      })

      registry.captureAll()

      // Change the source value AFTER capture
      value = 'changed'

      // Should still return captured value
      expect(registry.get('test.resource')).toBe('initial')
    })

    it('should mark resource as captured this frame', () => {
      registry.register({
        id: 'test.resource',
        getter: () => 'value',
      })

      expect(registry.isCaptured('test.resource')).toBe(false)

      registry.captureAll()

      expect(registry.isCaptured('test.resource')).toBe(true)
    })

    it('should capture null values correctly', () => {
      registry.register({
        id: 'test.resource',
        getter: () => null,
      })

      registry.captureAll()

      expect(registry.get('test.resource')).toBe(null)
      expect(registry.isCaptured('test.resource')).toBe(true)
    })

    it('should handle getter errors gracefully', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      registry.register({
        id: 'test.resource',
        getter: () => {
          throw new Error('Getter failed')
        },
      })

      registry.captureAll()

      expect(registry.get('test.resource')).toBe(null)
      expect(registry.isCaptured('test.resource')).toBe(false)
      expect(errorSpy).toHaveBeenCalled()

      errorSpy.mockRestore()
    })
  })

  describe('validation', () => {
    it('should validate captured values', () => {
      registry.register({
        id: 'test.resource',
        getter: () => 'invalid',
        validator: (v) => v !== 'invalid',
      })

      registry.captureAll()

      expect(registry.get('test.resource')).toBe(null)
      expect(registry.isCaptured('test.resource')).toBe(false)
    })

    it('should capture valid values', () => {
      registry.register({
        id: 'test.resource',
        getter: () => 'valid',
        validator: (v) => v === 'valid',
      })

      registry.captureAll()

      expect(registry.get('test.resource')).toBe('valid')
      expect(registry.isCaptured('test.resource')).toBe(true)
    })
  })

  describe('frame advancement', () => {
    it('should reset captured state on frame advance', () => {
      registry.register({
        id: 'test.resource',
        getter: () => 'value',
      })

      registry.captureAll()
      expect(registry.hasCapturedThisFrame()).toBe(true)

      registry.advanceFrame()
      expect(registry.hasCapturedThisFrame()).toBe(false)
    })

    it('should increment frame counter', () => {
      expect(registry.getCurrentFrame()).toBe(0)

      registry.advanceFrame()
      expect(registry.getCurrentFrame()).toBe(1)

      registry.advanceFrame()
      expect(registry.getCurrentFrame()).toBe(2)
    })

    it('should return latest capture after new frame', () => {
      let value = 'frame0'
      registry.register({
        id: 'test.resource',
        getter: () => value,
      })

      registry.captureAll()
      expect(registry.get('test.resource')).toBe('frame0')

      // Advance frame and change value
      registry.advanceFrame()
      value = 'frame1'
      registry.captureAll()

      expect(registry.get('test.resource')).toBe('frame1')
    })
  })

  describe('freeze behavior', () => {
    it('should freeze value even if source changes mid-frame', () => {
      let counter = 0
      registry.register({
        id: 'counter',
        getter: () => counter++,
      })

      registry.captureAll()

      // Multiple reads should return same captured value
      const read1 = registry.get('counter')
      const read2 = registry.get('counter')
      const read3 = registry.get('counter')

      expect(read1).toBe(0)
      expect(read2).toBe(0)
      expect(read3).toBe(0)
    })

    it('should isolate multiple resources', () => {
      let a = 1
      let b = 2

      registry.register({ id: 'a', getter: () => a })
      registry.register({ id: 'b', getter: () => b })

      registry.captureAll()

      // Change sources
      a = 100
      b = 200

      // Should still see captured values
      expect(registry.get('a')).toBe(1)
      expect(registry.get('b')).toBe(2)
    })
  })

  describe('lifecycle', () => {
    it('should dispose all resources', () => {
      registry.register({ id: 'a', getter: () => 1 })
      registry.register({ id: 'b', getter: () => 2 })

      registry.captureAll()
      registry.advanceFrame()
      registry.advanceFrame()

      registry.dispose()

      expect(registry.has('a')).toBe(false)
      expect(registry.has('b')).toBe(false)
      expect(registry.getCurrentFrame()).toBe(0)
    })

    it('should invalidate captures but keep registrations', () => {
      registry.register({ id: 'test', getter: () => 'value' })

      registry.captureAll()
      expect(registry.isCaptured('test')).toBe(true)

      registry.invalidateCaptures()

      expect(registry.has('test')).toBe(true)
      expect(registry.isCaptured('test')).toBe(false)
      expect(registry.get('test')).toBe(null)
    })
  })

  describe('debugging', () => {
    it('should return debug info', () => {
      registry.register({
        id: 'test.resource',
        getter: () => 'value',
        description: 'Test resource',
      })

      registry.captureAll()

      const info = registry.getDebugInfo()

      expect(info).toContain('test.resource')
      expect(info).toContain('valid')
      expect(info).toContain('Test resource')
    })

    it('should return resource IDs', () => {
      registry.register({ id: 'a', getter: () => 1 })
      registry.register({ id: 'b', getter: () => 2 })

      const ids = registry.getResourceIds()

      expect(ids).toContain('a')
      expect(ids).toContain('b')
      expect(ids).toHaveLength(2)
    })
  })
})
