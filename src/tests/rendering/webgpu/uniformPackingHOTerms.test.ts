import { describe, expect, it } from 'vitest'

import { SCHROEDINGER_LAYOUT } from '@/rendering/webgpu/renderers/schroedingerLayout'
import { packPrecomputedHOTerms } from '@/rendering/webgpu/renderers/uniformPackingHOTerms'
import { MAX_TERMS } from '@/rendering/webgpu/shaders/schroedinger/uniforms.wgsl'

const I = SCHROEDINGER_LAYOUT.index

function makeViews(): {
  buffer: ArrayBuffer
  floatView: Float32Array
  intView: Int32Array
} {
  const buffer = new ArrayBuffer(SCHROEDINGER_LAYOUT.totalSize)
  return {
    buffer,
    floatView: new Float32Array(buffer),
    intView: new Int32Array(buffer),
  }
}

describe('packPrecomputedHOTerms', () => {
  it('writes term_k = c_k * exp(-i E_k t) at the precomputed slot', () => {
    const { floatView, intView } = makeViews()
    intView[I.termCount] = 1
    floatView[I.energy] = 0.5
    floatView[I.coeff] = 1
    floatView[I.coeff + 1] = 0

    packPrecomputedHOTerms(floatView, intView, 2, 1)

    // phase = -E*t = -0.5 * 2 = -1
    expect(floatView[I.precomputedTerm]).toBeCloseTo(Math.cos(-1), 6)
    expect(floatView[I.precomputedTerm + 1]).toBeCloseTo(Math.sin(-1), 6)
    expect(floatView[I.precomputedTerm + 2]).toBe(0)
    expect(floatView[I.precomputedTerm + 3]).toBe(0)
  })

  it('multiplies coeff complex with exp(-i E t)', () => {
    const { floatView, intView } = makeViews()
    intView[I.termCount] = 1
    floatView[I.energy] = 1
    // c = (2, 3)
    floatView[I.coeff] = 2
    floatView[I.coeff + 1] = 3

    packPrecomputedHOTerms(floatView, intView, 1, 1)

    // (2 + 3i) * (cos(-1) + i sin(-1))
    const c = Math.cos(-1)
    const s = Math.sin(-1)
    expect(floatView[I.precomputedTerm]).toBeCloseTo(2 * c - 3 * s, 6)
    expect(floatView[I.precomputedTerm + 1]).toBeCloseTo(2 * s + 3 * c, 6)
  })

  it('multiplies time by timeScale to match shader getVolumeTime', () => {
    const a = makeViews()
    a.intView[I.termCount] = 1
    a.floatView[I.energy] = 0.7
    a.floatView[I.coeff] = 1
    packPrecomputedHOTerms(a.floatView, a.intView, 4, 0.5)

    const b = makeViews()
    b.intView[I.termCount] = 1
    b.floatView[I.energy] = 0.7
    b.floatView[I.coeff] = 1
    packPrecomputedHOTerms(b.floatView, b.intView, 2, 1)

    expect(a.floatView[I.precomputedTerm]).toBeCloseTo(b.floatView[I.precomputedTerm]!, 6)
    expect(a.floatView[I.precomputedTerm + 1]).toBeCloseTo(b.floatView[I.precomputedTerm + 1]!, 6)
  })

  it('zeros slots beyond termCount so a previous larger termCount cannot leak', () => {
    const { floatView, intView } = makeViews()
    // Pre-fill all slots with a stale signal.
    for (let k = 0; k < MAX_TERMS; k++) {
      const slot = I.precomputedTerm + k * 4
      floatView[slot] = 99
      floatView[slot + 1] = 99
      floatView[slot + 2] = 99
      floatView[slot + 3] = 99
    }
    intView[I.termCount] = 2
    floatView[I.energy] = 0
    floatView[I.energy + 1] = 0
    floatView[I.coeff] = 0.4
    floatView[I.coeff + 4] = 0.6

    packPrecomputedHOTerms(floatView, intView, 0, 1)

    // First two slots written from coeff (phase=0, exp=1)
    expect(floatView[I.precomputedTerm]).toBeCloseTo(0.4, 6)
    expect(floatView[I.precomputedTerm + 4]).toBeCloseTo(0.6, 6)
    // Remaining slots zeroed
    for (let k = 2; k < MAX_TERMS; k++) {
      const slot = I.precomputedTerm + k * 4
      expect(floatView[slot]).toBe(0)
      expect(floatView[slot + 1]).toBe(0)
      expect(floatView[slot + 2]).toBe(0)
      expect(floatView[slot + 3]).toBe(0)
    }
  })

  it('clamps termCount into [0, MAX_TERMS]', () => {
    const negCase = makeViews()
    negCase.intView[I.termCount] = -3
    // Pre-fill so we can detect bleed.
    for (let k = 0; k < MAX_TERMS; k++) {
      const slot = I.precomputedTerm + k * 4
      negCase.floatView[slot] = 7
    }
    packPrecomputedHOTerms(negCase.floatView, negCase.intView, 1, 1)
    for (let k = 0; k < MAX_TERMS; k++) {
      expect(negCase.floatView[I.precomputedTerm + k * 4]).toBe(0)
    }

    const overCase = makeViews()
    overCase.intView[I.termCount] = MAX_TERMS + 5
    // All energies zero ⇒ exp(-iEt) = 1 ⇒ term_k == coeff_k.
    for (let k = 0; k < MAX_TERMS; k++) {
      overCase.floatView[I.coeff + k * 4] = k + 1
    }
    packPrecomputedHOTerms(overCase.floatView, overCase.intView, 1, 1)
    for (let k = 0; k < MAX_TERMS; k++) {
      expect(overCase.floatView[I.precomputedTerm + k * 4]).toBeCloseTo(k + 1, 6)
    }
  })
})
