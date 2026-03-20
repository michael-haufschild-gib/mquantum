/**
 * Tests for WGSL shader composition utility functions.
 *
 * Validates processFeatureFlags, generateStandardBindGroups, generateTextureBindings.
 * These utilities feed into every shader composition path — a bug here affects all shaders.
 *
 * @module tests/rendering/webgpu/shaders/composeHelpers
 */

import { describe, expect, it } from 'vitest'

import {
  generateStandardBindGroups,
  generateTextureBindings,
  processFeatureFlags,
} from '@/rendering/webgpu/shaders/shared/compose-helpers'

describe('processFeatureFlags', () => {
  it('generates DIMENSION define from config', () => {
    const result = processFeatureFlags({ dimension: 7 })
    expect(result.defines).toContain('const DIMENSION: i32 = 7;')
  })

  it('defaults temporal and sss to false', () => {
    const result = processFeatureFlags({ dimension: 3 })
    expect(result.defines).toContain('const TEMPORAL_ENABLED: bool = false;')
    expect(result.defines).toContain('const SSS_ENABLED: bool = false;')
    expect(result.features.temporal).toBe(false)
    expect(result.features.sss).toBe(false)
  })

  it('enables temporal when config.temporal = true', () => {
    const result = processFeatureFlags({ dimension: 3, temporal: true })
    expect(result.defines).toContain('const TEMPORAL_ENABLED: bool = true;')
    expect(result.features.temporal).toBe(true)
  })

  it('enables sss when config.sss = true', () => {
    const result = processFeatureFlags({ dimension: 3, sss: true })
    expect(result.defines).toContain('const SSS_ENABLED: bool = true;')
    expect(result.features.sss).toBe(true)
  })
})

describe('generateStandardBindGroups', () => {
  it('produces WGSL with 4 bind groups (0-3)', () => {
    const wgsl = generateStandardBindGroups()
    expect(wgsl).toContain('@group(0) @binding(0)')
    expect(wgsl).toContain('@group(1) @binding(0)')
    expect(wgsl).toContain('@group(2) @binding(0)')
    expect(wgsl).toContain('@group(3) @binding(0)')
    expect(wgsl).toContain('CameraUniforms')
    expect(wgsl).toContain('LightingUniforms')
  })
})

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
