import { describe, expect, it } from 'vitest'

import { composeTdseWriteGridShader } from '@/rendering/webgpu/passes/TDSEComputePassSetup'
import { tdseUniformsBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseUniforms.wgsl'
import { tdseWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseWriteGrid.wgsl'

describe('tdseWriteGrid CTC causal-shadow field view', () => {
  it('documents ctcCausalShadow as fieldView enum 13 without moving existing CTC views', () => {
    expect(tdseUniformsBlock).toContain(
      '10=ctcResidual, 11=ctcLoopGain, 12=ctcDeutschEntropy, 13=ctcCausalShadow'
    )
  })

  it('adds a fieldView 13 branch that writes the causal-shadow scalar', () => {
    const branchStart = tdseWriteGridBlock.indexOf('params.fieldView == 13u')
    const nextElseIf = tdseWriteGridBlock.indexOf('} else if (', branchStart + 1)
    const branchEnd = nextElseIf === -1 ? tdseWriteGridBlock.length : nextElseIf
    const branch = tdseWriteGridBlock.slice(branchStart, branchEnd)

    expect(branchStart).toBeGreaterThan(0)
    expect(branchEnd).toBeGreaterThan(branchStart)
    expect(branch).toContain(
      'displayScalar = computeCtcCausalShadowScalar(idx, re, im, density, &nnCoords, &invSpacings, densityGate);'
    )
  })

  it('reuses guarded mirror sampling and samples current at the mirror site', () => {
    const shadowStart = tdseWriteGridBlock.indexOf('fn computeCtcCausalShadowScalar')
    const shadowEnd = tdseWriteGridBlock.indexOf('@compute', shadowStart)
    const shadowBody = tdseWriteGridBlock.slice(shadowStart, shadowEnd)

    expect(shadowStart).toBeGreaterThan(0)
    expect(shadowBody).toContain('let mirror = sampleCtcMirror(idx, nnCoords);')
    expect(shadowBody).toContain('if (!mirror.valid) { return 0.0; }')
    expect(shadowBody).toContain('mirrorCoords[axis] = params.gridSize[axis] - 1u - (*nnCoords)[axis];')
    expect(shadowBody).toContain(
      'let localJ = computeProbabilityCurrentAtSite(idx, vec2f(re, im), nnCoords, invSpacings);'
    )
    expect(shadowBody).toContain(
      'let mirrorJ = computeProbabilityCurrentAtSite(mirror.idx, mirror.z, &mirrorCoords, invSpacings);'
    )
  })

  it('implements current opposition, balance, phase coherence, and feedback gates', () => {
    const shadowStart = tdseWriteGridBlock.indexOf('fn computeCtcCausalShadowScalar')
    const shadowEnd = tdseWriteGridBlock.indexOf('@compute', shadowStart)
    const shadowBody = tdseWriteGridBlock.slice(shadowStart, shadowEnd)

    expect(shadowBody).toContain('if (density <= eps || mirror.density <= eps || feedback <= eps)')
    expect(shadowBody).toContain('if (localMag <= eps || mirrorMag <= eps) { return 0.0; }')
    expect(shadowBody).toContain('let phaseCoherence = 0.5 * (1.0 + cos(delta));')
    expect(shadowBody).toContain('let jmLocal = mirrorJ[d2] * select(1.0, -1.0, d2 == axis);')
    expect(shadowBody).toContain('let opposing = clamp(-dotJ / (localMag * mirrorMag + eps), 0.0, 1.0);')
    expect(shadowBody).toContain(
      'let balanceJ = 2.0 * min(localMag, mirrorMag) / (localMag + mirrorMag + eps);'
    )
    expect(shadowBody).toContain(
      'let display = clamp(feedback * balanceJ * opposing * phaseCoherence, 0.0, 1.0);'
    )
    expect(shadowBody).toContain('return display * densityGate;')
  })

  it('uses the same PML-aware finite-difference current pattern as current field view', () => {
    const helperStart = tdseWriteGridBlock.indexOf('fn computeProbabilityCurrentAtSite')
    const helperEnd = tdseWriteGridBlock.indexOf('fn computeCtcResidualScalar', helperStart)
    const helperBody = tdseWriteGridBlock.slice(helperStart, helperEnd)

    expect(helperStart).toBeGreaterThan(0)
    expect(helperBody).toContain('let pmlAxis = tdsePmlAxisActive(d);')
    expect(helperBody).toContain('if (pmlAxis && atLo)')
    expect(helperBody).toContain('} else if (pmlAxis && atHi)')
    expect(helperBody).toContain('let fwdIdx = select(idx + stride, idx - stride * (Nd - 1u), atHi);')
    expect(helperBody).toContain('current[d] = hbarOverM * (z0.x * dIm - z0.y * dRe);')
  })

  it('composes the causal-shadow branch into TDSE write-grid shaders', () => {
    const wgsl = composeTdseWriteGridShader()
    expect(wgsl).toContain('fn computeCtcCausalShadowScalar')
    expect(wgsl).toContain('params.fieldView == 13u')
  })
})
