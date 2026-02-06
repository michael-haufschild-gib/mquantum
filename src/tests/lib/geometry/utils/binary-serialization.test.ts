/**
 * Tests for Binary Serialization for Polytope Geometry
 *
 * @see src/lib/geometry/utils/binary-serialization.ts
 */

import { describe, it, expect } from 'vitest'
import {
  serializeToBinary,
  deserializeFromBinary,
  isBinaryFormat,
  estimateStorageSizes,
  type BinaryPolytopeData,
} from '@/lib/geometry/utils/binary-serialization'
import type { NdGeometry } from '@/lib/geometry/types'

// Helper to create test geometry
function createTestGeometry(
  dimension: number,
  vertexCount: number,
  edgeCount: number
): NdGeometry {
  const vertices: number[][] = []
  for (let i = 0; i < vertexCount; i++) {
    const vertex = Array(dimension)
      .fill(0)
      .map((_, d) => i + d * 0.1)
    vertices.push(vertex)
  }

  const edges: [number, number][] = []
  for (let i = 0; i < edgeCount; i++) {
    edges.push([i % vertexCount, (i + 1) % vertexCount])
  }

  return {
    type: 'schroedinger',
    dimension,
    vertices,
    edges,
    metadata: {
      name: 'Test Polytope',
      properties: { test: true },
    },
  }
}

describe('serializeToBinary', () => {
  it('should serialize 3D geometry correctly', () => {
    const geometry = createTestGeometry(3, 4, 4)
    const binary = serializeToBinary(geometry)

    expect(binary.version).toBe(1)
    expect(binary.dimension).toBe(3)
    expect(binary.vertexCount).toBe(4)
    expect(binary.edgeCount).toBe(4)
    expect(binary.vertices).toBeInstanceOf(ArrayBuffer)
    expect(binary.edges).toBeInstanceOf(ArrayBuffer)
    expect(typeof binary.metadata).toBe('string')
  })

  it('should serialize vertices to Float64Array buffer', () => {
    const geometry: NdGeometry = {
      type: 'schroedinger',
      dimension: 3,
      vertices: [
        [1.5, 2.5, 3.5],
        [4.5, 5.5, 6.5],
      ],
      edges: [[0, 1]],
    }

    const binary = serializeToBinary(geometry)
    const vertexArray = new Float64Array(binary.vertices)

    // 2 vertices * 3 dimensions = 6 floats
    expect(vertexArray.length).toBe(6)
    expect(vertexArray[0]).toBe(1.5)
    expect(vertexArray[1]).toBe(2.5)
    expect(vertexArray[2]).toBe(3.5)
    expect(vertexArray[3]).toBe(4.5)
    expect(vertexArray[4]).toBe(5.5)
    expect(vertexArray[5]).toBe(6.5)
  })

  it('should serialize edges to Uint32Array buffer', () => {
    const geometry: NdGeometry = {
      type: 'schroedinger',
      dimension: 3,
      vertices: [
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 0],
      ],
    }

    const binary = serializeToBinary(geometry)
    const edgeArray = new Uint32Array(binary.edges)

    // 3 edges * 2 indices = 6 integers
    expect(edgeArray.length).toBe(6)
    expect(edgeArray[0]).toBe(0)
    expect(edgeArray[1]).toBe(1)
    expect(edgeArray[2]).toBe(1)
    expect(edgeArray[3]).toBe(2)
    expect(edgeArray[4]).toBe(2)
    expect(edgeArray[5]).toBe(0)
  })

  it('should serialize metadata as JSON', () => {
    const geometry: NdGeometry = {
      type: 'schroedinger',
      dimension: 3,
      vertices: [[0, 0, 0]],
      edges: [],
      metadata: {
        name: 'Test',
        properties: { scale: 2.5, preset: 'regular' },
      },
    }

    const binary = serializeToBinary(geometry)
    const metadata = JSON.parse(binary.metadata)

    expect(metadata.name).toBe('Test')
    expect(metadata.properties.scale).toBe(2.5)
    expect(metadata.properties.preset).toBe('regular')
  })

  it('should handle empty geometry', () => {
    const geometry: NdGeometry = {
      type: 'schroedinger',
      dimension: 3,
      vertices: [],
      edges: [],
    }

    const binary = serializeToBinary(geometry)
    expect(binary.dimension).toBe(0) // No vertices to determine dimension
    expect(binary.vertexCount).toBe(0)
    expect(binary.edgeCount).toBe(0)
    expect(binary.vertices.byteLength).toBe(0)
    expect(binary.edges.byteLength).toBe(0)
  })

  it('should handle high-dimensional geometry (11D)', () => {
    const geometry = createTestGeometry(11, 10, 15)
    const binary = serializeToBinary(geometry)

    expect(binary.dimension).toBe(11)
    // 10 vertices * 11 dimensions * 8 bytes = 880 bytes
    expect(binary.vertices.byteLength).toBe(880)
    // 15 edges * 2 indices * 4 bytes = 120 bytes
    expect(binary.edges.byteLength).toBe(120)
  })
})

