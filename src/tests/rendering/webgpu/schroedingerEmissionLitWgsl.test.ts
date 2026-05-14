import { describe, expect, it } from 'vitest'

import { emissionPostBlock } from '@/rendering/webgpu/shaders/schroedinger/volume/emissionLit.wgsl'

import { functionSlice } from './wgslTestHelpers'

describe('Schroedinger lit emission WGSL safety', () => {
  it('normalizes light vectors through a zero-length guard', () => {
    expect(emissionPostBlock).toContain('fn safeNormalizeEmission(')
    expect(emissionPostBlock).not.toContain('return normalize(-light.direction.xyz);')
    expect(emissionPostBlock).not.toContain('normalize(light.position.xyz - pos)')

    const body = functionSlice(emissionPostBlock, 'computeEmissionLit')
    expect(body).toContain('l = safeNormalizeEmission(-light.direction.xyz, -viewDir);')
    expect(body).toContain('let spotDir = safeNormalizeEmission(light.direction.xyz, viewDir);')
    expect(body).toContain('let halfVec = safeNormalizeEmission(l + n * sssJitteredDistortion, n);')
  })
})
