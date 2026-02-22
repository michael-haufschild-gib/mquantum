/**
 * Tests for E1 electric dipole selection rules: allowed/forbidden transitions
 * and dipole component computation.
 */
import { describe, expect, it } from 'vitest'
import { isAllowedE1, dipoleComponent } from '@/lib/physics/openQuantum/selectionRules'
import type { HydrogenBasisState } from '@/lib/physics/openQuantum/hydrogenBasis'

// ---------------------------------------------------------------------------
// Helper: construct a minimal basis state for selection rule tests
// ---------------------------------------------------------------------------

function state(
  n: number,
  l: number,
  m: number,
  extraDimN: number[] = [],
): HydrogenBasisState {
  return { index: 0, n, l, m, extraDimN, energy: 0 }
}

// ---------------------------------------------------------------------------
// isAllowedE1 — allowed transitions
// ---------------------------------------------------------------------------

describe('isAllowedE1', () => {
  describe('allowed transitions', () => {
    it('1s → 2p₀ is allowed (Δl=+1, Δm=0)', () => {
      expect(isAllowedE1(state(1, 0, 0), state(2, 1, 0))).toBe(true)
    })

    it('1s → 2p₊₁ is allowed (Δl=+1, Δm=+1)', () => {
      expect(isAllowedE1(state(1, 0, 0), state(2, 1, 1))).toBe(true)
    })

    it('1s → 2p₋₁ is allowed (Δl=+1, Δm=-1)', () => {
      expect(isAllowedE1(state(1, 0, 0), state(2, 1, -1))).toBe(true)
    })

    it('2p₀ → 3d₀ is allowed (Δl=+1, Δm=0)', () => {
      expect(isAllowedE1(state(2, 1, 0), state(3, 2, 0))).toBe(true)
    })

    it('2p₀ → 3s is allowed (Δl=-1, Δm=0)', () => {
      expect(isAllowedE1(state(2, 1, 0), state(3, 0, 0))).toBe(true)
    })

    it('2p₀ → 1s is allowed (reverse direction, Δl=-1, Δm=0)', () => {
      expect(isAllowedE1(state(2, 1, 0), state(1, 0, 0))).toBe(true)
    })

    it('2p₊₁ → 3d₊₂ is allowed (Δl=+1, Δm=+1)', () => {
      expect(isAllowedE1(state(2, 1, 1), state(3, 2, 2))).toBe(true)
    })

    it('3d₋₁ → 2p₀ is allowed (Δl=-1, Δm=+1)', () => {
      expect(isAllowedE1(state(3, 2, -1), state(2, 1, 0))).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // Forbidden: Δl ≠ ±1
  // -------------------------------------------------------------------------

  describe('forbidden: Δl ≠ ±1', () => {
    it('1s → 2s is forbidden (Δl=0)', () => {
      expect(isAllowedE1(state(1, 0, 0), state(2, 0, 0))).toBe(false)
    })

    it('2p₀ → 3p₀ is forbidden (Δl=0)', () => {
      expect(isAllowedE1(state(2, 1, 0), state(3, 1, 0))).toBe(false)
    })

    it('1s → 3d₀ is forbidden (|Δl|=2)', () => {
      expect(isAllowedE1(state(1, 0, 0), state(3, 2, 0))).toBe(false)
    })

    it('3d₀ → 3d₀ is forbidden (same state, Δl=0)', () => {
      expect(isAllowedE1(state(3, 2, 0), state(3, 2, 0))).toBe(false)
    })

    it('2s → 3s is forbidden (Δl=0)', () => {
      expect(isAllowedE1(state(2, 0, 0), state(3, 0, 0))).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // Forbidden: |Δm| > 1
  // -------------------------------------------------------------------------

  describe('forbidden: |Δm| > 1', () => {
    it('2p₋₁ → 3d₊₁ is forbidden (Δm=+2)', () => {
      expect(isAllowedE1(state(2, 1, -1), state(3, 2, 1))).toBe(false)
    })

    it('3d₊₂ → 2p₋₁ is forbidden (|Δm|=3)', () => {
      expect(isAllowedE1(state(3, 2, 2), state(2, 1, -1))).toBe(false)
    })

    it('2p₊₁ → 3d₋₁ is forbidden (Δm=-2)', () => {
      expect(isAllowedE1(state(2, 1, 1), state(3, 2, -1))).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // Extra dimension constraint
  // -------------------------------------------------------------------------

  describe('extra dimension constraint', () => {
    it('states with identical extraDimN and valid Δl/Δm are allowed', () => {
      expect(
        isAllowedE1(state(1, 0, 0, [0, 0]), state(2, 1, 0, [0, 0])),
      ).toBe(true)
    })

    it('states differing in first extra dim are forbidden', () => {
      expect(
        isAllowedE1(state(1, 0, 0, [0, 0]), state(2, 1, 0, [1, 0])),
      ).toBe(false)
    })

    it('states differing in second extra dim are forbidden', () => {
      expect(
        isAllowedE1(state(1, 0, 0, [0, 0]), state(2, 1, 0, [0, 1])),
      ).toBe(false)
    })

    it('states differing in all extra dims are forbidden', () => {
      expect(
        isAllowedE1(state(1, 0, 0, [0, 0]), state(2, 1, 0, [1, 1])),
      ).toBe(false)
    })

    it('3D states (empty extraDimN) bypass extra-dim check', () => {
      // Both have empty arrays — no extra dims to compare
      expect(
        isAllowedE1(state(1, 0, 0, []), state(2, 1, 0, [])),
      ).toBe(true)
    })
  })
})

// ---------------------------------------------------------------------------
// dipoleComponent
// ---------------------------------------------------------------------------

describe('dipoleComponent', () => {
  it('returns 0 for Δm=0 (π transition)', () => {
    expect(dipoleComponent(0, 0)).toBe(0)
  })

  it('returns +1 for Δm=+1 (σ⁺ transition)', () => {
    expect(dipoleComponent(0, 1)).toBe(1)
  })

  it('returns -1 for Δm=-1 (σ⁻ transition)', () => {
    expect(dipoleComponent(0, -1)).toBe(-1)
  })

  it('returns +1 for m=-1 → m=0', () => {
    expect(dipoleComponent(-1, 0)).toBe(1)
  })

  it('returns -1 for m=1 → m=0', () => {
    expect(dipoleComponent(1, 0)).toBe(-1)
  })

  it('returns null for |Δm|=2 (forbidden)', () => {
    expect(dipoleComponent(0, 2)).toBeNull()
  })

  it('returns null for |Δm|=3 (forbidden)', () => {
    expect(dipoleComponent(-1, 2)).toBeNull()
  })

  it('returns null for large negative Δm', () => {
    expect(dipoleComponent(2, -1)).toBeNull()
  })
})
