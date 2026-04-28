import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const evolutionSource = readFileSync(
  resolve(HERE, '../../../../..', 'src/rendering/webgpu/passes/TDSEComputePassEvolution.ts'),
  'utf-8'
)

describe('TDSE torus absorber contract', () => {
  it('suppresses PML absorber dispatch for periodic torus metrics', () => {
    expect(evolutionSource).toContain(
      "const absorberEnabled = config.absorberEnabled === true && metricKind !== 'torus'"
    )
    expect(evolutionSource).not.toContain('config.absorberEnabled && !stochasticActive')
    expect(evolutionSource).not.toContain('config.absorberEnabled && stochasticActive')
  })
})
