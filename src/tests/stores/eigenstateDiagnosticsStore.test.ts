import { beforeEach, describe, expect, it } from 'vitest'

import { useEigenstateDiagnosticsStore } from '@/stores/eigenstateDiagnosticsStore'

describe('eigenstateDiagnosticsStore', () => {
  beforeEach(() => {
    useEigenstateDiagnosticsStore.getState().clear()
  })

  it('starts empty with no eigenstates and no level spacing', () => {
    const { eigenstates, levelSpacing } = useEigenstateDiagnosticsStore.getState()
    expect(eigenstates).toEqual([])
    expect(levelSpacing).toBeNull()
  })

  describe('pushEigenstate', () => {
    it('appends entries with incrementing indices', () => {
      const { pushEigenstate } = useEigenstateDiagnosticsStore.getState()
      pushEigenstate(1.5, 0.01)
      pushEigenstate(3.0, 0.02)

      const entries = useEigenstateDiagnosticsStore.getState().eigenstates
      expect(entries).toHaveLength(2)
      expect(entries[0]!.index).toBe(0)
      expect(entries[1]!.index).toBe(1)
    })

    it('stores energy, IPR, and defaults orbitCorrelation to NaN', () => {
      useEigenstateDiagnosticsStore.getState().pushEigenstate(2.5, 0.03)
      const entry = useEigenstateDiagnosticsStore.getState().eigenstates[0]!

      expect(entry.energy).toBe(2.5)
      expect(entry.ipr).toBe(0.03)
      expect(Number.isNaN(entry.orbitCorrelation)).toBe(true)
    })

    it('stores explicit orbitCorrelation when provided', () => {
      useEigenstateDiagnosticsStore.getState().pushEigenstate(2.5, 0.03, 1.7)
      const entry = useEigenstateDiagnosticsStore.getState().eigenstates[0]!
      expect(entry.orbitCorrelation).toBe(1.7)
    })

    it('does not compute level spacing with fewer than 10 eigenstates', () => {
      const { pushEigenstate } = useEigenstateDiagnosticsStore.getState()
      for (let i = 0; i < 9; i++) {
        pushEigenstate(i * 1.0, 0.01)
      }
      expect(useEigenstateDiagnosticsStore.getState().levelSpacing).toBeNull()
    })

    it('computes level spacing when 10 or more eigenstates with finite energies', () => {
      const { pushEigenstate } = useEigenstateDiagnosticsStore.getState()
      for (let i = 0; i < 12; i++) {
        pushEigenstate(i * 1.0, 0.01)
      }
      const ls = useEigenstateDiagnosticsStore.getState().levelSpacing!
      expect(ls.energies.length).toBeGreaterThanOrEqual(10)
      expect(Number.isFinite(ls.meanSpacing)).toBe(true)
      expect(ls.brodyBeta).toBeGreaterThanOrEqual(0)
      expect(ls.brodyBeta).toBeLessThanOrEqual(1)
    })

    it('ignores NaN energies when computing level spacing threshold', () => {
      const { pushEigenstate } = useEigenstateDiagnosticsStore.getState()
      // Push 12 entries but 5 have NaN energy → only 7 valid → no level spacing
      for (let i = 0; i < 7; i++) {
        pushEigenstate(i * 1.0, 0.01)
      }
      for (let i = 0; i < 5; i++) {
        pushEigenstate(NaN, 0.01)
      }
      expect(useEigenstateDiagnosticsStore.getState().levelSpacing).toBeNull()
    })
  })

  describe('updateIPR', () => {
    it('updates the IPR of an existing eigenstate and recomputes level spacing', () => {
      const { pushEigenstate } = useEigenstateDiagnosticsStore.getState()
      for (let i = 0; i < 10; i++) {
        pushEigenstate(i * 1.0, 0.01)
      }

      useEigenstateDiagnosticsStore.getState().updateIPR(3, 0.99)
      const entry = useEigenstateDiagnosticsStore.getState().eigenstates[3]!
      expect(entry.ipr).toBe(0.99)
    })

    it('ignores out-of-range indices (negative)', () => {
      useEigenstateDiagnosticsStore.getState().pushEigenstate(1.0, 0.01)
      useEigenstateDiagnosticsStore.getState().updateIPR(-1, 0.5)
      // Should not crash, entry unchanged
      expect(useEigenstateDiagnosticsStore.getState().eigenstates[0]!.ipr).toBe(0.01)
    })

    it('ignores out-of-range indices (too large)', () => {
      useEigenstateDiagnosticsStore.getState().pushEigenstate(1.0, 0.01)
      useEigenstateDiagnosticsStore.getState().updateIPR(99, 0.5)
      expect(useEigenstateDiagnosticsStore.getState().eigenstates[0]!.ipr).toBe(0.01)
    })
  })

  describe('updateOrbitCorrelation', () => {
    it('updates orbitCorrelation for an existing eigenstate', () => {
      useEigenstateDiagnosticsStore.getState().pushEigenstate(1.0, 0.01)
      useEigenstateDiagnosticsStore.getState().updateOrbitCorrelation(0, 2.5)
      expect(useEigenstateDiagnosticsStore.getState().eigenstates[0]!.orbitCorrelation).toBe(2.5)
    })

    it('ignores out-of-range indices', () => {
      useEigenstateDiagnosticsStore.getState().pushEigenstate(1.0, 0.01)
      useEigenstateDiagnosticsStore.getState().updateOrbitCorrelation(5, 2.5)
      expect(
        Number.isNaN(useEigenstateDiagnosticsStore.getState().eigenstates[0]!.orbitCorrelation)
      ).toBe(true)
    })
  })

  describe('clear', () => {
    it('resets all state to initial', () => {
      const { pushEigenstate } = useEigenstateDiagnosticsStore.getState()
      for (let i = 0; i < 15; i++) {
        pushEigenstate(i * 1.0, 0.01)
      }
      // Should have level spacing with valid brody parameter
      expect(
        useEigenstateDiagnosticsStore.getState().levelSpacing!.brodyBeta
      ).toBeGreaterThanOrEqual(0)

      useEigenstateDiagnosticsStore.getState().clear()
      const { eigenstates, levelSpacing } = useEigenstateDiagnosticsStore.getState()
      expect(eigenstates).toEqual([])
      expect(levelSpacing).toBeNull()
    })
  })
})
