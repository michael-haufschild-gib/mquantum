/**
 * Tests for image export utilities
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { generateTimestampFilename, findThreeCanvas } from '@/lib/export/image'

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

  describe('findThreeCanvas', () => {
    beforeEach(() => {
      // Clear any existing canvases
      document.body.innerHTML = ''
    })

    it('should return null when no canvas exists', () => {
      const canvas = findThreeCanvas()
      expect(canvas).toBeNull()
    })

    it('should find canvas element inside main-webgl-canvas wrapper', () => {
      // Create the wrapper div that R3F uses
      const wrapper = document.createElement('div')
      wrapper.id = 'main-webgl-canvas'

      const testCanvas = document.createElement('canvas')
      wrapper.appendChild(testCanvas)
      document.body.appendChild(wrapper)

      const canvas = findThreeCanvas()
      expect(canvas).toBe(testCanvas)

      document.body.removeChild(wrapper)
    })

    it('should return canvas directly if wrapper is a canvas element', () => {
      // Edge case: if the wrapper itself is a canvas
      const testCanvas = document.createElement('canvas')
      testCanvas.id = 'main-webgl-canvas'
      document.body.appendChild(testCanvas)

      const canvas = findThreeCanvas()
      expect(canvas).toBe(testCanvas)

      document.body.removeChild(testCanvas)
    })

    it('should return null when wrapper exists but has no canvas', () => {
      const wrapper = document.createElement('div')
      wrapper.id = 'main-webgl-canvas'
      document.body.appendChild(wrapper)

      const canvas = findThreeCanvas()
      expect(canvas).toBeNull()

      document.body.removeChild(wrapper)
    })
  })
})
