/**
 * Tests for Wythoff polytope caching layer
 *
 * @see src/lib/geometry/wythoff/cache.ts
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  getCacheKey,
  cachePolytope,
  getCachedPolytope,
  getFromMemoryCache,
  clearMemoryCache,
  getMemoryCacheSize,
  applyScaleToGeometry,
} from '@/lib/geometry/wythoff/cache'
import type { PolytopeGeometry } from '@/lib/geometry/types'
import type { WythoffPolytopeConfig } from '@/lib/geometry/wythoff/types'

/**
 * Create test geometry for testing
 * @param dimension
 */
function createTestGeometry(dimension: number = 4): PolytopeGeometry {
  const vertices: number[][] = []
  for (let i = 0; i < 8; i++) {
    const vertex = Array(dimension)
      .fill(0)
      .map((_, d) => ((i >> d) & 1 ? 1 : -1))
    vertices.push(vertex)
  }

  return {
    type: 'wythoff-polytope',
    dimension,
    vertices,
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ],
    metadata: { name: 'Test Polytope', properties: {} },
  }
}

describe('getCacheKey', () => {
  it('should generate consistent keys for same config', () => {
    const config: WythoffPolytopeConfig = {
      symmetryGroup: 'B',
      preset: 'regular',
      scale: 1.0,
      snub: false,
      customSymbol: [],
    }

    const key1 = getCacheKey(4, config)
    const key2 = getCacheKey(4, config)
    expect(key1).toBe(key2)
  })

  it('should generate different keys for different dimensions', () => {
    const config: WythoffPolytopeConfig = {
      symmetryGroup: 'B',
      preset: 'regular',
      scale: 1.0,
      snub: false,
      customSymbol: [],
    }

    const key4d = getCacheKey(4, config)
    const key5d = getCacheKey(5, config)
    expect(key4d).not.toBe(key5d)
  })

  it('should generate different keys for different symmetry groups', () => {
    const configA: WythoffPolytopeConfig = {
      symmetryGroup: 'A',
      preset: 'regular',
      scale: 1.0,
      snub: false,
      customSymbol: [],
    }
    const configB: WythoffPolytopeConfig = {
      symmetryGroup: 'B',
      preset: 'regular',
      scale: 1.0,
      snub: false,
      customSymbol: [],
    }

    expect(getCacheKey(4, configA)).not.toBe(getCacheKey(4, configB))
  })

  it('should generate different keys for different presets', () => {
    const configRegular: WythoffPolytopeConfig = {
      symmetryGroup: 'B',
      preset: 'regular',
      scale: 1.0,
      snub: false,
      customSymbol: [],
    }
    const configTruncated: WythoffPolytopeConfig = {
      symmetryGroup: 'B',
      preset: 'truncated',
      scale: 1.0,
      snub: false,
      customSymbol: [],
    }

    expect(getCacheKey(4, configRegular)).not.toBe(getCacheKey(4, configTruncated))
  })

  it('should ignore scale in cache key (scale-independent caching)', () => {
    const config1: WythoffPolytopeConfig = {
      symmetryGroup: 'B',
      preset: 'regular',
      scale: 1.0,
      snub: false,
      customSymbol: [],
    }
    const config2: WythoffPolytopeConfig = {
      ...config1,
      scale: 2.5, // Different scale
    }

    // Scale is intentionally excluded from cache key
    const key1 = getCacheKey(4, config1)
    const key2 = getCacheKey(4, config2)
    expect(key1).toBe(key2)
  })

  it('should generate different keys for snub variants', () => {
    const configNormal: WythoffPolytopeConfig = {
      symmetryGroup: 'B',
      preset: 'regular',
      scale: 1.0,
      snub: false,
      customSymbol: [],
    }
    const configSnub: WythoffPolytopeConfig = {
      ...configNormal,
      snub: true,
    }

    expect(getCacheKey(4, configNormal)).not.toBe(getCacheKey(4, configSnub))
  })
})

