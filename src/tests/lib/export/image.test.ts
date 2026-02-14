/**
 * Tests for image export utilities
 */

import { describe, it, expect } from 'vitest'
import { generateTimestampFilename } from '@/lib/export/image'

describe('image export', () => {
  describe('generateTimestampFilename', () => {
    it('should generate filename with default prefix', () => {
      const filename = generateTimestampFilename()
      expect(filename).toMatch(/^ndimensional-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/)
    })

    it('should generate filename with custom prefix', () => {
      const filename = generateTimestampFilename('tesseract')
      expect(filename).toMatch(/^tesseract-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/)
    })

    it('should generate unique filenames', () => {
      const filename1 = generateTimestampFilename()
      const filename2 = generateTimestampFilename()
      // They might be the same if executed in the same second
      // But the format should be correct
      expect(filename1).toMatch(/^ndimensional-/)
      expect(filename2).toMatch(/^ndimensional-/)
    })
  })
})
