/**
 * Regression guard for the shared `MAX_SLICE_POSITIONS_WRITE_COUNT` clamp
 * in the compute-pass uniform writers.
 *
 * All 5 compute passes (TDSE, Dirac, Pauli, FSF, QW) pack their
 * slicePositions store array into a WGSL `array<f32, 12>` uniform region
 * where the shader only reads indices `d >= 3`. The TS writer maps store
 * index `i` → WGSL index `i + 3`, which means store indices `i ∈ [0, 8]`
 * land inside the 12-slot region and `i >= 9` overflows into the next
 * uniform field (basisX for every pass laid out this way).
 *
 * Before the clamp was introduced, an oversized store array — seen in
 * the original `DEFAULT_DIRAC_CONFIG` (12 zeros) and `DEFAULT_BEC_CONFIG`
 * (12 zeros), or in any legacy preset that predated the setter
 * convention — would silently corrupt the basisX vector before it was
 * (in some code paths) rewritten a few lines later. Where a rewrite
 * followed, the corruption was invisible; where no rewrite followed the
 * corruption was durable.
 *
 * This suite targets two writers:
 *
 *   1. `packWriteGridUniforms` (QuantumWalk) — a pure function with no
 *      GPUDevice dependency. Easy to test for the happy path and for
 *      store→WGSL index mapping.
 *   2. `writeTdseUniforms` — a near-pure function that takes its
 *      `uniformData` / `u32` / `f32` arguments externally and only
 *      dereferences `device.queue.writeBuffer` at the very end, so we
 *      can stub the device and observe the raw buffer post-write. This
 *      writer has an *observable* overflow path: when `basisX` is
 *      undefined it falls back to `f32[100] = 1.0`, leaving
 *      `f32[101..111]` at the pre-loop fill-zero state — and the
 *      oversized-slice-position overflow lands exactly on those slots.
 */

import { describe, expect, it } from 'vitest'

import type { QuantumWalkConfig } from '@/lib/geometry/extended/quantumWalk'
import { DEFAULT_QUANTUM_WALK_CONFIG } from '@/lib/geometry/extended/quantumWalk'
import type { TdseConfig } from '@/lib/geometry/extended/tdse'
import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'
import { MAX_SLICE_POSITIONS_WRITE_COUNT } from '@/rendering/webgpu/passes/computePassUtils'
import { packWriteGridUniforms } from '@/rendering/webgpu/passes/QuantumWalkComputePassUniforms'
import { writeTdseUniforms } from '@/rendering/webgpu/passes/TDSEComputePassUniforms'

function mkQwConfig(slicePositions: number[]): QuantumWalkConfig {
  return { ...DEFAULT_QUANTUM_WALK_CONFIG, slicePositions }
}

function viewF32(buf: ArrayBuffer): Float32Array {
  return new Float32Array(buf)
}

// ─── QuantumWalk: store→WGSL index mapping -------------------------------

describe('slicePositions write clamp: QuantumWalk', () => {
  it('MAX_SLICE_POSITIONS_WRITE_COUNT equals 9', () => {
    // The WGSL uniform is `array<f32, 12>` with shader reading `slicePositions[d]`
    // for d >= 3. Store index `i` maps to WGSL index `i + 3`, so `i ∈ [0, 8]`
    // (9 values) are safe. Anything larger overflows the 12-slot region.
    expect(MAX_SLICE_POSITIONS_WRITE_COUNT).toBe(9)
  })

  it('writes store entries at the correct WGSL offset (f32[80 + 3 + i])', () => {
    const config = mkQwConfig([0.11, 0.22, 0.33])
    const buf = packWriteGridUniforms(
      config,
      1,
      1,
      [1, 0, 0, 0],
      undefined,
      undefined,
      undefined,
      1
    )
    const f32 = viewF32(buf)
    // First 3 slots (the d<3 range the shader never reads) stay zero.
    expect(f32[80]).toBe(0)
    expect(f32[81]).toBe(0)
    expect(f32[82]).toBe(0)
    // Three store entries land at f32[83..85].
    expect(f32[83]).toBeCloseTo(0.11, 6)
    expect(f32[84]).toBeCloseTo(0.22, 6)
    expect(f32[85]).toBeCloseTo(0.33, 6)
    // Remaining slicePositions slots (f32[86..91]) stay at zero.
    for (let i = 86; i <= 91; i++) {
      expect(f32[i]).toBe(0)
    }
  })

  it('writes exactly MAX_SLICE_POSITIONS_WRITE_COUNT entries when the store array is oversized', () => {
    // 15 store entries is > MAX_SLICE_POSITIONS_WRITE_COUNT (9) AND > the
    // WGSL array size (12). QuantumWalk's struct ends at the slicePositions
    // region, so the overflow would fall off the ArrayBuffer and silently
    // no-op — we can't observe overflow *corruption* here, but we CAN
    // observe that store[9..14] never appear at the safe slots and that
    // store[0..8] land exactly where expected.
    const MARKER_BASE = 77.0
    const oversized = Array.from({ length: 15 }, (_, i) => MARKER_BASE + (i + 1) * 0.01)
    const config = mkQwConfig(oversized)
    const buf = packWriteGridUniforms(
      config,
      1,
      1,
      [1, 0, 0, 0],
      undefined,
      undefined,
      undefined,
      1
    )
    const f32 = viewF32(buf)

    for (let i = 0; i < MAX_SLICE_POSITIONS_WRITE_COUNT; i++) {
      expect(f32[83 + i]).toBeCloseTo(MARKER_BASE + (i + 1) * 0.01, 3)
    }

    // Store entries 9..14 must NOT appear at the first 3 (unused) slots
    // or past the slicePositions region — i.e., anywhere in f32[80..82]
    // or f32[92..].
    for (let i = MAX_SLICE_POSITIONS_WRITE_COUNT; i < oversized.length; i++) {
      const forbidden = MARKER_BASE + (i + 1) * 0.01
      for (let idx = 80; idx <= 82; idx++) {
        expect(
          Math.abs(f32[idx]! - forbidden),
          `overflow marker ${forbidden} leaked into unused slot f32[${idx}]`
        ).toBeGreaterThan(1e-3)
      }
      for (let idx = 92; idx < f32.length; idx++) {
        expect(
          Math.abs(f32[idx]! - forbidden),
          `overflow marker ${forbidden} leaked into post-region slot f32[${idx}]`
        ).toBeGreaterThan(1e-3)
      }
    }
  })
})

