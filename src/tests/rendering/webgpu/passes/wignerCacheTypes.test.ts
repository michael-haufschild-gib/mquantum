/**
 * Unit tests for the CPU-side Wigner cross-pair mapping and coefficient
 * computation plumbing that bridges the two-phase Wigner cache pipeline.
 *
 * Why these exist
 * ───────────────
 * The Wigner cache has three CPU-side glue functions:
 *
 *   1. `buildCrossPairMap(termCount)` — iterates j<k pairs and assigns each
 *      pair a layer index (2 pairs per layer) and channel offset (.rg or
 *      .ba). This mapping is consumed by BOTH the spatial precompute
 *      (writes) and the reconstruction (reads). A bug in this function
 *      silently corrupts every cross-term Wigner visualization.
 *
 *   2. `computeReconstructCoefficients(...)` — reads c_j and E_j from the
 *      Schroedinger uniform ArrayBuffer, computes per-pair phased
 *      coefficients `2 * (c_j^* c_k * e^{-i (E_j - E_k) t})`, and writes
 *      them into the per-frame reconstruction uniform. Lots of index
 *      arithmetic over packed vec4f arrays (coeff uses 4-stride, energy
 *      uses dense packing) — easy to misread.
 *
 *   3. `uploadWignerSpatialParams(...)` — writes the layer-to-pair mapping
 *      into the WGSL `array<vec4i, 14>` uniform region of
 *      `WignerSpatialParams`. Writes past byte 239 of the 240-byte
 *      `ArrayBuffer` are silent no-ops (Int32Array writes past byteLength
 *      do nothing), so an oversized termCount would silently corrupt the
 *      visualization.
 *
 * Before this file existed, none of these functions had any test coverage
 * at all. The tests here lock in:
 *
 *   - Pair count / ordering / layer mapping for termCount 1..8 (full range)
 *   - Time-evolution phase convention for computeReconstructCoefficients
 *     (t=0 identity, pi-flip, factor-of-2 baked in)
 *   - The new runtime guards in uploadWignerSpatialParams and
 *     computeReconstructCoefficients that block termCount > 8 from
 *     silently corrupting the WGSL uniform struct.
 *
 * @module tests/rendering/webgpu/passes/wignerCacheTypes
 */

import { describe, expect, it } from 'vitest'

import { uploadWignerSpatialParams } from '@/rendering/webgpu/passes/WignerCacheComputePassSetup'
import {
  buildCrossPairMap,
  computeReconstructCoefficients,
  type CrossPairInfo,
  MAX_WIGNER_CROSS_LAYERS,
  MAX_WIGNER_CROSS_PAIRS,
  MAX_WIGNER_TERM_COUNT,
  SCHROEDINGER_COEFF_FLOAT_INDEX,
  SCHROEDINGER_ENERGY_FLOAT_INDEX,
} from '@/rendering/webgpu/passes/wignerCacheTypes'
import { WIGNER_RECONSTRUCT_PARAMS_SIZE } from '@/rendering/webgpu/shaders/schroedinger/compute/wignerReconstruct.wgsl'
import { WIGNER_SPATIAL_PARAMS_SIZE } from '@/rendering/webgpu/shaders/schroedinger/compute/wignerSpatial.wgsl'

// ─── Test helpers ──────────────────────────────────────────────────────

/** Minimal fake GPUDevice that logs queue.writeBuffer calls so we can
 *  assert on the packed bytes *without* a real GPU. */
function fakeDeviceWithRecorder(): {
  device: GPUDevice
  writes: { buffer: GPUBuffer; offset: number; data: ArrayBuffer }[]
} {
  const writes: { buffer: GPUBuffer; offset: number; data: ArrayBuffer }[] = []
  const device = {
    queue: {
      writeBuffer: (buffer: GPUBuffer, offset: number, data: ArrayBuffer | ArrayBufferView) => {
        const ab =
          data instanceof ArrayBuffer
            ? data
            : (data.buffer as ArrayBuffer).slice(data.byteOffset, data.byteOffset + data.byteLength)
        writes.push({ buffer, offset, data: ab })
      },
    },
  } as unknown as GPUDevice
  return { device, writes }
}

function fakeBuffer(): GPUBuffer {
  return {} as GPUBuffer
}

