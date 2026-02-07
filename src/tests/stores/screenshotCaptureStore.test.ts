import { beforeEach, describe, expect, it } from 'vitest'
import { useScreenshotCaptureStore } from '@/stores/screenshotCaptureStore'

describe('screenshotCaptureStore', () => {
  beforeEach(() => {
    useScreenshotCaptureStore.setState({
      status: 'idle',
      capturedImage: null,
      error: null,
      requestId: 0,
    })
  })

  it('starts capture and returns request ID', () => {
    const requestId = useScreenshotCaptureStore.getState().requestCapture()
    const state = useScreenshotCaptureStore.getState()

    expect(requestId).toBe(1)
    expect(state.status).toBe('capturing')
    expect(state.requestId).toBe(1)
    expect(state.capturedImage).toBeNull()
    expect(state.error).toBeNull()
  })

  it('reuses active request ID when capture already in progress', () => {
    const firstId = useScreenshotCaptureStore.getState().requestCapture()
    const secondId = useScreenshotCaptureStore.getState().requestCapture()

    expect(secondId).toBe(firstId)
    expect(useScreenshotCaptureStore.getState().status).toBe('capturing')
  })

  it('ignores stale success completions from older request IDs', () => {
    const requestId = useScreenshotCaptureStore.getState().requestCapture()
    useScreenshotCaptureStore.getState().reset()

    useScreenshotCaptureStore.getState().setCapturedImage('data:image/png;base64,stale', requestId)

    const state = useScreenshotCaptureStore.getState()
    expect(state.status).toBe('idle')
    expect(state.capturedImage).toBeNull()
  })

  it('accepts completion only for the active request ID', () => {
    const requestId = useScreenshotCaptureStore.getState().requestCapture()
    useScreenshotCaptureStore.getState().setCapturedImage('data:image/png;base64,new', requestId)

    const state = useScreenshotCaptureStore.getState()
    expect(state.status).toBe('ready')
    expect(state.capturedImage).toBe('data:image/png;base64,new')
    expect(state.error).toBeNull()
  })

  it('ignores stale errors from older request IDs', () => {
    const requestId = useScreenshotCaptureStore.getState().requestCapture()
    useScreenshotCaptureStore.getState().reset()

    useScreenshotCaptureStore.getState().setError('stale error', requestId)

    const state = useScreenshotCaptureStore.getState()
    expect(state.status).toBe('idle')
    expect(state.error).toBeNull()
  })
})
