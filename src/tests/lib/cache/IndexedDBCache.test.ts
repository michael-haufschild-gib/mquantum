/**
 * Tests for IndexedDBCache
 *
 * @see src/lib/cache/IndexedDBCache.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { IndexedDBCache } from '@/lib/cache/IndexedDBCache'

/** Database name - must match IndexedDBCache.ts */
const DB_NAME = 'mdimension-cache'

describe('IndexedDBCache', () => {
  let cache: IndexedDBCache

  beforeEach(async () => {
    // Delete the database before each test to ensure clean state
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase(DB_NAME)
      request.onsuccess = () => resolve()
      request.onerror = () => resolve() // Continue even on error
      request.onblocked = () => resolve()
    })
    cache = new IndexedDBCache()
    await cache.open()
  })

  afterEach(() => {
    cache.close()
  })

  describe('open', () => {
    it('should open database successfully', async () => {
      const newCache = new IndexedDBCache()
      const result = await newCache.open()
      expect(result).toBe(true)
      expect(newCache.isOpen()).toBe(true)
      newCache.close()
    })

    it('should reuse existing open promise when called concurrently', async () => {
      // Delete DB first to ensure clean state for this test
      await new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(DB_NAME)
        request.onsuccess = () => resolve()
        request.onerror = () => resolve()
        request.onblocked = () => resolve()
      })

      const newCache = new IndexedDBCache()
      const p1 = newCache.open()
      const p2 = newCache.open()

      // Both calls should return the same promise
      const [r1, r2] = await Promise.all([p1, p2])
      expect(r1).toBe(true)
      expect(r2).toBe(true)
      newCache.close()
    })

    it('should handle reopening after close', async () => {
      const newCache = new IndexedDBCache()
      await newCache.open()
      expect(newCache.isOpen()).toBe(true)

      newCache.close()
      expect(newCache.isOpen()).toBe(false)

      const result = await newCache.open()
      expect(result).toBe(true)
      expect(newCache.isOpen()).toBe(true)
      newCache.close()
    })
  })

  describe('get/set', () => {
    it('should store and retrieve data', async () => {
      await cache.set('polytope-geometry', 'test-key', { foo: 'bar' })
      const result = await cache.get('polytope-geometry', 'test-key')
      expect(result).toEqual({ foo: 'bar' })
    })

    it('should return null for missing key', async () => {
      const result = await cache.get('polytope-geometry', 'nonexistent')
      expect(result).toBeNull()
    })

    it('should overwrite existing value', async () => {
      await cache.set('polytope-geometry', 'key', { value: 1 })
      await cache.set('polytope-geometry', 'key', { value: 2 })
      const result = await cache.get('polytope-geometry', 'key')
      expect(result).toEqual({ value: 2 })
    })

    it('should store typed arrays', async () => {
      const vertices = new Float64Array([1.5, 2.5, 3.5, 4.5])
      await cache.set('polytope-geometry', 'typed-array', { vertices })
      const result = await cache.get<{ vertices: Float64Array }>('polytope-geometry', 'typed-array')
      expect(result).not.toBeNull()
      // Note: IndexedDB may return regular arrays, not typed arrays
      expect(Array.from(result!.vertices)).toEqual([1.5, 2.5, 3.5, 4.5])
    })

    it('should store with optional checksum', async () => {
      await cache.set('polytope-geometry', 'with-checksum', { data: 1 }, 'abc123')
      const result = await cache.get('polytope-geometry', 'with-checksum')
      expect(result).toEqual({ data: 1 })
    })
  })

  describe('delete', () => {
    it('should delete existing entry', async () => {
      await cache.set('polytope-geometry', 'to-delete', { data: 1 })
      await cache.delete('polytope-geometry', 'to-delete')
      const result = await cache.get('polytope-geometry', 'to-delete')
      expect(result).toBeNull()
    })

    it('should not throw when deleting non-existent key', async () => {
      await expect(cache.delete('polytope-geometry', 'nonexistent')).resolves.not.toThrow()
    })
  })

  describe('clear', () => {
    it('should clear all entries in store', async () => {
      await cache.set('polytope-geometry', 'key1', { data: 1 })
      await cache.set('polytope-geometry', 'key2', { data: 2 })
      await cache.set('polytope-geometry', 'key3', { data: 3 })

      await cache.clear('polytope-geometry')

      expect(await cache.get('polytope-geometry', 'key1')).toBeNull()
      expect(await cache.get('polytope-geometry', 'key2')).toBeNull()
      expect(await cache.get('polytope-geometry', 'key3')).toBeNull()
    })

    it('should not affect other stores', async () => {
      await cache.set('polytope-geometry', 'key1', { data: 1 })
      await cache.set('metadata', 'key1', { meta: true })

      await cache.clear('polytope-geometry')

      expect(await cache.get('polytope-geometry', 'key1')).toBeNull()
      expect(await cache.get('metadata', 'key1')).toEqual({ meta: true })
    })
  })

  describe('getAllKeys', () => {
    it('should return all keys', async () => {
      await cache.set('polytope-geometry', 'a', { data: 1 })
      await cache.set('polytope-geometry', 'b', { data: 2 })
      await cache.set('polytope-geometry', 'c', { data: 3 })

      const keys = await cache.getAllKeys('polytope-geometry')
      expect(keys).toContain('a')
      expect(keys).toContain('b')
      expect(keys).toContain('c')
      expect(keys.length).toBe(3)
    })

    it('should return empty array for empty store', async () => {
      const keys = await cache.getAllKeys('polytope-geometry')
      expect(keys).toEqual([])
    })
  })

  describe('getSize', () => {
    it('should calculate total size', async () => {
      await cache.set('polytope-geometry', 'key', { data: 'test string value' })
      const size = await cache.getSize('polytope-geometry')
      expect(size).toBeGreaterThan(0)
    })

    it('should return 0 for empty store', async () => {
      const size = await cache.getSize('polytope-geometry')
      expect(size).toBe(0)
    })

    it('should increase with more entries', async () => {
      await cache.set('polytope-geometry', 'key1', { data: 'value1' })
      const size1 = await cache.getSize('polytope-geometry')

      await cache.set('polytope-geometry', 'key2', { data: 'value2' })
      const size2 = await cache.getSize('polytope-geometry')

      expect(size2).toBeGreaterThan(size1)
    })
  })

  describe('evictLRU', () => {
    it('should evict oldest entries', async () => {
      // Add entries with delays to ensure different lastAccess times
      await cache.set('polytope-geometry', 'old1', { data: 1 })
      await new Promise((r) => setTimeout(r, 10))
      await cache.set('polytope-geometry', 'old2', { data: 2 })
      await new Promise((r) => setTimeout(r, 10))
      await cache.set('polytope-geometry', 'new1', { data: 3 })
      await new Promise((r) => setTimeout(r, 10))
      await cache.set('polytope-geometry', 'new2', { data: 4 })

      // Evict 50%
      const evicted = await cache.evictLRU('polytope-geometry', 0.5)
      expect(evicted).toBe(2)

      // Old entries should be gone
      expect(await cache.get('polytope-geometry', 'old1')).toBeNull()
      expect(await cache.get('polytope-geometry', 'old2')).toBeNull()

      // New entries should remain
      expect(await cache.get('polytope-geometry', 'new1')).not.toBeNull()
      expect(await cache.get('polytope-geometry', 'new2')).not.toBeNull()
    })

    it('should return 0 when no entries to evict', async () => {
      const evicted = await cache.evictLRU('polytope-geometry', 0.5)
      expect(evicted).toBe(0)
    })

    it('should update lastAccess on get', async () => {
      // Add old entry
      await cache.set('polytope-geometry', 'old', { data: 1 })
      await new Promise((r) => setTimeout(r, 10))

      // Add new entry
      await cache.set('polytope-geometry', 'new', { data: 2 })
      await new Promise((r) => setTimeout(r, 10))

      // Access old entry to update its lastAccess
      await cache.get('polytope-geometry', 'old')
      await new Promise((r) => setTimeout(r, 10))

      // Evict 50% - should evict 'new' since 'old' was accessed more recently
      await cache.evictLRU('polytope-geometry', 0.5)

      // 'old' should still exist (accessed recently)
      expect(await cache.get('polytope-geometry', 'old')).not.toBeNull()
      // 'new' should be evicted (older lastAccess despite being added later)
      expect(await cache.get('polytope-geometry', 'new')).toBeNull()
    })
  })

  describe('isOpen', () => {
    it('should return true when open', () => {
      expect(cache.isOpen()).toBe(true)
    })

    it('should return false when closed', () => {
      cache.close()
      expect(cache.isOpen()).toBe(false)
    })
  })

  describe('multiple stores', () => {
    it('should isolate data between stores', async () => {
      await cache.set('polytope-geometry', 'shared-key', { store: 'polytope' })
      await cache.set('metadata', 'shared-key', { store: 'metadata' })

      const polytopeData = await cache.get('polytope-geometry', 'shared-key')
      const metadataData = await cache.get('metadata', 'shared-key')

      expect(polytopeData).toEqual({ store: 'polytope' })
      expect(metadataData).toEqual({ store: 'metadata' })
    })
  })
})
