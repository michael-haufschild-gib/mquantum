import { describe, expect, it } from 'vitest'

import {
  applySharedPml,
  computeLatticeBoundingRadius,
} from '@/rendering/webgpu/renderers/strategies/computeGridUtils'

describe('computeLatticeBoundingRadius', () => {
  it('computes half-extent with 1.15x margin for 3D grid', () => {
    // 32 * 0.1 = 3.2 per dimension
    const radius = computeLatticeBoundingRadius(3, [32, 32, 32], [0.1, 0.1, 0.1])
    expect(radius).toBeCloseTo((3.2 / 2) * 1.15, 5)
  })

  it('uses largest dimension extent', () => {
    // dim 0: 64*0.1=6.4, dim 1: 32*0.1=3.2, dim 2: 32*0.2=6.4 — max is 6.4
    const radius = computeLatticeBoundingRadius(3, [64, 32, 32], [0.1, 0.1, 0.2])
    expect(radius).toBeCloseTo((6.4 / 2) * 1.15, 5)
  })

  it('falls back to default extent when all extents are zero', () => {
    const radius = computeLatticeBoundingRadius(3, [0, 0, 0], [0, 0, 0])
    // maxExtent fallback = 3.2
    expect(radius).toBeCloseTo((3.2 / 2) * 1.15, 5)
  })

  it('uses default values for missing grid/spacing entries', () => {
    const radius = computeLatticeBoundingRadius(3, [], [])
    // Defaults: (32 * 0.1) = 3.2
    expect(radius).toBeCloseTo((3.2 / 2) * 1.15, 5)
  })

  it('handles single-dimension lattice', () => {
    const radius = computeLatticeBoundingRadius(1, [128], [0.05])
    // 128 * 0.05 = 6.4
    expect(radius).toBeCloseTo((6.4 / 2) * 1.15, 5)
  })
})

describe('applySharedPml', () => {
  it('overrides mode-specific PML with shared values', () => {
    const config = { absorberEnabled: true, absorberWidth: 0.1, pmlTargetReflection: 1e-4 }
    const shared = { absorberEnabled: false, absorberWidth: 0.2, pmlTargetReflection: 1e-6 }
    const result = applySharedPml(config, shared)
    expect(result.absorberEnabled).toBe(false)
    expect(result.absorberWidth).toBe(0.2)
    expect(result.pmlTargetReflection).toBe(1e-6)
  })

  it('preserves mode-specific values when shared is undefined', () => {
    const config = { absorberEnabled: true, absorberWidth: 0.15, pmlTargetReflection: 1e-5 }
    const result = applySharedPml(config, undefined)
    expect(result.absorberEnabled).toBe(true)
    expect(result.absorberWidth).toBe(0.15)
    expect(result.pmlTargetReflection).toBe(1e-5)
  })

  it('preserves extra config fields', () => {
    const config = { absorberEnabled: true, absorberWidth: 0.1, dt: 0.01, mass: 1.0 }
    const result = applySharedPml(config, { absorberEnabled: false })
    expect(result.absorberEnabled).toBe(false)
    expect(result.dt).toBe(0.01)
    expect(result.mass).toBe(1.0)
  })

  it('per-mode disable overrides shared enable (AND logic)', () => {
    const config = { absorberEnabled: false, absorberWidth: 0.2, pmlTargetReflection: 1e-6 }
    const shared = { absorberEnabled: true, absorberWidth: 0.3, pmlTargetReflection: 1e-8 }
    const result = applySharedPml(config, shared)
    expect(result.absorberEnabled).toBe(false)
    // Width/reflection still use shared override (non-boolean fields)
    expect(result.absorberWidth).toBe(0.3)
    expect(result.pmlTargetReflection).toBe(1e-8)
  })

  it('both enabled → absorber on', () => {
    const config = { absorberEnabled: true }
    const shared = { absorberEnabled: true }
    const result = applySharedPml(config, shared)
    expect(result.absorberEnabled).toBe(true)
  })
})
