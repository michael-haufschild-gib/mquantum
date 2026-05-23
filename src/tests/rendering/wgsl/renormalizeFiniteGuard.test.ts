import { describe, expect, it } from 'vitest'

import { composeDiracRenormalizeShader } from '@/rendering/webgpu/passes/DiracComputePassSetup'
import {
  isFinitePositiveNorm,
  MAX_SAFE_RENORMALIZE_NORM,
} from '@/rendering/webgpu/passes/normalizationGuards'
import { composePauliRenormalizeShader } from '@/rendering/webgpu/passes/PauliComputePassSetup'
import { composeTdseRenormalizeShader } from '@/rendering/webgpu/passes/TDSEComputePassSetup'
import { renormalizeBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/renormalize.wgsl'

describe('renormalize shader finite norm guards', () => {
  const shaders = [
    ['tdse vec2', composeTdseRenormalizeShader()],
    ['dirac vec2', composeDiracRenormalizeShader()],
    ['pauli vec2', composePauliRenormalizeShader()],
    ['legacy split', renormalizeBlock],
  ] as const

  it.each(shaders)('%s skips non-finite or catastrophically large norms', (_label, shader) => {
    expect(shader).toContain('fn isSafeRenormNorm')
    expect(shader).toContain('RENORM_MAX_SAFE_NORM')
    expect(shader).toContain('!isSafeRenormNorm(currentNorm)')
    expect(shader).toContain('!isSafeRenormNorm(targetNorm)')
    expect(shader).not.toContain('currentNorm != currentNorm')
  })

  it('CPU readback guard matches the shader finite-positive norm contract', () => {
    expect(isFinitePositiveNorm(1)).toBe(true)
    expect(isFinitePositiveNorm(1e20)).toBe(true)
    expect(isFinitePositiveNorm(0)).toBe(false)
    expect(isFinitePositiveNorm(Number.NaN)).toBe(false)
    expect(isFinitePositiveNorm(Number.POSITIVE_INFINITY)).toBe(false)
    expect(isFinitePositiveNorm(MAX_SAFE_RENORMALIZE_NORM)).toBe(false)
  })
})
