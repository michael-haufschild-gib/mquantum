/**
 * Tests for hydrogen basis construction: state enumeration, energy computation,
 * sorting, labeling, and truncation.
 */
import { describe, expect, it } from 'vitest'
import {
  buildHydrogenBasis,
  basisLabels,
  basisEnergies,
  hydrogenEnergy,
  extraDimEnergy,
} from '@/lib/physics/openQuantum/hydrogenBasis'

// ---------------------------------------------------------------------------
// hydrogenEnergy
// ---------------------------------------------------------------------------

describe('hydrogenEnergy', () => {
  it('returns -0.5 for n=1 (ground state, Hartree units)', () => {
    expect(hydrogenEnergy(1)).toBe(-0.5)
  })

  it('returns -0.125 for n=2', () => {
    expect(hydrogenEnergy(2)).toBe(-0.125)
  })

  it('returns -0.5/9 for n=3', () => {
    expect(hydrogenEnergy(3)).toBeCloseTo(-0.5 / 9, 10)
  })

  it('scales as -0.5/n² for large n', () => {
    expect(hydrogenEnergy(10)).toBeCloseTo(-0.005, 10)
  })
})

// ---------------------------------------------------------------------------
// extraDimEnergy
// ---------------------------------------------------------------------------

describe('extraDimEnergy', () => {
  it('returns 0.5*omega for ground state (n_j=0) with a single extra dim', () => {
    // E = ω(0 + 0.5) = 0.5 for ω=1
    expect(extraDimEnergy([0], [1])).toBe(0.5)
  })

  it('returns 1.5*omega for n_j=1 with a single extra dim', () => {
    // E = ω(1 + 0.5) = 1.5 for ω=1
    expect(extraDimEnergy([1], [1])).toBe(1.5)
  })

  it('sums contributions from multiple extra dimensions', () => {
    // E = 2*(0+0.5) + 3*(1+0.5) = 1 + 4.5 = 5.5
    expect(extraDimEnergy([0, 1], [2, 3])).toBe(5.5)
  })

  it('defaults missing omega values to 1', () => {
    // extraDimOmega shorter than extraDimN: missing ω defaults to 1
    // E = 2*(0+0.5) + 1*(1+0.5) = 1 + 1.5 = 2.5
    expect(extraDimEnergy([0, 1], [2])).toBe(2.5)
  })

  it('returns 0 for empty arrays', () => {
    expect(extraDimEnergy([], [])).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// buildHydrogenBasis — state counts
// ---------------------------------------------------------------------------

describe('buildHydrogenBasis', () => {
  describe('state counts', () => {
    it('returns exactly 1 state for maxN=1 (1s only)', () => {
      const basis = buildHydrogenBasis(1, 3)
      expect(basis).toHaveLength(1)
    })

    it('returns exactly 5 states for maxN=2 (1s + 2s + 2p×3)', () => {
      // n=1: 1 state, n=2: 1(s) + 3(p) = 4 states => total 5
      const basis = buildHydrogenBasis(2, 3)
      expect(basis).toHaveLength(5)
    })

    it('returns exactly 14 states for maxN=3', () => {
      // n=1: 1, n=2: 4, n=3: 9 => total 14
      const basis = buildHydrogenBasis(3, 3)
      expect(basis).toHaveLength(14)
    })
  })

  // -------------------------------------------------------------------------
  // Quantum number correctness
  // -------------------------------------------------------------------------

  describe('quantum number constraints', () => {
    it('the single maxN=1 state is n=1, l=0, m=0', () => {
      const [state] = buildHydrogenBasis(1, 3)
      expect(state!.n).toBe(1)
      expect(state!.l).toBe(0)
      // JS loop `for (m = -l; m <= l; m++)` with l=0 produces -0;
      // use toBeCloseTo which treats -0 and +0 as numerically equal
      expect(state!.m).toBeCloseTo(0)
    })

    it('all states satisfy 0 ≤ l < n and -l ≤ m ≤ l', () => {
      const basis = buildHydrogenBasis(3, 3)
      for (const s of basis) {
        expect(s.l).toBeGreaterThanOrEqual(0)
        expect(s.l).toBeLessThan(s.n)
        expect(s.m).toBeGreaterThanOrEqual(-s.l)
        expect(s.m).toBeLessThanOrEqual(s.l)
      }
    })

    it('maxN=2 contains the expected quantum number triples', () => {
      const basis = buildHydrogenBasis(2, 3)
      // Normalize -0 to +0 for comparison (JS loop yields -0 for m when l=0)
      const triples = basis.map((s) => [s.n, s.l, s.m || 0])
      expect(triples).toContainEqual([1, 0, 0]) // 1s
      expect(triples).toContainEqual([2, 0, 0]) // 2s
      expect(triples).toContainEqual([2, 1, -1]) // 2p₋₁
      expect(triples).toContainEqual([2, 1, 0]) // 2p₀
      expect(triples).toContainEqual([2, 1, 1]) // 2p₊₁
    })
  })

  // -------------------------------------------------------------------------
  // Sorting
  // -------------------------------------------------------------------------

  describe('energy sorting', () => {
    it('states are sorted by ascending energy', () => {
      const basis = buildHydrogenBasis(3, 3)
      for (let i = 1; i < basis.length; i++) {
        expect(basis[i]!.energy).toBeGreaterThanOrEqual(basis[i - 1]!.energy)
      }
    })

    it('within the same energy level, states are sorted by n, then l, then m', () => {
      const basis = buildHydrogenBasis(3, 3)
      for (let i = 1; i < basis.length; i++) {
        const prev = basis[i - 1]!
        const curr = basis[i]!
        if (prev.energy === curr.energy) {
          // Same energy → n ascending, then l, then m
          const prevKey = [prev.n, prev.l, prev.m]
          const currKey = [curr.n, curr.l, curr.m]
          const prevVal = prevKey[0]! * 10000 + prevKey[1]! * 100 + (prevKey[2]! + 50)
          const currVal = currKey[0]! * 10000 + currKey[1]! * 100 + (currKey[2]! + 50)
          expect(currVal).toBeGreaterThanOrEqual(prevVal)
        }
      }
    })

    it('first state is always the 1s ground state (lowest energy)', () => {
      const basis = buildHydrogenBasis(3, 3)
      expect(basis[0]!.n).toBe(1)
      expect(basis[0]!.l).toBe(0)
      expect(basis[0]!.m).toBeCloseTo(0)
    })
  })

  // -------------------------------------------------------------------------
  // Index assignment
  // -------------------------------------------------------------------------

  describe('index assignment', () => {
    it('assigns sequential 0-based indices after sorting', () => {
      const basis = buildHydrogenBasis(3, 3)
      for (let i = 0; i < basis.length; i++) {
        expect(basis[i]!.index).toBe(i)
      }
    })
  })

  // -------------------------------------------------------------------------
  // MAX_K truncation
  // -------------------------------------------------------------------------

  describe('MAX_K truncation', () => {
    it('truncates basis to at most 14 states', () => {
      // maxN=3 produces exactly 14 states = MAX_K, so no truncation
      const basis = buildHydrogenBasis(3, 3)
      expect(basis.length).toBeLessThanOrEqual(14)
    })

    it('would truncate if more than 14 states were generated', () => {
      // maxN=4 would produce 1+4+9+16 = 30 states without truncation
      const basis = buildHydrogenBasis(4, 3)
      expect(basis).toHaveLength(14)
    })
  })

  // -------------------------------------------------------------------------
  // N-Dimensional (extra dimensions)
  // -------------------------------------------------------------------------

  describe('extra dimensions (ND)', () => {
    it('3D states have empty extraDimN arrays', () => {
      const basis = buildHydrogenBasis(2, 3)
      for (const s of basis) {
        expect(s.extraDimN).toEqual([])
      }
    })

    it('5D states have extraDimN of length 2, all zeros (ground state)', () => {
      const basis = buildHydrogenBasis(1, 5)
      expect(basis[0]!.extraDimN).toEqual([0, 0])
    })

    it('5D energy includes extra-dimension zero-point contribution', () => {
      const omega = [2, 3]
      const basis = buildHydrogenBasis(1, 5, omega)
      // E = -0.5/1² + 2*(0+0.5) + 3*(0+0.5) = -0.5 + 1 + 1.5 = 2.0
      expect(basis[0]!.energy).toBeCloseTo(2.0, 10)
    })

    it('7D states have extraDimN of length 4', () => {
      const basis = buildHydrogenBasis(1, 7)
      expect(basis[0]!.extraDimN).toHaveLength(4)
      expect(basis[0]!.extraDimN).toEqual([0, 0, 0, 0])
    })
  })
})

// ---------------------------------------------------------------------------
// basisLabels
// ---------------------------------------------------------------------------

describe('basisLabels', () => {
  it('labels maxN=1 basis as ["1s"]', () => {
    const basis = buildHydrogenBasis(1, 3)
    expect(basisLabels(basis)).toEqual(['1s'])
  })

  it('labels maxN=2 basis in spectroscopic notation', () => {
    const basis = buildHydrogenBasis(2, 3)
    const labels = basisLabels(basis)
    expect(labels).toEqual(['1s', '2s', '2p₋₁', '2p₀', '2p₊₁'])
  })

  it('labels l=2 states with "d" and correct subscripts', () => {
    const basis = buildHydrogenBasis(3, 3)
    const labels = basisLabels(basis)
    // n=3, l=2 states should be labeled 3d₋₂, 3d₋₁, 3d₀, 3d₊₁, 3d₊₂
    expect(labels).toContain('3d₋₂')
    expect(labels).toContain('3d₀')
    expect(labels).toContain('3d₊₂')
  })

  it('s orbitals (l=0) have no subscript', () => {
    const basis = buildHydrogenBasis(3, 3)
    const labels = basisLabels(basis)
    expect(labels).toContain('1s')
    expect(labels).toContain('2s')
    expect(labels).toContain('3s')
  })
})

// ---------------------------------------------------------------------------
// basisEnergies
// ---------------------------------------------------------------------------

describe('basisEnergies', () => {
  it('returns a Float64Array with the correct length', () => {
    const basis = buildHydrogenBasis(2, 3)
    const energies = basisEnergies(basis)
    expect(energies).toBeInstanceOf(Float64Array)
    expect(energies).toHaveLength(5)
  })

  it('contains the same energy values as the basis states in order', () => {
    const basis = buildHydrogenBasis(3, 3)
    const energies = basisEnergies(basis)
    for (let i = 0; i < basis.length; i++) {
      expect(energies[i]).toBe(basis[i]!.energy)
    }
  })

  it('first energy is -0.5 (ground state, Hartree) for 3D hydrogen', () => {
    const basis = buildHydrogenBasis(2, 3)
    const energies = basisEnergies(basis)
    expect(energies[0]).toBe(-0.5)
  })

  it('second energy is -0.125 (n=2, Hartree) for 3D hydrogen', () => {
    const basis = buildHydrogenBasis(2, 3)
    const energies = basisEnergies(basis)
    // States 1-4 are all n=2 with energy -0.125
    expect(energies[1]).toBe(-0.125)
  })
})
