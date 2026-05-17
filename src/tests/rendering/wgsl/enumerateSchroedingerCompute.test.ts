import { describe, expect, it } from 'vitest'

import { enumerateSchroedingerCompute } from './enumerateSchroedingerCompute'

describe('enumerateSchroedingerCompute', () => {
  it('covers TDSE 3D kinetic shader built by the runtime pipeline setup', () => {
    const labels = [...enumerateSchroedingerCompute()].map((record) => record.label)

    expect(labels).toContain('compute_tdse-kinetic-3d')
  })
})
