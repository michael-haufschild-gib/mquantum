import { describe, expect, it } from 'vitest'

import {
  computeHermiteCocycleInflation,
  type HermiteCocycleInflationInput,
} from '@/lib/physics/harmonicOscillator/hermiteCocycleInflation'

const baseInput: HermiteCocycleInflationInput = {
  xND: [0.72, 0.41, -0.26, 0.35],
  dimension: 4,
  quantumNumbers: [1, 2, 3, 1],
  termIndex: 2,
  enabled: true,
  strength: 1.4,
  shellRadius: 0.9,
  twist: 0.65,
}

describe('computeHermiteCocycleInflation', () => {
  it('returns exact identity phase when disabled or strength is nonpositive', () => {
    expect(computeHermiteCocycleInflation({ ...baseInput, enabled: false })).toEqual({
      shellGate: 0,
      obstruction: 0,
      phase: 0,
    })
    expect(computeHermiteCocycleInflation({ ...baseInput, strength: 0 })).toEqual({
      shellGate: 0,
      obstruction: 0,
      phase: 0,
    })
    expect(computeHermiteCocycleInflation({ ...baseInput, strength: -4 })).toEqual({
      shellGate: 0,
      obstruction: 0,
      phase: 0,
    })
  })

  it('keeps phase finite and bounded after unsafe input sanitization and strength clamping', () => {
    const result = computeHermiteCocycleInflation({
      ...baseInput,
      xND: [Number.NaN, Number.POSITIVE_INFINITY, -0.1, Number.NEGATIVE_INFINITY],
      dimension: Number.POSITIVE_INFINITY,
      quantumNumbers: [999, Number.NaN, 4, 3],
      termIndex: Number.NaN,
      strength: 999,
      shellRadius: Number.NaN,
      twist: Number.POSITIVE_INFINITY,
    })

    expect(Number.isFinite(result.shellGate)).toBe(true)
    expect(Number.isFinite(result.obstruction)).toBe(true)
    expect(Number.isFinite(result.phase)).toBe(true)
    expect(result.shellGate).toBeGreaterThanOrEqual(0)
    expect(result.shellGate).toBeLessThanOrEqual(1)
    expect(result.obstruction).toBeGreaterThanOrEqual(-1)
    expect(result.obstruction).toBeLessThanOrEqual(1)
    expect(result.phase).toBeGreaterThanOrEqual(-2)
    expect(result.phase).toBeLessThanOrEqual(2)
  })

  it('peaks the shell gate near shellRadius and fades at center and far field', () => {
    const center = computeHermiteCocycleInflation({
      ...baseInput,
      xND: [0, 0, 0, 0.35],
    })
    const shell = computeHermiteCocycleInflation({
      ...baseInput,
      xND: [baseInput.shellRadius, 0, 0, 0.35],
    })
    const far = computeHermiteCocycleInflation({
      ...baseInput,
      xND: [3.6 * baseInput.shellRadius, 0, 0, 0.35],
    })

    expect(shell.shellGate).toBeGreaterThan(0.9)
    expect(shell.shellGate).toBeGreaterThan(center.shellGate + 0.5)
    expect(shell.shellGate).toBeGreaterThan(far.shellGate + 0.5)
    expect(Math.abs(shell.phase)).toBeGreaterThan(Math.abs(center.phase))
  })

  it('gives different local phases for different Hermite quantum-number branches', () => {
    const branchA = computeHermiteCocycleInflation({
      ...baseInput,
      quantumNumbers: [0, 1, 2, 1],
    })
    const branchB = computeHermiteCocycleInflation({
      ...baseInput,
      quantumNumbers: [3, 1, 0, 1],
    })

    expect(Math.abs(branchA.phase - branchB.phase)).toBeGreaterThan(0.02)
  })

  it('uses the fourth coordinate only when dimension is at least 4', () => {
    const threeDimA = computeHermiteCocycleInflation({
      ...baseInput,
      dimension: 3,
      xND: [0.72, 0.41, -0.26, -0.8],
    })
    const threeDimB = computeHermiteCocycleInflation({
      ...baseInput,
      dimension: 3,
      xND: [0.72, 0.41, -0.26, 0.9],
    })
    const fourDimA = computeHermiteCocycleInflation({
      ...baseInput,
      dimension: 4,
      xND: [0.72, 0.41, -0.26, -0.8],
    })
    const fourDimB = computeHermiteCocycleInflation({
      ...baseInput,
      dimension: 4,
      xND: [0.72, 0.41, -0.26, 0.9],
    })

    expect(threeDimA.phase).toBeCloseTo(threeDimB.phase, 12)
    expect(Math.abs(fourDimA.phase - fourDimB.phase)).toBeGreaterThan(0.02)
  })

  it('changes the obstruction phase when twist changes', () => {
    const untwisted = computeHermiteCocycleInflation({ ...baseInput, twist: 0 })
    const twisted = computeHermiteCocycleInflation({ ...baseInput, twist: 1.2 })

    expect(Math.abs(twisted.phase - untwisted.phase)).toBeGreaterThan(0.02)
    expect(Math.abs(twisted.obstruction - untwisted.obstruction)).toBeGreaterThan(0.02)
  })

  it('matches production clamp domains for shell radius and twist', () => {
    const lowRadius = computeHermiteCocycleInflation({
      ...baseInput,
      xND: [0.1, 0, 0, 0],
      shellRadius: -1,
    })
    const clampedLowRadius = computeHermiteCocycleInflation({
      ...baseInput,
      xND: [0.1, 0, 0, 0],
      shellRadius: 0.1,
    })
    const highRadius = computeHermiteCocycleInflation({
      ...baseInput,
      xND: [2, 0, 0, 0],
      shellRadius: 99,
    })
    const clampedHighRadius = computeHermiteCocycleInflation({
      ...baseInput,
      xND: [2, 0, 0, 0],
      shellRadius: 2,
    })
    const highTwist = computeHermiteCocycleInflation({ ...baseInput, twist: 99 })
    const clampedHighTwist = computeHermiteCocycleInflation({ ...baseInput, twist: 8 })

    expect(lowRadius.phase).toBeCloseTo(clampedLowRadius.phase, 12)
    expect(lowRadius.shellGate).toBeCloseTo(clampedLowRadius.shellGate, 12)
    expect(highRadius.phase).toBeCloseTo(clampedHighRadius.phase, 12)
    expect(highRadius.shellGate).toBeCloseTo(clampedHighRadius.shellGate, 12)
    expect(highTwist.phase).toBeCloseTo(clampedHighTwist.phase, 12)
    expect(highTwist.obstruction).toBeCloseTo(clampedHighTwist.obstruction, 12)
  })
})
