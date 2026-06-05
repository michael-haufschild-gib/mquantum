import { describe, expect, it } from 'vitest'

import {
  MAX_WIGNER_MATRIX_ENTRIES,
  wignerFromRDM,
  wignerNegativityFromRDM,
} from '@/lib/physics/wigner/wignerFromRDM'

describe('wignerFromRDM', () => {
  it('computes a finite phase-space grid for a localized pure state', () => {
    const M = 2
    const rhoRe = new Float64Array([1, 0, 0, 0])
    const rhoIm = new Float64Array(4)

    const result = wignerFromRDM(rhoRe, rhoIm, M)

    expect(result.wigner).toHaveLength(M * M)
    expect(result.negativity).toBe(0)
    expect(wignerNegativityFromRDM(rhoRe, rhoIm, M)).toBe(result.negativity)
    expect([...result.wigner].every(Number.isFinite)).toBe(true)
  })

  it('rejects invalid dimensions and undersized buffers', () => {
    const rhoRe = new Float64Array(1)
    const rhoIm = new Float64Array(1)

    for (const M of [0, -1, 1.5, Number.NaN]) {
      expect(() => wignerFromRDM(rhoRe, rhoIm, M)).toThrow(/positive safe integer/)
    }
    expect(() => wignerFromRDM(rhoRe, rhoIm, 2)).toThrow(/buffer too small/)
  })

  it('rejects over-budget RDM matrices before input buffer allocation', () => {
    const rhoRe = new Float64Array(1)
    const rhoIm = new Float64Array(1)
    const overBudgetM = Math.floor(Math.sqrt(MAX_WIGNER_MATRIX_ENTRIES)) + 1

    expect(() => wignerFromRDM(rhoRe, rhoIm, overBudgetM)).toThrow(/M\*M exceeds/)
    expect(() => wignerNegativityFromRDM(rhoRe, rhoIm, overBudgetM)).toThrow(/M\*M exceeds/)
  })
})