/** Build a minimal Schroedinger uniform ArrayBuffer with specific
 *  coefficients and energies at the documented offsets. All other slots
 *  are zero. Caller supplies arrays in term-index order. */
function makeSchroedingerData(
  coeffs: Array<[number, number]>, // (Re, Im) per term
  energies: number[]
): ArrayBuffer {
  // 1088 bytes is comfortably larger than the actual SCHROEDINGER_UNIFORM_SIZE;
  // we only touch the coeff (at float index 104) and energy (at float index 136)
  // slots, and nothing else, so any over-allocation is fine.
  const bytes = 1088
  const buf = new ArrayBuffer(bytes)
  const f32 = new Float32Array(buf)
  for (let j = 0; j < coeffs.length; j++) {
    // coeff is `array<vec4f, 8>` — each term occupies 4 floats (Re, Im, pad, pad).
    f32[SCHROEDINGER_COEFF_FLOAT_INDEX + j * 4] = coeffs[j]![0]
    f32[SCHROEDINGER_COEFF_FLOAT_INDEX + j * 4 + 1] = coeffs[j]![1]
  }
  for (let j = 0; j < energies.length; j++) {
    // energy is `array<vec4f, 2>` with 4 energies packed per vec4f (dense stride 1).
    f32[SCHROEDINGER_ENERGY_FLOAT_INDEX + j] = energies[j]!
  }
  return buf
}

// ─── buildCrossPairMap ─────────────────────────────────────────────────