describe('Memory cache', () => {
  beforeEach(() => {
    clearMemoryCache()
  })

  afterEach(() => {
    clearMemoryCache()
  })

  it('should cache and retrieve from memory', () => {
    const geometry = createTestGeometry()
    const key = 'test-key'

    cachePolytope(key, geometry)

    const cached = getFromMemoryCache(key)
    expect(cached).not.toBeNull()
    expect(cached?.dimension).toBe(4)
  })

  it('should return null for missing key', () => {
    const result = getFromMemoryCache('nonexistent')
    expect(result).toBeNull()
  })

  it('should track cache size correctly', () => {
    expect(getMemoryCacheSize()).toBe(0)

    cachePolytope('key1', createTestGeometry())
    expect(getMemoryCacheSize()).toBe(1)

    cachePolytope('key2', createTestGeometry())
    expect(getMemoryCacheSize()).toBe(2)
  })

  it('should clear memory cache', () => {
    cachePolytope('key1', createTestGeometry())
    cachePolytope('key2', createTestGeometry())
    expect(getMemoryCacheSize()).toBe(2)

    clearMemoryCache()
    expect(getMemoryCacheSize()).toBe(0)
    expect(getFromMemoryCache('key1')).toBeNull()
  })

  it('should evict oldest when at capacity', () => {
    // WYTHOFF_CONFIG.MAX_CACHE_SIZE is 20
    for (let i = 0; i < 25; i++) {
      cachePolytope(`key-${i}`, createTestGeometry())
    }

    // First 5 should be evicted (FIFO)
    expect(getFromMemoryCache('key-0')).toBeNull()
    expect(getFromMemoryCache('key-4')).toBeNull()

    // Last 20 should still be there
    expect(getFromMemoryCache('key-5')).not.toBeNull()
    expect(getFromMemoryCache('key-24')).not.toBeNull()
  })
})

describe('getCachedPolytope', () => {
  beforeEach(() => {
    clearMemoryCache()
  })

  afterEach(() => {
    clearMemoryCache()
  })

  it('should check memory cache first', async () => {
    const geometry = createTestGeometry()
    const key = 'memory-test'

    // Put in memory cache
    cachePolytope(key, geometry)

    const result = await getCachedPolytope(key)
    expect(result).not.toBeNull()
    expect(result?.dimension).toBe(4)
  })

  it('should fall back to IndexedDB', async () => {
    const geometry = createTestGeometry()
    const key = 'indexeddb-test-' + Date.now()

    // Put in cache (writes to both memory and IndexedDB)
    cachePolytope(key, geometry)

    // Wait for IndexedDB write (fire-and-forget)
    await new Promise((r) => setTimeout(r, 100))

    // Clear memory cache
    clearMemoryCache()
    expect(getFromMemoryCache(key)).toBeNull()

    // Should retrieve from IndexedDB
    const result = await getCachedPolytope(key)
    expect(result).not.toBeNull()
    expect(result?.dimension).toBe(4)

    // Should also populate memory cache
    expect(getFromMemoryCache(key)).not.toBeNull()
  })

  it('should return null when not in either cache', async () => {
    const result = await getCachedPolytope('nonexistent-' + Date.now())
    expect(result).toBeNull()
  })
})

