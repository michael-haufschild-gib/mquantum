/**
 * CameraUniforms struct layout validation.
 *
 * The TypeScript layout (`CAMERA_UNIFORMS_LAYOUT`) is the source of truth for
 * byte offsets used by `uniformPackingSupport.ts::packCameraUniforms`. The
 * WGSL struct in `shared/core/uniforms.wgsl.ts::CAMERA_UNIFORMS_STRUCT` is
 * the source of truth for what the shader reads. If these two drift the
 * shader silently reads garbage from the wrong slot and every frame breaks.
 *
 * This test parses the WGSL struct text and asserts that:
 * 1. Every WGSL field has a matching TypeScript field (same name, order).
 * 2. Every field's WGSL type maps to the same `WGSLFieldType` as the TS layout.
 * 3. Every field's computed byte offset matches.
 * 4. The total struct size equals the GPU buffer size used at runtime
 *    (`CAMERA_UNIFORMS_SIZE`, currently 528 bytes).
 *
 * `mat4x4f` in WGSL is layout-equivalent to `array<vec4f, 4>` (align 16,
 * size 64), so the parser maps `mat4x4f` to `arr('vec4f', 4)` for the
 * comparison.
 */

import { describe, expect, it } from 'vitest'

import {
  CAMERA_UNIFORMS_LAYOUT,
  CAMERA_UNIFORMS_SIZE,
} from '@/rendering/webgpu/renderers/cameraLayout'
import { CAMERA_UNIFORMS_STRUCT } from '@/rendering/webgpu/shaders/shared/core/uniforms.wgsl'
import { computeStructLayout, type StructFieldDef } from '@/rendering/webgpu/utils/structLayout'
import { parseStructFields, typesEqual } from '@/tests/rendering/webgpu/utils/wgslStructParser'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CameraUniforms WGSL validation', () => {
  const wgslFields = parseStructFields(CAMERA_UNIFORMS_STRUCT, 'CameraUniforms')
  const tsLayout = CAMERA_UNIFORMS_LAYOUT

  it('parses a non-trivial number of fields from the WGSL struct', () => {
    // CameraUniforms has 19 named fields (7 matrices + 12 scalars/vecs/pads).
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

  it('matches the byte offsets the existing packer uses (528-byte buffer)', () => {
    // These are the magic numbers `packCameraUniforms` previously used
    // directly. If the layout drifts they must drift here too.
    const expectedOffsets: Record<string, number> = {
      viewMatrix: 0,
      projectionMatrix: 64,
      viewProjectionMatrix: 128,
      inverseViewMatrix: 192,
      inverseProjectionMatrix: 256,
      modelMatrix: 320,
      inverseModelMatrix: 384,
      cameraPosition: 448,
      cameraNear: 460,
      cameraFar: 464,
      fov: 468,
      resolution: 472,
      aspectRatio: 480,
      time: 484,
      deltaTime: 488,
      frameNumber: 492,
      bayerOffset: 496,
      _padding: 504,
      cameraPositionModel: 512,
      _paddingEnd: 524,
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

  it('total size matches the GPU buffer allocation (528 bytes)', () => {
    expect(tsLayout.totalSize).toBe(528)
    expect(CAMERA_UNIFORMS_SIZE).toBe(528)
    expect(CAMERA_UNIFORMS_SIZE).toBe(tsLayout.totalSize)
  })

  it('marks `_padding` and `_paddingEnd` as reserved (bulk-zero candidates)', () => {
    const reservedNames = tsLayout.fields.filter((f) => f.reserved).map((f) => f.name)
    expect(reservedNames).toContain('_padding')
    expect(reservedNames).toContain('_paddingEnd')
  })
})
