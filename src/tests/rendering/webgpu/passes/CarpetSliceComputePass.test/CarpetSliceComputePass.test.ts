/**
 * Unit tests for the pure helpers extracted from `CarpetSliceComputePass`.
 *
 * The class itself is hard to unit-test — it owns a GPUDevice, compute
 * pipeline, storage texture, and an onSubmittedWorkDone/mapAsync chain.
 * But the CPU-side row-unpacking is pure data-shuffling that had zero
 * coverage and is easy to get subtly wrong:
 *
 *   1. `copyTextureToBuffer` requires `bytesPerRow` to be a multiple of
 *      256. For a 96-wide r32float carpet that's 96*4=384 bytes raw,
 *      rounded up to 512 (next multiple of 256) — so each staging row
 *      has 128 floats but only the first 96 are real data. Missing the
 *      padding stride would silently decode garbage for every row after
 *      the first.
 *
 *   2. The unpack loop is nested (rows × cols). Off-by-one errors in
 *      either index are invisible at runtime because the output is a
 *      Float32Array and the carpet visualisation tolerates smeared
 *      values. Tests here assert exact values at chosen row/col
 *      coordinates.
 *
 *   3. Matches the DENSITY_GRID_SIZE=96 production configuration to
 *      guard against a future grid-size change that forgets to update
 *      the padding math.
 *
 * @module tests/rendering/webgpu/passes/CarpetSliceComputePass
 */

import { describe, expect, it } from 'vitest'

import { DENSITY_GRID_SIZE } from '@/constants/densityGrid'
import { unpackCarpetStaging } from '@/rendering/webgpu/passes/CarpetSliceComputePass'

/**
 * Build a padded staging buffer where every element is uniquely identifiable
 * by its `(row, col)` position. Real-data slots use `row * 1000 + col`;
 * padding slots use `-1` so any leak from padding into the output is caught.
 */
function buildPaddedStaging(
  gridSize: number,
  historyLength: number,
  paddedRowFloats: number
): Float32Array {
  const total = paddedRowFloats * historyLength
  const buf = new Float32Array(total)
  for (let row = 0; row < historyLength; row++) {
    for (let i = 0; i < paddedRowFloats; i++) {
      const flat = row * paddedRowFloats + i
      if (i < gridSize) {
        buf[flat] = row * 1000 + i
      } else {
        buf[flat] = -1 // padding marker
      }
    }
  }
  return buf
}

describe('unpackCarpetStaging', () => {
  it('strips 256-byte row alignment padding at the production 96-wide config', () => {
    // 96 * 4 = 384 bytes raw. ceil(384/256)*256 = 512 bytes padded → 128 f32 stride.
    const gridSize = 96
    const historyLength = 4
    const paddedRowFloats = 128 // (ceil(96*4/256)*256)/4 = 512/4
    const src = buildPaddedStaging(gridSize, historyLength, paddedRowFloats)
    const out = unpackCarpetStaging(src, gridSize, historyLength, paddedRowFloats)

    expect(out.length).toBe(gridSize * historyLength)
    // Spot-check corners and a mid-row cell.
    expect(out[0]).toBe(0) // row 0, col 0
    expect(out[95]).toBe(95) // row 0, col 95 (last real)
    expect(out[96]).toBe(1000) // row 1, col 0
    expect(out[96 + 50]).toBe(1050) // row 1, col 50
    expect(out[96 * 3 + 95]).toBe(3095) // row 3, last col
  })

  it('never leaks a padding cell (-1) into the unpacked output', () => {
    const gridSize = 96
    const historyLength = 8
    const paddedRowFloats = 128
    const src = buildPaddedStaging(gridSize, historyLength, paddedRowFloats)
    const out = unpackCarpetStaging(src, gridSize, historyLength, paddedRowFloats)
    for (let i = 0; i < out.length; i++) {
      expect(out[i], `f32[${i}]`).not.toBe(-1)
    }
  })

  it('row 0 values are written at output indices [0 .. gridSize − 1]', () => {
    const gridSize = 10 // exaggerated small size to make the mapping obvious
    const historyLength = 3
    const paddedRowFloats = 16 // arbitrary padding > gridSize
    const src = buildPaddedStaging(gridSize, historyLength, paddedRowFloats)
    const out = unpackCarpetStaging(src, gridSize, historyLength, paddedRowFloats)
    for (let col = 0; col < gridSize; col++) {
      expect(out[col]).toBe(col) // row 0 data
    }
    for (let col = 0; col < gridSize; col++) {
      expect(out[gridSize + col]).toBe(1000 + col) // row 1 data
    }
    for (let col = 0; col < gridSize; col++) {
      expect(out[2 * gridSize + col]).toBe(2000 + col) // row 2 data
    }
  })

  it('handles paddedRowFloats === gridSize (no padding) without corrupting rows', () => {
    // Edge case: if `gridSize * 4` happens to already be a multiple of 256
    // (e.g., gridSize = 64 → 256 bytes → no padding), paddedRowFloats equals
    // gridSize and the inner loop must still produce a correct dense output.
    const gridSize = 64
    const historyLength = 2
    const paddedRowFloats = 64
    const src = new Float32Array(gridSize * historyLength)
    for (let row = 0; row < historyLength; row++) {
      for (let col = 0; col < gridSize; col++) {
        src[row * paddedRowFloats + col] = row * 1000 + col
      }
    }
    const out = unpackCarpetStaging(src, gridSize, historyLength, paddedRowFloats)
    expect(out[0]).toBe(0)
    expect(out[gridSize - 1]).toBe(gridSize - 1)
    expect(out[gridSize]).toBe(1000)
    expect(out[gridSize * 2 - 1]).toBe(1000 + gridSize - 1)
  })

  it('does NOT read past paddedRowFloats × historyLength (exact buffer sizing)', () => {
    // Regression guard: if the loop ever used `gridSize` instead of
    // `paddedRowFloats` for the source stride, row 1+ would read garbage
    // from the start of row 0. This test builds a staging buffer sized
    // exactly for the padded layout so the bug would also return
    // undefined (which the code's `!` would silently coerce to NaN).
    const gridSize = 96
    const historyLength = 3
    const paddedRowFloats = 128
    const src = new Float32Array(paddedRowFloats * historyLength)
    src[paddedRowFloats * 1 + 0] = 42 // row 1, col 0
    src[paddedRowFloats * 2 + 0] = 99 // row 2, col 0
    const out = unpackCarpetStaging(src, gridSize, historyLength, paddedRowFloats)
    expect(out[gridSize * 1 + 0]).toBe(42)
    expect(out[gridSize * 2 + 0]).toBe(99)
  })

  it('historyLength=0 produces an empty output without error', () => {
    const out = unpackCarpetStaging(new Float32Array(0), 96, 0, 128)
    expect(out.length).toBe(0)
  })
})

// Static sanity: make sure the production DENSITY_GRID_SIZE constant is what
// the unpack math was derived against. If someone bumps it to 128 (which
// changes the padding result), the tests above still work but this one is
// a clear signal to revisit.
describe('DENSITY_GRID_SIZE shape invariants', () => {
  it('is 96 (triggers row-alignment padding: 96*4 = 384 → ceil/256 = 512)', () => {
    expect(DENSITY_GRID_SIZE).toBe(96)
    const bytesPerRow = Math.ceil((DENSITY_GRID_SIZE * 4) / 256) * 256
    expect(bytesPerRow).toBe(512)
    expect(bytesPerRow / 4).toBe(128) // paddedRowFloats
    expect(bytesPerRow / 4).toBeGreaterThan(DENSITY_GRID_SIZE)
  })
})
