import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { captureScreenshotAsync, useScreenshotCapture } from '@/hooks/useScreenshotCapture'
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

  it('returns fresh data when invoked while a prior capture is already "ready"', async () => {
    // Pre-seed the store with the result of a previous capture so we can
    // verify the new request bumps requestId, clears the stale image, and
    // resolves with the new payload — not the old one. Pinning this
    // behaviour explicitly because it is the path the export → modal
    // flow takes after a user clicks Save → Capture again.
    useScreenshotCaptureStore.setState({
      status: 'ready',
      capturedImage: 'data:image/png;base64,STALE',
      error: null,
      requestId: 7,
    })

    const promise = captureScreenshotAsync()

    // requestCapture() must have bumped the id and cleared the stale image
    // *synchronously* before we resolve the new image.
    const midState = useScreenshotCaptureStore.getState()
    expect(midState.status).toBe('capturing')
    expect(midState.capturedImage).toBeNull()
    expect(midState.requestId).toBe(8)

    useScreenshotCaptureStore.getState().setCapturedImage('data:image/png;base64,FRESH', 8)

    await expect(promise).resolves.toBe('data:image/png;base64,FRESH')
  })

  it('ignores stale completions targeting an older requestId', async () => {
    const promise = captureScreenshotAsync()
    const requestId = useScreenshotCaptureStore.getState().requestId

    // Simulate a stale completion from a prior in-flight capture: the
    // store-side requestId filter must reject it as a no-op so the new
    // promise does not resolve with someone else's image.
    useScreenshotCaptureStore
      .getState()
      .setCapturedImage('data:image/png;base64,WRONG', requestId - 1)
    expect(useScreenshotCaptureStore.getState().status).toBe('capturing')
    expect(useScreenshotCaptureStore.getState().capturedImage).toBeNull()

    // The genuine completion (matching id) finally resolves the promise.
    useScreenshotCaptureStore.getState().setCapturedImage('data:image/png;base64,RIGHT', requestId)
    await expect(promise).resolves.toBe('data:image/png;base64,RIGHT')
  })
})

describe('useScreenshotCapture', () => {
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

  it('subscribes React callers to status, image, and error changes', () => {
    const { result } = renderHook(() => useScreenshotCapture())

    expect(result.current.status).toBe('idle')
    expect(result.current.capturedImage).toBeNull()
    expect(result.current.error).toBeNull()

    let requestId = 0
    act(() => {
      requestId = useScreenshotCaptureStore.getState().requestCapture()
    })
    expect(result.current.status).toBe('capturing')

    act(() => {
      useScreenshotCaptureStore.getState().setCapturedImage('data:image/png;base64,HOOK', requestId)
    })
    expect(result.current.status).toBe('ready')
    expect(result.current.capturedImage).toBe('data:image/png;base64,HOOK')
    expect(result.current.error).toBeNull()
  })

  it('captureScreenshot resolves through the hook and leaves hook state ready', async () => {
    const { result } = renderHook(() => useScreenshotCapture())

    let promise: Promise<string> | null = null
    act(() => {
      promise = result.current.captureScreenshot()
    })
    if (promise === null) {
      throw new Error('expected hook captureScreenshot to return a promise')
    }
    const requestId = useScreenshotCaptureStore.getState().requestId
    expect(result.current.status).toBe('capturing')

    act(() => {
      useScreenshotCaptureStore
        .getState()
        .setCapturedImage('data:image/png;base64,HOOK-CALL', requestId)
    })

    await expect(promise).resolves.toBe('data:image/png;base64,HOOK-CALL')
    expect(result.current.status).toBe('ready')
    expect(result.current.capturedImage).toBe('data:image/png;base64,HOOK-CALL')
  })
})
