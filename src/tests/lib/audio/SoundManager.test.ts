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

describe('SoundManager throttling', () => {
  let manager: typeof soundManager
  const savedAudioContext = (window as WindowWithAudio).AudioContext
  const savedWebkitAudioContext = (window as WindowWithAudio).webkitAudioContext

  const mockAudioParam = () => ({
    value: 0,
    setValueAtTime: vi.fn().mockReturnThis(),
    linearRampToValueAtTime: vi.fn().mockReturnThis(),
    exponentialRampToValueAtTime: vi.fn().mockReturnThis(),
  })

  beforeEach(async () => {
    // Provide a minimal AudioContext so init() succeeds and play methods reach throttle logic
    class MinimalAudioContext {
      sampleRate = 44100
      currentTime = 0
      destination = {}
      createGain = vi.fn().mockReturnValue({
        gain: mockAudioParam(),
        connect: vi.fn(),
      })
      createOscillator = vi.fn().mockReturnValue({
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        frequency: mockAudioParam(),
        type: 'sine',
        onended: null,
      })
      createBuffer = vi.fn().mockImplementation((_ch: number, len: number, sr: number) => ({
        numberOfChannels: 1,
        length: len,
        sampleRate: sr,
        getChannelData: vi.fn().mockReturnValue(new Float32Array(len)),
      }))
      createBufferSource = vi.fn().mockReturnValue({
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      })
      createBiquadFilter = vi.fn().mockReturnValue({
        type: 'lowpass',
        frequency: mockAudioParam(),
        Q: mockAudioParam(),
        connect: vi.fn(),
      })
    }

    setAudioConstructors(MinimalAudioContext, undefined)

    vi.resetModules()
    const mod = await import('@/lib/audio/SoundManager')
    manager = mod.soundManager

    // Force-initialize
    const internal = manager as unknown as { init: () => void }
    internal.init()
  })

  afterEach(() => {
    setAudioConstructors(savedAudioContext, savedWebkitAudioContext)
    vi.resetModules()
  })

  it('allows first playClick call', () => {
    expect(() => manager.playClick()).not.toThrow()
  })

  it('suppresses rapid successive playClick calls within throttle window', () => {
    const internal = manager as unknown as { ctx: { createBufferSource: ReturnType<typeof vi.fn> } }
    manager.playClick()
    const callCountAfterFirst = internal.ctx.createBufferSource.mock.calls.length

    // Immediate second call should be throttled (no new buffer source created)
    manager.playClick()
    expect(internal.ctx.createBufferSource.mock.calls.length).toBe(callCountAfterFirst)
  })

  it('suppresses rapid successive playHover calls within throttle window', () => {
    const internal = manager as unknown as { ctx: { createOscillator: ReturnType<typeof vi.fn> } }
    manager.playHover()
    const callCountAfterFirst = internal.ctx.createOscillator.mock.calls.length

    manager.playHover()
    expect(internal.ctx.createOscillator.mock.calls.length).toBe(callCountAfterFirst)
  })

  it('allows playClick after throttle window elapses', async () => {
    const internal = manager as unknown as {
      ctx: { createBufferSource: ReturnType<typeof vi.fn> }
      lastPlayTime: Record<string, number>
    }
    manager.playClick()
    const callCountAfterFirst = internal.ctx.createBufferSource.mock.calls.length

    // Simulate time passing beyond the 50ms throttle by backdating the timestamp
    internal.lastPlayTime['click'] = performance.now() - 100
    manager.playClick()
    expect(internal.ctx.createBufferSource.mock.calls.length).toBe(callCountAfterFirst + 1)
  })

  it('throttles each sound type independently', () => {
    const internal = manager as unknown as {
      ctx: {
        createBufferSource: ReturnType<typeof vi.fn>
        createOscillator: ReturnType<typeof vi.fn>
      }
    }
    manager.playClick()
    const bufferCalls = internal.ctx.createBufferSource.mock.calls.length
    const oscCalls = internal.ctx.createOscillator.mock.calls.length

    // playHover should not be throttled by playClick
    manager.playHover()
    expect(internal.ctx.createOscillator.mock.calls.length).toBe(oscCalls + 1)

    // But playClick should still be throttled
    manager.playClick()
    expect(internal.ctx.createBufferSource.mock.calls.length).toBe(bufferCalls)
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
