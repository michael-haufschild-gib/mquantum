/**
 * Tests for WGSL shader composition utility functions.
 *
 * Validates generateTextureBindings and assembleShaderBlocks.
 * These utilities feed into every shader composition path — a bug here affects all shaders.
 *
 * @module tests/rendering/webgpu/shaders/composeHelpers
 */

import { describe, expect, it } from 'vitest'

import { generateTextureBindings } from '@/rendering/webgpu/shaders/shared/compose-helpers'

describe('generateTextureBindings', () => {
  it('generates paired texture + sampler bindings', () => {
    const wgsl = generateTextureBindings(2, [{ name: 'diffuseMap' }, { name: 'normalMap' }])

    // diffuseMap at binding 0, diffuseMapSampler at binding 1
    expect(wgsl).toContain('@group(2) @binding(0) var diffuseMap: texture_2d<f32>')
    expect(wgsl).toContain('@group(2) @binding(1) var diffuseMapSampler: sampler')
    // normalMap at binding 2, normalMapSampler at binding 3
    expect(wgsl).toContain('@group(2) @binding(2) var normalMap: texture_2d<f32>')
    expect(wgsl).toContain('@group(2) @binding(3) var normalMapSampler: sampler')
  })

  it('respects startBinding offset', () => {
    const wgsl = generateTextureBindings(1, [{ name: 'tex' }], 4)
    expect(wgsl).toContain('@group(1) @binding(4) var tex')
    expect(wgsl).toContain('@group(1) @binding(5) var texSampler')
  })

  it('respects custom texture type', () => {
    const wgsl = generateTextureBindings(0, [{ name: 'depth', type: 'texture_depth_2d' }])
    expect(wgsl).toContain('var depth: texture_depth_2d')
  })
})

describe('assembleShaderBlocks', () => {
  // Dynamic import to match project pattern
  async function getAssemble() {
    const mod = await import('@/rendering/webgpu/shaders/shared/compose-helpers')
    return mod.assembleShaderBlocks
  }

  it('returns valid output for empty block list', async () => {
    const assembleShaderBlocks = await getAssemble()
    const result = assembleShaderBlocks([])
    expect(result.wgsl).toContain('Auto-generated')
    expect(result.modules).toEqual([])
  })

  it('concatenates blocks in order with section headers', async () => {
    const assembleShaderBlocks = await getAssemble()
    const result = assembleShaderBlocks([
      { name: 'defines', content: 'const X: f32 = 1.0;' },
      { name: 'main', content: '@fragment fn main() -> @location(0) vec4f { return vec4f(1.0); }' },
    ])
    expect(result.modules).toEqual(['defines', 'main'])
    expect(result.wgsl).toContain('====== defines ======')
    expect(result.wgsl).toContain('const X: f32 = 1.0;')
    expect(result.wgsl).toContain('====== main ======')
    // defines must appear before main in the output
    expect(result.wgsl.indexOf('defines')).toBeLessThan(result.wgsl.indexOf('main'))
  })

  it('skips blocks with condition === false', async () => {
    const assembleShaderBlocks = await getAssemble()
    const result = assembleShaderBlocks([
      { name: 'always', content: 'const A: f32 = 1.0;' },
      { name: 'skipped', content: 'const B: f32 = 2.0;', condition: false },
      { name: 'also-always', content: 'const C: f32 = 3.0;' },
    ])
    expect(result.modules).toEqual(['always', 'also-always'])
    expect(result.wgsl).toContain('const A')
    expect(result.wgsl).not.toContain('const B')
    expect(result.wgsl).toContain('const C')
  })

  it('includes blocks with condition === true', async () => {
    const assembleShaderBlocks = await getAssemble()
    const result = assembleShaderBlocks([
      { name: 'conditional', content: 'const X: f32 = 42.0;', condition: true },
    ])
    expect(result.modules).toEqual(['conditional'])
    expect(result.wgsl).toContain('const X: f32 = 42.0;')
  })

  it('includes blocks with condition === undefined (default)', async () => {
    const assembleShaderBlocks = await getAssemble()
    const result = assembleShaderBlocks([{ name: 'implicit', content: 'const Y: f32 = 99.0;' }])
    expect(result.modules).toEqual(['implicit'])
    expect(result.wgsl).toContain('const Y: f32 = 99.0;')
  })

  it('includes override content when target matches', async () => {
    const assembleShaderBlocks = await getAssemble()
    const result = assembleShaderBlocks(
      [
        { name: 'original', content: 'const X: f32 = 1.0;' },
        { name: 'keep', content: 'const Y: f32 = 2.0;' },
      ],
      [{ target: 'original', replacement: 'const X: f32 = 999.0;' }]
    )
    expect(result.wgsl).toContain('const X: f32 = 999.0;')
    expect(result.wgsl).not.toContain('const X: f32 = 1.0;')
    expect(result.wgsl).toContain('const Y: f32 = 2.0;')
    // Module list should still include the overridden block
    expect(result.modules).toContain('original')
  })

  it('override for non-existent target is silently ignored', async () => {
    const assembleShaderBlocks = await getAssemble()
    const result = assembleShaderBlocks(
      [{ name: 'real', content: 'fn main() {}' }],
      [{ target: 'nonexistent', replacement: 'fn fake() {}' }]
    )
    expect(result.wgsl).toContain('fn main() {}')
    expect(result.wgsl).not.toContain('fn fake() {}')
  })
})
