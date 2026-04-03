import { beforeEach, describe, expect, it } from 'vitest'

import { useDiagnosticsStore } from '@/stores/diagnosticsStore'

describe('eigenstateDiagnosticsStore', () => {
  beforeEach(() => {
    useDiagnosticsStore.getState().clearEigenstate()
  })

  it('starts empty with no eigenstates and no level spacing', () => {
    const { eigenstates, levelSpacing } = useDiagnosticsStore.getState().eigenstate
    expect(eigenstates).toEqual([])
    expect(levelSpacing).toBeNull()
  })

  describe('pushEigenstate', () => {
    it('appends entries with incrementing indices', () => {
      const { pushEigenstate } = useDiagnosticsStore.getState()
      pushEigenstate(1.5, 0.01)
      pushEigenstate(3.0, 0.02)

      const entries = useDiagnosticsStore.getState().eigenstate.eigenstates
      expect(entries).toHaveLength(2)
      expect(entries[0]!.index).toBe(0)
      expect(entries[1]!.index).toBe(1)
    })

    it('stores energy, IPR, and defaults orbitCorrelation to NaN', () => {
      useDiagnosticsStore.getState().pushEigenstate(2.5, 0.03)
      const entry = useDiagnosticsStore.getState().eigenstate.eigenstates[0]!

      expect(entry.energy).toBe(2.5)
      expect(entry.ipr).toBe(0.03)
      expect(Number.isNaN(entry.orbitCorrelation)).toBe(true)
    })

    it('stores explicit orbitCorrelation when provided', () => {
      useDiagnosticsStore.getState().pushEigenstate(2.5, 0.03, 1.7)
      const entry = useDiagnosticsStore.getState().eigenstate.eigenstates[0]!
      expect(entry.orbitCorrelation).toBe(1.7)
    })

    it('does not compute level spacing with fewer than 10 eigenstates', () => {
      const { pushEigenstate } = useDiagnosticsStore.getState()
      for (let i = 0; i < 9; i++) {
        pushEigenstate(i * 1.0, 0.01)
      }
      expect(useDiagnosticsStore.getState().eigenstate.levelSpacing).toBeNull()
    })

    it('computes level spacing when 10 or more eigenstates with finite energies', () => {
      const { pushEigenstate } = useDiagnosticsStore.getState()
      for (let i = 0; i < 12; i++) {
        pushEigenstate(i * 1.0, 0.01)
      }
      const ls = useDiagnosticsStore.getState().eigenstate.levelSpacing!
      expect(ls.energies.length).toBeGreaterThanOrEqual(10)
      expect(Number.isFinite(ls.meanSpacing)).toBe(true)
      expect(ls.brodyBeta).toBeGreaterThanOrEqual(0)
      expect(ls.brodyBeta).toBeLessThanOrEqual(1)
    })

    it('ignores NaN energies when computing level spacing threshold', () => {
      const { pushEigenstate } = useDiagnosticsStore.getState()
      // Push 12 entries but 5 have NaN energy → only 7 valid → no level spacing
      for (let i = 0; i < 7; i++) {
        pushEigenstate(i * 1.0, 0.01)
      }
      for (let i = 0; i < 5; i++) {
        pushEigenstate(NaN, 0.01)
      }
      expect(useDiagnosticsStore.getState().eigenstate.levelSpacing).toBeNull()
    })
  })

  describe('updateIPR', () => {
    it('updates the IPR of an existing eigenstate and recomputes level spacing', () => {
      const { pushEigenstate } = useDiagnosticsStore.getState()
      for (let i = 0; i < 10; i++) {
        pushEigenstate(i * 1.0, 0.01)
      }

      useDiagnosticsStore.getState().updateEigenstateIPR(3, 0.99)
      const entry = useDiagnosticsStore.getState().eigenstate.eigenstates[3]!
      expect(entry.ipr).toBe(0.99)
    })

    it('ignores out-of-range indices (negative)', () => {
      useDiagnosticsStore.getState().pushEigenstate(1.0, 0.01)
      useDiagnosticsStore.getState().updateEigenstateIPR(-1, 0.5)
      // Should not crash, entry unchanged
      expect(useDiagnosticsStore.getState().eigenstate.eigenstates[0]!.ipr).toBe(0.01)
    })

    it('ignores out-of-range indices (too large)', () => {
      useDiagnosticsStore.getState().pushEigenstate(1.0, 0.01)
      useDiagnosticsStore.getState().updateEigenstateIPR(99, 0.5)
      expect(useDiagnosticsStore.getState().eigenstate.eigenstates[0]!.ipr).toBe(0.01)
    })
  })

  describe('updateOrbitCorrelation', () => {
    it('updates orbitCorrelation for an existing eigenstate', () => {
      useDiagnosticsStore.getState().pushEigenstate(1.0, 0.01)
      useDiagnosticsStore.getState().updateEigenstateOrbitCorrelation(0, 2.5)
      expect(useDiagnosticsStore.getState().eigenstate.eigenstates[0]!.orbitCorrelation).toBe(2.5)
    })

    it('ignores out-of-range indices', () => {
      useDiagnosticsStore.getState().pushEigenstate(1.0, 0.01)
      useDiagnosticsStore.getState().updateEigenstateOrbitCorrelation(5, 2.5)
      expect(
        Number.isNaN(useDiagnosticsStore.getState().eigenstate.eigenstates[0]!.orbitCorrelation)
      ).toBe(true)
    })
  })

  describe('clear', () => {
    it('resets all state to initial', () => {
      const { pushEigenstate } = useDiagnosticsStore.getState()
      for (let i = 0; i < 15; i++) {
        pushEigenstate(i * 1.0, 0.01)
      }
      // Should have level spacing with valid brody parameter
      expect(
        useDiagnosticsStore.getState().eigenstate.levelSpacing!.brodyBeta
      ).toBeGreaterThanOrEqual(0)

      useDiagnosticsStore.getState().clearEigenstate()
      const { eigenstates, levelSpacing } = useDiagnosticsStore.getState().eigenstate
      expect(eigenstates).toEqual([])
      expect(levelSpacing).toBeNull()
    })
  })
})
