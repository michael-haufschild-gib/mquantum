/**
 * DiracUniforms struct layout validation.
 *
 * The TypeScript layout (`DIRAC_UNIFORMS_LAYOUT`) is the source of truth for
 * byte offsets used by `DiracComputePassUniforms.ts`. The WGSL struct in
 * `diracUniforms.wgsl.ts` is the source of truth for what the shader reads.
 * If these two drift, the shader silently reads garbage from the wrong slot
 * and Dirac physics breaks.
 *
 * This test parses the WGSL struct text and asserts that:
 * 1. Every WGSL field has a matching TypeScript field (same name, order).
 * 2. Every field's WGSL type maps to the same `WGSLFieldType` as the TS layout.
 * 3. Every field's computed byte offset matches.
 * 4. The total struct size equals the GPU buffer size used at runtime
 *    (`DIRAC_UNIFORM_SIZE`, currently 592 bytes).
 *
 * The WGSL parser also accepts scalar-element arrays (`array<u32, 12>`,
 * `array<f32, 12>`) — DiracUniforms has nine such arrays, none of which
 * Schroedinger uses, so this test exercises the layout engine path that
 * Schroedinger doesn't.
 */

import { describe, expect, it } from 'vitest'

import {
  DIRAC_UNIFORM_SIZE,
  DIRAC_UNIFORMS_LAYOUT,
} from '@/rendering/webgpu/passes/diracUniformsLayout'
import { diracUniformsBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/diracUniforms.wgsl'
import { computeStructLayout, type StructFieldDef } from '@/rendering/webgpu/utils/structLayout'
import { parseStructFields, typesEqual } from '@/tests/rendering/webgpu/utils/wgslStructParser'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DiracUniforms WGSL validation', () => {
  const wgslFields = parseStructFields(diracUniformsBlock, 'DiracUniforms')
  const tsLayout = DIRAC_UNIFORMS_LAYOUT

  it('parses a non-trivial number of fields from the WGSL struct', () => {
    // Sanity check on the parser: DiracUniforms has 30+ named fields.
    expect(wgslFields.length).toBeGreaterThan(20)
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
    // These are the magic numbers `DiracComputePassUniforms.ts` previously
    // used directly. If the layout drifts they must drift here too.
    const expectedOffsets: Record<string, number> = {
      gridSize: 0,
      strides: 48,
      spacing: 96,
      totalSites: 144,
      latticeDim: 148,
      mass: 152,
      speedOfLight: 156,
      hbar: 160,
      dt: 164,
      spinorSize: 168,
      potentialType: 172,
      potentialStrength: 176,
      potentialWidth: 180,
      potentialCenter: 184,
      harmonicOmega: 188,
      coulombZ: 192,
      initCondition: 196,
      packetWidth: 200,
      positiveEnergyFraction: 204,
      packetCenter: 208,
      packetMomentum: 256,
      fieldView: 304,
      autoScale: 308,
      simTime: 312,
      absorberEnabled: 316,
      absorberWidth: 320,
      absorberStrength: 324,
      slicePositions: 328,
      basisX: 376,
      basisY: 424,
      basisZ: 472,
      boundingRadius: 520,
      densityScale: 524,
      stepsPerFrame: 528,
      showPotential: 532,
      spinTheta: 536,
      spinPhi: 540,
      kGridScale: 544,
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

  it('total size matches the GPU buffer allocation (592 bytes)', () => {
    expect(tsLayout.totalSize).toBe(592)
    expect(DIRAC_UNIFORM_SIZE).toBe(592)
    expect(DIRAC_UNIFORM_SIZE).toBe(tsLayout.totalSize)
  })

  it('has no reserved (`_`-prefixed) fields — DiracUniforms uses implicit padding only', () => {
    for (const f of tsLayout.fields) {
      expect(f.reserved, `field ${f.name} should not be reserved`).toBe(false)
    }
  })
})
