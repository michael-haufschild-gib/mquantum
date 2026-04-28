/**
 * Tests for free-scalar lattice correlator construction (Peschel probe input).
 *
 * `buildLatticeCorrelators1D` and the more general
 * `buildLatticeSliceCorrelators` produce the symmetric, positive-definite
 * matrices `X = ⟨φφ⟩` and `P = ⟨ππ⟩` whose joint symplectic decomposition
 * feeds the von Neumann entropy. Subtle bugs in either:
 *   - the IR cutoff branch (which crushes c_eff ≈ 1 down to 0.46 if leaked
 *     from the broader vacuum sampler — see ENTROPY_IR_FLOOR comment),
 *   - the periodic Toeplitz fill (cosine is even, so j-i and i-j must alias),
 *   - the transverse-mode marginalization (slice correlators are NOT
 *     pure-1D correlators in latticeDim ≥ 2),
 * silently corrupt every downstream entropy computation.
 */

import { describe, expect, it } from 'vitest'

import {
  buildLatticeCorrelators1D,
  buildLatticeSliceCorrelators,
  ENTROPY_IR_FLOOR,
} from '@/lib/physics/entanglement/peschelCorrelators'

function symmetric(matrix: Float64Array, n: number, tol = 1e-12): boolean {
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(matrix[i * n + j]! - matrix[j * n + i]!) > tol) return false
    }
  }
  return true
}

function isToeplitz(matrix: Float64Array, n: number, tol = 1e-12): boolean {
  // M_ij depends only on (i - j) mod n. Sample one value per shift.
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const r = (((i - j) % n) + n) % n
      const ref = matrix[r]! // M[r, 0] = profile[r]
      if (Math.abs(matrix[i * n + j]! - ref) > tol) return false
    }
  }
  return true
}

function diagonalEntries(matrix: Float64Array, n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(matrix[i * n + i]!)
  return out
}

describe('ENTROPY_IR_FLOOR', () => {
  it('is the small probe-specific 1e-6 IR cutoff (NOT the larger Klein-Gordon M_FLOOR)', () => {
    // Regression guard: the comment block in the source explicitly warns
    // that using vacuumSpectrum's M_FLOOR here crushes c_eff to ~0.46.
    expect(ENTROPY_IR_FLOOR).toBe(1e-6)
  })
})

