import { describe, expect, it } from 'vitest'
import {
  normDriftFromHistory,
  computeReflectionTransmission,
  TdseDiagnosticsHistory,
  type TdseDiagnosticsSnapshot,
} from '@/lib/physics/tdse/diagnostics'

describe('normDriftFromHistory', () => {
  it('returns 0 for empty history', () => {
    expect(normDriftFromHistory([])).toBe(0)
  })

  it('returns 0 for single-entry history', () => {
    const history: TdseDiagnosticsSnapshot[] = [
      { simTime: 0, totalNorm: 1.0, maxDensity: 0.5, normDrift: 0, normLeft: 0.5, normRight: 0.5, R: 0.5, T: 0.5 },
    ]
    expect(normDriftFromHistory(history)).toBe(0)
  })

  it('computes correct fractional drift for increasing norm', () => {
    const history: TdseDiagnosticsSnapshot[] = [
      { simTime: 0, totalNorm: 1.0, maxDensity: 0.5, normDrift: 0, normLeft: 0.5, normRight: 0.5, R: 0.5, T: 0.5 },
      { simTime: 1, totalNorm: 1.05, maxDensity: 0.5, normDrift: 0.05, normLeft: 0.5, normRight: 0.55, R: 0.476, T: 0.524 },
    ]
    expect(normDriftFromHistory(history)).toBeCloseTo(0.05)
  })

  it('computes correct fractional drift for decreasing norm (absorber)', () => {
    const history: TdseDiagnosticsSnapshot[] = [
      { simTime: 0, totalNorm: 1.0, maxDensity: 0.5, normDrift: 0, normLeft: 0.5, normRight: 0.5, R: 0.5, T: 0.5 },
      { simTime: 0.5, totalNorm: 0.98, maxDensity: 0.45, normDrift: -0.02, normLeft: 0.49, normRight: 0.49, R: 0.5, T: 0.5 },
      { simTime: 1, totalNorm: 0.95, maxDensity: 0.4, normDrift: -0.05, normLeft: 0.475, normRight: 0.475, R: 0.5, T: 0.5 },
    ]
    expect(normDriftFromHistory(history)).toBeCloseTo(-0.05)
  })

  it('returns 0 when initial norm is 0', () => {
    const history: TdseDiagnosticsSnapshot[] = [
      { simTime: 0, totalNorm: 0, maxDensity: 0, normDrift: 0, normLeft: 0, normRight: 0, R: 0, T: 0 },
      { simTime: 1, totalNorm: 0.5, maxDensity: 0.3, normDrift: 0, normLeft: 0.25, normRight: 0.25, R: 0.5, T: 0.5 },
    ]
    expect(normDriftFromHistory(history)).toBe(0)
  })
})

describe('computeReflectionTransmission', () => {
  it('returns R=0, T=0 for zero norm', () => {
    const { R, T } = computeReflectionTransmission(0, 0)
    expect(R).toBe(0)
    expect(T).toBe(0)
  })

  it('computes correct R and T for symmetric case', () => {
    const { R, T } = computeReflectionTransmission(0.5, 0.5)
    expect(R).toBeCloseTo(0.5)
    expect(T).toBeCloseTo(0.5)
  })

  it('R + T equals 1 for arbitrary case', () => {
    const { R, T } = computeReflectionTransmission(0.3, 0.7)
    expect(R + T).toBeCloseTo(1.0)
  })

  it('computes correct coefficients for tunneling scenario', () => {
    const { R, T } = computeReflectionTransmission(0.8, 0.15)
    expect(R).toBeCloseTo(0.8 / 0.95)
    expect(T).toBeCloseTo(0.15 / 0.95)
  })
})

describe('TdseDiagnosticsHistory', () => {
  it('starts empty', () => {
    const h = new TdseDiagnosticsHistory()
    expect(h.length).toBe(0)
    expect(h.getLatest()).toBeNull()
    expect(h.getHistory()).toHaveLength(0)
  })

  it('stores and retrieves snapshots', () => {
    const h = new TdseDiagnosticsHistory()
    h.push({ simTime: 0, totalNorm: 1.0, maxDensity: 0.5, normDrift: 0, normLeft: 0.5, normRight: 0.5, R: 0.5, T: 0.5 })
    h.push({ simTime: 0.1, totalNorm: 0.99, maxDensity: 0.48, normDrift: -0.01, normLeft: 0.495, normRight: 0.495, R: 0.5, T: 0.5 })

    expect(h.length).toBe(2)
    expect(h.getLatest()!.simTime).toBe(0.1)
    expect(h.getLatest()!.totalNorm).toBe(0.99)
  })

  it('evicts oldest entries at capacity', () => {
    const h = new TdseDiagnosticsHistory(3)
    h.push({ simTime: 0, totalNorm: 1.0, maxDensity: 0.5, normDrift: 0, normLeft: 0.5, normRight: 0.5, R: 0.5, T: 0.5 })
    h.push({ simTime: 1, totalNorm: 0.99, maxDensity: 0.49, normDrift: -0.01, normLeft: 0.495, normRight: 0.495, R: 0.5, T: 0.5 })
    h.push({ simTime: 2, totalNorm: 0.98, maxDensity: 0.48, normDrift: -0.02, normLeft: 0.49, normRight: 0.49, R: 0.5, T: 0.5 })
    h.push({ simTime: 3, totalNorm: 0.97, maxDensity: 0.47, normDrift: -0.03, normLeft: 0.485, normRight: 0.485, R: 0.5, T: 0.5 })

    expect(h.length).toBe(3)
    expect(h.getHistory()[0]!.simTime).toBe(1) // oldest evicted
    expect(h.getLatest()!.simTime).toBe(3)
  })

  it('stores no snapshots when capacity is 0', () => {
    const h = new TdseDiagnosticsHistory(0)
    h.push({ simTime: 0, totalNorm: 1.0, maxDensity: 0.5, normDrift: 0, normLeft: 0.5, normRight: 0.5, R: 0.5, T: 0.5 })

    expect(h.length).toBe(0)
    expect(h.getLatest()).toBeNull()
    expect(h.getHistory()).toHaveLength(0)
  })

  it('computes norm drift from history', () => {
    const h = new TdseDiagnosticsHistory()
    h.push({ simTime: 0, totalNorm: 1.0, maxDensity: 0.5, normDrift: 0, normLeft: 0.5, normRight: 0.5, R: 0.5, T: 0.5 })
    h.push({ simTime: 1, totalNorm: 1.02, maxDensity: 0.5, normDrift: 0.02, normLeft: 0.51, normRight: 0.51, R: 0.5, T: 0.5 })
    expect(h.getNormDrift()).toBeCloseTo(0.02)
  })

  it('clears all entries', () => {
    const h = new TdseDiagnosticsHistory()
    h.push({ simTime: 0, totalNorm: 1.0, maxDensity: 0.5, normDrift: 0, normLeft: 0.5, normRight: 0.5, R: 0.5, T: 0.5 })
    h.clear()
    expect(h.length).toBe(0)
    expect(h.getLatest()).toBeNull()
  })
})
