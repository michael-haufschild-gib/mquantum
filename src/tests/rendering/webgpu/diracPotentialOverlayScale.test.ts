import { describe, expect, it } from 'vitest'

import { composeDiracWriteGridShader } from '@/rendering/webgpu/passes/DiracComputePassSetup'
import { diracWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/diracWriteGrid.wgsl'

function extractSlice(source: string, startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle)
  const end = source.indexOf(endNeedle, start + startNeedle.length)

  expect(start).toBeGreaterThanOrEqual(0)
  expect(end).toBeGreaterThan(start)

  return source.slice(start, end)
}

describe('Dirac potential overlay scaling', () => {
  it('normalizes overlay alpha through a potential-specific scale helper', () => {
    const overlayBranch = extractSlice(
      diracWriteGridBlock,
      'if (params.showPotential == 1u && params.fieldView != 3u)',
      'textureStore(outputTex'
    )

    expect(overlayBranch).toContain('abs(V) / getDiracPotentialScale()')
    expect(overlayBranch).not.toContain('abs(params.potentialStrength)')
  })

  it('does not let hidden strength leak into harmonic or Coulomb overlay scaling', () => {
    const helper = extractSlice(
      diracWriteGridBlock,
      'fn getDiracPotentialScale()',
      'fn worldToLatticeInterp'
    )
    const strengthBranch = extractSlice(
      helper,
      'params.potentialType == 1u || params.potentialType == 2u || params.potentialType == 3u',
      '} else if (params.potentialType == 4u)'
    )
    const harmonicBranch = extractSlice(
      helper,
      'params.potentialType == 4u',
      '} else if (params.potentialType == 5u)'
    )
    const coulombBranch = extractSlice(helper, 'params.potentialType == 5u', 'return 1.0')

    expect(strengthBranch).toContain('params.potentialStrength')
    expect(harmonicBranch).toContain('params.boundingRadius')
    expect(harmonicBranch).toContain('params.harmonicOmega')
    expect(harmonicBranch).not.toContain('params.potentialStrength')
    expect(coulombBranch).toContain('params.coulombZ')
    expect(coulombBranch).toContain('/ 0.05')
    expect(coulombBranch).not.toContain('params.potentialStrength')
  })

  it('composes the scale helper into the final Dirac write-grid shader', () => {
    const wgsl = composeDiracWriteGridShader(3)

    expect(wgsl).toContain('fn getDiracPotentialScale() -> f32')
    expect(wgsl).toContain('abs(V) / getDiracPotentialScale()')
  })
})
