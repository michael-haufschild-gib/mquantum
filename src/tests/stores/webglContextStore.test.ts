import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_RECOVERY_CONFIG,
  RECOVERY_STATE_KEY,
  useWebGLContextStore,
} from '@/stores/webglContextStore'

describe('webglContextStore (invariants)', () => {
  beforeEach(() => {
    useWebGLContextStore.getState().reset()
    localStorage.removeItem(RECOVERY_STATE_KEY)
    vi.restoreAllMocks()
  })

  it('tracks context loss and maintains lossHistory within the rapidFailureWindow', () => {
    const now = 100_000
    vi.spyOn(Date, 'now').mockReturnValue(now)

    useWebGLContextStore.getState().onContextLost()
    const s1 = useWebGLContextStore.getState()
    expect(s1.status).toBe('lost')
    expect(s1.lostCount).toBe(1)
    expect(s1.lostAt).toBe(now)
    expect(s1.lossHistory).toEqual([now])

    // Outside the window: old entries should be filtered out on next loss
    vi.spyOn(Date, 'now').mockReturnValue(now + DEFAULT_RECOVERY_CONFIG.rapidFailureWindow + 1)
    useWebGLContextStore.getState().onContextLost()
    const s2 = useWebGLContextStore.getState()
    expect(s2.lostCount).toBe(2)
    expect(s2.lossHistory).toHaveLength(1)
    expect(s2.lossHistory[0]).toBe(now + DEFAULT_RECOVERY_CONFIG.rapidFailureWindow + 1)
  })

  it('computes exponential backoff and doubles again during rapid failure (capped at maxTimeout)', () => {
    const base = DEFAULT_RECOVERY_CONFIG.initialTimeout
    const max = DEFAULT_RECOVERY_CONFIG.maxTimeout

    // 0 attempts => base
    expect(useWebGLContextStore.getState().getCurrentTimeout()).toBe(base)

    // 2 attempts => base * 2^2
    useWebGLContextStore.getState().onContextRestoring()
    useWebGLContextStore.getState().onContextRestoring()
    expect(useWebGLContextStore.getState().getCurrentTimeout()).toBe(Math.min(base * 4, max))

    // Rapid failure mode: timeout is doubled again (still capped)
    const now = 200_000
    const nowSpy = vi.spyOn(Date, 'now')
    nowSpy.mockReturnValue(now)
    useWebGLContextStore.getState().onContextLost()
    nowSpy.mockReturnValue(now + 1)
    useWebGLContextStore.getState().onContextLost()
    nowSpy.mockReturnValue(now + 2)
    useWebGLContextStore.getState().onContextLost()
    expect(useWebGLContextStore.getState().isRapidFailure()).toBe(true)

    const rapidTimeout = useWebGLContextStore.getState().getCurrentTimeout()
    const normalTimeout = Math.min(base * 4, max)
    expect(rapidTimeout).toBe(Math.min(normalTimeout * 2, max))
  })

  it('persists a recovery marker and enters failed state on hard failure', () => {
    useWebGLContextStore.getState().onContextFailed('boom')

    const state = useWebGLContextStore.getState()
    expect(state.status).toBe('failed')
    expect(state.lastError).toBe('boom')

    const saved = localStorage.getItem(RECOVERY_STATE_KEY)
    expect(saved).not.toBeNull()
    const parsed = JSON.parse(saved!)
    expect(typeof parsed.savedAt).toBe('number')
  })
})
