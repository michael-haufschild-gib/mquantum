/**
 * Error-path tests for `computeRawKSpaceData` validation.
 *
 * The existing kSpaceOccupation tests cover happy-path physics (energy
 * conservation, vacuum particle counts, cosmology adiabatic vacuum) but
 * do NOT exercise the input-validation throws. A regression that loosens
 * a guard would silently accept NaN dispersion, zero spacing, or negative
 * coefficients — values that propagate corrupted ω_k into the thermometer
 * pipeline. The source explicitly states "throw at the API boundary
 * instead of lying in the output"; these tests pin that contract.
 */

import { describe, expect, it } from 'vitest'

import { computeRawKSpaceData } from '@/lib/physics/freeScalar/kSpaceOccupation'

const PHI = new Float32Array(8)
const PI = new Float32Array(8)

describe('computeRawKSpaceData — input validation', () => {
  it('throws when dispersion is non-finite (NaN, ±Infinity)', () => {
    expect(() => computeRawKSpaceData(PHI, PI, [8], [1], 1, 1, NaN as unknown as number)).toThrow(
      /dispersion must be 'kgFloor' or a finite number/
    )
    expect(() =>
      computeRawKSpaceData(PHI, PI, [8], [1], 1, 1, Infinity as unknown as number)
    ).toThrow(/dispersion must be/)
  })

  it('accepts dispersion = "kgFloor" (sentinel, the default)', () => {
    expect(() => computeRawKSpaceData(PHI, PI, [8], [1], 1, 1, 'kgFloor')).not.toThrow()
  })

  it('accepts a finite numeric dispersion (instantaneous adiabatic vacuum)', () => {
    expect(() => computeRawKSpaceData(PHI, PI, [8], [1], 1, 1, 0.25)).not.toThrow()
    expect(() => computeRawKSpaceData(PHI, PI, [8], [1], 1, 1, -0.5)).not.toThrow()
  })

  it('throws when basisCoefs.aKinetic is non-finite or non-positive', () => {
    for (const aKinetic of [NaN, -Infinity, 0, -1]) {
      expect(() =>
        computeRawKSpaceData(PHI, PI, [8], [1], 1, 1, 'kgFloor', {
          aKinetic,
          aPotential: 1,
        })
      ).toThrow(/aKinetic must be a finite positive number/)
    }
  })

  it('throws when basisCoefs.aPotential is non-finite or non-positive', () => {
    for (const aPotential of [NaN, Infinity, 0, -2]) {
      expect(() =>
        computeRawKSpaceData(PHI, PI, [8], [1], 1, 1, 'kgFloor', {
          aKinetic: 1,
          aPotential,
        })
      ).toThrow(/aPotential must be a finite positive number/)
    }
  })

  it('throws when latticeDim is not an integer in [1, gridSize.length]', () => {
    expect(() => computeRawKSpaceData(PHI, PI, [8], [1], 1, 0)).toThrow(
      /latticeDim must be an integer/
    )
    expect(() => computeRawKSpaceData(PHI, PI, [8], [1], 1, -1)).toThrow(
      /latticeDim must be an integer/
    )
    expect(() => computeRawKSpaceData(PHI, PI, [8], [1], 1, 1.5)).toThrow(
      /latticeDim must be an integer/
    )
    // > gridSize.length: latticeDim=2 but only 1 dim provided
    expect(() => computeRawKSpaceData(PHI, PI, [8], [1], 1, 2)).toThrow(
      /latticeDim must be an integer/
    )
  })

  it('throws when spacing has fewer entries than latticeDim', () => {
    expect(() => computeRawKSpaceData(PHI, PI, [4, 2], [1], 1, 2)).toThrow(
      /spacing must provide at least 2 entries/
    )
  })

  it('throws when an active grid dimension is not a positive integer', () => {
    expect(() => computeRawKSpaceData(PHI, PI, [0], [1], 1, 1)).toThrow(
      /gridSize\[0\] must be a positive integer/
    )
    expect(() => computeRawKSpaceData(PHI, PI, [-4], [1], 1, 1)).toThrow(
      /gridSize\[0\] must be a positive integer/
    )
    expect(() => computeRawKSpaceData(PHI, PI, [4.5], [1], 1, 1)).toThrow(
      /gridSize\[0\] must be a positive integer/
    )
  })

  it('throws when an active spacing entry is non-finite or non-positive', () => {
    expect(() => computeRawKSpaceData(PHI, PI, [8], [0], 1, 1)).toThrow(
      /spacing\[0\] must be a finite positive number/
    )
    expect(() => computeRawKSpaceData(PHI, PI, [8], [-1], 1, 1)).toThrow(
      /spacing\[0\] must be a finite positive number/
    )
    expect(() => computeRawKSpaceData(PHI, PI, [8], [NaN], 1, 1)).toThrow(
      /spacing\[0\] must be a finite positive number/
    )
    expect(() => computeRawKSpaceData(PHI, PI, [8], [Infinity], 1, 1)).toThrow(
      /spacing\[0\] must be a finite positive number/
    )
  })

  it('throws when mass is non-finite', () => {
    expect(() => computeRawKSpaceData(PHI, PI, [8], [1], NaN, 1)).toThrow(/mass must be finite/)
    expect(() => computeRawKSpaceData(PHI, PI, [8], [1], Infinity, 1)).toThrow(
      /mass must be finite/
    )
  })

  it('does NOT validate inactive trailing grid dims (only active [0..latticeDim) checked)', () => {
    // Trailing dims past latticeDim can be anything — they're inactive.
    // gridSize[1] = 0 with latticeDim=1 should NOT throw.
    expect(() =>
      computeRawKSpaceData(new Float32Array(8), new Float32Array(8), [8, 0], [1, 0], 1, 1)
    ).not.toThrow()
  })
})
