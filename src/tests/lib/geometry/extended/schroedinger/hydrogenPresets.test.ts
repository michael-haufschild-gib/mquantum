/**
 * Tests for hydrogen quantum number helper utilities.
 */

import { describe, expect, it } from 'vitest'
import {
  maxAzimuthalForPrincipal,
  orbitalShapeLetter,
  quantumNumbersToLabel,
  validateQuantumNumbers,
} from '@/lib/geometry/extended/schroedinger/hydrogenPresets'

describe('Hydrogen Quantum Number Utilities', () => {
  describe('validateQuantumNumbers', () => {
    it('accepts valid quantum number combinations', () => {
      expect(validateQuantumNumbers(1, 0, 0)).toBe(true)
      expect(validateQuantumNumbers(2, 1, 0)).toBe(true)
      expect(validateQuantumNumbers(3, 2, -2)).toBe(true)
    })

    it('rejects invalid principal quantum number', () => {
      expect(validateQuantumNumbers(0, 0, 0)).toBe(false)
      expect(validateQuantumNumbers(-1, 0, 0)).toBe(false)
    })

    it('rejects invalid azimuthal quantum number', () => {
      expect(validateQuantumNumbers(1, 1, 0)).toBe(false)
      expect(validateQuantumNumbers(2, 2, 0)).toBe(false)
      expect(validateQuantumNumbers(3, -1, 0)).toBe(false)
    })

    it('rejects invalid magnetic quantum number', () => {
      expect(validateQuantumNumbers(2, 1, 2)).toBe(false)
      expect(validateQuantumNumbers(2, 1, -2)).toBe(false)
      expect(validateQuantumNumbers(3, 0, 1)).toBe(false)
    })
  })

  describe('orbitalShapeLetter', () => {
    it('maps known l values to orbital letters', () => {
      expect(orbitalShapeLetter(0)).toBe('s')
      expect(orbitalShapeLetter(1)).toBe('p')
      expect(orbitalShapeLetter(2)).toBe('d')
      expect(orbitalShapeLetter(3)).toBe('f')
      expect(orbitalShapeLetter(4)).toBe('g')
    })

    it('falls back to l=<value> for higher indices', () => {
      expect(orbitalShapeLetter(7)).toBe('l=7')
    })
  })

  describe('maxAzimuthalForPrincipal', () => {
    it('returns n-1 for valid n', () => {
      expect(maxAzimuthalForPrincipal(1)).toBe(0)
      expect(maxAzimuthalForPrincipal(2)).toBe(1)
      expect(maxAzimuthalForPrincipal(7)).toBe(6)
    })

    it('clamps to zero for invalid n', () => {
      expect(maxAzimuthalForPrincipal(0)).toBe(0)
      expect(maxAzimuthalForPrincipal(-3)).toBe(0)
    })
  })

  describe('quantumNumbersToLabel', () => {
    it('formats s/p/d orbitals with conventional labels', () => {
      expect(quantumNumbersToLabel(1, 0, 0)).toBe('1s')
      expect(quantumNumbersToLabel(2, 1, 1)).toBe('2px')
      expect(quantumNumbersToLabel(2, 1, -1)).toBe('2py')
      expect(quantumNumbersToLabel(3, 2, 0)).toBe('3dz²')
      expect(quantumNumbersToLabel(3, 2, 2)).toBe('3dxy')
    })

    it('falls back to generic label for unsupported combinations', () => {
      expect(quantumNumbersToLabel(5, 4, 1)).toBe('5g (m=1)')
    })
  })
})
