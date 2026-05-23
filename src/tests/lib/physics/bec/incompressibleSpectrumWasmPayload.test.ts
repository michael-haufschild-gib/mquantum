import { beforeEach, describe, expect, it, vi } from 'vitest'

const wasm = vi.hoisted(() => ({
  computeIncompressibleSpectrumWasm: vi.fn(),
}))

vi.mock('@/lib/wasm', () => ({
  computeIncompressibleSpectrumWasm: wasm.computeIncompressibleSpectrumWasm,
  fft1dWasm: vi.fn(() => null),
  fftNdWasm: vi.fn(() => null),
  ifft1dWasm: vi.fn(() => null),
  ifftNdWasm: vi.fn(() => null),
  isAnimationWasmReady: vi.fn(() => false),
}))

import {
  computeIncompressibleSpectrum,
  NUM_SPECTRUM_BINS,
} from '@/lib/physics/bec/incompressibleSpectrum'

describe('computeIncompressibleSpectrum WASM payload validation', () => {
  beforeEach(() => {
    wasm.computeIncompressibleSpectrumWasm.mockReset()
  })

  it('rejects finite-length WASM payloads containing non-finite or negative diagnostics', () => {
    const packed = new Float64Array(2 * NUM_SPECTRUM_BINS + 2)
    packed.fill(1)
    packed[3] = Number.NaN
    packed[NUM_SPECTRUM_BINS + 2] = Number.POSITIVE_INFINITY
    packed[2 * NUM_SPECTRUM_BINS] = -1
    wasm.computeIncompressibleSpectrumWasm.mockReturnValue(packed)

    const psiRe = new Float32Array(8 * 8)
    const psiIm = new Float32Array(8 * 8)
    psiRe.fill(1)

    const result = computeIncompressibleSpectrum(psiRe, psiIm, [8, 8], [0.5, 0.5], 1, 1)

    expect(result.spectrum).toHaveLength(NUM_SPECTRUM_BINS)
    expect(result.kValues).toHaveLength(NUM_SPECTRUM_BINS)
    expect(result.spectrum.every((value) => value === 0)).toBe(true)
    expect(result.kValues.every((value) => Number.isFinite(value) && value > 0)).toBe(true)
    expect(result.totalIncompressible).toBe(0)
    expect(result.totalCompressible).toBe(0)
  })

  it('validates grid shape before WASM Uint32 coercion', () => {
    const psiRe = new Float32Array(18)
    const psiIm = new Float32Array(18)
    psiRe.fill(1)

    const result = computeIncompressibleSpectrum(psiRe, psiIm, [4.5, 4], [0.5, 0.5], 1, 1)

    expect(wasm.computeIncompressibleSpectrumWasm).not.toHaveBeenCalled()
    expect(result.spectrum.every((value) => value === 0)).toBe(true)
    expect(result.totalIncompressible).toBe(0)
    expect(result.totalCompressible).toBe(0)
  })
})