// ─── TDSE: observable overflow into basisX region ------------------------

describe('slicePositions write clamp: TDSE (observable overflow)', () => {
  /**
   * Build a minimal fake GPUDevice that accepts the `queue.writeBuffer`
   * call without doing anything. The writer uses this only to upload the
   * final buffer — we don't care about the upload itself, we only care
   * about the CPU-side `f32` view it leaves behind.
   */
  function fakeDevice(): GPUDevice {
    return {
      queue: {
        writeBuffer: () => {
          /* no-op */
        },
      },
    } as unknown as GPUDevice
  }

  function fakeBuffer(): GPUBuffer {
    return {} as GPUBuffer
  }

  // 800 bytes / 4 — struct grew by 32 bytes (one 16-byte-aligned row) when
  // the analog Hawking block was appended after the black-hole Regge–Wheeler
  // slots. See TDSE_UNIFORM_SIZE in TDSEComputePassResources.ts.
  const TDSE_UNIFORM_F32_COUNT = 200

  function callWriteTdseUniforms(config: TdseConfig): Float32Array {
    const uniformData = new ArrayBuffer(TDSE_UNIFORM_F32_COUNT * 4)
    const u32 = new Uint32Array(uniformData)
    const f32 = new Float32Array(uniformData)
    writeTdseUniforms(fakeDevice(), fakeBuffer(), uniformData, u32, f32, {
      config,
      totalSites: 64 * 64 * 64,
      simTime: 0,
      maxDensity: 1,
      initialMaxDensity: 1,
      autoScaleMaxGain: 1,
      strides: [1, 64, 64 * 64, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      needsInit: false,
      // basisX/Y/Z intentionally undefined so we can observe the raw
      // post-slicePositions state at f32[101..111] — those slots stay at
      // zero with the clamp, but would hold overflow markers without it.
      basisX: undefined,
      basisY: undefined,
      basisZ: undefined,
    })
    return f32
  }

  it('oversized slicePositions do not leak into the basisX region (f32[101..111])', () => {
    // `writeTdseUniforms` maps store[i] → f32[88 + 3 + i], so with an
    // unclamped loop of length 15 the writes would cover f32[91..105].
    // The slicePositions region ends at f32[99] (12 slots: 88..99).
    // Writes beyond f32[99] fall into the basisX region (f32[100..111]).
    //
    // When basisX is undefined, writeTdseUniforms sets ONLY f32[100] = 1.0
    // as a fallback. f32[101..111] stay at the pre-loop u32.fill(0) state
    // — UNLESS the loop overflowed into them. So checking that f32[101..111]
    // are all zero is exactly the assertion that catches the overflow.
    const MARKER_BASE = 77.0
    const oversized = Array.from({ length: 15 }, (_, i) => MARKER_BASE + (i + 1) * 0.01)
    const f32 = callWriteTdseUniforms({ ...DEFAULT_TDSE_CONFIG, slicePositions: oversized })

    // Clamp contract: store[0..8] land at f32[91..99] (the 9 usable
    // slicePositions slots). Verify the last two as a spot-check.
    expect(f32[91]).toBeCloseTo(MARKER_BASE + 0.01, 3)
    expect(f32[99]).toBeCloseTo(MARKER_BASE + 0.09, 3)

    // basisX fallback: f32[100] = 1.0 (the identity first component).
    expect(f32[100]).toBe(1.0)

    // basisX rest (f32[101..111]) is the overflow witness. With the
    // clamp, they must be zero. Without the clamp, f32[101..105] would
    // contain MARKER_BASE + 0.10..0.14.
    for (let idx = 101; idx <= 111; idx++) {
      expect(f32[idx], `basisX overflow witness f32[${idx}]`).toBe(0)
    }
  })

  it('9-entry slicePositions (the exact MAX_SLICE_POSITIONS_WRITE_COUNT) fills the usable region without touching basisX', () => {
    const nine = Array.from({ length: 9 }, (_, i) => 0.1 + i * 0.1)
    const f32 = callWriteTdseUniforms({ ...DEFAULT_TDSE_CONFIG, slicePositions: nine })

    // All 9 store entries land in the slicePositions region.
    for (let i = 0; i < 9; i++) {
      expect(f32[91 + i]).toBeCloseTo(0.1 + i * 0.1, 5)
    }
    // basisX region pristine (only the [100]=1.0 fallback).
    expect(f32[100]).toBe(1.0)
    for (let idx = 101; idx <= 111; idx++) {
      expect(f32[idx]).toBe(0)
    }
  })
})
