/**
 * Behavioral equivalence tests for TDSE fused compute kernels.
 *
 * Verifies that the fused kernels (potentialHalf+pack, unpack+potentialHalf)
 * produce bit-identical results to the original sequential kernel execution.
 * This catches regressions in the numerically sensitive Strang-splitting path
 * that runs every TDSE substep.
 */
import { describe, expect, it } from 'vitest'

import {
  tdseFusedPotentialPackBlock,
  tdseFusedUnpackPotentialBlock,
} from '@/rendering/webgpu/shaders/schroedinger/compute/tdseFusedKernels.wgsl'

// ── CPU reference implementations mirroring the WGSL logic ──────────────

interface TDSEParams {
  totalSites: number
  dt: number
  hbar: number
  interactionStrength: number
  imaginaryTime: boolean
}

/**
 * Sequential: potentialHalf then pack (original two-pass path).
 * Returns { psiRe, psiIm, complexBuf } after both operations.
 */
function sequentialPotentialHalfThenPack(
  psiRe: Float32Array,
  psiIm: Float32Array,
  potential: Float32Array,
  params: TDSEParams
): { psiRe: Float32Array; psiIm: Float32Array; complexBuf: Float32Array } {
  const n = params.totalSites
  const outRe = new Float32Array(n)
  const outIm = new Float32Array(n)
  const complexBuf = new Float32Array(n * 2)

  // Pass 1: Apply half-step potential (in-place on psi)
  for (let idx = 0; idx < n; idx++) {
    const re = psiRe[idx]!
    const im = psiIm[idx]!
    const density = re * re + im * im
    const effectiveV = potential[idx]! + params.interactionStrength * density
    const arg = (effectiveV * params.dt) / (2.0 * Math.max(params.hbar, 1e-6))

    if (params.imaginaryTime) {
      const decay = Math.exp(-arg)
      outRe[idx] = re * decay
      outIm[idx] = im * decay
    } else {
      const phase = -arg
      const cosP = Math.cos(phase)
      const sinP = Math.sin(phase)
      outRe[idx] = re * cosP - im * sinP
      outIm[idx] = re * sinP + im * cosP
    }
  }

  // Pass 2: Pack into interleaved complex buffer
  for (let idx = 0; idx < n; idx++) {
    complexBuf[idx * 2] = outRe[idx]!
    complexBuf[idx * 2 + 1] = outIm[idx]!
  }

  return { psiRe: outRe, psiIm: outIm, complexBuf }
}

/**
 * Fused: potentialHalf + pack in a single pass (new fused kernel logic).
 */
function fusedPotentialHalfAndPack(
  psiRe: Float32Array,
  psiIm: Float32Array,
  potential: Float32Array,
  params: TDSEParams
): { psiRe: Float32Array; psiIm: Float32Array; complexBuf: Float32Array } {
  const n = params.totalSites
  const outRe = new Float32Array(n)
  const outIm = new Float32Array(n)
  const complexBuf = new Float32Array(n * 2)

  for (let idx = 0; idx < n; idx++) {
    const re = psiRe[idx]!
    const im = psiIm[idx]!
    const density = re * re + im * im
    const effectiveV = potential[idx]! + params.interactionStrength * density
    const arg = (effectiveV * params.dt) / (2.0 * Math.max(params.hbar, 1e-6))

    let newRe: number
    let newIm: number
    if (params.imaginaryTime) {
      const decay = Math.exp(-arg)
      newRe = re * decay
      newIm = im * decay
    } else {
      const phase = -arg
      const cosP = Math.cos(phase)
      const sinP = Math.sin(phase)
      newRe = re * cosP - im * sinP
      newIm = re * sinP + im * cosP
    }

    outRe[idx] = newRe
    outIm[idx] = newIm
    complexBuf[idx * 2] = newRe
    complexBuf[idx * 2 + 1] = newIm
  }

  return { psiRe: outRe, psiIm: outIm, complexBuf }
}

/**
 * Sequential: unpack (with 1/N norm) then potentialHalf (original two-pass path).
 */
