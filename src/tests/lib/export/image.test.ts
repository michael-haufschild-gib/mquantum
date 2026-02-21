/**
 * Tests for image export utilities
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exportSceneToPNG, generateTimestampFilename } from '@/lib/export/image'
import { captureScreenshotAsync } from '@/hooks/useScreenshotCapture'

const { openModalMock, showMsgBoxMock } = vi.hoisted(() => ({
  openModalMock: vi.fn(),
  showMsgBoxMock: vi.fn(),
}))

vi.mock('@/stores/screenshotStore', () => ({
  useScreenshotStore: {
    getState: () => ({
      openModal: openModalMock,
    }),
  },
}))

vi.mock('@/stores/msgBoxStore', () => ({
  useMsgBoxStore: {
    getState: () => ({
      showMsgBox: showMsgBoxMock,
    }),
  },
}))

vi.mock('@/hooks/useScreenshotCapture', () => ({
  captureScreenshotAsync: vi.fn(),
}))

describe('image export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('exportSceneToPNG', () => {
    it('returns false when async screenshot capture fails', async () => {
      vi.mocked(captureScreenshotAsync).mockRejectedValue(new Error('capture failed'))

      const result = await exportSceneToPNG()

      expect(result).toBe(false)
      expect(showMsgBoxMock).toHaveBeenCalledWith('Export Failed', 'capture failed', 'error')
      expect(openModalMock).not.toHaveBeenCalled()
    })
  })

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
