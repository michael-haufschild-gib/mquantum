/**
 * Tests for FFT WASM bridge functions.
 *
 * In the vitest (happy-dom) environment, WASM is mocked/unavailable.
 * These tests verify the bridge functions gracefully return null.
 */

import { describe, expect, it } from 'vitest'

import {
  fft1dWasm,
  fftNdWasm,
  ifft1dWasm,
  ifftNdWasm,
  isAnimationWasmReady,
} from '@/lib/wasm/animation-wasm'

describe('FFT WASM bridge — null when not ready', () => {
  it('WASM is not ready in test environment', () => {
    expect(isAnimationWasmReady()).toBe(false)
  })

  it('fft1dWasm returns null', () => {
    const data = new Float64Array([1, 0, 0, 0, 0, 0, 0, 0])
    expect(fft1dWasm(data, 4)).toBeNull()
  })

  it('ifft1dWasm returns null', () => {
    const data = new Float64Array([1, 0, 1, 0, 1, 0, 1, 0])
    expect(ifft1dWasm(data, 4)).toBeNull()
  })

  it('fftNdWasm returns null', () => {
    const data = new Float64Array(2 * 4 * 4)
    const gridSize = new Uint32Array([4, 4])
    expect(fftNdWasm(data, gridSize)).toBeNull()
  })

  it('ifftNdWasm returns null', () => {
    const data = new Float64Array(2 * 4 * 4)
    const gridSize = new Uint32Array([4, 4])
    expect(ifftNdWasm(data, gridSize)).toBeNull()
  })
})
