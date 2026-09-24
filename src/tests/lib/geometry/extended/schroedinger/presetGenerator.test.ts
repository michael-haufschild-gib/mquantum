/**
 * Tests for the quantum preset generator (generateQuantumPreset).
 *
 * Verifies physical invariants that must hold for any generated preset:
 * - Coefficient normalization (valid quantum state)
 * - Quantum number bounds and extra-dimension parity constraints
 * - Energy conservation formula
 * - Deterministic output from same seed
 * - Parameter clamping
 */

import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { generateQuantumPreset, getNamedPreset } from '@/lib/geometry/extended/schroedinger/presets'

describe('generateQuantumPreset', () => {
  describe('coefficient normalization', () => {
    it('Σ|c_k|² = 1 for all generated presets (valid quantum state)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100000 }),
          fc.integer({ min: 3, max: 11 }),
          fc.integer({ min: 1, max: 8 }),
          fc.integer({ min: 1, max: 6 }),
          fc.double({ min: 0, max: 0.5, noNaN: true, noDefaultInfinity: true }),
          (seed, dim, terms, maxN, spread) => {
            const preset = generateQuantumPreset(seed, dim, terms, maxN, spread)
            const normSq = preset.coefficients.reduce((sum, [re, im]) => sum + re * re + im * im, 0)
            expect(normSq).toBeCloseTo(1.0, 8)
          }
        ),
        { numRuns: 500 }
      )
    })

    it('single-term preset has coefficient magnitude = 1', () => {
      const preset = generateQuantumPreset(42, 3, 1, 3, 0.01)
      expect(preset.coefficients).toHaveLength(1)
      const [re, im] = preset.coefficients[0]!
      expect(Math.sqrt(re * re + im * im)).toBeCloseTo(1.0, 8)
    })
  })

  describe('quantum number constraints', () => {
    it('all quantum numbers are non-negative and <= maxN', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100000 }),
          fc.integer({ min: 3, max: 11 }),
          fc.integer({ min: 1, max: 8 }),
          fc.integer({ min: 1, max: 6 }),
          (seed, dim, terms, maxN) => {
            const preset = generateQuantumPreset(seed, dim, terms, maxN, 0.1)
            for (const term of preset.quantumNumbers) {
              for (const n of term) {
                expect(n).toBeGreaterThanOrEqual(0)
                expect(n).toBeLessThanOrEqual(maxN)
              }
            }
          }
        ),
        { numRuns: 300 }
      )
    })

    it('extra dimensions (j >= 3) use only even quantum numbers', () => {
      // This constraint ensures HO wavefunctions don't vanish at slice coordinate = 0
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100000 }),
          fc.integer({ min: 5, max: 11 }), // Need at least 5D to have extra dims
          fc.integer({ min: 1, max: 8 }),
          fc.integer({ min: 2, max: 6 }),
          (seed, dim, terms, maxN) => {
            const preset = generateQuantumPreset(seed, dim, terms, maxN, 0.1)
            for (const term of preset.quantumNumbers) {
              for (let j = 3; j < term.length; j++) {
                expect(term[j]! % 2, `dim ${j} quantum number ${term[j]} must be even`).toBe(0)
              }
            }
          }
        ),
        { numRuns: 300 }
      )
    })

    it('first 3 dimensions allow odd quantum numbers', () => {
      // Run enough seeds until we find at least one odd quantum number in dims 0-2
      let foundOdd = false
      for (let seed = 0; seed < 200; seed++) {
        const preset = generateQuantumPreset(seed, 4, 4, 5, 0.1)
        for (const term of preset.quantumNumbers) {
          for (let j = 0; j < 3; j++) {
            if (term[j]! % 2 !== 0) foundOdd = true
          }
        }
        if (foundOdd) break
      }
      expect(foundOdd).toBe(true)
    })
  })

  describe('energy computation', () => {
    it('energy equals Σ ω_j(n_{kj} + 0.5) for every term', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100000 }),
          fc.integer({ min: 3, max: 11 }),
          fc.integer({ min: 1, max: 8 }),
          (seed, dim, terms) => {
            const preset = generateQuantumPreset(seed, dim, terms, 5, 0.1)
            for (let k = 0; k < preset.termCount; k++) {
              let expectedE = 0
              for (let j = 0; j < dim; j++) {
                const omega = preset.omega[j] ?? 1.0
                const n = preset.quantumNumbers[k]![j] ?? 0
                expectedE += omega * (n + 0.5)
              }
              expect(preset.energies[k]).toBeCloseTo(expectedE, 8)
            }
          }
        ),
        { numRuns: 200 }
      )
    })
  })

  describe('deterministic output', () => {
    it('same seed produces identical output', () => {
      const a = generateQuantumPreset(12345, 5, 3, 4, 0.1)
      const b = generateQuantumPreset(12345, 5, 3, 4, 0.1)

      expect(a.termCount).toBe(b.termCount)
      expect(a.omega).toEqual(b.omega)
      expect(a.quantumNumbers).toEqual(b.quantumNumbers)
      expect(a.coefficients).toEqual(b.coefficients)
      expect(a.energies).toEqual(b.energies)
    })

    it('different seeds produce different output', () => {
      const a = generateQuantumPreset(1, 4, 3, 4, 0.1)
      const b = generateQuantumPreset(2, 4, 3, 4, 0.1)

      // At minimum, coefficients should differ (phases are random)
      const aSig = a.coefficients.flat().join(',')
      const bSig = b.coefficients.flat().join(',')
      expect(aSig).not.toBe(bSig)
    })
  })

  describe('parameter clamping', () => {
    it('clamps dimension to [MIN_DIMENSION = 2, MAX_DIM]', () => {
      const small = generateQuantumPreset(0, 1, 1, 3, 0)
      expect(small.omega).toHaveLength(2)
      expect(small.quantumNumbers[0]).toHaveLength(2)

      const large = generateQuantumPreset(0, 99, 1, 3, 0)
      expect(large.omega.length).toBeLessThanOrEqual(11)
    })

    it('clamps termCount to [1, MAX_TERMS]', () => {
      const zero = generateQuantumPreset(0, 3, 0, 3, 0)
      expect(zero.termCount).toBeGreaterThanOrEqual(1)

      const huge = generateQuantumPreset(0, 3, 999, 3, 0)
      expect(huge.termCount).toBeLessThanOrEqual(8)
    })

    it('clamps maxN to [1, 6]', () => {
      const preset = generateQuantumPreset(0, 3, 3, 0, 0)
      // All quantum numbers should be <= 1 (clamped maxN)
      for (const term of preset.quantumNumbers) {
        for (const n of term) {
          expect(n).toBeLessThanOrEqual(1)
        }
      }
    })

    it('clamps frequencySpread to [0, 0.5]', () => {
      const neg = generateQuantumPreset(0, 3, 1, 3, -1)
      const big = generateQuantumPreset(0, 3, 1, 3, 5)
      // Omegas should all be positive and finite
      for (const o of neg.omega) {
        expect(o).toBeGreaterThan(0)
        expect(Number.isFinite(o)).toBe(true)
      }
      for (const o of big.omega) {
        expect(o).toBeGreaterThan(0)
        expect(Number.isFinite(o)).toBe(true)
      }
    })

    it('falls back for non-finite parameters instead of leaking NaN into preset state', () => {
      const preset = generateQuantumPreset(
        Number.NaN,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NaN,
        Number.NaN
      )

      expect(preset.termCount).toBe(3)
      expect(preset.omega).toHaveLength(3)
      expect(preset.quantumNumbers).toHaveLength(3)
      expect(preset.coefficients).toHaveLength(3)
      expect(preset.energies).toHaveLength(3)

      for (const value of [
        ...preset.omega,
        ...preset.quantumNumbers.flat(),
        ...preset.coefficients.flat(),
        ...preset.energies,
      ]) {
        expect(Number.isFinite(value)).toBe(true)
      }
    })

    it('floors fractional structural parameters before allocating preset arrays', () => {
      const preset = generateQuantumPreset(0, 4.9, 2.9, 3.9, 0.1)

      expect(preset.omega).toHaveLength(4)
      expect(preset.termCount).toBe(2)
      expect(preset.quantumNumbers).toHaveLength(2)
      for (const term of preset.quantumNumbers) {
        expect(term).toHaveLength(4)
        for (const n of term) {
          expect(Number.isInteger(n)).toBe(true)
          expect(n).toBeLessThanOrEqual(3)
        }
      }
    })
  })

  describe('structural invariants', () => {
    it('termCount matches actual number of terms', () => {
      const preset = generateQuantumPreset(42, 5, 4, 3, 0.1)
      expect(preset.quantumNumbers).toHaveLength(preset.termCount)
      expect(preset.coefficients).toHaveLength(preset.termCount)
      expect(preset.energies).toHaveLength(preset.termCount)
    })

    it('each term has correct number of dimensions', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10000 }),
          fc.integer({ min: 3, max: 11 }),
          (seed, dim) => {
            const preset = generateQuantumPreset(seed, dim, 3, 4, 0.1)
            expect(preset.omega).toHaveLength(dim)
            for (const term of preset.quantumNumbers) {
              expect(term).toHaveLength(dim)
            }
          }
        ),
        { numRuns: 100 }
      )
    })

    it('all omega values are positive', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100000 }),
          fc.integer({ min: 3, max: 11 }),
          (seed, dim) => {
            const preset = generateQuantumPreset(seed, dim, 3, 4, 0.5)
            for (const o of preset.omega) {
              expect(o).toBeGreaterThan(0)
            }
          }
        ),
        { numRuns: 200 }
      )
    })

    it('all energies are positive (ground state energy is positive for HO)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 100000 }),
          fc.integer({ min: 3, max: 11 }),
          (seed, dim) => {
            const preset = generateQuantumPreset(seed, dim, 3, 4, 0.1)
            for (const e of preset.energies) {
              expect(e).toBeGreaterThan(0)
            }
          }
        ),
        { numRuns: 200 }
      )
    })
  })

  describe('named preset semantic states', () => {
    it('materializes advertised harmonic-oscillator basis states', () => {
      const expectedStates = [
        ['groundState', [[0, 0, 0]]],
        ['firstExcited', [[0, 0, 1]]],
        [
          'groundExcitedBeat',
          [
            [0, 0, 0],
            [0, 3, 0],
          ],
        ],
        ['nodalStructure', [[6, 2, 2]]],
      ] as const

      for (const [name, expected] of expectedStates) {
        const preset = getNamedPreset(name, 3)
        if (!preset) throw new Error(`Named preset '${name}' was not found`)
        expect(preset.quantumNumbers).toEqual(expected)
        expect(preset.termCount).toBe(expected.length)
      }
    })

    it('makes the isotropic preset exactly degenerate', () => {
      const preset = getNamedPreset('isotropic', 3)
      if (!preset) throw new Error('Named preset isotropic was not found')

      expect(preset.quantumNumbers).toEqual([
        [2, 0, 0],
        [0, 2, 0],
        [0, 0, 2],
      ])
      expect(preset.energies[0]!).toBeCloseTo(preset.energies[1]!, 8)
      expect(preset.energies[1]!).toBeCloseTo(preset.energies[2]!, 8)
    })

    it('pads exact named states with valid ground modes in higher dimensions', () => {
      const preset = getNamedPreset('nodalStructure', 6)
      if (!preset) throw new Error('Named preset nodalStructure was not found')

      expect(preset.quantumNumbers).toEqual([[6, 2, 2, 0, 0, 0]])
      expect(preset.quantumNumbers[0]!.slice(3).every((n) => n === 0 && n % 2 === 0)).toBe(true)
    })
  })
})

