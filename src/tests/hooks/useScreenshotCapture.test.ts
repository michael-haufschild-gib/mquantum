import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureScreenshotAsync } from '@/hooks/useScreenshotCapture'
import { useScreenshotCaptureStore } from '@/stores/screenshotCaptureStore'

describe('captureScreenshotAsync', () => {
  beforeEach(() => {
    useScreenshotCaptureStore.setState({
      status: 'idle',
      capturedImage: null,
      error: null,
      requestId: 0,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves with captured image data when capture succeeds', async () => {
    const promise = captureScreenshotAsync()
    const requestId = useScreenshotCaptureStore.getState().requestId
    useScreenshotCaptureStore.getState().setCapturedImage('data:image/png;base64,ok', requestId)

    await expect(promise).resolves.toBe('data:image/png;base64,ok')
  })

  it('shares a single in-flight request across concurrent callers', async () => {
    const p1 = captureScreenshotAsync()
    const p2 = captureScreenshotAsync()
    const requestId = useScreenshotCaptureStore.getState().requestId

    useScreenshotCaptureStore.getState().setCapturedImage('data:image/png;base64,same', requestId)

    await expect(p1).resolves.toBe('data:image/png;base64,same')
    await expect(p2).resolves.toBe('data:image/png;base64,same')
  })

  it('rejects with timeout and marks store error when capture never completes', async () => {
    vi.useFakeTimers()
    const promise = captureScreenshotAsync()
    const rejection = expect(promise).rejects.toThrow('Screenshot capture timeout')

    await vi.advanceTimersByTimeAsync(5000)
    await rejection
    expect(useScreenshotCaptureStore.getState().status).toBe('error')
    expect(useScreenshotCaptureStore.getState().error).toBe('Screenshot capture timeout')
  })
})
