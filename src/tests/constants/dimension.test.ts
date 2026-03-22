/**
 * Invariant tests for dimension constants.
 *
 * These verify structural constraints that, if violated, would break
 * the dimension selector UI, URL serialization, and rotation plane generation.
 */

import { describe, expect, it } from 'vitest'

import { MAX_DIMENSION, MIN_DIMENSION } from '@/constants/dimension'

describe('dimension constant invariants', () => {
  it('MIN_DIMENSION >= 2 (required for rotation planes to exist)', () => {
    // Rotation planes are formed from pairs of axes.
    // With < 2 dimensions, there are no 2-planes to rotate in.
    expect(MIN_DIMENSION).toBeGreaterThanOrEqual(2)
  })

  it('MAX_DIMENSION >= 3 (required for 3D hydrogen orbitals)', () => {
    // Hydrogen orbital visualization requires at least 3 spatial dimensions.
    expect(MAX_DIMENSION).toBeGreaterThanOrEqual(3)
  })

  it('MIN_DIMENSION < MAX_DIMENSION (range must be non-empty)', () => {
    expect(MIN_DIMENSION).toBeLessThan(MAX_DIMENSION)
  })

  it('both constants are positive integers', () => {
    expect(Number.isInteger(MIN_DIMENSION)).toBe(true)
    expect(Number.isInteger(MAX_DIMENSION)).toBe(true)
    expect(MIN_DIMENSION).toBeGreaterThan(0)
    expect(MAX_DIMENSION).toBeGreaterThan(0)
  })

  it('rotation plane count formula n*(n-1)/2 yields valid counts at boundaries', () => {
    // At MIN_DIMENSION, we need at least 1 rotation plane
    const minPlanes = (MIN_DIMENSION * (MIN_DIMENSION - 1)) / 2
    expect(minPlanes).toBeGreaterThanOrEqual(1)

    // At MAX_DIMENSION, the count should be reasonable (not cause UI overflow)
    const maxPlanes = (MAX_DIMENSION * (MAX_DIMENSION - 1)) / 2
    expect(maxPlanes).toBeLessThanOrEqual(100) // UI can handle up to ~55 planes for 11D
    expect(Number.isInteger(maxPlanes)).toBe(true)
  })
})
