/**
 * Tests for dimension color utilities
 */

import { describe, it, expect } from 'vitest'
import {
  getDimensionColor,
  getDimensionColorHex,
  getEdgeDimensions,
  getEdgePrimaryDimension,
  getEdgeColor,
  getPredefinedDimensionColor,
  DIMENSION_COLORS,
} from '@/rendering/shaders/dimensionColors'

describe('dimensionColors', () => {
  describe('getDimensionColor', () => {
    it('should return HSL color string', () => {
      const color = getDimensionColor(0, 4)
      expect(color).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/)
    })

    it('should return evenly spaced hues for dimensions', () => {
      // For 4 dimensions, hues should be 0, 90, 180, 270
      expect(getDimensionColor(0, 4)).toBe('hsl(0, 80%, 60%)')
      expect(getDimensionColor(1, 4)).toBe('hsl(90, 80%, 60%)')
      expect(getDimensionColor(2, 4)).toBe('hsl(180, 80%, 60%)')
      expect(getDimensionColor(3, 4)).toBe('hsl(270, 80%, 60%)')
    })

    it('should handle edge case of zero dimensions', () => {
      expect(getDimensionColor(0, 0)).toBe('hsl(0, 80%, 60%)')
    })

    it('should handle single dimension', () => {
      expect(getDimensionColor(0, 1)).toBe('hsl(0, 80%, 60%)')
    })
  })

  describe('getDimensionColorHex', () => {
    it('should return hex color string', () => {
      const color = getDimensionColorHex(0, 4)
      expect(color).toMatch(/^#[0-9a-f]{6}$/)
    })

    it('should return red-ish color for first dimension', () => {
      const color = getDimensionColorHex(0, 4)
      // Should be in red range
      expect(color.substring(1, 3)).not.toBe('00')
    })

    it('should handle edge cases', () => {
      expect(getDimensionColorHex(0, 0)).toMatch(/^#[0-9a-f]{6}$/)
    })
  })

  describe('getEdgeDimensions', () => {
    it('should identify single dimension difference', () => {
      // X dimension edge
      expect(getEdgeDimensions([0, 0, 0], [1, 0, 0])).toEqual([0])
      // Y dimension edge
      expect(getEdgeDimensions([0, 0, 0], [0, 1, 0])).toEqual([1])
      // Z dimension edge
      expect(getEdgeDimensions([0, 0, 0], [0, 0, 1])).toEqual([2])
    })

    it('should identify multiple dimension differences', () => {
      // XY diagonal
      expect(getEdgeDimensions([0, 0, 0], [1, 1, 0])).toEqual([0, 1])
      // XYZ diagonal
      expect(getEdgeDimensions([0, 0, 0], [1, 1, 1])).toEqual([0, 1, 2])
    })

    it('should return empty array for identical vertices', () => {
      expect(getEdgeDimensions([1, 2, 3], [1, 2, 3])).toEqual([])
    })

    it('should handle 4D vertices', () => {
      // W dimension edge
      expect(getEdgeDimensions([0, 0, 0, 0], [0, 0, 0, 1])).toEqual([3])
    })

    it('should handle floating point values', () => {
      expect(getEdgeDimensions([0, 0, 0], [0.5, 0, 0])).toEqual([0])
      expect(getEdgeDimensions([0.1, 0.2, 0.3], [0.1, 0.2, 0.3])).toEqual([])
    })

    it('should handle vertices of different lengths', () => {
      // Should compare up to shorter length
      expect(getEdgeDimensions([0, 0], [1, 0, 0])).toEqual([0])
    })
  })

  describe('getEdgePrimaryDimension', () => {
    it('should return first differing dimension', () => {
      expect(getEdgePrimaryDimension([0, 0, 0], [1, 0, 0])).toBe(0)
      expect(getEdgePrimaryDimension([0, 0, 0], [0, 1, 0])).toBe(1)
      expect(getEdgePrimaryDimension([0, 0, 0], [1, 1, 0])).toBe(0)
    })

    it('should return 0 for identical vertices', () => {
      expect(getEdgePrimaryDimension([1, 1, 1], [1, 1, 1])).toBe(0)
    })
  })

  describe('getEdgeColor', () => {
    it('should return hex color for edge', () => {
      const color = getEdgeColor([0, 0, 0], [1, 0, 0], 4)
      expect(color).toMatch(/^#[0-9a-f]{6}$/)
    })

    it('should return different colors for different dimension edges', () => {
      const xColor = getEdgeColor([0, 0, 0], [1, 0, 0], 4)
      const yColor = getEdgeColor([0, 0, 0], [0, 1, 0], 4)
      const zColor = getEdgeColor([0, 0, 0], [0, 0, 1], 4)

      expect(xColor).not.toBe(yColor)
      expect(yColor).not.toBe(zColor)
      expect(xColor).not.toBe(zColor)
    })

    it('should handle identical vertices', () => {
      const color = getEdgeColor([0, 0, 0], [0, 0, 0], 4)
      expect(color).toMatch(/^#[0-9a-f]{6}$/)
    })
  })

  describe('DIMENSION_COLORS', () => {
    it('should have predefined colors for first 8 dimensions', () => {
      expect(DIMENSION_COLORS[0]).toBe('#FF4444') // X - Red
      expect(DIMENSION_COLORS[1]).toBe('#44FF44') // Y - Green
      expect(DIMENSION_COLORS[2]).toBe('#4444FF') // Z - Blue
      expect(DIMENSION_COLORS[3]).toBe('#FF44FF') // W - Magenta
    })

    it('should have 8 predefined colors', () => {
      const count = Object.keys(DIMENSION_COLORS).length
      expect(count).toBe(8)
    })
  })

  describe('getPredefinedDimensionColor', () => {
    it('should return predefined color for first 8 dimensions', () => {
      expect(getPredefinedDimensionColor(0, 10)).toBe('#FF4444')
      expect(getPredefinedDimensionColor(3, 10)).toBe('#FF44FF')
    })

    it('should fall back to computed color for dimensions >= 8', () => {
      const color = getPredefinedDimensionColor(8, 10)
      expect(color).toMatch(/^#[0-9a-f]{6}$/)
      // Should not be a predefined color
      expect(Object.values(DIMENSION_COLORS)).not.toContain(color)
    })
  })
})
