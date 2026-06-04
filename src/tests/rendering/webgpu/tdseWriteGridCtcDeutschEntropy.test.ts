import { describe, expect, it } from 'vitest'

import { composeTdseWriteGridShader } from '@/rendering/webgpu/passes/TDSEComputePassSetup'
import { tdseUniformsBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseUniforms.wgsl'
import { tdseWriteGridBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseWriteGrid.wgsl'

describe('tdseWriteGrid CTC Deutsch entropy field view', () => {
  it('documents ctcDeutschEntropy as fieldView enum 12 without moving existing CTC views', () => {
    expect(tdseUniformsBlock).toContain(
      '10=ctcResidual, 11=ctcLoopGain, 12=ctcDeutschEntropy'
    )
  })

  it('adds a fieldView 12 branch that writes the density-gated Deutsch entropy', () => {
    const branchStart = tdseWriteGridBlock.indexOf('params.fieldView == 12u')
    const nextElseIf = tdseWriteGridBlock.indexOf('} else if (', branchStart + 1)
    const branchEnd = nextElseIf === -1 ? tdseWriteGridBlock.length : nextElseIf
    const branch = tdseWriteGridBlock.slice(branchStart, branchEnd)

    expect(branchStart).toBeGreaterThan(0)
    expect(branchEnd).toBeGreaterThan(branchStart)
    expect(branch).toContain(
      'displayScalar = computeCtcDeutschEntropyScalar(idx, re, im, density, &nnCoords, densityGate);'
    )
  })

  it('reuses guarded mirror sampling and zeroes empty mirror pairs', () => {
    const entropyStart = tdseWriteGridBlock.indexOf('fn computeCtcDeutschEntropyScalar')
    const entropyEnd = tdseWriteGridBlock.indexOf('@compute', entropyStart)
    const entropyBody = tdseWriteGridBlock.slice(entropyStart, entropyEnd)

    expect(entropyStart).toBeGreaterThan(0)
    expect(entropyBody).toContain('let mirror = sampleCtcMirror(idx, nnCoords);')
    expect(entropyBody).toContain('if (!mirror.valid) { return 0.0; }')
    expect(entropyBody).toContain('if (density <= eps || mirror.density <= eps)')
    expect(entropyBody).toContain('let echo = ctcEcho(mirror.z);')
  })

  it('implements balanced mirror-pair paradox entropy', () => {
    const entropyStart = tdseWriteGridBlock.indexOf('fn computeCtcDeutschEntropyScalar')
    const entropyEnd = tdseWriteGridBlock.indexOf('@compute', entropyStart)
    const entropyBody = tdseWriteGridBlock.slice(entropyStart, entropyEnd)

    expect(entropyBody).toContain(
      'let delta = atan2(sin(phaseMismatch), cos(phaseMismatch));'
    )
    expect(entropyBody).toContain(
      'let balance = 4.0 * density * mirror.density / (denom * denom);'
    )
    expect(entropyBody).toContain('let phaseParadox = 0.5 * (1.0 - cos(delta));')
    expect(entropyBody).toContain(
      'let feedback = clamp(params.ctcPostselectionStrength, 0.0, 1.0);'
    )
    expect(entropyBody).toContain(
      'let display = clamp(feedback * balance * phaseParadox, 0.0, 1.0);'
    )
    expect(entropyBody).toContain('return display * densityGate;')
  })

  it('composes the entropy branch into TDSE write-grid shaders', () => {
    const wgsl = composeTdseWriteGridShader()
    expect(wgsl).toContain('fn computeCtcDeutschEntropyScalar')
    expect(wgsl).toContain('params.fieldView == 12u')
  })
})
