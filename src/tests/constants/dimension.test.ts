import { describe, expect, it } from 'vitest'

import { MAX_DIMENSION, MIN_DIMENSION } from '@/constants/dimension'

describe('dimension constants', () => {
  it('MIN_DIMENSION is 2', () => {
    expect(MIN_DIMENSION).toBe(2)
  })

  it('MAX_DIMENSION is 11', () => {
    expect(MAX_DIMENSION).toBe(11)
  })

  it('MIN_DIMENSION < MAX_DIMENSION', () => {
    expect(MIN_DIMENSION).toBeLessThan(MAX_DIMENSION)
  })
})