describe('buildLatticeCorrelators1D', () => {
  it('produces matrices of the correct shape and symmetry', () => {
    const { X, P } = buildLatticeCorrelators1D({ gridSize: 32, spacing: 1, massSq: 0 })
    expect(X.length).toBe(32 * 32)
    expect(P.length).toBe(32 * 32)
    expect(symmetric(X, 32)).toBe(true)
    expect(symmetric(P, 32)).toBe(true)
  })

  it('produces Toeplitz (translation-invariant) matrices on the periodic lattice', () => {
    const { X, P } = buildLatticeCorrelators1D({ gridSize: 16, spacing: 1, massSq: 0.1 })
    expect(isToeplitz(X, 16)).toBe(true)
    expect(isToeplitz(P, 16)).toBe(true)
  })

  it('all diagonal entries are equal (X_ii = X_00 by translation invariance)', () => {
    const { X, P } = buildLatticeCorrelators1D({ gridSize: 24, spacing: 1, massSq: 0 })
    const xDiag = diagonalEntries(X, 24)
    const pDiag = diagonalEntries(P, 24)
    for (let i = 1; i < 24; i++) {
      expect(xDiag[i]).toBeCloseTo(xDiag[0]!, 12)
      expect(pDiag[i]).toBeCloseTo(pDiag[0]!, 12)
    }
  })

  it('diagonal entries are strictly positive (variance ⟨φ²⟩, ⟨π²⟩ > 0)', () => {
    const { X, P } = buildLatticeCorrelators1D({ gridSize: 32, spacing: 1, massSq: 0.5 })
    expect(X[0]!).toBeGreaterThan(0)
    expect(P[0]!).toBeGreaterThan(0)
  })

  it('canonical commutation hint: ⟨φπ⟩ correlator product satisfies X·P ≥ ¼ (Heisenberg) — diagonal element check', () => {
    // Strict ⟨XP⟩ ≥ ¼ is the symplectic eigenvalue floor; the diagonal
    // product is a necessary but not sufficient witness.
    const { X, P } = buildLatticeCorrelators1D({ gridSize: 32, spacing: 1, massSq: 0.1 })
    expect(X[0]! * P[0]!).toBeGreaterThanOrEqual(0.25 - 1e-9)
  })

  it('massive theory has shorter correlation length than massless (X_off-diagonal decays faster)', () => {
    const { X: xMassless } = buildLatticeCorrelators1D({ gridSize: 64, spacing: 1, massSq: 0 })
    const { X: xMassive } = buildLatticeCorrelators1D({ gridSize: 64, spacing: 1, massSq: 1.0 })
    // Compare ⟨φ_0 φ_16⟩ at a fixed mid-range distance.
    const r = 16
    expect(Math.abs(xMassive[r]!)).toBeLessThan(Math.abs(xMassless[r]!))
  })

  it('throws on invalid gridSize, spacing, or massSq', () => {
    expect(() => buildLatticeCorrelators1D({ gridSize: 0, spacing: 1, massSq: 0 })).toThrow(
      /gridSize/
    )
    expect(() => buildLatticeCorrelators1D({ gridSize: 1.5, spacing: 1, massSq: 0 })).toThrow(
      /gridSize/
    )
    expect(() => buildLatticeCorrelators1D({ gridSize: -8, spacing: 1, massSq: 0 })).toThrow(
      /gridSize/
    )
    expect(() => buildLatticeCorrelators1D({ gridSize: 32, spacing: 0, massSq: 0 })).toThrow(
      /spacing/
    )
    expect(() => buildLatticeCorrelators1D({ gridSize: 32, spacing: -1, massSq: 0 })).toThrow(
      /spacing/
    )
    expect(() => buildLatticeCorrelators1D({ gridSize: 32, spacing: NaN, massSq: 0 })).toThrow(
      /spacing/
    )
    expect(() => buildLatticeCorrelators1D({ gridSize: 32, spacing: 1, massSq: NaN })).toThrow(
      /massSq/
    )
  })

  it('handles N = 1 (degenerate single-site lattice)', () => {
    const { X, P } = buildLatticeCorrelators1D({ gridSize: 1, spacing: 1, massSq: 1 })
    expect(X.length).toBe(1)
    expect(P.length).toBe(1)
    expect(X[0]!).toBeGreaterThan(0)
    expect(P[0]!).toBeGreaterThan(0)
  })
})

