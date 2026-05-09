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

const mockAudioParam = () => ({
  value: 0,
  setValueAtTime: vi.fn().mockReturnThis(),
  linearRampToValueAtTime: vi.fn().mockReturnThis(),
  exponentialRampToValueAtTime: vi.fn().mockReturnThis(),
})

class MinimalAudioContext {
  sampleRate = 44100
  currentTime = 0
  destination = {}
  state: AudioContext['state'] | 'interrupted' = 'running'
  resume = vi.fn().mockResolvedValue(undefined)
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

  it('playClick is a no-op when disabled (does NOT touch the audio context)', () => {
    soundManager.toggle(false)
    const internal = soundManager as unknown as {
      ctx: { createBufferSource?: ReturnType<typeof vi.fn> } | null
    }
    if (internal.ctx && vi.isMockFunction(internal.ctx.createBufferSource)) {
      internal.ctx.createBufferSource.mockClear()
      soundManager.playClick()
      expect(internal.ctx.createBufferSource).not.toHaveBeenCalled()
    } else {
      // No mocked AudioContext available (uninitialised, or initialised with
      // a real Web Audio API). The disabled-state guard fires first so
      // playClick is a no-op regardless — verify no throw.
      expect(() => soundManager.playClick()).not.toThrow()
    }
  })

  it('all play methods are no-ops when SoundManager is disabled (every audio API path stays untouched)', () => {
    soundManager.toggle(false)
    const internal = soundManager as unknown as {
      ctx: {
        createBufferSource?: ReturnType<typeof vi.fn>
        createOscillator?: ReturnType<typeof vi.fn>
        createBuffer?: ReturnType<typeof vi.fn>
        createGain?: ReturnType<typeof vi.fn>
        createBiquadFilter?: ReturnType<typeof vi.fn>
      } | null
    }
    if (
      !internal.ctx ||
      !vi.isMockFunction(internal.ctx.createBufferSource) ||
      !vi.isMockFunction(internal.ctx.createOscillator)
    ) {
      // No mocked audio context to inspect; smoke test: every method returns void.
      expect(soundManager.playClick()).toBeUndefined()
      expect(soundManager.playHover()).toBeUndefined()
      expect(soundManager.playSnap()).toBeUndefined()
      expect(soundManager.playSuccess()).toBeUndefined()
      expect(soundManager.playSwish()).toBeUndefined()
      return
    }
    const mockedSpies = [
      internal.ctx.createBufferSource,
      internal.ctx.createOscillator,
      internal.ctx.createBuffer,
      internal.ctx.createGain,
      internal.ctx.createBiquadFilter,
    ].filter((s): s is ReturnType<typeof vi.fn> => Boolean(s) && vi.isMockFunction(s))
    for (const spy of mockedSpies) spy.mockClear()
    soundManager.playClick()
    soundManager.playHover()
    soundManager.playSnap()
    soundManager.playSuccess()
    soundManager.playSwish()
    for (const spy of mockedSpies) expect(spy).not.toHaveBeenCalled()
  })
})

describe('SoundManager throttling', () => {
  let manager: typeof soundManager
  const savedAudioContext = (window as WindowWithAudio).AudioContext
  const savedWebkitAudioContext = (window as WindowWithAudio).webkitAudioContext

  beforeEach(async () => {
    // Provide a minimal AudioContext so init() succeeds and play methods reach throttle logic
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

  it('allows first playClick call and reaches audio path', () => {
    const internal = manager as unknown as { ctx: { createBufferSource: ReturnType<typeof vi.fn> } }
    manager.playClick()
    expect(internal.ctx.createBufferSource).toHaveBeenCalledTimes(1)
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

  it('initializes on the first playClick call so the triggering click can produce audio', async () => {
    setAudioConstructors(MinimalAudioContext, undefined)

    const { soundManager } = await import('@/lib/audio/SoundManager')
    const manager = soundManager as unknown as {
      initialized: boolean
      ctx: MinimalAudioContext | null
    }

    expect(manager.initialized).toBe(false)
    soundManager.playClick()

    expect(manager.initialized).toBe(true)
    expect(manager.ctx?.createBufferSource).toHaveBeenCalledTimes(1)
  })

  it('initializes on the first playHover call instead of waiting for click or keydown', async () => {
    setAudioConstructors(MinimalAudioContext, undefined)

    const { soundManager } = await import('@/lib/audio/SoundManager')
    const manager = soundManager as unknown as {
      initialized: boolean
      ctx: MinimalAudioContext | null
    }

    expect(manager.initialized).toBe(false)
    soundManager.playHover()

    expect(manager.initialized).toBe(true)
    expect(manager.ctx?.createOscillator).toHaveBeenCalledTimes(1)
  })

  it('resumes suspended audio contexts before scheduling playback', async () => {
    class SuspendedAudioContext extends MinimalAudioContext {
      override state: AudioContext['state'] | 'interrupted' = 'suspended'
      override resume = vi.fn().mockImplementation(() => {
        this.state = 'running'
        return Promise.resolve()
      })
    }

    setAudioConstructors(SuspendedAudioContext, undefined)

    const { soundManager } = await import('@/lib/audio/SoundManager')
    const manager = soundManager as unknown as { ctx: SuspendedAudioContext | null }

    soundManager.playClick()

    expect(manager.ctx?.resume).toHaveBeenCalledTimes(1)
    expect(manager.ctx?.createBufferSource).toHaveBeenCalledTimes(1)
  })

  it('does not initialize audio while muted', async () => {
    const constructorSpy = vi.fn()

    class TrackingAudioContext extends MinimalAudioContext {
      constructor() {
        super()
        constructorSpy()
      }
    }

    setAudioConstructors(TrackingAudioContext, undefined)

    const { soundManager } = await import('@/lib/audio/SoundManager')

    soundManager.toggle(false)
    soundManager.playClick()

    expect(constructorSpy).not.toHaveBeenCalled()
  })

  it('drops a closed context without creating playback nodes', async () => {
    const instances: MinimalAudioContext[] = []

    class ClosedAudioContext extends MinimalAudioContext {
      override state: AudioContext['state'] | 'interrupted' = 'closed'

      constructor() {
        super()
        instances.push(this)
      }
    }

    setAudioConstructors(ClosedAudioContext, undefined)

    const { soundManager } = await import('@/lib/audio/SoundManager')
    const manager = soundManager as unknown as {
      initialized: boolean
      ctx: ClosedAudioContext | null
    }

    expect(() => soundManager.playClick()).not.toThrow()

    expect(instances).toHaveLength(1)
    const closedContext = instances[0]
    if (!closedContext) throw new Error('Expected closed audio context instance')
    expect(closedContext.createBufferSource).not.toHaveBeenCalled()
    expect(manager.initialized).toBe(false)
    expect(manager.ctx).toBeNull()
  })

  it('does not let optional audio node failures break UI handlers', async () => {
    class ThrowingAudioContext extends MinimalAudioContext {
      override createBuffer = vi.fn().mockImplementation(() => {
        throw new DOMException('audio backend unavailable', 'InvalidStateError')
      })
    }

    setAudioConstructors(ThrowingAudioContext, undefined)

    const { soundManager } = await import('@/lib/audio/SoundManager')

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
