/**
 * AudioContext mock for SoundManager in tests.
 *
 * Provides mocks for Web Audio API: AudioContext, OscillatorNode,
 * GainNode, BiquadFilterNode, and AudioBufferSourceNode.
 *
 * @module tests/__mocks__/audio
 */

import { vi } from 'vitest'

const mockAudioParam = {
  value: 0,
  setValueAtTime: vi.fn().mockReturnThis(),
  linearRampToValueAtTime: vi.fn().mockReturnThis(),
  exponentialRampToValueAtTime: vi.fn().mockReturnThis(),
  cancelScheduledValues: vi.fn().mockReturnThis(),
}

class MockAudioContext {
  sampleRate = 44100
  currentTime = 0
  destination = {}

  createGain = vi.fn().mockReturnValue({
    gain: { ...mockAudioParam, value: 1 },
    connect: vi.fn(),
  })

  createOscillator = vi.fn().mockReturnValue({
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    frequency: { ...mockAudioParam },
    type: 'sine',
  })

  createBuffer = vi
    .fn()
    .mockImplementation((channels: number, length: number, sampleRate: number) => ({
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: vi.fn().mockReturnValue(new Float32Array(length)),
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
    frequency: { ...mockAudioParam, value: 1000 },
    Q: { ...mockAudioParam, value: 1 },
    gain: { ...mockAudioParam, value: 0 },
    connect: vi.fn(),
  })
}

/** Window with AudioContext and vendor-prefixed variant (Safari). */
interface WindowWithAudioContext extends Window {
  AudioContext: typeof AudioContext
  webkitAudioContext: typeof AudioContext
}

/**
 * Install AudioContext mock on globalThis and window.
 * Must be called during test setup.
 */
export function installAudioMock(): void {
  const mockCtor = MockAudioContext as unknown as typeof AudioContext
  globalThis.AudioContext = mockCtor
  const win = window as unknown as WindowWithAudioContext
  win.AudioContext = mockCtor
  win.webkitAudioContext = mockCtor
}
