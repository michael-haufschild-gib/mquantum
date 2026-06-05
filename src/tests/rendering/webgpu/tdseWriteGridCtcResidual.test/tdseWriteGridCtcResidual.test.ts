import { describe, expect, it } from 'vitest'

import { composeTdseWriteGridShader } from '@/rendering/webgpu/passes/TDSEComputePassSetup'
import { tdseUniformsBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseUniforms.wgsl'
import { tdseWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseWriteGrid.wgsl'

describe('tdseWriteGrid CTC residual field view', () => {
  it('documents ctcResidual as fieldView enum 10', () => {
    expect(tdseUniformsBlock).toContain('10=ctcResidual')
  })

  it('adds a fieldView 10 branch that writes the density-gated loop residue', () => {
    const branchStart = tdseWriteGridBlock.indexOf('params.fieldView == 10u')
    const nextElseIf = tdseWriteGridBlock.indexOf('} else if (', branchStart + 1)
    const branchEnd = nextElseIf === -1 ? tdseWriteGridBlock.length : nextElseIf
    const branch = tdseWriteGridBlock.slice(branchStart, branchEnd)

    expect(branchStart).toBeGreaterThan(0)
    expect(branchEnd).toBeGreaterThan(branchStart)
    expect(branch).toContain(
      'displayScalar = computeCtcResidualScalar(idx, re, im, density, &nnCoords, densityGate);'
    )
  })

  it('guards mirror reads before sampling psi', () => {
    const fnStart = tdseWriteGridBlock.indexOf('fn sampleCtcMirror')
    const fnEnd = tdseWriteGridBlock.indexOf('fn ctcEcho', fnStart)
    const fnBody = tdseWriteGridBlock.slice(fnStart, fnEnd)
    const residualStart = tdseWriteGridBlock.indexOf('fn computeCtcResidualScalar')
    const residualEnd = tdseWriteGridBlock.indexOf('fn computeCtcLoopGainScalar', residualStart)
    const residualBody = tdseWriteGridBlock.slice(residualStart, residualEnd)

    expect(fnStart).toBeGreaterThan(0)
    expect(fnBody).toContain('if (axis >= 12u || axis >= params.latticeDim)')
    expect(fnBody).toContain('if (axisSize < 2u || (axisSize % 2u) != 0u)')
    expect(fnBody).toContain('if (coord >= axisSize)')
    expect(fnBody).toContain('if (mirrorIdxI < 0)')
    expect(fnBody).toContain('if (mirrorIdx >= params.totalSites)')
    expect(fnBody.indexOf('if (mirrorIdx >= params.totalSites)')).toBeLessThan(
      fnBody.indexOf('let z = psi[mirrorIdx];')
    )
    expect(residualBody).toContain('let mirror = sampleCtcMirror(idx, nnCoords);')
    expect(residualBody).toContain('let residueRaw =')
    expect(residualBody).toContain('return clamp(residueRaw, 0.0, 1.0) * densityGate;')
  })

  it('composes the residual branch into TDSE write-grid shaders', () => {
    const wgsl = composeTdseWriteGridShader()
    expect(wgsl).toContain('fn computeCtcResidualScalar')
    expect(wgsl).toContain('params.fieldView == 10u')
  })
})
