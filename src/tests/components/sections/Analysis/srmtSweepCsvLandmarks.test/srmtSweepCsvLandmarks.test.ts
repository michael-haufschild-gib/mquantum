import { describe, expect, it } from 'vitest'

import { sweepPointsToCsv } from '@/components/sections/Analysis/srmtSweepHelpers'
import type { SrmtSweepPoint } from '@/lib/physics/srmt/sweepTypes'

function mkPoint(index: number): SrmtSweepPoint {
  return {
    index,
    sweepValue: 0.1 + index * 0.1,
    cutNormalized: 0.1 + index * 0.1,
    quality: { a: 0.02, phi1: 0.3, phi2: 0.4 },
    kSpectrumByClock: {},
    hjSpectrumByClock: {},
    computeMs: 15,
  }
}

describe('sweepPointsToCsv per-point landmarks', () => {
  it('exports per-point phiRef landmarks in row columns', () => {
    const point: SrmtSweepPoint = {
      ...mkPoint(0),
      perPointLandmarks: [
        {
          kind: 'a_turn',
          clock: 'a',
          phiRef: -0.5,
          sweepValueAtLandmark: 0.42,
          absoluteCoordinate: 0.91,
        },
        {
          kind: 'phi_turn',
          clock: 'phi1',
          phiRef: -0.5,
          sweepValueAtLandmark: null,
          absoluteCoordinate: null,
        },
        {
          kind: 'phi_turn',
          clock: 'phi2',
          phiRef: -0.5,
          sweepValueAtLandmark: 0.63,
          absoluteCoordinate: 1.27,
        },
      ],
    }

    const csv = sweepPointsToCsv([point], 'phiRef', [])
    const lines = csv.trim().split('\n')
    const dataRow = lines.find((l) => l.startsWith('0,'))!
    const cells = dataRow.split(',')

    expect(cells).toHaveLength(57)
    expect(cells.slice(-6)).toEqual(['0.420000', '0.910000', '', '', '0.630000', '1.27000'])
  })
})
