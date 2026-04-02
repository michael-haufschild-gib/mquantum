import { describe, expect, it } from 'vitest'

import {
  computeHydrogenRadialNormND,
  computeHypersphericalLayerNorm,
} from '@/rendering/webgpu/renderers/uniformPackingHydrogenMath'

describe('computeHydrogenRadialNormND', () => {
  it('produces positive norm for ground state (n=1, l=0)', () => {
    // nr = n - l - 1 = 0, lambda = l = 0, nEff = 1, a0 = 1
    const norm = computeHydrogenRadialNormND(0, 0, 1, 1)
    expect(norm).toBeGreaterThan(0)
    expect(Number.isFinite(norm)).toBe(true)
  })

  it('produces positive norm for 2p state (n=2, l=1)', () => {
    // nr = 2 - 1 - 1 = 0, lambda = 1, nEff = 2, a0 = 1
    const norm = computeHydrogenRadialNormND(0, 1, 2, 1)
    expect(norm).toBeGreaterThan(0)
    expect(Number.isFinite(norm)).toBe(true)
  })

  it('produces positive norm for 3d state (n=3, l=2)', () => {
    // nr = 0, lambda = 2, nEff = 3, a0 = 1
    const norm = computeHydrogenRadialNormND(0, 2, 3, 1)
    expect(norm).toBeGreaterThan(0)
  })

  it('norm changes with Bohr radius', () => {
    const norm1 = computeHydrogenRadialNormND(0, 0, 1, 1.0)
    const norm2 = computeHydrogenRadialNormND(0, 0, 1, 2.0)
    expect(norm1).not.toBeCloseTo(norm2, 3)
  })

  it('norm changes with nEff (dimension-dependent)', () => {
    // 3D: nEff = n = 2, 5D: nEff = n + (5-3)/2 = 3
    const norm3d = computeHydrogenRadialNormND(0, 0, 2, 1)
    const norm5d = computeHydrogenRadialNormND(0, 0, 3, 1)
    expect(norm3d).not.toBeCloseTo(norm5d, 3)
  })
})

describe('computeHypersphericalLayerNorm', () => {
  it('produces positive norm for valid quantum numbers', () => {
    // l0=1, l1=0, D=4, k=0
    const norm = computeHypersphericalLayerNorm(1, 0, 4, 0)
    expect(norm).toBeGreaterThan(0)
    expect(Number.isFinite(norm)).toBe(true)
  })

  it('returns small value for negative nk (l < l_next)', () => {
    // nk = lk - lkp1 = 0 - 1 = -1 → should return exp(-20)
    const norm = computeHypersphericalLayerNorm(0, 1, 4, 0)
    expect(norm).toBeCloseTo(Math.exp(-20), 12)
  })

  it('produces finite results for range of D values (3-8)', () => {
    for (let D = 3; D <= 8; D++) {
      const norm = computeHypersphericalLayerNorm(2, 1, D, 0)
      expect(Number.isFinite(norm)).toBe(true)
      expect(norm).toBeGreaterThan(0)
    }
  })

  it('norm varies with layer index k', () => {
    const norm0 = computeHypersphericalLayerNorm(2, 1, 5, 0)
    const norm1 = computeHypersphericalLayerNorm(2, 1, 5, 1)
    // Different k produces different D-k-1 factors
    expect(norm0).not.toBeCloseTo(norm1, 3)
  })

  it('norm for nk=0 (l=l_next) gives correct degenerate case', () => {
    // nk = 0 → the Gegenbauer polynomial is just 1
    // lk = lkp1 = 2, D = 5, k = 0
    const norm = computeHypersphericalLayerNorm(2, 2, 5, 0)
    expect(Number.isFinite(norm)).toBe(true)
    expect(norm).toBeGreaterThan(0)
  })
})