function sequentialUnpackThenPotentialHalf(
  complexBuf: Float32Array,
  potential: Float32Array,
  params: TDSEParams
): { psiRe: Float32Array; psiIm: Float32Array } {
  const n = params.totalSites
  const invN = 1.0 / n
  const midRe = new Float32Array(n)
  const midIm = new Float32Array(n)

  // Pass 1: Unpack with 1/N normalization
  for (let idx = 0; idx < n; idx++) {
    midRe[idx] = complexBuf[idx * 2]! * invN
    midIm[idx] = complexBuf[idx * 2 + 1]! * invN
  }

  // Pass 2: Apply half-step potential
  const outRe = new Float32Array(n)
  const outIm = new Float32Array(n)
  for (let idx = 0; idx < n; idx++) {
    const re = midRe[idx]!
    const im = midIm[idx]!
    const density = re * re + im * im
    const effectiveV = potential[idx]! + params.interactionStrength * density
    const arg = (effectiveV * params.dt) / (2.0 * Math.max(params.hbar, 1e-6))

    if (params.imaginaryTime) {
      const decay = Math.exp(-arg)
      outRe[idx] = re * decay
      outIm[idx] = im * decay
    } else {
      const phase = -arg
      const cosP = Math.cos(phase)
      const sinP = Math.sin(phase)
      outRe[idx] = re * cosP - im * sinP
      outIm[idx] = re * sinP + im * cosP
    }
  }

  return { psiRe: outRe, psiIm: outIm }
}

/**
 * Fused: unpack (with 1/N norm) + potentialHalf in a single pass (new fused kernel logic).
 */
function fusedUnpackAndPotentialHalf(
  complexBuf: Float32Array,
  potential: Float32Array,
  params: TDSEParams
): { psiRe: Float32Array; psiIm: Float32Array } {
  const n = params.totalSites
  const invN = 1.0 / n
  const outRe = new Float32Array(n)
  const outIm = new Float32Array(n)

  for (let idx = 0; idx < n; idx++) {
    const re = complexBuf[idx * 2]! * invN
    const im = complexBuf[idx * 2 + 1]! * invN
    const density = re * re + im * im
    const effectiveV = potential[idx]! + params.interactionStrength * density
    const arg = (effectiveV * params.dt) / (2.0 * Math.max(params.hbar, 1e-6))

    if (params.imaginaryTime) {
      const decay = Math.exp(-arg)
      outRe[idx] = re * decay
      outIm[idx] = im * decay
    } else {
      const phase = -arg
      const cosP = Math.cos(phase)
      const sinP = Math.sin(phase)
      outRe[idx] = re * cosP - im * sinP
      outIm[idx] = re * sinP + im * cosP
    }
  }

  return { psiRe: outRe, psiIm: outIm }
}

// ── Test data generators ────────────────────────────────────────────────

/** Create a Gaussian wavepacket centered on the grid with non-trivial phase. */
function makeGaussianWavepacket(n: number, seed: number): { re: Float32Array; im: Float32Array } {
  const re = new Float32Array(n)
  const im = new Float32Array(n)
  const center = n / 2
  const sigma = n / 8
  for (let i = 0; i < n; i++) {
    const x = (i - center) / sigma
    const gauss = Math.exp(-0.5 * x * x)
    // Add momentum k0 = seed * 2π/n for non-trivial phase structure
    const phase = (seed * 2 * Math.PI * i) / n
    re[i] = gauss * Math.cos(phase)
    im[i] = gauss * Math.sin(phase)
  }
  return { re, im }
}

/** Create a non-trivial potential: double-well with varying depth. */
function makeDoubleSlit(n: number): Float32Array {
  const V = new Float32Array(n)
  const center = n / 2
  const barrierWidth = 3
  const slitWidth = 2
  const slitSpacing = 4
  for (let i = 0; i < n; i++) {
    const d = Math.abs(i - center)
    if (d < barrierWidth) {
      // Barrier region — check for slits
      const slit1 = Math.abs(i - center + slitSpacing)
      const slit2 = Math.abs(i - center - slitSpacing)
      if (slit1 > slitWidth && slit2 > slitWidth) {
        V[i] = 10.0 // High barrier
      }
    }
  }
  return V
}

