/**
 * Cross-validation that the TypeScript `FSF_UNIFORMS_LAYOUT` matches the
 * canonical WGSL `FreeScalarUniforms` struct. Parses the WGSL template
 * literal and compares every field name, type, byte offset, and the total
 * struct size. Detects any drift between the GPU shader and CPU writer.
 */

import { describe, expect, it } from 'vitest'

import {
  FSF_COSMO_COEFS_BYTE_OFFSET,
  FSF_COSMO_COEFS_BYTE_SIZE,
  FSF_COSMO_COEFS_F32_COUNT,
  FSF_COSMO_COEFS_F32_INDEX,
  FSF_DT_BYTE_OFFSET,
  FSF_UNIFORM_SIZE,
} from '@/rendering/webgpu/passes/FreeScalarFieldComputePassUniforms'
import { FSF_UNIFORMS_LAYOUT } from '@/rendering/webgpu/passes/fsfUniformsLayout'
import { freeScalarUniformsBlock } from '@/rendering/webgpu/shaders/schroedinger/compute/freeScalarInit.wgsl'
import { computeStructLayout, type StructFieldDef } from '@/rendering/webgpu/utils/structLayout'
import { parseStructFields, typesEqual } from '@/tests/rendering/webgpu/utils/wgslStructParser'

describe('FreeScalarUniforms WGSL validation', () => {
  const wgslFields = parseStructFields(freeScalarUniformsBlock, 'FreeScalarUniforms')
  const tsLayout = FSF_UNIFORMS_LAYOUT

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

  // Spot-check offsets used by the legacy magic-number consumers. These
  // are the load-bearing offsets — if any one drifts, the per-step uniform
  // patches in `fsfCosmologyStepping` and `FreeScalarFieldComputePassResources`
  // would silently scribble into the wrong slot.
  it.each([
    ['latticeDim', 0],
    ['totalSites', 4],
    ['mass', 8],
    ['dt', 12],
    ['gridSize', 16],
    ['strides', 64],
    ['spacing', 112],
    ['initCondition', 160],
    ['fieldView', 164],
    ['stepsPerFrame', 168],
    ['analysisMode', 188],
    ['packetCenter', 192],
    ['modeK', 240],
    ['slicePositions', 288],
    ['basisX', 336],
    ['basisY', 384],
    ['basisZ', 432],
    ['selfInteractionEnabled', 480],
    ['absorberEnabled', 492],
    ['absorberWidth', 496],
    ['absorberStrength', 500],
    ['aKinetic', 504],
    ['aPotential', 508],
    ['aFull', 512],
    ['massSquaredScale', 516],
    ['aPotentialRatio1', 520],
    ['aPotentialRatio2', 524],
  ])('offset of %s matches magic number %d', (name, expectedOffset) => {
    expect(tsLayout.byteOffset[name as keyof typeof tsLayout.byteOffset]).toBe(expectedOffset)
  })

  it('total size is 528 bytes', () => {
    expect(tsLayout.totalSize).toBe(528)
  })

  it('has no reserved fields (FreeScalarUniforms has no padding slots)', () => {
    const reserved = tsLayout.fields.filter((f) => f.reserved)
    expect(reserved).toEqual([])
  })
})

describe('FSF uniform exported constants', () => {
  it('FSF_UNIFORM_SIZE derives from the layout total size', () => {
    expect(FSF_UNIFORM_SIZE).toBe(FSF_UNIFORMS_LAYOUT.totalSize)
    expect(FSF_UNIFORM_SIZE).toBe(528)
  })

  it('FSF_DT_BYTE_OFFSET equals the layout byteOffset of `dt`', () => {
    expect(FSF_DT_BYTE_OFFSET).toBe(FSF_UNIFORMS_LAYOUT.byteOffset.dt)
    expect(FSF_DT_BYTE_OFFSET).toBe(12)
  })

  it('FSF_COSMO_COEFS_BYTE_OFFSET equals the layout byteOffset of `aKinetic`', () => {
    expect(FSF_COSMO_COEFS_BYTE_OFFSET).toBe(FSF_UNIFORMS_LAYOUT.byteOffset.aKinetic)
    expect(FSF_COSMO_COEFS_BYTE_OFFSET).toBe(504)
  })

  it('FSF_COSMO_COEFS_F32_INDEX equals the layout index of `aKinetic`', () => {
    expect(FSF_COSMO_COEFS_F32_INDEX).toBe(FSF_UNIFORMS_LAYOUT.index.aKinetic)
    expect(FSF_COSMO_COEFS_F32_INDEX).toBe(126)
  })

  it('FSF_COSMO_COEFS_F32_COUNT covers six contiguous f32 fields ending at aPotentialRatio2', () => {
    expect(FSF_COSMO_COEFS_F32_COUNT).toBe(6)
    // Contiguity check: aPotentialRatio2 sits at aKinetic + 5 slots, +4 bytes for its own size.
    const lastByte =
      FSF_UNIFORMS_LAYOUT.byteOffset.aPotentialRatio2 +
      FSF_UNIFORMS_LAYOUT.byteSize.aPotentialRatio2
    expect(lastByte - FSF_UNIFORMS_LAYOUT.byteOffset.aKinetic).toBe(FSF_COSMO_COEFS_F32_COUNT * 4)
  })

  it('FSF_COSMO_COEFS_BYTE_SIZE is count * 4', () => {
    expect(FSF_COSMO_COEFS_BYTE_SIZE).toBe(FSF_COSMO_COEFS_F32_COUNT * 4)
    expect(FSF_COSMO_COEFS_BYTE_SIZE).toBe(24)
  })
})
