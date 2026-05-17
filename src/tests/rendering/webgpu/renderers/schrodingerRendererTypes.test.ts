import { describe, expect, it } from 'vitest'

import type { HydrogenBasisState } from '@/lib/physics/openQuantum/hydrogenBasis'
import { packHydrogenBasisForGPU } from '@/rendering/webgpu/renderers/schrodingerRendererTypes'

function basisState(
  index: number,
  overrides: Partial<HydrogenBasisState> = {}
): HydrogenBasisState {
  return {
    index,
    n: 1,
    l: 0,
    m: 0,
    extraDimN: [],
    energy: index,
    ...overrides,
  }
}

describe('packHydrogenBasisForGPU', () => {
  it('caps public basisCount metadata to the shader MAX_K layout', () => {
    const basis = Array.from({ length: 16 }, (_, index) => basisState(index, { n: index + 1 }))
    const buffer = packHydrogenBasisForGPU(basis, 3)
    const i32View = new Int32Array(buffer, 0, 156)
    const f32View = new Float32Array(buffer, 624, 16)
    const u32View = new Uint32Array(buffer, 688, 4)

    expect(u32View[0]).toBe(14)
    expect(f32View[13]).toBe(13)
    expect(f32View[14]).toBe(0)
    expect(i32View[14 * 11]).toBe(0)
  })

  it('sanitizes malformed public basis states before uniform upload', () => {
    const buffer = packHydrogenBasisForGPU(
      [
        basisState(0, {
          n: NaN,
          l: Infinity,
          m: -Infinity,
          extraDimN: [NaN, 2],
          energy: NaN,
        }),
      ],
      5
    )
    const i32View = new Int32Array(buffer, 0, 156)
    const f32View = new Float32Array(buffer, 624, 16)
    const u32View = new Uint32Array(buffer, 688, 4)

    expect(u32View[0]).toBe(1)
    expect(Array.from(i32View.slice(0, 5))).toEqual([0, 0, 0, 0, 2])
    expect(f32View[0]).toBe(0)
  })
})
