/**
 * Shader source contract tests for TDSE wormhole P-CTC postselection.
 */

import { describe, expect, it } from 'vitest'

import { tdseWormholeCoupleBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseWormholeCouple.wgsl'

describe('tdseWormholeCouple P-CTC shader contract', () => {
  it('early-returns only when both wormhole coupling and CTC postselection are off', () => {
    expect(tdseWormholeCoupleBlock).toContain(
      'params.wormholeCouplingEnabled == 0u && params.ctcPostselectionEnabled == 0u'
    )
  })

  it('contains the phase-twisted fixed-point projector and pair renormalization', () => {
    expect(tdseWormholeCoupleBlock).toContain('let expMinusIphi = vec2f(cos(phi), -sin(phi));')
    expect(tdseWormholeCoupleBlock).toContain('let twistedMirror = cMul(expMinusIphi, outVP);')
    expect(tdseWormholeCoupleBlock).toContain('let consistent = 0.5 * (outV + twistedMirror);')
    expect(tdseWormholeCoupleBlock).toContain('let paradox = 0.5 * (outV - twistedMirror);')
    expect(tdseWormholeCoupleBlock).toContain('let damp = 1.0 - ctcStrength;')
    expect(tdseWormholeCoupleBlock).toContain(
      'let renorm = sqrt(max(pairNormBefore, 0.0) / max(pairNormAfter, 1e-30));'
    )
  })
})