// Regression: the generator floored the dimension at 3, so a 2D scene carried
// a phantom z quantum number whose ω_z(n_z + ½) entered every term's energy.
// The 2D evaluator ignores z, so the displayed state beat at frequencies it
// does not have (and two terms equal in (n_x, n_y) evolved with different
// phases).
describe('2D harmonic-oscillator presets', () => {
  it('carry exactly two modes and a 2D energy per term', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100000 }),
        fc.integer({ min: 1, max: 8 }),
        (seed, terms) => {
          const preset = generateQuantumPreset(seed, 2, terms, 5, 0.1)
          expect(preset.omega).toHaveLength(2)
          for (let k = 0; k < preset.termCount; k++) {
            const n = preset.quantumNumbers[k]!
            expect(n).toHaveLength(2)
            const expectedE = preset.omega[0]! * (n[0]! + 0.5) + preset.omega[1]! * (n[1]! + 0.5)
            expect(preset.energies[k]).toBeCloseTo(expectedE, 10)
          }
        }
      ),
      { numRuns: 200 }
    )
  })

  it('drops the z column of exact named states instead of pricing it in', () => {
    const preset = getNamedPreset('isotropic', 2)
    if (!preset) throw new Error('Named preset isotropic was not found')

    expect(preset.quantumNumbers).toEqual([
      [2, 0],
      [0, 2],
      [0, 0],
    ])
    const [wx, wy] = preset.omega as [number, number]
    expect(preset.energies[2]).toBeCloseTo(0.5 * wx + 0.5 * wy, 10)
  })
})

