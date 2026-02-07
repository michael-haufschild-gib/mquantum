/**
 * Tests for education content
 */

import { describe, it, expect } from 'vitest'
import {
  getDimensionInfo,
  getRotationPlaneCount,
} from '@/lib/education/content'

describe('education content', () => {
  describe('getDimensionInfo', () => {
    it('should return undefined for unsupported dimensions', () => {
      expect(getDimensionInfo(2)).toBeUndefined()
      expect(getDimensionInfo(7)).toBeUndefined()
    })
  })

  describe('getRotationPlaneCount', () => {
    it('should return 3 for 3D', () => {
      expect(getRotationPlaneCount(3)).toBe(3)
    })

    it('should return 6 for 4D', () => {
      expect(getRotationPlaneCount(4)).toBe(6)
    })

    it('should return 10 for 5D', () => {
      expect(getRotationPlaneCount(5)).toBe(10)
    })

    it('should return 15 for 6D', () => {
      expect(getRotationPlaneCount(6)).toBe(15)
    })
  })
})
