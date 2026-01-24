/**
 * Tests for cross-section computation
 */

import { describe, it, expect } from 'vitest'
import {
  computeCrossSection,
  projectCrossSectionTo3D,
  getWRange,
} from '@/lib/geometry/cross-section'
import { generateHypercube, generateHypercubeFaces } from '@/lib/geometry/hypercube'
import type { Face } from '@/lib/geometry/faces'

describe('cross-section', () => {
  describe('computeCrossSection', () => {
    it('should return empty result for 3D geometry', () => {
      const cube = generateHypercube(3)
      const result = computeCrossSection(cube, 0)

      expect(result.hasIntersection).toBe(false)
      expect(result.points).toHaveLength(0)
    })

    it('should find intersection at W=0 for tesseract', () => {
      const tesseract = generateHypercube(4)
      const result = computeCrossSection(tesseract, 0)

      expect(result.hasIntersection).toBe(true)
      // At W=0, we should get a cube (8 vertices)
      expect(result.points.length).toBeGreaterThan(0)
    })

    it('should find no intersection outside tesseract bounds', () => {
      const tesseract = generateHypercube(4)
      // Tesseract vertices are at ±1, so W=2 is outside
      const result = computeCrossSection(tesseract, 2)

      expect(result.hasIntersection).toBe(false)
      expect(result.points).toHaveLength(0)
    })

    it('should return fewer points at extreme W values', () => {
      const tesseract = generateHypercube(4)

      const resultCenter = computeCrossSection(tesseract, 0)
      const resultEdge = computeCrossSection(tesseract, 0.9)

      // The center slice should generally have more points
      expect(resultCenter.points.length).toBeGreaterThanOrEqual(resultEdge.points.length)
    })

    it('should produce points with correct W coordinate', () => {
      const tesseract = generateHypercube(4)
      const sliceW = 0.5
      const result = computeCrossSection(tesseract, sliceW)

      if (result.hasIntersection) {
        for (const point of result.points) {
          expect(point[3]).toBeCloseTo(sliceW, 5)
        }
      }
    })

    it('should produce edges connecting related points', () => {
      const tesseract = generateHypercube(4)
      // We need faces to generate correct edges now
      const faceIndices = generateHypercubeFaces(4)
      const faces: Face[] = faceIndices.map((indices) => ({ vertices: indices }))

      const result = computeCrossSection(tesseract, 0, faces)

      if (result.hasIntersection) {
        // All edge indices should be valid
        for (const [i, j] of result.edges) {
          expect(i).toBeGreaterThanOrEqual(0)
          expect(i).toBeLessThan(result.points.length)
          expect(j).toBeGreaterThanOrEqual(0)
          expect(j).toBeLessThan(result.points.length)
        }
      }
    })

    it('should form a correct 3D Cube (12 edges) when slicing a Tesseract', () => {
      const tesseract = generateHypercube(4)
      const faceIndices = generateHypercubeFaces(4)
      const faces: Face[] = faceIndices.map((indices) => ({ vertices: indices }))

      const result = computeCrossSection(tesseract, 0, faces)

      expect(result.hasIntersection).toBe(true)
      expect(result.points.length).toBe(8)
      expect(result.edges.length).toBe(12)
    })

    it('should handle negative W values', () => {
      const tesseract = generateHypercube(4)
      const result = computeCrossSection(tesseract, -0.5)

      expect(result.hasIntersection).toBe(true)
      expect(result.points.length).toBeGreaterThan(0)
    })
  })

  describe('projectCrossSectionTo3D', () => {
    it('should project points to 3D', () => {
      const tesseract = generateHypercube(4)
      const crossSection = computeCrossSection(tesseract, 0)
      const projected = projectCrossSectionTo3D(crossSection)

      for (const point of projected) {
        expect(point).toHaveLength(3)
      }
    })

    it('should preserve X, Y, Z coordinates', () => {
      const tesseract = generateHypercube(4)
      const crossSection = computeCrossSection(tesseract, 0)
      const projected = projectCrossSectionTo3D(crossSection)

      for (let i = 0; i < crossSection.points.length; i++) {
        expect(projected[i]![0]).toBe(crossSection.points[i]![0])
        expect(projected[i]![1]).toBe(crossSection.points[i]![1])
        expect(projected[i]![2]).toBe(crossSection.points[i]![2])
      }
    })

    it('should handle empty cross-section', () => {
      const cube = generateHypercube(3)
      const crossSection = computeCrossSection(cube, 0)
      const projected = projectCrossSectionTo3D(crossSection)

      expect(projected).toHaveLength(0)
    })
  })

  describe('getWRange', () => {
    it('should return [0, 0] for 3D geometry', () => {
      const cube = generateHypercube(3)
      const [minW, maxW] = getWRange(cube)

      expect(minW).toBe(0)
      expect(maxW).toBe(0)
    })

    it('should return [-1, 1] for unit tesseract', () => {
      const tesseract = generateHypercube(4)
      const [minW, maxW] = getWRange(tesseract)

      expect(minW).toBe(-1)
      expect(maxW).toBe(1)
    })

    it('should handle 5D geometry', () => {
      const penteract = generateHypercube(5)
      const [minW, maxW] = getWRange(penteract)

      expect(minW).toBe(-1)
      expect(maxW).toBe(1)
    })

    it('should handle empty geometry', () => {
      const emptyGeometry = {
        vertices: [],
        edges: [],
        dimension: 4,
        type: 'hypercube' as const,
      }
      const [minW, maxW] = getWRange(emptyGeometry)

      expect(minW).toBe(0)
      expect(maxW).toBe(0)
    })
  })
})
