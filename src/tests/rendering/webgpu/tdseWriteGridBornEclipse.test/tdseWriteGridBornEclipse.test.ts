import { describe, expect, it } from 'vitest'

import { composeTdseWriteGridShader } from '@/rendering/webgpu/passes/TDSEComputePassSetup'
import { tdseUniformsBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseUniforms.wgsl'
import { tdseWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseWriteGrid.wgsl'

describe('tdseWriteGrid Born Eclipse field view', () => {
  it('documents bornEclipse as fieldView enum 14 without moving existing views', () => {
    expect(tdseUniformsBlock).toContain('13=ctcCausalShadow, 14=bornEclipse')
  })

  it('adds a fieldView 14 branch that writes the Born Eclipse scalar', () => {
    const branchStart = tdseWriteGridBlock.indexOf('params.fieldView == 14u')
    const nextElseIf = tdseWriteGridBlock.indexOf('} else if (', branchStart + 1)
    const branchEnd = nextElseIf === -1 ? tdseWriteGridBlock.length : nextElseIf
    const branch = tdseWriteGridBlock.slice(branchStart, branchEnd)

    expect(branchStart).toBeGreaterThanOrEqual(0)
    expect(branchEnd).toBeGreaterThan(branchStart)
    expect(branch).toContain(
      'displayScalar = computeBornEclipseScalar(idx, vec2f(re, im), density, phase, &nnCoords, &invSpacings, densityGate);'
    )
  })

  it('uses PML-aware current and density-gradient finite differences', () => {
    const helperStart = tdseWriteGridBlock.indexOf('fn computeBornEclipseFlowAtSite')
    const helperEnd = tdseWriteGridBlock.indexOf('fn computeBornEclipseScalar', helperStart)
    const helperBody = tdseWriteGridBlock.slice(helperStart, helperEnd)

    expect(helperStart).toBeGreaterThanOrEqual(0)
    expect(helperBody).toContain('let pmlAxis = tdsePmlAxisActive(d);')
    expect(helperBody).toContain('if (pmlAxis && atLo)')
    expect(helperBody).toContain('} else if (pmlAxis && atHi)')
    expect(helperBody).toContain('let jd = hbarOverM * (z0.x * dIm - z0.y * dRe);')
    expect(helperBody).toContain('let gradRho = 2.0 * (z0.x * dRe + z0.y * dIm);')
    expect(helperBody).toContain('dotCurrentGradient += jd * gradRho;')
  })

  it('gates on current-gradient opposition, flow, gradient, phase band, and density', () => {
    const scalarStart = tdseWriteGridBlock.indexOf('fn computeBornEclipseScalar')
    const scalarEnd = tdseWriteGridBlock.indexOf('fn computeCtcResidualScalar', scalarStart)
    const scalarBody = tdseWriteGridBlock.slice(scalarStart, scalarEnd)

    expect(scalarStart).toBeGreaterThanOrEqual(0)
    expect(scalarBody).toContain('-flow.dotCurrentGradient / (currentMag * gradientMag + eps)')
    expect(scalarBody).toContain('let flowGate = 1.0 - exp(-currentMag / densityScale);')
    expect(scalarBody).toContain(
      'let gradientGate = 1.0 - exp(-8.0 * averageSpacing * gradientMag / densityScale);'
    )
    expect(scalarBody).toContain(
      'let phaseBand = 0.55 + 0.45 * cos(phase + 2.0 * orientation - 0.7 * params.simTime);'
    )
    expect(scalarBody).toContain('return clamp(eclipse, 0.0, 1.0) * densityGate;')
  })

  it('composes the Born Eclipse branch into TDSE write-grid shaders', () => {
    const wgsl = composeTdseWriteGridShader()
    expect(wgsl).toContain('fn computeBornEclipseScalar')
    expect(wgsl).toContain('params.fieldView == 14u')
  })
})