describe('buildCrossPairMap', () => {
  it('termCount = 1: zero pairs, zero layers', () => {
    const { crossPairs, numCrossLayers } = buildCrossPairMap(1)
    expect(crossPairs).toEqual([])
    expect(numCrossLayers).toBe(0)
  })

  it('termCount = 2: one pair, one layer', () => {
    const { crossPairs, numCrossLayers } = buildCrossPairMap(2)
    expect(crossPairs).toEqual<CrossPairInfo[]>([
      { termJ: 0, termK: 1, layerIndex: 0, channelOffset: 0 },
    ])
    expect(numCrossLayers).toBe(1)
  })

  it('termCount = 3: three pairs, two layers (second layer holds one pair)', () => {
    const { crossPairs, numCrossLayers } = buildCrossPairMap(3)
    expect(crossPairs).toEqual<CrossPairInfo[]>([
      { termJ: 0, termK: 1, layerIndex: 0, channelOffset: 0 },
      { termJ: 0, termK: 2, layerIndex: 0, channelOffset: 1 },
      { termJ: 1, termK: 2, layerIndex: 1, channelOffset: 0 },
    ])
    expect(numCrossLayers).toBe(2)
  })

  it('termCount = 8 (max): 28 pairs, 14 layers', () => {
    const { crossPairs, numCrossLayers } = buildCrossPairMap(8)
    expect(crossPairs).toHaveLength(28)
    expect(numCrossLayers).toBe(14)
    // Every pair appears with termJ < termK.
    for (const p of crossPairs) {
      expect(p.termJ).toBeLessThan(p.termK)
    }
    // No duplicate (j, k) combinations.
    const seen = new Set<string>()
    for (const p of crossPairs) {
      const key = `${p.termJ},${p.termK}`
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
    // 2 pairs per layer in the first 13 layers, 2 in the last (28 = 14*2).
    const byLayer = new Map<number, number>()
    for (const p of crossPairs) {
      byLayer.set(p.layerIndex, (byLayer.get(p.layerIndex) ?? 0) + 1)
    }
    for (const count of byLayer.values()) {
      expect(count).toBe(2)
    }
  })

  it('channel offsets alternate 0, 1, 0, 1, ...', () => {
    const { crossPairs } = buildCrossPairMap(5)
    for (let i = 0; i < crossPairs.length; i++) {
      expect(crossPairs[i]!.channelOffset).toBe(i % 2)
    }
  })

  it('respects the documented C(termCount, 2) pair-count formula', () => {
    for (let tc = 1; tc <= 8; tc++) {
      const { crossPairs, numCrossLayers } = buildCrossPairMap(tc)
      expect(crossPairs.length).toBe((tc * (tc - 1)) / 2)
      expect(numCrossLayers).toBe(Math.ceil(crossPairs.length / 2))
    }
  })
})

// ─── computeReconstructCoefficients ────────────────────────────────────

describe('computeReconstructCoefficients', () => {
  /** Allocate the per-frame reconstruction buffer exactly as
   *  `WignerCacheComputePass` does at construction time. */
  function allocReconstructBuffers() {
    const data = new ArrayBuffer(WIGNER_RECONSTRUCT_PARAMS_SIZE)
    return { data, f32: new Float32Array(data), u32: new Uint32Array(data) }
  }

  it('t=0 with real coefficients: phase is 1, factor of 2 applied, imaginary parts zero', () => {
    const { crossPairs } = buildCrossPairMap(2) // one pair: (0, 1)
    const sch = makeSchroedingerData(
      [
        [0.6, 0.0], // c_0 = 0.6 (real)
        [0.8, 0.0], // c_1 = 0.8 (real)
      ],
      [1.0, 2.0] // E_0, E_1
    )
    const { f32, u32 } = allocReconstructBuffers()
    computeReconstructCoefficients(crossPairs, sch, 0, 1, f32, u32)

    expect(u32[0]).toBe(1) // numPairs written to header
    // Pair 0 at float offset 4:
    //   phasedRe = 2 * Re(c_0^* c_1 * 1) = 2 * (0.6 * 0.8) = 0.96
    //   phasedIm = 2 * Im(...) = 0
    //   layerIndex = 0, channelOffset = 0
    expect(f32[4]).toBeCloseTo(0.96, 6)
    expect(f32[5]).toBeCloseTo(0, 6)
    expect(f32[6]).toBe(0) // layerIndex
    expect(f32[7]).toBe(0) // channelOffset
  })

  it('phase angle = pi (dE = pi, t = 1, timeScale = 1): phasedRe flips sign for real coefficients', () => {
    const { crossPairs } = buildCrossPairMap(2)
    const sch = makeSchroedingerData(
      [
        [0.5, 0.0],
        [0.5, 0.0],
      ],
      [Math.PI, 0] // E_0 - E_1 = pi
    )
    const { f32, u32 } = allocReconstructBuffers()
    // phaseAngle = -(E_j - E_k) * t = -pi, cos(-pi) = -1, sin(-pi) ≈ 0
    //   phasedRe = 2 * (prodRe * -1 - prodIm * 0) = -2 * (0.25) = -0.5
    //   phasedIm ≈ 0
    computeReconstructCoefficients(crossPairs, sch, 1, 1, f32, u32)
    expect(u32[0]).toBe(1)
    expect(f32[4]).toBeCloseTo(-0.5, 6)
    expect(f32[5]).toBeCloseTo(0, 6)
  })

  it('timeScale multiplies time: same effective angle with doubled time and halved scale', () => {
    const { crossPairs } = buildCrossPairMap(2)
    const sch = makeSchroedingerData(
      [
        [0.5, 0.0],
        [0.5, 0.0],
      ],
      [1, 0]
    )
    const a = allocReconstructBuffers()
    const b = allocReconstructBuffers()
    computeReconstructCoefficients(crossPairs, sch, 2.0, 0.5, a.f32, a.u32)
    computeReconstructCoefficients(crossPairs, sch, 1.0, 1.0, b.f32, b.u32)
    // Both reduce to phaseAngle = -(1 - 0) * 1 = -1 rad, so phasedRe and
    // phasedIm must match bit-for-bit.
    expect(a.f32[4]).toBeCloseTo(b.f32[4]!, 10)
    expect(a.f32[5]).toBeCloseTo(b.f32[5]!, 10)
  })

  it('layer index and channel offset round-trip through the output buffer', () => {
    // termCount = 4 → 6 pairs: (0,1),(0,2),(0,3),(1,2),(1,3),(2,3)
    // layer 0: pairs 0,1; layer 1: pairs 2,3; layer 2: pairs 4,5
    // channels alternate 0,1,0,1,0,1
    const { crossPairs } = buildCrossPairMap(4)
    const coeffs: Array<[number, number]> = [
      [1, 0],
      [1, 0],
      [1, 0],
      [1, 0],
    ]
    const energies = [0, 0, 0, 0]
    const sch = makeSchroedingerData(coeffs, energies)
    const { f32, u32 } = allocReconstructBuffers()
    computeReconstructCoefficients(crossPairs, sch, 0, 0, f32, u32)

    expect(u32[0]).toBe(6)
    for (let i = 0; i < 6; i++) {
      const baseIdx = 4 + i * 4
      // All phases are 1 and all coefficients are (1,0), so phasedRe = 2
      // and phasedIm = 0 for every pair.
      expect(f32[baseIdx + 0]).toBe(2)
      expect(f32[baseIdx + 1]).toBe(0)
      expect(f32[baseIdx + 2]).toBe(Math.floor(i / 2)) // layerIndex
      expect(f32[baseIdx + 3]).toBe(i % 2) // channelOffset
    }
  })

  it('zero pairs (termCount = 1): buffer stays all-zero except numPairs header', () => {
    const { crossPairs } = buildCrossPairMap(1)
    const sch = makeSchroedingerData([[1, 0]], [0])
    const { f32, u32 } = allocReconstructBuffers()
    computeReconstructCoefficients(crossPairs, sch, 5, 3, f32, u32)
    expect(u32[0]).toBe(0)
    // No pair data should be written past the header.
    for (let i = 4; i < f32.length; i++) {
      expect(f32[i]).toBe(0)
    }
  })

  it('throws when crossPairs.length > MAX_WIGNER_CROSS_PAIRS (capacity guard)', () => {
    // Build a synthetic oversized array — this simulates a future refactor
    // that widens the termCount literal union without updating the WGSL
    // struct size. The guard must fire before we silently write past the
    // end of the reconstruction buffer.
    const oversized: CrossPairInfo[] = []
    for (let i = 0; i <= MAX_WIGNER_CROSS_PAIRS; i++) {
      oversized.push({ termJ: 0, termK: 1, layerIndex: 0, channelOffset: 0 })
    }
    const sch = makeSchroedingerData([[1, 0]], [0])
    const { f32, u32 } = allocReconstructBuffers()
    expect(() => computeReconstructCoefficients(oversized, sch, 0, 0, f32, u32)).toThrow(
      /MAX_WIGNER_CROSS_PAIRS/
    )
  })
})

// ─── uploadWignerSpatialParams ─────────────────────────────────────────

describe('uploadWignerSpatialParams', () => {
  it('writes numPairs, numLayers, and layerPairs at the documented offsets', () => {
    const { crossPairs, numCrossLayers } = buildCrossPairMap(4) // 6 pairs, 3 layers
    const { device, writes } = fakeDeviceWithRecorder()
    uploadWignerSpatialParams(device, fakeBuffer(), crossPairs, numCrossLayers)

    expect(writes).toHaveLength(1)
    const w = writes[0]!
    expect(w.offset).toBe(0)
    expect(w.data.byteLength).toBe(WIGNER_SPATIAL_PARAMS_SIZE)

    const u32 = new Uint32Array(w.data)
    const i32 = new Int32Array(w.data)
    expect(u32[0]).toBe(6) // numPairs
    expect(u32[1]).toBe(3) // numLayers

    // layerPairs at i32 index 4 (byte 16).
    // Layer 0: (0, 1), (0, 2) → i32[4..7] = [0, 1, 0, 2]
    expect(i32[4]).toBe(0)
    expect(i32[5]).toBe(1)
    expect(i32[6]).toBe(0)
    expect(i32[7]).toBe(2)
    // Layer 1: (0, 3), (1, 2) → i32[8..11] = [0, 3, 1, 2]
    expect(i32[8]).toBe(0)
    expect(i32[9]).toBe(3)
    expect(i32[10]).toBe(1)
    expect(i32[11]).toBe(2)
    // Layer 2: (1, 3), (2, 3) → i32[12..15] = [1, 3, 2, 3]
    expect(i32[12]).toBe(1)
    expect(i32[13]).toBe(3)
    expect(i32[14]).toBe(2)
    expect(i32[15]).toBe(3)
  })

  it('pads the second pair slot with -1 when a layer has only one pair (odd total)', () => {
    const { crossPairs, numCrossLayers } = buildCrossPairMap(3) // 3 pairs, 2 layers
    expect(numCrossLayers).toBe(2)
    const { device, writes } = fakeDeviceWithRecorder()
    uploadWignerSpatialParams(device, fakeBuffer(), crossPairs, numCrossLayers)

    const w = writes[0]!
    const i32 = new Int32Array(w.data)
    // Layer 0: (0, 1), (0, 2) → full
    expect(i32[4]).toBe(0)
    expect(i32[5]).toBe(1)
    expect(i32[6]).toBe(0)
    expect(i32[7]).toBe(2)
    // Layer 1: (1, 2), —  → second pair padded with (-1, -1)
    expect(i32[8]).toBe(1)
    expect(i32[9]).toBe(2)
    expect(i32[10]).toBe(-1)
    expect(i32[11]).toBe(-1)
  })

  it('fills exactly at the max termCount without overflowing the 240-byte struct', () => {
    const { crossPairs, numCrossLayers } = buildCrossPairMap(MAX_WIGNER_TERM_COUNT)
    expect(numCrossLayers).toBe(MAX_WIGNER_CROSS_LAYERS)
    const { device, writes } = fakeDeviceWithRecorder()
    uploadWignerSpatialParams(device, fakeBuffer(), crossPairs, numCrossLayers)

    const w = writes[0]!
    expect(w.data.byteLength).toBe(WIGNER_SPATIAL_PARAMS_SIZE)
    const u32 = new Uint32Array(w.data)
    expect(u32[0]).toBe(MAX_WIGNER_CROSS_PAIRS)
    expect(u32[1]).toBe(MAX_WIGNER_CROSS_LAYERS)
    // Last written slot is layer 13 = i32[56..59]. Beyond that the struct is
    // sealed — nothing to overflow into.
    const i32 = new Int32Array(w.data)
    // Layer 13 must not be (0,0,0,0) because every layer received real pairs.
    expect([i32[56], i32[57], i32[58], i32[59]]).not.toEqual([0, 0, 0, 0])
  })

  it('throws when numCrossLayers > MAX_WIGNER_CROSS_LAYERS (capacity guard)', () => {
    const { device } = fakeDeviceWithRecorder()
    // Build a plausible-but-oversized layer count. Pairs array can be empty
    // because the guard fires on `numCrossLayers` first.
    expect(() =>
      uploadWignerSpatialParams(device, fakeBuffer(), [], MAX_WIGNER_CROSS_LAYERS + 1)
    ).toThrow(/MAX_WIGNER_CROSS_LAYERS/)
  })

  it('throws when crossPairs.length > MAX_WIGNER_CROSS_PAIRS even if numCrossLayers is in range', () => {
    const { device } = fakeDeviceWithRecorder()
    const oversized: CrossPairInfo[] = []
    for (let i = 0; i <= MAX_WIGNER_CROSS_PAIRS; i++) {
      oversized.push({ termJ: 0, termK: 1, layerIndex: 0, channelOffset: 0 })
    }
    expect(() =>
      uploadWignerSpatialParams(device, fakeBuffer(), oversized, MAX_WIGNER_CROSS_LAYERS)
    ).toThrow(/MAX_WIGNER_CROSS_PAIRS/)
  })
})

// ─── Static invariants ─────────────────────────────────────────────────

describe('MAX_WIGNER_* capacity invariants', () => {
  it('MAX_WIGNER_TERM_COUNT = 8 (matches TdseConfig.termCount literal union)', () => {
    expect(MAX_WIGNER_TERM_COUNT).toBe(8)
  })

  it('MAX_WIGNER_CROSS_PAIRS = C(8, 2) = 28', () => {
    expect(MAX_WIGNER_CROSS_PAIRS).toBe(28)
  })

  it('MAX_WIGNER_CROSS_LAYERS = ceil(28 / 2) = 14 (matches WGSL array<vec4i, 14>)', () => {
    expect(MAX_WIGNER_CROSS_LAYERS).toBe(14)
  })

  it('spatial params buffer fits exactly: 16 header + 14 * 16 = 240 bytes', () => {
    expect(WIGNER_SPATIAL_PARAMS_SIZE).toBe(16 + MAX_WIGNER_CROSS_LAYERS * 16)
  })

  it('reconstruct params buffer has headroom for 29 vec4f slots (WGSL 16-byte-alignment quirk)', () => {
    // 16-byte header + 29 pair slots * 16 bytes = 480.
    expect(WIGNER_RECONSTRUCT_PARAMS_SIZE).toBe(16 + 29 * 16)
    // The actual usable cap is 28 pairs (MAX_WIGNER_CROSS_PAIRS) — the 29th
    // slot exists only so the total is a multiple of 16 per WGSL uniform
    // buffer alignment rules. Not a capacity increase.
    expect(MAX_WIGNER_CROSS_PAIRS).toBeLessThan(29)
  })
})