describe('applyScaleToGeometry', () => {
  it('should return unchanged geometry for scale=1.0', () => {
    const geometry = createTestGeometry()
    const scaled = applyScaleToGeometry(geometry, 1.0)

    // Should return same reference when scale is 1.0
    expect(scaled).toBe(geometry)
  })

  it('should scale all vertices', () => {
    const geometry: PolytopeGeometry = {
      type: 'wythoff-polytope',
      dimension: 3,
      vertices: [
        [1, 2, 3],
        [4, 5, 6],
      ],
      edges: [[0, 1]],
    }

    const scaled = applyScaleToGeometry(geometry, 2.0)

    expect(scaled.vertices[0]).toEqual([2, 4, 6])
    expect(scaled.vertices[1]).toEqual([8, 10, 12])
  })

  it('should preserve edges', () => {
    const geometry: PolytopeGeometry = {
      type: 'wythoff-polytope',
      dimension: 3,
      vertices: [
        [1, 0, 0],
        [0, 1, 0],
      ],
      edges: [
        [0, 1],
        [1, 0],
      ],
    }

    const scaled = applyScaleToGeometry(geometry, 2.0)

    expect(scaled.edges).toEqual([
      [0, 1],
      [1, 0],
    ])
  })

  it('should preserve and extend metadata', () => {
    const geometry: PolytopeGeometry = {
      type: 'wythoff-polytope',
      dimension: 3,
      vertices: [[1, 0, 0]],
      edges: [],
      metadata: { name: 'Test', properties: { original: true } },
    }

    const scaled = applyScaleToGeometry(geometry, 2.0)

    expect(scaled.metadata?.name).toBe('Test')
    expect(scaled.metadata?.properties?.original).toBe(true)
  })

  it('should add appliedScale to metadata', () => {
    const geometry = createTestGeometry()
    const scaled = applyScaleToGeometry(geometry, 2.5)

    expect(scaled.metadata?.properties?.appliedScale).toBe(2.5)
  })

  it('should handle negative scale', () => {
    const geometry: PolytopeGeometry = {
      type: 'wythoff-polytope',
      dimension: 3,
      vertices: [[1, 2, 3]],
      edges: [],
    }

    const scaled = applyScaleToGeometry(geometry, -1.0)

    expect(scaled.vertices[0]).toEqual([-1, -2, -3])
  })

  it('should handle fractional scale', () => {
    const geometry: PolytopeGeometry = {
      type: 'wythoff-polytope',
      dimension: 3,
      vertices: [[4, 8, 12]],
      edges: [],
    }

    const scaled = applyScaleToGeometry(geometry, 0.5)

    expect(scaled.vertices[0]).toEqual([2, 4, 6])
  })

  it('should not mutate original geometry', () => {
    const geometry: PolytopeGeometry = {
      type: 'wythoff-polytope',
      dimension: 3,
      vertices: [[1, 2, 3]],
      edges: [],
    }
    const originalVertex = [...geometry.vertices[0]!]

    applyScaleToGeometry(geometry, 2.0)

    // Original should be unchanged
    expect(geometry.vertices[0]).toEqual(originalVertex)
  })
})

describe('Integration: cache key + storage + retrieval', () => {
  beforeEach(() => {
    clearMemoryCache()
  })

  afterEach(() => {
    clearMemoryCache()
  })

  it('should cache and retrieve geometry by config-derived key', async () => {
    const config: WythoffPolytopeConfig = {
      symmetryGroup: 'B',
      preset: 'regular',
      scale: 2.0,
      snub: false,
      customSymbol: [],
    }

    const key = getCacheKey(4, config)
    const geometry = createTestGeometry(4)

    cachePolytope(key, geometry)

    // Immediate memory cache hit
    const cached = await getCachedPolytope(key)
    expect(cached).not.toBeNull()
    expect(cached?.dimension).toBe(4)
    expect(cached?.vertices.length).toBe(8)
  })

  it('should allow scale-independent caching with different scales', () => {
    const config1: WythoffPolytopeConfig = {
      symmetryGroup: 'B',
      preset: 'regular',
      scale: 1.0,
      snub: false,
      customSymbol: [],
    }
    const config2: WythoffPolytopeConfig = {
      ...config1,
      scale: 3.0,
    }

    // Same key for different scales
    const key1 = getCacheKey(4, config1)
    const key2 = getCacheKey(4, config2)
    expect(key1).toBe(key2)

    // Cache normalized geometry
    const geometry = createTestGeometry(4)
    cachePolytope(key1, geometry)

    // Retrieve and apply different scales
    const cached = getFromMemoryCache(key1)!
    const scaled1 = applyScaleToGeometry(cached, 1.0)
    const scaled3 = applyScaleToGeometry(cached, 3.0)

    // Scaled versions should have different vertex coordinates
    expect(scaled1.vertices[0]).not.toEqual(scaled3.vertices[0])

    // But same structure
    expect(scaled1.vertices.length).toBe(scaled3.vertices.length)
    expect(scaled1.edges.length).toBe(scaled3.edges.length)
  })
})
