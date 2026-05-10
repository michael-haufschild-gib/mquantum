/**
 * MaterialUniforms struct layout validation.
 *
 * The TypeScript layout (`MATERIAL_UNIFORMS_LAYOUT`) is the source of truth
 * for byte offsets used by `uniformPackingSupport.ts::packMaterialUniforms`.
 * The WGSL struct in `shared/core/uniforms.wgsl.ts::uniformsBlock` is the
 * source of truth for what the shader reads. If these two drift the shader
 * silently reads garbage from the wrong slot and PBR shading breaks.
 *
 * This test parses the WGSL `MaterialUniforms` struct text out of the
 * composed `uniformsBlock` (the struct itself is not exported individually)
 * and asserts that:
 * 1. Every WGSL field has a matching TypeScript field (same name, order).
 * 2. Every field's WGSL type maps to the same `WGSLFieldType` as the TS layout.
 * 3. Every field's computed byte offset matches.
 * 4. The total struct size equals the GPU buffer size used at runtime
 *    (`MATERIAL_UNIFORMS_SIZE`, currently 160 bytes).
 */

import { describe, expect, it } from 'vitest'

import {
  MATERIAL_UNIFORMS_LAYOUT,
  MATERIAL_UNIFORMS_SIZE,
} from '@/rendering/webgpu/renderers/materialLayout'
import { uniformsBlock } from '@/rendering/webgpu/shaders/shared/core/uniforms.wgsl'
import { computeStructLayout, type StructFieldDef } from '@/rendering/webgpu/utils/structLayout'
import { parseStructFields, typesEqual } from '@/tests/rendering/webgpu/utils/wgslStructParser'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MaterialUniforms WGSL validation', () => {
  const wgslFields = parseStructFields(uniformsBlock, 'MaterialUniforms')
  const tsLayout = MATERIAL_UNIFORMS_LAYOUT

  it('parses a non-trivial number of fields from the WGSL struct', () => {
    // MaterialUniforms has 22 named fields including reserved Fresnel slots.
    expect(wgslFields.length).toBeGreaterThan(15)
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

  it('matches the byte offsets the existing packer uses (160-byte buffer)', () => {
    // These are the magic numbers `packMaterialUniforms` previously used
    // directly (e.g. `dataView.setUint32(15 * 4 = 60, ...)` for sssEnabled).
    const expectedOffsets: Record<string, number> = {
      baseColor: 0,
      metallic: 16,
      roughness: 20,
      reflectance: 24,
      ao: 28,
      emissive: 32,
      emissiveIntensity: 44,
      ior: 48,
      transmission: 52,
      thickness: 56,
      sssEnabled: 60,
      sssIntensity: 64,
      sssColor: 80, // vec3f alignment pushes from 68 → 80
      sssThickness: 92,
      sssJitter: 96,
      _reserved_fresnel0: 100,
      _reserved_fresnel1: 104,
      _reserved_fresnel2: 112, // vec3f alignment pushes from 108 → 112
      _padding2: 124,
      specularIntensity: 128,
      specularColor: 144, // vec3f alignment pushes from 132 → 144
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

  it('total size matches the GPU buffer allocation (160 bytes)', () => {
    expect(tsLayout.totalSize).toBe(160)
    expect(MATERIAL_UNIFORMS_SIZE).toBe(160)
    expect(MATERIAL_UNIFORMS_SIZE).toBe(tsLayout.totalSize)
  })

  it('marks every removed-Fresnel slot as reserved (bulk-zero candidates)', () => {
    const reservedNames = tsLayout.fields.filter((f) => f.reserved).map((f) => f.name)
    expect(reservedNames).toEqual([
      '_reserved_fresnel0',
      '_reserved_fresnel1',
      '_reserved_fresnel2',
      '_padding2',
    ])
  })
})
