import { describe, expect, it } from 'vitest'

import { composeTdseWriteGridShader } from '@/rendering/webgpu/passes/TDSEComputePassSetup'
import { tdseUniformsBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseUniforms.wgsl'
import { tdseWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseWriteGrid.wgsl'

describe('tdseWriteGrid CTC loop-gain field view', () => {
  it('documents ctcLoopGain as fieldView enum 11 without moving ctcResidual', () => {
    expect(tdseUniformsBlock).toContain('10=ctcResidual, 11=ctcLoopGain')
  })

  it('adds a fieldView 11 branch that writes the density-gated loop gain', () => {
    const branchStart = tdseWriteGridBlock.indexOf('params.fieldView == 11u')
    const nextElseIf = tdseWriteGridBlock.indexOf('} else if (', branchStart + 1)
    const branchEnd = nextElseIf === -1 ? tdseWriteGridBlock.length : nextElseIf
    const branch = tdseWriteGridBlock.slice(branchStart, branchEnd)

    expect(branchStart).toBeGreaterThan(0)
    expect(branchEnd).toBeGreaterThan(branchStart)
    expect(branch).toContain(
      'displayScalar = computeCtcLoopGainScalar(idx, re, im, density, &nnCoords, densityGate);'
    )
  })

  it('guards invalid mirror geometry and empty pairs before computing gain', () => {
    const fnStart = tdseWriteGridBlock.indexOf('fn sampleCtcMirror')
    const fnEnd = tdseWriteGridBlock.indexOf('fn ctcEcho', fnStart)
    const fnBody = tdseWriteGridBlock.slice(fnStart, fnEnd)
    const gainStart = tdseWriteGridBlock.indexOf('fn computeCtcLoopGainScalar')
    const gainEnd = tdseWriteGridBlock.indexOf('@compute', gainStart)
    const gainBody = tdseWriteGridBlock.slice(gainStart, gainEnd)

    expect(fnStart).toBeGreaterThan(0)
    expect(fnBody).toContain('if (axis >= 12u || axis >= params.latticeDim)')
    expect(fnBody).toContain('if (axisSize < 2u || (axisSize % 2u) != 0u)')
    expect(fnBody).toContain('if (coord >= axisSize)')
    expect(fnBody).toContain('if (mirrorIdxI < 0)')
    expect(fnBody).toContain('if (mirrorIdx >= params.totalSites)')
    expect(fnBody.indexOf('if (mirrorIdx >= params.totalSites)')).toBeLessThan(
      fnBody.indexOf('let z = psi[mirrorIdx];')
    )
    expect(gainBody).toContain('let mirror = sampleCtcMirror(idx, nnCoords);')
    expect(gainBody).toContain('if (density <= eps || mirror.density <= eps)')
    expect(gainBody).toContain('if (a <= 0.0)')
  })

  it('implements logarithmic chronology-horizon gain normalization', () => {
    const fnStart = tdseWriteGridBlock.indexOf('fn computeCtcLoopGainScalar')
    const fnEnd = tdseWriteGridBlock.indexOf('@compute', fnStart)
    const fnBody = tdseWriteGridBlock.slice(fnStart, fnEnd)

    expect(fnBody).toContain(
      'let phaseMismatch = theta - thetaEcho; let delta = atan2(sin(phaseMismatch), cos(phaseMismatch));'
    )
    expect(fnBody).toContain(
      'let gain = 1.0 / (1.0 + a * a - 2.0 * a * cos(delta) + eps); let resonantGain = 1.0 / ((1.0 - a) * (1.0 - a) + eps);'
    )
    expect(fnBody).toContain('let display = log(1.0 + gain) / log(1.0 + resonantGain);')
    expect(fnBody).toContain('return clamp(display, 0.0, 1.0) * densityGate;')
  })

  it('composes the loop-gain branch into TDSE write-grid shaders', () => {
    const wgsl = composeTdseWriteGridShader()
    expect(wgsl).toContain('fn computeCtcLoopGainScalar')
    expect(wgsl).toContain('params.fieldView == 11u')
  })
})
