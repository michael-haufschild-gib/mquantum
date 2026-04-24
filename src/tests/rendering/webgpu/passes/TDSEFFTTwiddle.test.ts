/**
 * Tests for the TDSE FFT twiddle-table generator.
 *
 * The GPU path replaces per-thread `cos(angle), sin(angle)` in the Stockham
 * radix-2 butterfly with a lookup into `buildTdseFFTTwiddleTable()`. Any drift
 * in the table layout, sign convention, or value would silently introduce
 * phase errors in the FFT — so every byte of the table is validated against
 * the analytic formula.
 */

import { describe, expect, it } from 'vitest'

import {
  buildTdseFFTTwiddleTable,
  FFT_TWIDDLE_BYTES,
  FFT_TWIDDLE_COMPLEX_COUNT,
  N_MAX_FFT_TWIDDLE,
} from '@/rendering/webgpu/passes/TDSEFFTTwiddle'

describe('TDSEFFTTwiddle constants', () => {
  it('N_MAX is 128 (power of two in TDSE grid range)', () => {
    expect(N_MAX_FFT_TWIDDLE).toBe(128)
    expect(N_MAX_FFT_TWIDDLE & (N_MAX_FFT_TWIDDLE - 1)).toBe(0)
  })

  it('complex count is N_MAX/2 (sufficient for largest stage)', () => {
    expect(FFT_TWIDDLE_COMPLEX_COUNT).toBe(N_MAX_FFT_TWIDDLE / 2)
  })

  it('byte size is complex count * 8 (cos + -sin as f32)', () => {
    expect(FFT_TWIDDLE_BYTES).toBe(FFT_TWIDDLE_COMPLEX_COUNT * 2 * 4)
    expect(FFT_TWIDDLE_BYTES).toBe(512)
  })
})

describe('buildTdseFFTTwiddleTable', () => {
  it('returns a Float32Array of length 2 * FFT_TWIDDLE_COMPLEX_COUNT', () => {
    const table = buildTdseFFTTwiddleTable()
    expect(table).toBeInstanceOf(Float32Array)
    expect(table.length).toBe(2 * FFT_TWIDDLE_COMPLEX_COUNT)
    // 64 complex values * 2 floats = 128
    expect(table.length).toBe(128)
  })

  it('stores (cos(2*pi*k/N), -sin(2*pi*k/N)) at index 2k/2k+1', () => {
    const table = buildTdseFFTTwiddleTable()
    const twoPiOverN = (2 * Math.PI) / N_MAX_FFT_TWIDDLE
    for (let k = 0; k < FFT_TWIDDLE_COMPLEX_COUNT; k++) {
      const theta = twoPiOverN * k
      // f32 round-trip tolerance — the stored table IS f32, so ULP drift is
      // inherent. Comparing against Math.cos(theta) (f64) cast to f32 matches
      // exactly because the generator does the same cast.
      expect(table[2 * k]!).toBeCloseTo(Math.cos(theta), 6)
      expect(table[2 * k + 1]!).toBeCloseTo(-Math.sin(theta), 6)
    }
  })

  it('k=0 twiddle is exactly (1, 0) (W^0 identity)', () => {
    const table = buildTdseFFTTwiddleTable()
    expect(table[0]).toBe(1)
    // -sin(0) = 0 — no rounding.
    expect(table[1]).toBe(-0)
  })

  it('k=32 twiddle is (0, -1) (W_128^32 = exp(-i*pi/2))', () => {
    // 2*pi*32/128 = pi/2. cos = 0, -sin = -1.
    const table = buildTdseFFTTwiddleTable()
    expect(table[2 * 32]!).toBeCloseTo(0, 6)
    expect(table[2 * 32 + 1]!).toBeCloseTo(-1, 6)
  })

  it('Stride derivation — k = j * (N_MAX / fullStage) reproduces smaller stages', () => {
    // For an axis of size 8 at stage s=2 (halfStage=4, fullStage=8), the
    // butterfly wants exp(-i*2*pi*j/8) for j in [0, 4). With stride =
    // 128/8 = 16 into the 128-sized table we must get the same values.
    const table = buildTdseFFTTwiddleTable()
    const stride = N_MAX_FFT_TWIDDLE / 8 // = 16
    for (let j = 0; j < 4; j++) {
      const k = j * stride
      const expectedAngle = (-2 * Math.PI * j) / 8 // shader's angle for dir=+1
      const expectedRe = Math.cos(expectedAngle)
      const expectedIm = Math.sin(expectedAngle) // = -sin(2*pi*j/8)
      expect(table[2 * k]!).toBeCloseTo(expectedRe, 6)
      expect(table[2 * k + 1]!).toBeCloseTo(expectedIm, 6)
    }
  })

  it('inverse direction reconstruction — tw.y = dir * twFwd.y', () => {
    // Shader flips imaginary component via `tw = vec2f(twFwd.x, dir * twFwd.y)`.
    // For dir=-1 (inverse) this must produce exp(+i*2*pi*j/fullStage).
    const table = buildTdseFFTTwiddleTable()
    const N = 8
    const stride = N_MAX_FFT_TWIDDLE / N
    for (let j = 0; j < N / 2; j++) {
      const k = j * stride
      // Inverse: dir = -1. Reconstructed tw = (twFwd.x, -1 * twFwd.y).
      const reconstructedRe = table[2 * k]!
      const reconstructedIm = -1 * table[2 * k + 1]!
      const expectedAngle = (2 * Math.PI * j) / N // +angle for dir=-1
      expect(reconstructedRe).toBeCloseTo(Math.cos(expectedAngle), 6)
      expect(reconstructedIm).toBeCloseTo(Math.sin(expectedAngle), 6)
    }
  })

  it('matches CPU FFT reference twiddle convention at shared indices', () => {
    // src/lib/math/fft.ts caches twiddles with angle = -2*pi*j/len, storing
    // (cos(angle), sin(angle)) = (cos(2*pi*j/len), -sin(2*pi*j/len)). That is
    // exactly our table for len = N_MAX. For len < N_MAX the CPU FFT stores a
    // separate cache, but the per-element formula is identical — the GPU
    // shader just indexes the N_MAX table at stride N_MAX/len.
    const table = buildTdseFFTTwiddleTable()
    const N = N_MAX_FFT_TWIDDLE
    for (let j = 0; j < N / 2; j++) {
      const angle = (-2 * Math.PI * j) / N
      expect(table[2 * j]!).toBeCloseTo(Math.cos(angle), 6)
      expect(table[2 * j + 1]!).toBeCloseTo(Math.sin(angle), 6)
    }
  })
})
