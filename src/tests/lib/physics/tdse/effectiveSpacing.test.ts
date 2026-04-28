import { describe, expect, it } from 'vitest'

import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'
import {
  applyTorusMetricSpacing,
  computeTdseEffectiveSpacing,
} from '@/lib/physics/tdse/effectiveSpacing'

describe('computeTdseEffectiveSpacing', () => {
  it('uses torus period as physical lattice extent', () => {
    const spacing = computeTdseEffectiveSpacing({
      ...DEFAULT_TDSE_CONFIG,
      latticeDim: 3,
      gridSize: [8, 16, 32],
      spacing: [0.1, 0.2, 0.3],
      metric: { kind: 'torus', torusPeriod: [Math.PI, 2 * Math.PI, 4] },
    })

    expect(spacing[0]).toBeCloseTo(Math.PI / 8, 8)
    expect(spacing[1]).toBeCloseTo((2 * Math.PI) / 16, 8)
    expect(spacing[2]).toBeCloseTo(4 / 32, 8)
  })

  it('preserves Kaluza-Klein compact spacing on non-torus metrics', () => {
    const spacing = computeTdseEffectiveSpacing({
      ...DEFAULT_TDSE_CONFIG,
      latticeDim: 2,
      gridSize: [10, 10],
      spacing: [0.1, 0.2],
      compactDims: [true, false],
      compactRadii: [2, 1],
      metric: { kind: 'flat' },
    })

    expect(spacing[0]).toBeCloseTo((2 * Math.PI * 2) / 10, 8)
    expect(spacing[1]).toBeCloseTo(0.2, 8)
  })

  it('clamps torus period through metric uniform bounds', () => {
    const spacing = applyTorusMetricSpacing([0.1, 0.1, 0.1], [10, 10, 10], 3, {
      kind: 'torus',
      torusPeriod: [0.001, 40, 5],
    })

    expect(spacing[0]).toBeCloseTo(0.5 / 10, 8)
    expect(spacing[1]).toBeCloseTo(20 / 10, 8)
    expect(spacing[2]).toBeCloseTo(5 / 10, 8)
  })
})