// Regression: terms were sampled independently, so a seeded superposition
// often repeated an eigenstate (3D, 5 terms: ~23% of seeds). Σ|c_k|² = 1 is
// the norm only for distinct terms, and the open-system propagator treated
// twins as separate levels whose mutual coherence dephasing then destroyed.
describe('seeded superposition terms are distinct eigenstates', () => {
  it('never repeats a quantum-number row and keeps the requested term count', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100000 }),
        fc.integer({ min: 2, max: 11 }),
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 2, max: 6 }),
        (seed, dim, terms, maxN) => {
          const preset = generateQuantumPreset(seed, dim, terms, maxN, 0.1)
          expect(preset.termCount).toBe(terms)
          const keys = preset.quantumNumbers.map((row) => row.join(','))
          expect(new Set(keys).size).toBe(keys.length)
          for (const row of preset.quantumNumbers) {
            for (let j = 0; j < row.length; j++) {
              expect(row[j]!).toBeLessThanOrEqual(maxN)
              if (j >= 3) expect(row[j]! % 2).toBe(0)
            }
          }
        }
      ),
      { numRuns: 500 }
    )
  })

  it('adding terms leaves the earlier terms unchanged', () => {
    for (let seed = 0; seed < 200; seed++) {
      const five = generateQuantumPreset(seed, 3, 5, 5, 0.02)
      const eight = generateQuantumPreset(seed, 3, 8, 5, 0.02)
      expect(eight.quantumNumbers.slice(0, 5)).toEqual(five.quantumNumbers)
    }
  })

  it('stops at the size of an exhausted state space instead of repeating a state', () => {
    // 2D with nMax = 1 has only 4 states (below the store's nMax ≥ 2 floor).
    const preset = generateQuantumPreset(7, 2, 8, 1, 0)
    expect(preset.termCount).toBe(4)
    expect(new Set(preset.quantumNumbers.map((row) => row.join(','))).size).toBe(4)
    const normSq = preset.coefficients.reduce((sum, [re, im]) => sum + re * re + im * im, 0)
    expect(normSq).toBeCloseTo(1, 12)
  })
})
