/**
 * QualityUniforms struct layout validation.
 *
 * The TypeScript layout (`QUALITY_UNIFORMS_LAYOUT`) is the source of truth
 * for byte offsets used by `uniformPackingSupport.ts::packQualityUniforms`.
 * The WGSL struct in `shared/core/uniforms.wgsl.ts::uniformsBlock` is the
 * source of truth for what the shader reads. If these two drift the shader
 * silently reads garbage from the wrong slot and SDF raymarching breaks.
 *
 * This test parses the WGSL `QualityUniforms` struct text out of the
 * composed `uniformsBlock` (the struct itself is not exported individually)
 * and asserts that:
 * 1. Every WGSL field has a matching TypeScript field (same name, order).
 * 2. Every field's WGSL type maps to the same `WGSLFieldType` as the TS layout.
 * 3. Every field's computed byte offset matches.
 * 4. The total struct size equals the GPU buffer size used at runtime
 *    (`QUALITY_UNIFORMS_SIZE`, currently 40 bytes).
 */

import { describe, expect, it } from 'vitest'

import {
  QUALITY_UNIFORMS_LAYOUT,
  QUALITY_UNIFORMS_SIZE,
} from '@/rendering/webgpu/renderers/qualityLayout'
import { uniformsBlock } from '@/rendering/webgpu/shaders/shared/core/uniforms.wgsl'
import { computeStructLayout, type StructFieldDef } from '@/rendering/webgpu/utils/structLayout'
import { parseStructFields, typesEqual } from '@/tests/rendering/webgpu/utils/wgslStructParser'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('QualityUniforms WGSL validation', () => {
  const wgslFields = parseStructFields(uniformsBlock, 'QualityUniforms')
  const tsLayout = QUALITY_UNIFORMS_LAYOUT

  it('parses every QualityUniforms field from the WGSL struct (10 total)', () => {
    expect(wgslFields.length).toBe(10)
  })

  it('has the same number of fields as the WGSL struct', () => {
    expect(tsLayout.fields.length).toBe(wgslFields.length)
  })

  it('has identical field names in declaration order', () => {
    const tsNames = tsLayout.fields.map((f) => f.name)
    const wgslNames = wgslFields.map((f) => f.name)
    expect(tsNames).toEqual(wgslNames)
  })

  it('has identical field types for every field', () => {
    for (let i = 0; i < wgslFields.length; i++) {
      const ts = tsLayout.fields[i]!
      const wgsl = wgslFields[i]!
      expect(
        typesEqual(ts.type, wgsl.type),
        `Field "${ts.name}" type mismatch: TS=${JSON.stringify(ts.type)}, WGSL=${JSON.stringify(wgsl.type)}`
      ).toBe(true)
    }
  })

  it('computes identical byte offsets from WGSL-parsed fields', () => {
    const wgslDefs: StructFieldDef[] = wgslFields.map((f) => ({
      name: f.name,
      type: f.type,
    }))
    const wgslLayout = computeStructLayout(wgslDefs)

    for (let i = 0; i < wgslLayout.fields.length; i++) {
      const wgsl = wgslLayout.fields[i]!
      const ts = tsLayout.fields[i]!
      expect(wgsl.offset, `Offset mismatch for "${ts.name}"`).toBe(ts.offset)
    }
    expect(wgslLayout.totalSize).toBe(tsLayout.totalSize)
  })

  it('matches the byte offsets the existing packer uses (40-byte buffer)', () => {
    // These are the magic numbers `packQualityUniforms` previously used
    // directly (e.g. `dataView.setInt32(0 * 4, ...)` for sdfMaxIterations).
    const expectedOffsets: Record<string, number> = {
      sdfMaxIterations: 0,
      sdfSurfaceDistance: 4,
      _reservedShadowQuality: 8,
      _reservedShadowSoftness: 12,
      _reservedAoEnabled: 16,
      _reservedAoSamples: 20,
      _reservedAoRadius: 24,
      _reservedAoIntensity: 28,
      qualityMultiplier: 32,
      _reservedDebug: 36,
    }
    for (const [name, expected] of Object.entries(expectedOffsets)) {
      expect(
        tsLayout.byteOffset[name as keyof typeof tsLayout.byteOffset],
        `byte offset for ${name}`
      ).toBe(expected)
    }
  })

  it('exposes float/u32 indices as byteOffset / 4', () => {
    for (const f of tsLayout.fields) {
      expect(tsLayout.index[f.name as keyof typeof tsLayout.index]).toBe(f.offset / 4)
    }
  })

  it('total size matches the GPU buffer allocation (40 bytes)', () => {
    expect(tsLayout.totalSize).toBe(40)
    expect(QUALITY_UNIFORMS_SIZE).toBe(40)
    expect(QUALITY_UNIFORMS_SIZE).toBe(tsLayout.totalSize)
  })

  it('marks every removed-shadow / removed-AO slot as reserved (bulk-zero candidates)', () => {
    const reservedNames = tsLayout.fields.filter((f) => f.reserved).map((f) => f.name)
    expect(reservedNames).toEqual([
      '_reservedShadowQuality',
      '_reservedShadowSoftness',
      '_reservedAoEnabled',
      '_reservedAoSamples',
      '_reservedAoRadius',
      '_reservedAoIntensity',
      '_reservedDebug',
    ])
  })
})
