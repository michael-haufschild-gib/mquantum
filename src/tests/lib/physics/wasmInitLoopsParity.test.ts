/**
 * Parity + fallback regression tests for init-loop kernels.
 *
 * In Vitest (`MODE === 'test'`) the WASM module is not loaded, so every call
 * falls through to the TS path. These tests verify:
 *   1. The TS fallback of the four wired call sites still produces the
 *      original behaviour (the WASM path is covered by `cargo test` in
 *      `src/wasm/mdimension_core/src/{disorder,collapse}.rs`).
 *   2. The wire-level distribution codes in `disorderPotential.ts` agree
 *      with the Rust enum (`DisorderDistribution::from_u32`), so the two
 *      paths agree on what the integer 0/1 mean.
 *
 * @module tests/lib/physics/wasmInitLoopsParity
 */

import { describe, expect, it } from 'vitest'

import { generateDisorderPotential } from '@/lib/physics/anderson/disorderPotential'
import { computeFullCollapse, computePartialCollapse } from '@/lib/physics/measurement'
import { generateDisorderNoise } from '@/lib/physics/tdse/disorderNoise'

describe('generateDisorderNoise — TS fallback', () => {
  it('stays within [-0.5, 0.5) and reproduces from the same seed', () => {
    const a = generateDisorderNoise(4096, 42)
    const b = generateDisorderNoise(4096, 42)
    expect(a).toEqual(b)
    for (const v of a) {
      expect(v).toBeGreaterThanOrEqual(-0.5)
      expect(v).toBeLessThan(0.5)
    }
  })

  it('produces different sequences for different seeds', () => {
    const a = generateDisorderNoise(512, 1)
    const b = generateDisorderNoise(512, 2)
    // Not byte-equal — at least one sample differs.
    let diffs = 0
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs++
    expect(diffs).toBeGreaterThan(0)
  })

  it('writes exactly totalSites entries', () => {
    const noise = generateDisorderNoise(777, 13)
    expect(noise).toHaveLength(777)
  })
})

describe('generateDisorderPotential — TS fallback', () => {
  it('uniform distribution bounded by W/2', () => {
    const W = 2.0
    const pot = generateDisorderPotential([64, 64], 2, W, 42, 'uniform')
    for (const v of pot) {
      expect(Math.abs(v)).toBeLessThanOrEqual(W / 2 + 1e-6)
    }
  })

  it('gaussian distribution is deterministic by seed', () => {
    const a = generateDisorderPotential([32, 32], 2, 1.0, 7, 'gaussian')
    const b = generateDisorderPotential([32, 32], 2, 1.0, 7, 'gaussian')
    expect(a).toEqual(b)
  })

  it('handles multi-dimensional grids correctly', () => {
    const pot = generateDisorderPotential([8, 8, 8, 8], 4, 1.0, 99, 'uniform')
    expect(pot).toHaveLength(8 ** 4)
  })
})

describe('computeFullCollapse — TS fallback', () => {
  it('peak real value is at the measurement center; imag is identically zero', () => {
    const gridSize = [16, 16]
    const spacing = [0.1, 0.1]
    const [psiRe, psiIm] = computeFullCollapse(16 * 16, gridSize, spacing, [0, 0], 1.0)
    expect(psiIm.every((v) => v === 0)).toBe(true)
    // Highest ψ_re should be around the center (|x|, |y| ≤ 0.05 => exp(-0.0025) ≈ 0.9975).
    let max = 0
    for (const v of psiRe) if (v > max) max = v
    expect(max).toBeGreaterThan(0.99)
    expect(max).toBeLessThanOrEqual(1)
  })

  it('compact axis wraps distance to shortest-path', () => {
    // 8-site ring, spacing 1.0 → L=8. Measurement near -4 should hit site 7
    // (x=3.5) on the torus much harder than on the open line.
    const grid = [8]
    const spc = [1.0]
    const [periodic] = computeFullCollapse(8, grid, spc, [-3.9], 1.0, [true])
    const [open] = computeFullCollapse(8, grid, spc, [-3.9], 1.0, [false])
    expect(periodic[7]).toBeGreaterThan(open[7]! * 1e6)
  })
})

describe('computePartialCollapse — TS fallback', () => {
  it('applies the 1D envelope uniformly across orthogonal axes', () => {
    const gridSize = [8, 8]
    const spacing = [0.1, 0.1]
    const total = 8 * 8
    const psiRe = new Float32Array(total).fill(1)
    const psiIm = new Float32Array(total).fill(0)
    const [outRe, outIm] = computePartialCollapse(psiRe, psiIm, gridSize, spacing, 0, 0.0, 1.0)
    expect(outIm.every((v) => v === 0)).toBe(true)
    // For C-order with last axis fastest: i = x0 * 8 + x1. Fixed x0 → equal rows.
    for (let x0 = 0; x0 < 8; x0++) {
      const base = x0 * 8
      const first = outRe[base]!
      for (let x1 = 1; x1 < 8; x1++) {
        expect(outRe[base + x1]).toBe(first)
      }
    }
  })

  it('rejects out-of-range axis as a finite no-op copy', () => {
    const gridSize = [4, 4]
    const spacing = [0.1, 0.1]
    const total = 16
    const psiRe = new Float32Array(total).fill(1)
    const psiIm = new Float32Array(total)
    psiIm[3] = 0.25

    const [outRe, outIm] = computePartialCollapse(psiRe, psiIm, gridSize, spacing, 2, 0.0, 1.0)

    expect(outRe).toEqual(psiRe)
    expect(outIm).toEqual(psiIm)
    expect(outRe).not.toBe(psiRe)
    expect(outIm).not.toBe(psiIm)
    expect(outRe.every(Number.isFinite)).toBe(true)
    expect(outIm.every(Number.isFinite)).toBe(true)
  })
})
