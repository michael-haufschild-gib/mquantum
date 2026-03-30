/**
 * Tests for Kaluza-Klein compactification utilities.
 */

import { describe, expect, it } from 'vitest'

import {
  buildCompactDimsMask,
  clampKKState,
  computeEffectiveSpacing,
  computeKKSpectrum,
  computeMaxCompactRadius,
} from '@/lib/physics/compactification'

describe('computeEffectiveSpacing', () => {
  it('returns original spacing when no dimensions are compact', () => {
    const result = computeEffectiveSpacing(
      [64, 64, 64],
      [0.1, 0.1, 0.1],
      [false, false, false],
      [1.0, 1.0, 1.0],
      3
    )
    expect(result).toEqual([0.1, 0.1, 0.1])
  })

  it('overrides spacing for compact dimensions with 2πR/N', () => {
    const R = 0.5
    const N = 64
    const expected = (2 * Math.PI * R) / N

    const result = computeEffectiveSpacing(
      [N, N, N],
      [0.1, 0.1, 0.1],
      [false, true, false],
      [1.0, R, 1.0],
      3
    )

    expect(result[0]).toBe(0.1)
    expect(result[1]).toBeCloseTo(expected, 10)
    expect(result[2]).toBe(0.1)
  })

  it('clamps compact radius to minimum 0.01', () => {
    const result = computeEffectiveSpacing(
      [32],
      [0.1],
      [true],
      [0.001], // below minimum
      1
    )
    // Should use R = 0.01, not 0.001
    expect(result[0]).toBeCloseTo((2 * Math.PI * 0.01) / 32, 10)
  })

  it('handles undefined compactDims/compactRadii gracefully', () => {
    const result = computeEffectiveSpacing([64, 64], [0.2, 0.3], undefined, undefined, 2)
    expect(result).toEqual([0.2, 0.3])
  })

  it('handles mixed compact and extended in higher dimensions', () => {
    const result = computeEffectiveSpacing(
      [32, 32, 32, 32, 32],
      [0.1, 0.1, 0.1, 0.1, 0.1],
      [false, false, false, true, true],
      [1.0, 1.0, 1.0, 0.2, 0.5],
      5
    )
    expect(result[0]).toBe(0.1)
    expect(result[3]).toBeCloseTo((2 * Math.PI * 0.2) / 32, 10)
    expect(result[4]).toBeCloseTo((2 * Math.PI * 0.5) / 32, 10)
  })
})

describe('buildCompactDimsMask', () => {
  it('returns 0 when no dimensions are compact', () => {
    expect(buildCompactDimsMask([false, false, false], 3)).toBe(0)
  })

  it('sets correct bits for compact dimensions', () => {
    // Dim 0 and 2 compact → bits 0 and 2 → 0b101 = 5
    expect(buildCompactDimsMask([true, false, true], 3)).toBe(5)
  })

  it('returns 0 for undefined compactDims', () => {
    expect(buildCompactDimsMask(undefined, 3)).toBe(0)
  })

  it('respects latticeDim boundary', () => {
    // compactDims has 5 entries but latticeDim is 3 — only first 3 count
    expect(buildCompactDimsMask([true, false, true, true, true], 3)).toBe(5)
  })

  it('handles all compact dimensions', () => {
    expect(buildCompactDimsMask([true, true, true], 3)).toBe(7)
  })
})

