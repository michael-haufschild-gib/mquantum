import { describe, expect, it } from 'vitest'

import {
  type AtlasSweepPlan,
  runFullEtaVisibilitySweep,
  stepEtaVisibilitySweep,
  totalCells,
} from '@/lib/physics/bell/atlasSweep'
import { CLASSICAL_BOUND, TSIRELSON_BOUND } from '@/lib/physics/bell/chsh'

const BASE_PLAN: AtlasSweepPlan = {
  etaMin: 0.5,
  etaMax: 1.0,
  etaSteps: 4,
  visibilityMin: 0.5,
  visibilityMax: 1.0,
  visibilitySteps: 4,
  trialsPerCell: 4_000,
  analysisMode: 'fairSampling',
  baseSeed: 42,
}

describe('atlasSweep — basic invariants', () => {
  it('totalCells = etaSteps * visibilitySteps', () => {
    expect(totalCells(BASE_PLAN)).toBe(16)
  })

  it('cell with η=1, v=1 (top-right corner) violates CHSH', () => {
    const cell = stepEtaVisibilitySweep(
      BASE_PLAN,
      BASE_PLAN.etaSteps - 1,
      BASE_PLAN.visibilitySteps - 1
    )
    expect(cell.eta).toBeCloseTo(1, 6)
    expect(cell.visibility).toBeCloseTo(1, 6)
    expect(cell.absS).toBeGreaterThan(CLASSICAL_BOUND)
    expect(cell.absS).toBeLessThan(TSIRELSON_BOUND + 0.1)
    expect(cell.violated).toBe(true)
  })

  it('cell with v=0.5 (below Werner threshold) cannot violate', () => {
    // Bottom-right column (η=1, v=0.5): closed-form ceiling = 0.5·2√2 ≈ 1.414.
    const cell = stepEtaVisibilitySweep(BASE_PLAN, BASE_PLAN.etaSteps - 1, 0)
    expect(cell.visibility).toBeCloseTo(0.5, 6)
    expect(cell.absS).toBeLessThan(CLASSICAL_BOUND)
    expect(cell.violated).toBe(false)
  })

  it('fair-sampling at low η still produces CHSH violation for v=1', () => {
    // η=0.5, v=1 — IID detection loss preserves correlations under fair-sampling.
    const cell = stepEtaVisibilitySweep(BASE_PLAN, 0, BASE_PLAN.visibilitySteps - 1)
    expect(cell.eta).toBeCloseTo(0.5, 6)
    expect(cell.visibility).toBeCloseTo(1, 6)
    expect(cell.absS).toBeGreaterThan(CLASSICAL_BOUND)
    expect(cell.coincidenceFraction).toBeCloseTo(0.25, 1)
  })

  it('assignNonDetection mode at low η forces |S| below the classical bound', () => {
    const plan: AtlasSweepPlan = { ...BASE_PLAN, analysisMode: 'assignNonDetection' }
    const cell = stepEtaVisibilitySweep(plan, 0, BASE_PLAN.visibilitySteps - 1)
    expect(cell.absS).toBeLessThan(CLASSICAL_BOUND)
  })
})

describe('atlasSweep — full sweep', () => {
  it('runs every cell deterministically with the same plan', () => {
    const a = runFullEtaVisibilitySweep(BASE_PLAN)
    const b = runFullEtaVisibilitySweep(BASE_PLAN)
    expect(a.length).toBe(totalCells(BASE_PLAN))
    expect(a.map((c) => c.absS)).toEqual(b.map((c) => c.absS))
  })

  it('changing baseSeed gives different absS traces but same monotone structure', () => {
    const a = runFullEtaVisibilitySweep(BASE_PLAN)
    const b = runFullEtaVisibilitySweep({ ...BASE_PLAN, baseSeed: 99 })
    // Diagonally-paired cells should differ (noise) but coverage should match.
    let differing = 0
    for (let i = 0; i < a.length; i++) {
      if (Math.abs(a[i]!.absS - b[i]!.absS) > 1e-12) differing++
    }
    expect(differing).toBeGreaterThan(0)
    // Both sweeps agree that top-right corner violates.
    const last = a.length - 1
    expect(a[last]!.violated).toBe(true)
    expect(b[last]!.violated).toBe(true)
  })

  it('violation region matches physics expectations (high v + (high η OR fair-sampling))', () => {
    const plan: AtlasSweepPlan = { ...BASE_PLAN, etaSteps: 3, visibilitySteps: 3 }
    const results = runFullEtaVisibilitySweep(plan)
    // With fair sampling, every cell with v > 1/√2 should violate (any η > 0).
    // Our v grid: 0.5, 0.75, 1.0 — only v=0.75 and v=1.0 cross 0.7071.
    for (const cell of results) {
      const expectedViolate = cell.visibility > Math.SQRT1_2 + 0.01
      if (expectedViolate) {
        expect(cell.absS).toBeGreaterThan(CLASSICAL_BOUND - 0.1)
      } else {
        expect(cell.absS).toBeLessThan(CLASSICAL_BOUND)
      }
    }
  })
})
