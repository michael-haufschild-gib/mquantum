/**
 * PauliUniforms struct layout validation.
 *
 * The TypeScript layout (`PAULI_UNIFORMS_LAYOUT`) is the source of truth for
 * byte offsets used by `PauliComputePassBuffers.ts`. The WGSL struct in
 * `pauliUniforms.wgsl.ts` is the source of truth for what the shader reads.
 * If these two drift, the shader silently reads garbage from the wrong slot
 * and Zeeman-Pauli physics breaks.
 *
 * This test parses the WGSL struct text and asserts that:
 * 1. Every WGSL field has a matching TypeScript field (same name, order).
 * 2. Every field's WGSL type maps to the same `WGSLFieldType` as the TS layout.
 * 3. Every field's computed byte offset matches.
 * 4. The total struct size equals the GPU buffer size used at runtime
 *    (`PAULI_UNIFORM_SIZE`, currently 640 bytes).
 * 5. The `_pad3`/`_pad4`/`_pad5` fields are classified as reserved and every
 *    other field is non-reserved.
 * 6. `PAULI_FIELD_VIEW_U32_OFFSET` is derived from the layout (76 = 304/4).
 */

import { describe, expect, it } from 'vitest'

import {
  PAULI_FIELD_VIEW_U32_OFFSET,
  PAULI_UNIFORM_SIZE,
} from '@/rendering/webgpu/passes/PauliComputePassBuffers'
import { PAULI_UNIFORMS_LAYOUT } from '@/rendering/webgpu/passes/pauliUniformsLayout'
import { pauliUniformsBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/pauliUniforms.wgsl'
import { computeStructLayout, type StructFieldDef } from '@/rendering/webgpu/utils/structLayout'
import { parseStructFields, typesEqual } from '@/tests/rendering/webgpu/utils/wgslStructParser'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PauliUniforms WGSL validation', () => {
  const wgslFields = parseStructFields(pauliUniformsBlock, 'PauliUniforms')
  const tsLayout = PAULI_UNIFORMS_LAYOUT

  it('parses a non-trivial number of fields from the WGSL struct', () => {
    // Sanity check on the parser: PauliUniforms has 49 named fields.
    expect(wgslFields.length).toBeGreaterThan(40)
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

  it('matches the WGSL-documented offsets in the struct comments', () => {
    // Spot-check the offsets the WGSL block documents in inline comments.
    // These are the magic numbers `PauliComputePassBuffers.ts` previously
    // used directly (cursor positions 0/1/13/25/26/30/36/37/38/40/42/54/66/
    // 67/72/76/84/88/100/112/124/136/148 × 4). If the layout drifts they
    // must drift here too.
    const expectedByteOffsets: Record<string, number> = {
      latticeDim: 0,
      gridSize: 4,
      strides: 52,
      totalSites: 100,
      dt: 104,
      hbar: 108,
      mass: 112,
      simTime: 116,
      fieldType: 120,
      fieldStrength: 124,
      fieldDirTheta: 128,
      fieldDirPhi: 132,
      gradientStrength: 136,
      rotatingFrequency: 140,
      fieldVecBx: 144,
      fieldVecBy: 148,
      spinTheta: 152,
      spinPhi: 156,
      initCondition: 160,
      packetWidth: 164,
      packetCenter: 168,
      packetMomentum: 216,
      fieldVecBz: 264,
      potentialType: 268,
      harmonicOmega: 272,
      wellDepth: 276,
      wellWidth: 280,
      showPotential: 284,
      absorberEnabled: 288,
      absorberWidth: 292,
      absorberStrength: 296,
      _pad3: 300,
      fieldView: 304,
      autoScale: 308,
      spinUpR: 312,
      spinUpG: 316,
      spinUpB: 320,
      spinDownR: 324,
      spinDownG: 328,
      spinDownB: 332,
      boundingRadius: 336,
      densityScale: 340,
      _pad4: 344,
      _pad5: 348,
      basisX: 352,
      basisY: 400,
      basisZ: 448,
      spacing: 496,
      slicePositions: 544,
      kGridScale: 592,
    }
    for (const [name, expected] of Object.entries(expectedByteOffsets)) {
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

  it('total size matches the GPU buffer allocation (640 bytes)', () => {
    expect(tsLayout.totalSize).toBe(640)
    expect(PAULI_UNIFORM_SIZE).toBe(640)
    expect(PAULI_UNIFORM_SIZE).toBe(tsLayout.totalSize)
  })

  it('derives PAULI_FIELD_VIEW_U32_OFFSET from the layout (= 76)', () => {
    expect(PAULI_FIELD_VIEW_U32_OFFSET).toBe(76)
    expect(PAULI_FIELD_VIEW_U32_OFFSET).toBe(tsLayout.index.fieldView)
  })

  it('classifies _pad3/_pad4/_pad5 as reserved and every other field as live', () => {
    const reservedNames = new Set(['_pad3', '_pad4', '_pad5'])
    let reservedSeen = 0
    for (const f of tsLayout.fields) {
      if (reservedNames.has(f.name)) {
        expect(f.reserved, `field ${f.name} should be reserved`).toBe(true)
        reservedSeen++
      } else {
        expect(f.reserved, `field ${f.name} should not be reserved`).toBe(false)
      }
    }
    expect(reservedSeen).toBe(reservedNames.size)
  })
})
