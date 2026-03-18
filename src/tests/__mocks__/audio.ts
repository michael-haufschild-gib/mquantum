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

/**
 * Install AudioContext mock on globalThis and window.
 * Must be called during test setup.
 */
export function installAudioMock(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.AudioContext = MockAudioContext as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).AudioContext = MockAudioContext
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).webkitAudioContext = MockAudioContext
}
