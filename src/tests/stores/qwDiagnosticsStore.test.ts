/**
 * Tests for qwDiagnosticsStore — quantum walk simulation diagnostic metrics.
 *
 * The store computes derived quantities (mean position, variance, norm drift)
 * from raw GPU readback data. Bugs here produce incorrect diagnostic displays
 * that mislead the user about whether their quantum walk is unitary.
 *
 * Key invariants tested:
 * - Initial norm captured on first pushDiagnostics call
 * - Norm drift is relative: (norm - norm0) / norm0
 * - Variance = <x^2> - <x>^2, clamped to >= 0
 * - Reset restores all fields to initial defaults
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'

describe('qwDiagnosticsStore', () => {
  beforeEach(() => {
    useDiagnosticsStore.getState().resetQw()
  })

  describe('initial state', () => {
    it('starts with no data and unit norm', () => {
      const s = useDiagnosticsStore.getState().qw
      expect(s.hasData).toBe(false)
      expect(s.totalNorm).toBe(1)
      expect(s.normDrift).toBe(0)
      expect(s.stepCount).toBe(0)
      expect(s.positionMean).toBe(0)
      expect(s.positionVariance).toBe(0)
      expect(s.initialNorm).toBe(-1)
    })
  })

  describe('pushDiagnostics', () => {
    it('captures initial norm on first call', () => {
      useDiagnosticsStore.getState().pushQwDiagnostics(0.98, 1, 0, 0)
      const s = useDiagnosticsStore.getState().qw
      expect(s.initialNorm).toBe(0.98)
      expect(s.hasData).toBe(true)
    })

    it('preserves initial norm on subsequent calls', () => {
      useDiagnosticsStore.getState().pushQwDiagnostics(1.0, 1, 0, 0)
      useDiagnosticsStore.getState().pushQwDiagnostics(0.95, 2, 0, 0)
      expect(useDiagnosticsStore.getState().qw.initialNorm).toBe(1.0)
    })

    it('computes norm drift correctly: (norm - norm0) / norm0', () => {
      // First call sets norm0 = 1.0
      useDiagnosticsStore.getState().pushQwDiagnostics(1.0, 1, 0, 0)
      expect(useDiagnosticsStore.getState().qw.normDrift).toBeCloseTo(0)

      // Second call: norm = 0.95, drift = (0.95 - 1.0) / 1.0 = -0.05
      useDiagnosticsStore.getState().pushQwDiagnostics(0.95, 2, 0, 0)
      expect(useDiagnosticsStore.getState().qw.normDrift).toBeCloseTo(-0.05)

      // Third call: norm = 1.05, drift = (1.05 - 1.0) / 1.0 = 0.05
      useDiagnosticsStore.getState().pushQwDiagnostics(1.05, 3, 0, 0)
      expect(useDiagnosticsStore.getState().qw.normDrift).toBeCloseTo(0.05)
    })

    it('computes position mean correctly: posSum / totalNorm', () => {
      // totalNorm=2, posSum=6 -> mean=3
      useDiagnosticsStore.getState().pushQwDiagnostics(2.0, 1, 6.0, 20.0)
      expect(useDiagnosticsStore.getState().qw.positionMean).toBeCloseTo(3.0)
    })

    it('computes variance correctly: posSqSum/norm - mean^2', () => {
      // norm=4, posSum=8, posSqSum=20
      // mean = 8/4 = 2
      // variance = 20/4 - 2^2 = 5 - 4 = 1
      useDiagnosticsStore.getState().pushQwDiagnostics(4.0, 1, 8.0, 20.0)
      expect(useDiagnosticsStore.getState().qw.positionVariance).toBeCloseTo(1.0)
    })

    it('clamps variance to zero (avoids negative from floating point)', () => {
      // Construct a case where posSqSum/norm < mean^2 due to roundoff
      // norm=1, posSum=1, posSqSum=0.99 -> variance = 0.99 - 1.0 = -0.01, clamped to 0
      useDiagnosticsStore.getState().pushQwDiagnostics(1.0, 1, 1.0, 0.99)
      expect(useDiagnosticsStore.getState().qw.positionVariance).toBe(0)
    })

    it('handles zero totalNorm gracefully (returns 0 for mean and variance)', () => {
      useDiagnosticsStore.getState().pushQwDiagnostics(0, 5, 10, 100)
      const s = useDiagnosticsStore.getState().qw
      expect(s.positionMean).toBe(0)
      expect(s.positionVariance).toBe(0)
    })

    it('handles zero initial norm gracefully (normDrift = 0)', () => {
      // First call with zero norm
      useDiagnosticsStore.getState().pushQwDiagnostics(0, 1, 0, 0)
      expect(useDiagnosticsStore.getState().qw.normDrift).toBe(0)

      // Second call still zero norm0, drift should be 0
      useDiagnosticsStore.getState().pushQwDiagnostics(0.5, 2, 0, 0)
      expect(useDiagnosticsStore.getState().qw.normDrift).toBe(0)
    })

    it('tracks step count correctly', () => {
      useDiagnosticsStore.getState().pushQwDiagnostics(1.0, 42, 0, 0)
      expect(useDiagnosticsStore.getState().qw.stepCount).toBe(42)

      useDiagnosticsStore.getState().pushQwDiagnostics(1.0, 100, 0, 0)
      expect(useDiagnosticsStore.getState().qw.stepCount).toBe(100)
    })

    it('updates totalNorm on every call', () => {
      useDiagnosticsStore.getState().pushQwDiagnostics(1.0, 1, 0, 0)
      expect(useDiagnosticsStore.getState().qw.totalNorm).toBe(1.0)

      useDiagnosticsStore.getState().pushQwDiagnostics(0.87, 2, 0, 0)
      expect(useDiagnosticsStore.getState().qw.totalNorm).toBe(0.87)
    })

    it('realistic quantum walk scenario: ballistic spreading', () => {
      // Simulate unitary walk with ballistic spreading (variance ~ t^2)
      // Step 0: localized at origin
      useDiagnosticsStore.getState().pushQwDiagnostics(1.0, 0, 0, 0)
      expect(useDiagnosticsStore.getState().qw.positionVariance).toBe(0)

      // Step 10: spread out, norm preserved
      // mean = posSum/norm = 5/1 = 5, variance = posSqSum/norm - mean^2 = 50/1 - 25 = 25
      useDiagnosticsStore.getState().pushQwDiagnostics(1.0, 10, 5.0, 50.0)
      expect(useDiagnosticsStore.getState().qw.positionVariance).toBeCloseTo(25.0)
      expect(useDiagnosticsStore.getState().qw.normDrift).toBeCloseTo(0)

      // Step 20: more spread, slight norm loss
      // mean = 10/0.99 ≈ 10.1, variance = 200/0.99 - 10.1^2 ≈ 202.02 - 102.01 ≈ 100.01
      useDiagnosticsStore.getState().pushQwDiagnostics(0.99, 20, 10.0, 200.0)
      expect(useDiagnosticsStore.getState().qw.normDrift).toBeCloseTo(-0.01)
      expect(useDiagnosticsStore.getState().qw.positionVariance).toBeGreaterThan(0)
    })
  })

  describe('reset', () => {
    it('restores all fields to initial defaults after mutations', () => {
      useDiagnosticsStore.getState().pushQwDiagnostics(0.95, 50, 25.0, 1000.0)
      expect(useDiagnosticsStore.getState().qw.hasData).toBe(true)

      useDiagnosticsStore.getState().resetQw()

      const s = useDiagnosticsStore.getState().qw
      expect(s.hasData).toBe(false)
      expect(s.totalNorm).toBe(1)
      expect(s.normDrift).toBe(0)
      expect(s.stepCount).toBe(0)
      expect(s.positionMean).toBe(0)
      expect(s.positionVariance).toBe(0)
      expect(s.initialNorm).toBe(-1)
    })

    it('allows fresh initial norm capture after reset', () => {
      useDiagnosticsStore.getState().pushQwDiagnostics(1.0, 1, 0, 0)
      expect(useDiagnosticsStore.getState().qw.initialNorm).toBe(1.0)

      useDiagnosticsStore.getState().resetQw()
      useDiagnosticsStore.getState().pushQwDiagnostics(0.5, 1, 0, 0)
      expect(useDiagnosticsStore.getState().qw.initialNorm).toBe(0.5)
    })
  })

  describe('rapid pushDiagnostics calls', () => {
    it('handles 100 rapid calls without state corruption', () => {
      for (let i = 0; i < 100; i++) {
        const norm = 1.0 - i * 0.001
        const posSum = i * 0.5
        const posSqSum = i * i * 0.25 + i
        useDiagnosticsStore.getState().pushQwDiagnostics(norm, i, posSum, posSqSum)
      }

      const s = useDiagnosticsStore.getState().qw
      expect(s.hasData).toBe(true)
      expect(s.stepCount).toBe(99)
      expect(s.initialNorm).toBe(1.0)
      expect(Number.isFinite(s.normDrift)).toBe(true)
      expect(Number.isFinite(s.positionMean)).toBe(true)
      expect(s.positionVariance).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(s.positionVariance)).toBe(true)
    })
  })
})
