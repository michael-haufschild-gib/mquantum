/**
 * TDSEUniforms WGSL layout parity test.
 *
 * Parses the WGSL `TDSEUniforms` struct text, computes byte offsets from
 * the WGSL-declared field types using the same struct-layout engine, and
 * compares the result against the TS `TDSE_UNIFORMS_LAYOUT`. This catches
 * any drift between the WGSL source of truth and the TypeScript layout
 * mirror that drives `writeTdseUniforms` / `TDSE_UNIFORM_*` constants.
 *
 * Mirrors the SchroedingerUniforms validation in
 * `tests/rendering/webgpu/structLayout.test.ts`.
 *
 * @module tests/rendering/webgpu/passes/tdseUniformsLayout
 */

import { describe, expect, it } from 'vitest'

import {
  TDSE_UNIFORM_OFFSET_STAGE_TIME_K1,
  TDSE_UNIFORM_SIZE,
} from '@/rendering/webgpu/passes/TDSEComputePassResources'
import { TDSE_UNIFORMS_LAYOUT } from '@/rendering/webgpu/passes/tdseUniformsLayout'
import { tdseUniformsBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/tdseUniforms.wgsl'
import { computeStructLayout, type StructFieldDef } from '@/rendering/webgpu/utils/structLayout'
import { parseStructFields, typesEqual } from '@/tests/rendering/webgpu/utils/wgslStructParser'

describe('TDSEUniforms WGSL validation', () => {
  const wgslFields = parseStructFields(tdseUniformsBlock, 'TDSEUniforms')
  const tsLayout = TDSE_UNIFORMS_LAYOUT

  it('has the same number of fields as the WGSL struct', () => {
    expect(tsLayout.fields.length).toBe(wgslFields.length)
  })

  it('has identical field names in the same order', () => {
    const tsNames = tsLayout.fields.map((f) => f.name)
    const wgslNames = wgslFields.map((f) => f.name)
    expect(tsNames).toEqual(wgslNames)
  })

  it('has identical field types', () => {
    for (let i = 0; i < wgslFields.length; i++) {
      const ts = tsLayout.fields[i]!
      const wgsl = wgslFields[i]!
      expect(
        typesEqual(ts.type, wgsl.type),
        `Field "${ts.name}" type mismatch: TS=${JSON.stringify(ts.type)}, WGSL=${JSON.stringify(wgsl.type)}`
      ).toBe(true)
    }
  })

  it('computes identical offsets from WGSL-parsed fields', () => {
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

  it('totalSize equals 1024 bytes (WGSL-documented struct size)', () => {
    expect(tsLayout.totalSize).toBe(1024)
  })

  it('TDSE_UNIFORM_SIZE is derived from layout.totalSize', () => {
    expect(TDSE_UNIFORM_SIZE).toBe(tsLayout.totalSize)
  })

  it('TDSE_UNIFORM_OFFSET_STAGE_TIME_K1 is derived from layout.byteOffset.stageTimeK1', () => {
    expect(TDSE_UNIFORM_OFFSET_STAGE_TIME_K1).toBe(tsLayout.byteOffset.stageTimeK1)
    // The literal value must remain stable so callers (e.g. TDSECurvedIntegrator)
    // that copy the K1..K4 quartet via copyBufferToBuffer keep targeting the
    // correct 16-byte block.
    expect(TDSE_UNIFORM_OFFSET_STAGE_TIME_K1).toBe(896)
  })

  // Spot-check offsets used historically as raw indices in packing code.
  // These mirror the magic numbers documented in the WGSL struct comments.
  it.each([
    ['latticeDim', 0],
    ['mass', 16],
    ['gridSize', 32],
    ['strides', 80],
    ['spacing', 128],
    ['packetCenter', 176],
    ['packetWidth', 272],
    ['boundingRadius', 280],
    ['fieldView', 284],
    ['simTime', 344],
    ['slicePositions', 352],
    ['basisX', 400],
    ['basisY', 448],
    ['basisZ', 496],
    ['kGridScale', 544],
    ['imaginaryTime', 700],
    ['customPotentialScale', 704],
    ['compactDimsMask', 736],
    ['bhMass', 748],
    ['hawkingVmax', 760],
    ['wormholeCosTau', 792],
    ['wormholeCouplingEnabled', 800],
    ['islandOverlayEnabled', 816],
    ['metricKind', 832],
    ['schwarzschildMass', 848],
    ['torusPeriod', 880],
    ['stageTimeK1', 896],
    ['showCurvatureOverlay', 912],
    ['invSpacing', 928],
    ['invSpacing2', 976],
  ])('offset of %s matches magic number %d', (name, expectedOffset) => {
    expect(tsLayout.byteOffset[name as keyof typeof tsLayout.byteOffset]).toBe(expectedOffset)
  })
})