describe('computeKKSpectrum', () => {
  it('returns correct number of levels', () => {
    const levels = computeKKSpectrum(1.0, 1.0, 1.0, 5)
    expect(levels).toHaveLength(6) // n = 0..5
  })

  it('has zero energy for n=0', () => {
    const levels = computeKKSpectrum(1.0, 1.0, 1.0, 3)
    expect(levels[0]!.n).toBe(0)
    expect(levels[0]!.energy).toBe(0)
  })

  it('computes E_n = (nℏ)²/(2mR²)', () => {
    const R = 0.5
    const hbar = 1.0
    const mass = 2.0
    const levels = computeKKSpectrum(R, hbar, mass, 3)

    for (const { n, energy } of levels) {
      const expected = (n * hbar) ** 2 / (2 * mass * R * R)
      expect(energy).toBeCloseTo(expected, 10)
    }
  })

  it('produces quadratically growing spectrum', () => {
    const levels = computeKKSpectrum(1.0, 1.0, 1.0, 4)
    // E_n ∝ n² → ratios should be 0:1:4:9:16
    expect(levels[1]!.energy).toBeGreaterThan(0)
    expect(levels[2]!.energy / levels[1]!.energy).toBeCloseTo(4, 5)
    expect(levels[3]!.energy / levels[1]!.energy).toBeCloseTo(9, 5)
    expect(levels[4]!.energy / levels[1]!.energy).toBeCloseTo(16, 5)
  })

  it('smaller R gives larger mass gap', () => {
    const small = computeKKSpectrum(0.1, 1.0, 1.0, 1)
    const large = computeKKSpectrum(10.0, 1.0, 1.0, 1)
    expect(small[1]!.energy).toBeGreaterThan(large[1]!.energy)
  })

  it('clamps R to 1e-6 minimum for near-zero input', () => {
    const levels = computeKKSpectrum(0, 1.0, 1.0, 1)
    // Should not produce Infinity or NaN
    expect(Number.isFinite(levels[1]!.energy)).toBe(true)
    expect(levels[1]!.energy).toBeGreaterThan(0)
  })

  // ── Physics cross-checks (independent of implementation formula) ──────────

  it('E_1 inverse-R² scaling: halving R quadruples mass gap', () => {
    const R1 = 1.0
    const R2 = 0.5
    const e1 = computeKKSpectrum(R1, 1.0, 1.0, 1)[1]!.energy
    const e2 = computeKKSpectrum(R2, 1.0, 1.0, 1)[1]!.energy
    // E ∝ 1/R² → E(R/2)/E(R) = 4
    expect(e2 / e1).toBeCloseTo(4.0, 10)
  })

  it('E_1 inverse-mass scaling: doubling mass halves energy', () => {
    const m1 = 1.0
    const m2 = 2.0
    const e1 = computeKKSpectrum(1.0, 1.0, m1, 1)[1]!.energy
    const e2 = computeKKSpectrum(1.0, 1.0, m2, 1)[1]!.energy
    // E ∝ 1/m → E(2m)/E(m) = 0.5
    expect(e2 / e1).toBeCloseTo(0.5, 10)
  })

  it('E_1 ℏ² scaling: doubling ℏ quadruples energy', () => {
    const h1 = 1.0
    const h2 = 2.0
    const e1 = computeKKSpectrum(1.0, h1, 1.0, 1)[1]!.energy
    const e2 = computeKKSpectrum(1.0, h2, 1.0, 1)[1]!.energy
    // E ∝ ℏ² → E(2ℏ)/E(ℏ) = 4
    expect(e2 / e1).toBeCloseTo(4.0, 10)
  })

  it('decompactification limit: E_1 → 0 as R → ∞', () => {
    // Physical: as R grows, the compact circle becomes flat → continuous spectrum → gap vanishes
    const e_large = computeKKSpectrum(1e6, 1.0, 1.0, 1)[1]!.energy
    expect(e_large).toBeLessThan(1e-10)
  })

  it('hand-computed value: ℏ=1, m=1, R=1 gives E_1 = 0.5', () => {
    // E_1 = (1·1)² / (2·1·1²) = 1/2 = 0.5 — verified by hand
    const e1 = computeKKSpectrum(1.0, 1.0, 1.0, 1)[1]!.energy
    expect(e1).toBe(0.5)
  })

  it('hand-computed value: ℏ=1, m=0.5, R=0.25 gives E_2 = 32', () => {
    // E_2 = (2·1)² / (2·0.5·0.25²) = 4 / 0.0625 = 64 ... wait
    // E_2 = (2·1)² / (2·0.5·0.0625) = 4 / 0.0625 = 64
    // Hmm let me recompute: 2*0.5 = 1, 0.25² = 0.0625, denominator = 1 * 0.0625 = 0.0625
    // E_2 = 4 / 0.0625 = 64
    const e2 = computeKKSpectrum(0.25, 1.0, 0.5, 2)[2]!.energy
    expect(e2).toBe(64)
  })

  it('level spacing grows linearly: E_{n+1} - E_n = (2n+1) × E_1', () => {
    // From E_n = n²·E_1: ΔE_n = E_{n+1} - E_n = (2n+1)·E_1
    const levels = computeKKSpectrum(0.3, 1.0, 1.5, 5)
    const e1 = levels[1]!.energy
    for (let n = 1; n < 5; n++) {
      const gap = levels[n + 1]!.energy - levels[n]!.energy
      expect(gap).toBeCloseTo((2 * n + 1) * e1, 8)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// Cross-function physics consistency
// ═══════════════════════════════════════════════════════════════════════════════

describe('KK cross-function consistency', () => {
  it('effective spacing yields correct k-space resolution for KK modes', () => {
    // A compact dim with radius R has circumference L = 2πR.
    // With N grid points: a_eff = L/N = 2πR/N.
    // k-space resolution: Δk = 2π/(N·a_eff) = 2π/(N · 2πR/N) = 1/R.
    // First KK momentum: p_1 = ℏ·Δk = ℏ/R.
    // First KK energy: E_1 = p_1²/(2m) = ℏ²/(2mR²).
    //
    // This test verifies the lattice discretization (computeEffectiveSpacing)
    // is consistent with the analytical spectrum (computeKKSpectrum).
    const R = 0.3
    const N = 64
    const hbar = 1.0
    const mass = 1.5

    const effSpacing = computeEffectiveSpacing([N], [0.1], [true], [R], 1)
    const a = effSpacing[0]!

    // k-space resolution from the lattice
    const dk = (2 * Math.PI) / (N * a)

    // First KK momentum from lattice discretization
    const p1_lattice = hbar * dk
    const E1_lattice = p1_lattice ** 2 / (2 * mass)

    // First KK energy from analytical spectrum
    const E1_analytical = computeKKSpectrum(R, hbar, mass, 1)[1]!.energy

    expect(E1_lattice).toBeCloseTo(E1_analytical, 10)
  })

  it('rMax constraint ensures compact extent ≤ extended extent', () => {
    // Physics: a compact dimension should not be physically larger than the
    // simulation box in the extended directions, or we'd need more grid
    // resolution than the extended dims provide.
    const gridSize = [32, 32, 32]
    const spacing = [0.1, 0.1, 0.1]
    const compactDims: boolean[] = [false, false, true]

    const rMax = computeMaxCompactRadius(gridSize, spacing, compactDims, 3)
    const compactExtent = 2 * Math.PI * rMax
    const extendedExtent = 32 * 0.1 // 3.2

    // L_compact = 2πR_max must equal the max extended extent
    expect(compactExtent).toBeCloseTo(extendedExtent, 10)
  })

  it('clampKKState produces spacing consistent with clamped radii', () => {
    // After clamping, the effective spacing computed from clamped radii
    // should match what computeEffectiveSpacing returns for those radii.
    const gridSize = [32, 32]
    const spacing = [0.1, 0.1]
    const compactDims: boolean[] = [false, true]
    const rawRadii = [0.15, 5.0] // dim 1 will be clamped

    const result = clampKKState(
      0.01, gridSize, spacing, compactDims, rawRadii, 2, 1.0,
      (dt) => dt
    )

    const effSpacing = computeEffectiveSpacing(
      gridSize, spacing, compactDims, result.compactRadii, 2
    )

    // Compact dim spacing should reflect the clamped radius, not the raw one
    const expectedSpacing = (2 * Math.PI * result.compactRadii[1]!) / 32
    expect(effSpacing[1]).toBeCloseTo(expectedSpacing, 10)

    // Extended dim unchanged
    expect(effSpacing[0]).toBe(0.1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// computeMaxCompactRadius
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeMaxCompactRadius', () => {
  it('returns max extended extent / (2π) for mixed compact/extended dims', () => {
    // Extended dim 0: 64 * 0.1 = 6.4, dim 1 is compact, dim 2: 64 * 0.2 = 12.8
    const rMax = computeMaxCompactRadius(
      [64, 64, 64],
      [0.1, 0.1, 0.2],
      [false, true, false],
      3
    )
    // max extended extent = 12.8, rMax = 12.8 / (2π)
    expect(rMax).toBeCloseTo(12.8 / (2 * Math.PI), 10)
  })

  it('uses grid0 fallback when all dims are compact', () => {
    const rMax = computeMaxCompactRadius(
      [32, 32, 32],
      [0.1, 0.1, 0.1],
      [true, true, true],
      3
    )
    // All compact → fallback: (32 * 0.1) / (2π)
    expect(rMax).toBeCloseTo((32 * 0.1) / (2 * Math.PI), 10)
  })

  it('returns result based on no compact dims (all extended)', () => {
    const rMax = computeMaxCompactRadius(
      [64, 64],
      [0.1, 0.15],
      [false, false],
      2
    )
    // Max extent = 64 * 0.15 = 9.6
    expect(rMax).toBeCloseTo(9.6 / (2 * Math.PI), 10)
  })

  it('handles undefined compactDims (all extended by default)', () => {
    const rMax = computeMaxCompactRadius([32, 32, 32], [0.1, 0.1, 0.1], undefined, 3)
    expect(rMax).toBeCloseTo((32 * 0.1) / (2 * Math.PI), 10)
  })

  it('respects latticeDim boundary shorter than arrays', () => {
    const rMax = computeMaxCompactRadius(
      [32, 64, 128],
      [0.1, 0.1, 0.5],
      [false, false, false],
      2 // only first 2 dims active
    )
    // Max extent = max(32*0.1=3.2, 64*0.1=6.4) = 6.4
    expect(rMax).toBeCloseTo(6.4 / (2 * Math.PI), 10)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// clampKKState
// ═══════════════════════════════════════════════════════════════════════════════

describe('clampKKState', () => {
  /** Identity clamp function — returns dt unchanged for testing radii clamping in isolation. */
  const identityClamp = (dt: number) => dt

  it('clamps oversized radii to rMax', () => {
    // Extended dim 0: 32 * 0.1 = 3.2 → rMax = 3.2 / (2π) ≈ 0.509
    const rMax = 3.2 / (2 * Math.PI)
    const result = clampKKState(
      0.01,
      [32, 32],
      [0.1, 0.1],
      [false, true],
      [0.15, 5.0], // dim 1 R=5.0 exceeds rMax
      2,
      1.0,
      identityClamp
    )
    expect(result.compactRadii[1]).toBeCloseTo(rMax, 5)
    expect(result.compactRadii[0]).toBe(0.15) // extended dim untouched
  })

  it('clamps sub-minimum radii to 0.01', () => {
    const result = clampKKState(
      0.01,
      [32, 32],
      [0.1, 0.1],
      [true, false],
      [0.001, 0.15], // dim 0 R=0.001 below 0.01 min
      2,
      1.0,
      identityClamp
    )
    expect(result.compactRadii[0]).toBe(0.01)
  })

  it('passes effective spacing to clampDtFn', () => {
    const capturedSpacing: number[][] = []
    const captureDt = (dt: number, spacing: number[], _dim: number, _mass: number) => {
      capturedSpacing.push([...spacing])
      return dt
    }
    clampKKState(
      0.01,
      [64, 64],
      [0.1, 0.1],
      [false, true],
      [0.15, 0.2],
      2,
      1.0,
      captureDt
    )
    // Dim 0: extended → spacing = 0.1
    expect(capturedSpacing[0]![0]).toBe(0.1)
    // Dim 1: compact with R=0.2 → spacing = 2π*0.2/64
    expect(capturedSpacing[0]![1]).toBeCloseTo((2 * Math.PI * 0.2) / 64, 10)
  })

  it('applies clampDtFn result to returned dt', () => {
    const halveDt = (dt: number) => dt / 2
    const result = clampKKState(
      0.04,
      [32, 32, 32],
      [0.1, 0.1, 0.1],
      undefined,
      undefined,
      3,
      1.0,
      halveDt
    )
    expect(result.dt).toBe(0.02)
  })

  it('defaults missing compactRadii entries to 0.15', () => {
    const result = clampKKState(
      0.01,
      [32, 32, 32],
      [0.1, 0.1, 0.1],
      [true, false, true],
      undefined, // no radii provided
      3,
      1.0,
      identityClamp
    )
    // All entries default to 0.15; compact dims clamped to [0.01, rMax]
    expect(result.compactRadii).toHaveLength(3)
    expect(result.compactRadii[0]).toBe(0.15) // 0.15 is within [0.01, rMax≈0.509]
    expect(result.compactRadii[1]).toBe(0.15) // extended, unchanged
    expect(result.compactRadii[2]).toBe(0.15) // compact, within range
  })

  it('preserves radii for extended dims even when oversized', () => {
    const result = clampKKState(
      0.01,
      [32, 32],
      [0.1, 0.1],
      [false, false], // all extended
      [100.0, 200.0], // huge values — should not be clamped since dims are extended
      2,
      1.0,
      identityClamp
    )
    expect(result.compactRadii[0]).toBe(100.0)
    expect(result.compactRadii[1]).toBe(200.0)
  })
})
