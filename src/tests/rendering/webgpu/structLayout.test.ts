import { describe, expect, it } from 'vitest'

import { SCHROEDINGER_LAYOUT } from '@/rendering/webgpu/renderers/schroedingerLayout'
import { schroedingerUniformsBlock } from '@/rendering/webgpu/shaders/schroedinger/uniforms.wgsl'
import {
  arr,
  computeStructLayout,
  type StructFieldDef,
  zeroReservedFields,
} from '@/rendering/webgpu/utils/structLayout'
import { parseStructFields, typesEqual } from '@/tests/rendering/webgpu/utils/wgslStructParser'

// ---------------------------------------------------------------------------
// Unit tests for the layout engine
// ---------------------------------------------------------------------------

describe('computeStructLayout', () => {
  it('computes scalar offsets sequentially', () => {
    const layout = computeStructLayout([
      { name: 'a', type: 'f32' },
      { name: 'b', type: 'i32' },
      { name: 'c', type: 'u32' },
    ] as const)

    expect(layout.byteOffset.a).toBe(0)
    expect(layout.byteOffset.b).toBe(4)
    expect(layout.byteOffset.c).toBe(8)
    expect(layout.totalSize).toBe(12)
  })

  it('aligns vec3f to 16 bytes', () => {
    const layout = computeStructLayout([
      { name: 'x', type: 'f32' },
      { name: 'v', type: 'vec3f' },
      { name: 'y', type: 'f32' },
    ] as const)

    // f32 at 0, then vec3f needs align 16 → offset 16, size 12, ends at 28
    // f32 at 28
    expect(layout.byteOffset.x).toBe(0)
    expect(layout.byteOffset.v).toBe(16)
    expect(layout.byteOffset.y).toBe(28)
    // struct align = 16, total = roundUp(16, 32) = 32
    expect(layout.totalSize).toBe(32)
  })

  it('aligns vec4f to 16 bytes', () => {
    const layout = computeStructLayout([
      { name: 'a', type: 'i32' },
      { name: 'b', type: 'i32' },
      { name: 'c', type: 'i32' },
      { name: 'v', type: 'vec4f' },
    ] as const)

    expect(layout.byteOffset.v).toBe(16)
    expect(layout.totalSize).toBe(32)
  })

  it('computes array<vec4f, N> layout correctly', () => {
    const layout = computeStructLayout([
      { name: 'header', type: 'i32' },
      { name: 'data', type: arr('vec4f', 3) },
      { name: 'footer', type: 'f32' },
    ] as const)

    // header at 0 (4 bytes), data needs align 16 → offset 16, size 48
    expect(layout.byteOffset.data).toBe(16)
    expect(layout.byteOffset.footer).toBe(64)
  })

  it('computes array<vec4<i32>, N> layout correctly', () => {
    const layout = computeStructLayout([{ name: 'arr', type: arr('vec4<i32>', 22) }] as const)

    expect(layout.byteOffset.arr).toBe(0)
    expect(layout.totalSize).toBe(352) // 22 * 16
  })

  it('provides index (byteOffset / 4) for float32/int32 access', () => {
    const layout = computeStructLayout([
      { name: 'a', type: 'f32' },
      { name: 'b', type: 'vec4f' },
    ] as const)

    expect(layout.index.a).toBe(0)
    expect(layout.index.b).toBe(4) // offset 16 / 4
  })

  it('marks fields starting with _ as reserved', () => {
    const layout = computeStructLayout([
      { name: 'active', type: 'f32' },
      { name: '_pad0', type: 'f32' },
      { name: '_reservedFoo', type: 'i32' },
    ] as const)

    expect(layout.fields[0]!.reserved).toBe(false)
    expect(layout.fields[1]!.reserved).toBe(true)
    expect(layout.fields[2]!.reserved).toBe(true)
  })

  it('rounds total size up to struct alignment', () => {
    const layout = computeStructLayout([
      { name: 'v', type: 'vec4f' },
      { name: 'x', type: 'f32' },
    ] as const)

    // vec4f(0-15) + f32(16-19) → raw end 20, struct align 16, total = 32
    expect(layout.totalSize).toBe(32)
  })
})

describe('zeroReservedFields', () => {
  it('zeroes only reserved fields', () => {
    const layout = computeStructLayout([
      { name: 'active', type: 'f32' },
      { name: '_pad', type: 'f32' },
      { name: 'alsoActive', type: 'f32' },
    ] as const)

    const buf = new Float32Array(3)
    buf[0] = 1.0
    buf[1] = 42.0
    buf[2] = 2.0

    zeroReservedFields(buf, layout)

    expect(buf[0]).toBe(1.0) // untouched
    expect(buf[1]).toBe(0.0) // zeroed
    expect(buf[2]).toBe(2.0) // untouched
  })

  it('zeroes vec3f reserved fields (3 floats)', () => {
    const layout = computeStructLayout([{ name: '_color', type: 'vec3f' }] as const)

    const buf = new Float32Array(4)
    buf.fill(99)

    zeroReservedFields(buf, layout)

    expect(buf[0]).toBe(0)
    expect(buf[1]).toBe(0)
    expect(buf[2]).toBe(0)
    expect(buf[3]).toBe(99) // implicit padding after vec3f, not part of field
  })

  it('zeroes array reserved fields', () => {
    const layout = computeStructLayout([{ name: '_arr', type: arr('vec4f', 2) }] as const)

    const buf = new Float32Array(8)
    buf.fill(7)

    zeroReservedFields(buf, layout)

    for (let i = 0; i < 8; i++) {
      expect(buf[i]).toBe(0)
    }
  })
})

// ---------------------------------------------------------------------------
// WGSL struct validation — ensures TypeScript layout matches the shader
// ---------------------------------------------------------------------------

describe('SchroedingerUniforms WGSL validation', () => {
  const wgslFields = parseStructFields(schroedingerUniformsBlock, 'SchroedingerUniforms')
  const tsLayout = SCHROEDINGER_LAYOUT

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

  // Spot-check offsets used by packing code and runtime magic-number consumers
  it.each([
    ['quantumMode', 0],
    ['termCount', 4],
    ['omega', 16],
    ['quantum', 64],
    ['coeff', 416],
    ['energy', 544],
    ['principalN', 576],
    ['hydrogenBoost', 596],
    ['extraDimN', 608],
    ['extraDimOmega', 640],
    ['phaseAnimationEnabled', 672],
    ['densityGain', 684],
    ['roughness', 716],
    ['nodalEnabled', 720],
    ['colorAlgorithm', 796],
    ['boundingRadius', 896],
    ['crossSectionEnabled', 1072],
    ['probabilityCurrentEnabled', 1136],
    ['representationMode', 1184],
    ['wignerDimensionIndex', 1312],
    ['wignerXRange', 1320],
    ['wignerPRange', 1324],
  ])('offset of %s matches magic number %d', (name, expectedOffset) => {
    expect(tsLayout.byteOffset[name as keyof typeof tsLayout.byteOffset]).toBe(expectedOffset)
  })
})