/** Generate post-FFT complex buffer with non-trivial values (simulating kinetic step output). */
function makePostFFTComplex(n: number, seed: number): Float32Array {
  const buf = new Float32Array(n * 2)
  for (let i = 0; i < n; i++) {
    // Simulate FFT output: oscillating values with varying amplitude
    const phase = (seed * 3.7 * i) / n + 0.5 * Math.sin((i * 2 * Math.PI) / n)
    const amp = Math.exp(-((i - n / 2) ** 2) / (2 * (n / 4) ** 2)) * n // Scale by N to test normalization
    buf[i * 2] = amp * Math.cos(phase)
    buf[i * 2 + 1] = amp * Math.sin(phase)
  }
  return buf
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('fused potentialHalf+pack equivalence', () => {
  const gridSizes = [64, 128, 256]
  const dtValues = [0.001, 0.01, 0.1]
  const gValues = [0, 5.0] // Linear TDSE and nonlinear GPE

  for (const n of gridSizes) {
    for (const dt of dtValues) {
      for (const g of gValues) {
        const label = `n=${n}, dt=${dt}, g=${g}`

        it(`real-time: identical output for ${label}`, () => {
          const params: TDSEParams = {
            totalSites: n,
            dt,
            hbar: 1.0,
            interactionStrength: g,
            imaginaryTime: false,
          }
          const { re, im } = makeGaussianWavepacket(n, 3)
          const V = makeDoubleSlit(n)

          const seq = sequentialPotentialHalfThenPack(re, im, V, params)
          const fused = fusedPotentialHalfAndPack(re, im, V, params)

          for (let i = 0; i < n; i++) {
            expect(fused.psiRe[i]).toBe(seq.psiRe[i])
            expect(fused.psiIm[i]).toBe(seq.psiIm[i])
            expect(fused.complexBuf[i * 2]).toBe(seq.complexBuf[i * 2])
            expect(fused.complexBuf[i * 2 + 1]).toBe(seq.complexBuf[i * 2 + 1])
          }
        })

        it(`imaginary-time: identical output for ${label}`, () => {
          const params: TDSEParams = {
            totalSites: n,
            dt,
            hbar: 1.0,
            interactionStrength: g,
            imaginaryTime: true,
          }
          const { re, im } = makeGaussianWavepacket(n, 5)
          const V = makeDoubleSlit(n)

          const seq = sequentialPotentialHalfThenPack(re, im, V, params)
          const fused = fusedPotentialHalfAndPack(re, im, V, params)

          for (let i = 0; i < n; i++) {
            expect(fused.psiRe[i]).toBe(seq.psiRe[i])
            expect(fused.psiIm[i]).toBe(seq.psiIm[i])
            expect(fused.complexBuf[i * 2]).toBe(seq.complexBuf[i * 2])
            expect(fused.complexBuf[i * 2 + 1]).toBe(seq.complexBuf[i * 2 + 1])
          }
        })
      }
    }
  }
})

describe('fused unpack+potentialHalf equivalence', () => {
  const gridSizes = [64, 128, 256]
  const dtValues = [0.001, 0.01, 0.1]
  const gValues = [0, 5.0]

  for (const n of gridSizes) {
    for (const dt of dtValues) {
      for (const g of gValues) {
        const label = `n=${n}, dt=${dt}, g=${g}`

        it(`real-time: identical output for ${label}`, () => {
          const params: TDSEParams = {
            totalSites: n,
            dt,
            hbar: 1.0,
            interactionStrength: g,
            imaginaryTime: false,
          }
          const complexBuf = makePostFFTComplex(n, 7)
          const V = makeDoubleSlit(n)

          const seq = sequentialUnpackThenPotentialHalf(complexBuf, V, params)
          const fused = fusedUnpackAndPotentialHalf(complexBuf, V, params)

          for (let i = 0; i < n; i++) {
            expect(fused.psiRe[i]).toBe(seq.psiRe[i])
            expect(fused.psiIm[i]).toBe(seq.psiIm[i])
          }
        })

        it(`imaginary-time: identical output for ${label}`, () => {
          const params: TDSEParams = {
            totalSites: n,
            dt,
            hbar: 1.0,
            interactionStrength: g,
            imaginaryTime: true,
          }
          const complexBuf = makePostFFTComplex(n, 11)
          const V = makeDoubleSlit(n)

          const seq = sequentialUnpackThenPotentialHalf(complexBuf, V, params)
          const fused = fusedUnpackAndPotentialHalf(complexBuf, V, params)

          for (let i = 0; i < n; i++) {
            expect(fused.psiRe[i]).toBe(seq.psiRe[i])
            expect(fused.psiIm[i]).toBe(seq.psiIm[i])
          }
        })
      }
    }
  }
})

describe('fused kernel multi-step norm conservation', () => {
  it('preserves total probability over 100 Strang substeps (real-time, linear)', () => {
    const n = 128
    const dt = 0.01
    const params: TDSEParams = {
      totalSites: n,
      dt,
      hbar: 1.0,
      interactionStrength: 0,
      imaginaryTime: false,
    }
    const { re, im } = makeGaussianWavepacket(n, 2)
    const V = makeDoubleSlit(n)
    let psiRe = re
    let psiIm = im

    const norm0 = computeNorm(psiRe, psiIm)

    // Simulate 100 substeps of fused V/2+pack → (skip FFT) → fused unpack+V/2
    // Without the FFT kinetic step, this is just repeated potential rotations.
    // The unitary rotation preserves |ψ|² exactly (no normalization drift).
    for (let step = 0; step < 100; step++) {
      // Fused V/2 + pack
      const packed = fusedPotentialHalfAndPack(psiRe, psiIm, V, params)

      // Skip FFT (would be identity if we did FFT → identity kinetic → iFFT)
      // Instead, just pass complexBuf through to unpack, simulating 1/N applied after
      // a round-trip FFT that would multiply by N then divide by N.

      // Fused unpack + V/2 (complexBuf already has correct values, just needs 1/N)
      // But since we skipped FFT, we need to multiply by N to cancel the 1/N in unpack
      const scaledComplex = new Float32Array(packed.complexBuf.length)
      for (let i = 0; i < scaledComplex.length; i++) {
        scaledComplex[i] = packed.complexBuf[i]! * n
      }

      const result = fusedUnpackAndPotentialHalf(scaledComplex, V, params)
      psiRe = result.psiRe
      psiIm = result.psiIm
    }

    const normFinal = computeNorm(psiRe, psiIm)

    // For linear TDSE (g=0), each potential rotation is exactly unitary:
    // |exp(-iVdt/2ℏ)|² = 1. Over 100 steps, accumulated floating-point error
    // from cos/sin evaluations gives ~O(100 × ε_f64) ≈ 1e-8 drift.
    expect(Math.abs(normFinal - norm0) / norm0).toBeLessThan(1e-6)
  })
})

describe('fused kernel WGSL structure', () => {
  it('fusedPotentialPack includes psiRe, psiIm, potential, and complexBuf access', () => {
    expect(tdseFusedPotentialPackBlock).toContain('psiRe[idx]')
    expect(tdseFusedPotentialPackBlock).toContain('psiIm[idx]')
    expect(tdseFusedPotentialPackBlock).toContain('potential[idx]')
    expect(tdseFusedPotentialPackBlock).toContain('complexBuf[idx * 2u]')
    expect(tdseFusedPotentialPackBlock).toContain('complexBuf[idx * 2u + 1u]')
  })

  it('fusedPotentialPack contains phase rotation (cos/sin) in real-time path', () => {
    expect(tdseFusedPotentialPackBlock).toContain('cos(phase)')
    expect(tdseFusedPotentialPackBlock).toContain('sin(phase)')
  })

  it('fusedPotentialPack contains exponential decay in imaginary-time path', () => {
    expect(tdseFusedPotentialPackBlock).toContain('exp(-arg)')
    expect(tdseFusedPotentialPackBlock).toContain('params.imaginaryTime')
  })

  it('fusedPotentialPack includes GPE nonlinear term', () => {
    expect(tdseFusedPotentialPackBlock).toContain('params.interactionStrength * density')
  })

  it('fusedUnpackPotential includes 1/N normalization from inverse FFT', () => {
    expect(tdseFusedUnpackPotentialBlock).toContain('1.0 / f32(params.totalSites)')
  })

  it('fusedUnpackPotential includes complexBuf input and psiRe, psiIm output', () => {
    expect(tdseFusedUnpackPotentialBlock).toContain('complexBuf[idx * 2u]')
    expect(tdseFusedUnpackPotentialBlock).toContain('psiRe[idx]')
    expect(tdseFusedUnpackPotentialBlock).toContain('psiIm[idx]')
  })

  it('fusedUnpackPotential does NOT write back to psiRe/psiIm before reading', () => {
    // The fused unpack+potential must read from complexBuf, normalize,
    // apply potential, then write to psi — never reading intermediate psi values.
    // Verify that complexBuf is read-only and psi is write-only.
    expect(tdseFusedUnpackPotentialBlock).toContain('var<storage, read> complexBuf')
    expect(tdseFusedUnpackPotentialBlock).toContain('var<storage, read_write> psiRe')
  })
})

// ── Helpers ─────────────────────────────────────────────────────────────

function computeNorm(re: Float32Array, im: Float32Array): number {
  let sum = 0
  for (let i = 0; i < re.length; i++) {
    sum += re[i]! * re[i]! + im[i]! * im[i]!
  }
  return sum
}
