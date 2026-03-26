/**
 * Tests for SoundManager audio initialization robustness.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { soundManager } from '@/lib/audio/SoundManager'

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

describe('SoundManager state management', () => {
  beforeEach(() => {
    soundManager.toggle(true)
  })

  it('is enabled by default', () => {
    expect(soundManager.isEnabled).toBe(true)
  })

  it('toggle(false) disables sounds', () => {
    soundManager.toggle(false)
    expect(soundManager.isEnabled).toBe(false)
  })

  it('toggle flips enabled state', () => {
    soundManager.toggle(false)
    expect(soundManager.isEnabled).toBe(false)
    soundManager.toggle(true)
    expect(soundManager.isEnabled).toBe(true)
  })

  it('subscribe notifies on state change', () => {
    let notifyCount = 0
    const unsub = soundManager.subscribe(() => notifyCount++)

    soundManager.toggle(false)
    expect(notifyCount).toBe(1)
    soundManager.toggle(true)
    expect(notifyCount).toBe(2)

    unsub()
    soundManager.toggle(false)
    expect(notifyCount).toBe(2) // no change after unsub
    soundManager.toggle(true)
  })

  it('getSnapshot returns current enabled state', () => {
    expect(soundManager.getSnapshot()).toBe(true)
    soundManager.toggle(false)
    expect(soundManager.getSnapshot()).toBe(false)
    soundManager.toggle(true)
  })

  it('playClick does not throw when disabled', () => {
    soundManager.toggle(false)
    expect(() => soundManager.playClick()).not.toThrow()
  })

  it('playClick does not throw when enabled (mock AudioContext)', () => {
    expect(() => soundManager.playClick()).not.toThrow()
  })

  it('playHover does not throw', () => {
    expect(() => soundManager.playHover()).not.toThrow()
  })

  it('playSnap does not throw', () => {
    expect(() => soundManager.playSnap()).not.toThrow()
  })

  it('playSuccess does not throw', () => {
    expect(() => soundManager.playSuccess()).not.toThrow()
  })

  it('playSwish does not throw', () => {
    expect(() => soundManager.playSwish()).not.toThrow()
  })
})

describe('SoundManager initialization', () => {
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
    expect(manager.ctx).toBeInstanceOf(FlakyAudioContext)
  })
})
