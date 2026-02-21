/**
 * Tests for SoundManager audio initialization robustness.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

type WindowWithAudio = Window & {
  AudioContext?: unknown
  webkitAudioContext?: unknown
}

function setAudioConstructors(AudioContextCtor: unknown, webkitCtor: unknown): void {
  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    writable: true,
    value: AudioContextCtor,
  })
  Object.defineProperty(window, 'webkitAudioContext', {
    configurable: true,
    writable: true,
    value: webkitCtor,
  })
}

describe('SoundManager', () => {
  const originalAudioContext = (window as WindowWithAudio).AudioContext
  const originalWebkitAudioContext = (window as WindowWithAudio).webkitAudioContext

  afterEach(() => {
    setAudioConstructors(originalAudioContext, originalWebkitAudioContext)
    vi.resetModules()
  })

  it('does not throw when AudioContext constructors are unavailable', async () => {
    setAudioConstructors(undefined, undefined)

    const { soundManager } = await import('@/lib/audio/SoundManager')
    const manager = soundManager as unknown as {
      init: () => void
      initialized: boolean
      ctx: unknown
    }

    expect(() => manager.init()).not.toThrow()
    expect(manager.initialized).toBe(false)
    expect(manager.ctx).toBeNull()
    expect(() => soundManager.playClick()).not.toThrow()
  })

  it('can recover by retrying init after a transient AudioContext constructor failure', async () => {
    let constructorAttempts = 0

    class FlakyAudioContext {
      public destination = {}

      constructor() {
        constructorAttempts += 1
        if (constructorAttempts === 1) {
          throw new Error('transient audio init failure')
        }
      }

      public createGain() {
        return {
          gain: { value: 1 },
          connect: vi.fn(),
        }
      }
    }

    setAudioConstructors(FlakyAudioContext, undefined)

    const { soundManager } = await import('@/lib/audio/SoundManager')
    const manager = soundManager as unknown as {
      init: () => void
      initialized: boolean
      ctx: unknown
    }

    expect(() => manager.init()).not.toThrow()
    expect(manager.initialized).toBe(false)
    expect(manager.ctx).toBeNull()

    expect(() => manager.init()).not.toThrow()
    expect(manager.initialized).toBe(true)
    expect(manager.ctx).not.toBeNull()
  })
})