describe('deserializeFromBinary', () => {
  it('should round-trip 3D geometry', () => {
    const original: NdGeometry = {
      type: 'schroedinger',
      dimension: 3,
      vertices: [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ],
      edges: [
        [0, 1],
        [1, 2],
      ],
      metadata: { name: 'Test', properties: { foo: 'bar' } },
    }

    const binary = serializeToBinary(original)
    const restored = deserializeFromBinary(binary)

    expect(restored.type).toBe('schroedinger')
    expect(restored.dimension).toBe(3)
    expect(restored.vertices).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ])
    expect(restored.edges).toEqual([
      [0, 1],
      [1, 2],
    ])
    expect(restored.metadata?.name).toBe('Test')
    expect(restored.metadata?.properties?.foo).toBe('bar')
  })

  it('should preserve vertex precision', () => {
    const original: NdGeometry = {
      type: 'schroedinger',
      dimension: 4,
      vertices: [[1.123456789012345, -2.987654321098765, 0, 3.141592653589793]],
      edges: [],
    }

    const binary = serializeToBinary(original)
    const restored = deserializeFromBinary(binary)

    // Float64 should preserve full precision
    expect(restored.vertices[0]![0]).toBe(1.123456789012345)
    expect(restored.vertices[0]![1]).toBe(-2.987654321098765)
    expect(restored.vertices[0]![3]).toBe(3.141592653589793)
  })

  it('should handle missing metadata gracefully', () => {
    const binary: BinaryPolytopeData = {
      version: 1,
      dimension: 3,
      vertexCount: 1,
      edgeCount: 0,
      vertices: new Float64Array([1, 2, 3]).buffer,
      edges: new Uint32Array([]).buffer,
      metadata: 'invalid json {{{',
    }

    const restored = deserializeFromBinary(binary)
    expect(restored.metadata).toBeUndefined()
  })

  it('should restore empty geometry', () => {
    const binary: BinaryPolytopeData = {
      version: 1,
      dimension: 3,
      vertexCount: 0,
      edgeCount: 0,
      vertices: new ArrayBuffer(0),
      edges: new ArrayBuffer(0),
      metadata: '{}',
    }

    const restored = deserializeFromBinary(binary)
    expect(restored.vertices).toEqual([])
    expect(restored.edges).toEqual([])
  })
})

