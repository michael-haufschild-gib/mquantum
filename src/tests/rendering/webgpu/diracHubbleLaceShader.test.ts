import { describe, expect, it } from 'vitest'

import { composeDiracWriteGridShader } from '@/rendering/webgpu/passes/DiracComputePassSetup'
import { diracUniformsBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/diracUniforms.wgsl'
import { diracWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/diracWriteGrid.wgsl'

describe('Dirac Hubble Lace field view', () => {
  it('documents hubbleLace as append-only fieldView enum 9', () => {
    expect(diracUniformsBlock).toContain('8=cliffordBloom, 9=hubbleLace')
  })

  it('adds a fieldView 9 branch for spin-current Hubble lace aperture', () => {
    const branchStart = diracWriteGridBlock.indexOf('params.fieldView == 9u')
    const branchEnd = diracWriteGridBlock.indexOf('} else if (params.fieldView == 6u)', branchStart)
    const branch = diracWriteGridBlock.slice(branchStart, branchEnd)

    expect(branchStart).toBeGreaterThan(0)
    expect(branchEnd).toBeGreaterThan(branchStart)
    expect(branch).toContain('let pairBalance = clamp(')
    expect(branch).toContain('4.0 * upperDensity * lowerDensity / (sectorDenom * sectorDenom)')
    expect(branch).toContain('var currentVec = vec3f(0.0);')
    expect(branch).toContain('var spinVec = vec3f(0.0);')
    expect(branch).toContain('let signedHelicity = select(')
    expect(branch).toContain('let helicityAlignment = pow(abs(signedHelicity), 0.65);')
    expect(branch).toContain('let radialShell = radialShell4 * radialShell4;')
    expect(branch).toContain('let bulk4DGate = select(')
    expect(branch).toContain('params.latticeDim > 3u')
    expect(branch).toContain('let phaseLace = 0.08 + 0.92 * lace2 * lace2;')
    expect(branch).toContain('phaseForColor = huePhase + DIRAC_WG_PI;')
  })

  it('composes the Hubble Lace branch into Dirac write-grid shaders', () => {
    const wgsl = composeDiracWriteGridShader(4)

    expect(wgsl).toContain('params.fieldView == 9u')
    expect(wgsl).toContain('let pairBalance = clamp(')
    expect(wgsl).toContain('let helicityAlignment = pow(abs(signedHelicity), 0.65);')
    expect(wgsl).toContain('let bulk4DGate = select(')
    expect(wgsl).toContain(
      'textureStore(outputTex, gid, vec4f(normDisplay, logDensity, phaseForColor, alphaChannel));'
    )
  })
})