describe('buildLatticeSliceCorrelators (N-D)', () => {
  it('latticeDim=1 case is numerically equivalent to buildLatticeCorrelators1D', () => {
    const cfg1d = { gridSize: 32, spacing: 1, massSq: 0.5 }
    const oneD = buildLatticeCorrelators1D(cfg1d)
    const slice = buildLatticeSliceCorrelators({
      gridSize: [32],
      spacing: [1],
      latticeDim: 1,
      massSq: 0.5,
    })
    for (let i = 0; i < oneD.X.length; i++) {
      expect(slice.X[i]!).toBeCloseTo(oneD.X[i]!, 12)
      expect(slice.P[i]!).toBeCloseTo(oneD.P[i]!, 12)
    }
  })

  it('produces symmetric Toeplitz matrices for a 2D slice', () => {
    const { X, P } = buildLatticeSliceCorrelators({
      gridSize: [16, 8],
      spacing: [1, 1],
      latticeDim: 2,
      massSq: 0,
    })
    expect(X.length).toBe(16 * 16)
    expect(symmetric(X, 16)).toBe(true)
    expect(symmetric(P, 16)).toBe(true)
    expect(isToeplitz(X, 16)).toBe(true)
    expect(isToeplitz(P, 16)).toBe(true)
  })

  it('transverse fluctuations shorten the on-slice correlation length (slice ≠ pure-1D)', () => {
    // Same axis-0 geometry, different latticeDim → different correlators.
    const oneD = buildLatticeSliceCorrelators({
      gridSize: [64, 32, 32],
      spacing: [1, 1, 1],
      latticeDim: 1,
      massSq: 0,
    })
    const threeD = buildLatticeSliceCorrelators({
      gridSize: [64, 32, 32],
      spacing: [1, 1, 1],
      latticeDim: 3,
      massSq: 0,
    })
    // 1D pure log-correlation vs 3D power-law decay → off-diagonal differs.
    const r = 16
    expect(oneD.X[r]).not.toBe(threeD.X[r])
  })

  it('throws on inconsistent gridSize/spacing length vs latticeDim', () => {
    expect(() =>
      buildLatticeSliceCorrelators({
        gridSize: [16],
        spacing: [1, 1],
        latticeDim: 2,
        massSq: 0,
      })
    ).toThrow(/gridSize/)
    expect(() =>
      buildLatticeSliceCorrelators({
        gridSize: [16, 8],
        spacing: [1],
        latticeDim: 2,
        massSq: 0,
      })
    ).toThrow(/spacing/)
  })

  it('throws on invalid latticeDim', () => {
    expect(() =>
      buildLatticeSliceCorrelators({
        gridSize: [16],
        spacing: [1],
        latticeDim: 0,
        massSq: 0,
      })
    ).toThrow(/latticeDim/)
    expect(() =>
      buildLatticeSliceCorrelators({
        gridSize: [16],
        spacing: [1],
        latticeDim: 1.5,
        massSq: 0,
      })
    ).toThrow(/latticeDim/)
  })

  it('throws on non-finite massSq', () => {
    expect(() =>
      buildLatticeSliceCorrelators({
        gridSize: [8],
        spacing: [1],
        latticeDim: 1,
        massSq: NaN,
      })
    ).toThrow(/massSq/)
  })

  it('throws on non-positive grid sizes or spacings inside the active dims', () => {
    expect(() =>
      buildLatticeSliceCorrelators({
        gridSize: [16, 0],
        spacing: [1, 1],
        latticeDim: 2,
        massSq: 0,
      })
    ).toThrow(/gridSize\[1\]/)
    expect(() =>
      buildLatticeSliceCorrelators({
        gridSize: [16, 8],
        spacing: [1, -1],
        latticeDim: 2,
        massSq: 0,
      })
    ).toThrow(/spacing\[1\]/)
  })

  it('regression: massless on a small lattice does not produce divergent X (IR floor active)', () => {
    // With ENTROPY_IR_FLOOR active, k=0 mode has ω_0 ≥ 1e-6 → ⟨φ²⟩ finite.
    const { X } = buildLatticeSliceCorrelators({
      gridSize: [16],
      spacing: [1],
      latticeDim: 1,
      massSq: 0,
    })
    for (let i = 0; i < X.length; i++) {
      expect(Number.isFinite(X[i]!)).toBe(true)
    }
  })

  it('massSq < 0 is treated as zero (no tachyonic propagation through the floor)', () => {
    const negMass = buildLatticeSliceCorrelators({
      gridSize: [16],
      spacing: [1],
      latticeDim: 1,
      massSq: -1,
    })
    const zeroMass = buildLatticeSliceCorrelators({
      gridSize: [16],
      spacing: [1],
      latticeDim: 1,
      massSq: 0,
    })
    for (let i = 0; i < negMass.X.length; i++) {
      expect(negMass.X[i]!).toBeCloseTo(zeroMass.X[i]!, 12)
    }
  })

  it('does not mutate input arrays', () => {
    const grid = [32, 16, 16]
    const space = [1.0, 1.0, 1.0]
    const gridSnap = [...grid]
    const spaceSnap = [...space]
    buildLatticeSliceCorrelators({
      gridSize: grid,
      spacing: space,
      latticeDim: 3,
      massSq: 0,
    })
    expect(grid).toEqual(gridSnap)
    expect(space).toEqual(spaceSnap)
  })
})
