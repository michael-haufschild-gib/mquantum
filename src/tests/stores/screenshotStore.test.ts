/**
 * Screenshot store tests.
 *
 * Verifies modal open/close lifecycle and cross-store cleanup:
 * closing the modal must reset the capture store to free the data URL
 * from memory. A leaked data URL is a multi-MB string that accumulates.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useScreenshotCaptureStore } from '@/stores/screenshotCaptureStore'
import { useScreenshotStore } from '@/stores/screenshotStore'

describe('screenshotStore', () => {
  beforeEach(() => {
    useScreenshotStore.getState().reset()
    useScreenshotCaptureStore.getState().reset()
  })

  it('openModal sets isOpen and stores image source', () => {
    useScreenshotStore.getState().openModal('data:image/png;base64,abc123')
    const state = useScreenshotStore.getState()
    expect(state.isOpen).toBe(true)
    expect(state.imageSrc).toBe('data:image/png;base64,abc123')
  })

  it('closeModal clears isOpen and imageSrc', () => {
    useScreenshotStore.getState().openModal('data:image/png;base64,xyz')
    useScreenshotStore.getState().closeModal()

    const state = useScreenshotStore.getState()
    expect(state.isOpen).toBe(false)
    expect(state.imageSrc).toBeNull()
  })

  it('closeModal triggers screenshotCaptureStore.reset (cross-store cleanup)', () => {
    // Set up capture store with data
    useScreenshotCaptureStore.setState({ capturedImage: 'data:image/png;large-blob' })
    expect(useScreenshotCaptureStore.getState().capturedImage).toBe('data:image/png;large-blob')

    // Open and close screenshot modal
    useScreenshotStore.getState().openModal('data:image/png;base64,abc')
    useScreenshotStore.getState().closeModal()

    // Capture store should be reset (data URL freed)
    expect(useScreenshotCaptureStore.getState().capturedImage).toBeNull()
  })

  it('reset also triggers screenshotCaptureStore.reset', () => {
    useScreenshotCaptureStore.setState({ capturedImage: 'data:image/png;blob' })
    useScreenshotStore.getState().openModal('data:image/png;base64,abc')

    useScreenshotStore.getState().reset()

    expect(useScreenshotStore.getState().isOpen).toBe(false)
    expect(useScreenshotStore.getState().imageSrc).toBeNull()
    expect(useScreenshotCaptureStore.getState().capturedImage).toBeNull()
  })

  it('closeModal is idempotent (calling twice does not throw)', () => {
    useScreenshotStore.getState().closeModal()
    useScreenshotStore.getState().closeModal()
    expect(useScreenshotStore.getState().isOpen).toBe(false)
  })
})