describe('isBinaryFormat', () => {
  it('should return true for valid binary data', () => {
    const binary: BinaryPolytopeData = {
      version: 1,
      dimension: 4,
      vertexCount: 10,
      edgeCount: 15,
      vertices: new ArrayBuffer(10 * 4 * 8), // 10 vertices * 4 dims * 8 bytes
      edges: new ArrayBuffer(15 * 2 * 4), // 15 edges * 2 indices * 4 bytes
      metadata: '{}',
    }

    expect(isBinaryFormat(binary)).toBe(true)
  })

  it('should return false for null/undefined', () => {
    expect(isBinaryFormat(null)).toBe(false)
    expect(isBinaryFormat(undefined)).toBe(false)
  })

  it('should return false for non-object', () => {
    expect(isBinaryFormat('string')).toBe(false)
    expect(isBinaryFormat(123)).toBe(false)
    expect(isBinaryFormat([])).toBe(false)
  })

  it('should return false for missing fields', () => {
    expect(isBinaryFormat({})).toBe(false)
    expect(isBinaryFormat({ version: 1 })).toBe(false)
    expect(
      isBinaryFormat({
        version: 1,
        dimension: 3,
        // missing other fields
      })
    ).toBe(false)
  })

  it('should return false for wrong types', () => {
    expect(
      isBinaryFormat({
        version: '1',
        dimension: 3,
        vertexCount: 0,
        edgeCount: 0,
        vertices: new ArrayBuffer(0),
        edges: new ArrayBuffer(0),
        metadata: '{}',
      })
    ).toBe(false)

    expect(
      isBinaryFormat({
        version: 1,
        dimension: 3,
        vertexCount: 0,
        edgeCount: 0,
        vertices: [], // Wrong type
        edges: new ArrayBuffer(0),
        metadata: '{}',
      })
    ).toBe(false)
  })

  it('should return false for unsupported version', () => {
    expect(
      isBinaryFormat({
        version: 2, // Unsupported
        dimension: 3,
        vertexCount: 0,
        edgeCount: 0,
        vertices: new ArrayBuffer(0),
        edges: new ArrayBuffer(0),
        metadata: '{}',
      })
    ).toBe(false)
  })

  it('should return false for invalid dimension range', () => {
    // Dimension < 3
    expect(
      isBinaryFormat({
        version: 1,
        dimension: 2,
        vertexCount: 0,
        edgeCount: 0,
        vertices: new ArrayBuffer(0),
        edges: new ArrayBuffer(0),
        metadata: '{}',
      })
    ).toBe(false)

    // Dimension > 11
    expect(
      isBinaryFormat({
        version: 1,
        dimension: 12,
        vertexCount: 0,
        edgeCount: 0,
        vertices: new ArrayBuffer(0),
        edges: new ArrayBuffer(0),
        metadata: '{}',
      })
    ).toBe(false)
  })

  it('should return false for negative counts', () => {
    expect(
      isBinaryFormat({
        version: 1,
        dimension: 3,
        vertexCount: -1,
        edgeCount: 0,
        vertices: new ArrayBuffer(0),
        edges: new ArrayBuffer(0),
        metadata: '{}',
      })
    ).toBe(false)
  })

  it('should return false for buffer size mismatch', () => {
    // Wrong vertex buffer size
    expect(
      isBinaryFormat({
        version: 1,
        dimension: 3,
        vertexCount: 10,
        edgeCount: 0,
        vertices: new ArrayBuffer(100), // Should be 10 * 3 * 8 = 240
        edges: new ArrayBuffer(0),
        metadata: '{}',
      })
    ).toBe(false)

    // Wrong edge buffer size
    expect(
      isBinaryFormat({
        version: 1,
        dimension: 3,
        vertexCount: 0,
        edgeCount: 5,
        vertices: new ArrayBuffer(0),
        edges: new ArrayBuffer(20), // Should be 5 * 2 * 4 = 40
        metadata: '{}',
      })
    ).toBe(false)
  })
})

describe('estimateStorageSizes', () => {
  it('should estimate sizes for simple geometry', () => {
    const geometry = createTestGeometry(3, 10, 15)
    const { jsonBytes, binaryBytes, ratio } = estimateStorageSizes(geometry)

    expect(jsonBytes).toBeGreaterThan(0)
    expect(binaryBytes).toBeGreaterThan(0)
    expect(ratio).toBeGreaterThan(1) // Binary should be smaller
  })

  it('should show ~2-3x improvement for typical geometry', () => {
    // Large geometry with many vertices
    const geometry = createTestGeometry(4, 1000, 2000)
    const { ratio } = estimateStorageSizes(geometry)

    // Should be roughly 2-3x improvement
    expect(ratio).toBeGreaterThan(1.5)
    expect(ratio).toBeLessThan(4)
  })

  it('should handle empty geometry', () => {
    const geometry: NdGeometry = {
      type: 'schroedinger',
      dimension: 3,
      vertices: [],
      edges: [],
    }

    const { jsonBytes, binaryBytes, ratio } = estimateStorageSizes(geometry)
    // Empty but with overhead
    expect(jsonBytes).toBeGreaterThan(0)
    expect(binaryBytes).toBeGreaterThan(0)
    expect(ratio).toBeGreaterThan(0)
  })
})

describe('Round-trip integrity', () => {
  it('should preserve all data through round-trip', () => {
    const original = createTestGeometry(5, 100, 200)

    const binary = serializeToBinary(original)
    const restored = deserializeFromBinary(binary)

    expect(restored.dimension).toBe(original.dimension)
    expect(restored.vertices.length).toBe(original.vertices.length)
    expect(restored.edges.length).toBe(original.edges.length)

    // Check a few vertices
    for (let i = 0; i < Math.min(10, original.vertices.length); i++) {
      expect(restored.vertices[i]).toEqual(original.vertices[i])
    }

    // Check a few edges
    for (let i = 0; i < Math.min(10, original.edges.length); i++) {
      expect(restored.edges[i]).toEqual(original.edges[i])
    }
  })

  it('should validate restored data passes isBinaryFormat', () => {
    const original = createTestGeometry(4, 50, 100)
    const binary = serializeToBinary(original)

    // The binary data should pass validation
    expect(isBinaryFormat(binary)).toBe(true)
  })
})
