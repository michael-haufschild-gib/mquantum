/**
 * Stage 2B — Integration tests for the HKLL density-grid packer.
 *
 * Verifies:
 *   - HKLL-enabled config routes through `packHkllReconstructedDensityGrid`
 *     rather than the bound-state path.
 *   - Localized source produces a bulk density peaked along the spot axis
 *     (+x) rather than isotropic.
 *   - Plane wave source produces an azimuthal pattern (the packed R
 *     channel differs substantively between φ = 0 and φ = π for m_b ≥ 1).
 *   - Diagnostics (`isTachyon`, `kwFallbackApplied`) are well-defined.
 *
 * @module tests/lib/physics/antiDeSitter/hkllDensityGrid
 */

import { describe, expect, it } from 'vitest'

import { DENSITY_GRID_SIZE } from '@/constants/densityGrid'
import {
  type AntiDeSitterConfig,
  DEFAULT_ANTI_DE_SITTER_CONFIG,
} from '@/lib/geometry/extended/antiDeSitter'
import {
  createAdsPackerScratch,
  packAntiDeSitterDensityGrid,
} from '@/lib/physics/antiDeSitter/densityGrid'

// Decode the half-float R channel (byte offset 0 in each rgba16float texel).
function halfToFloat(h: number): number {
  const s = (h & 0x8000) >> 15
  const e = (h & 0x7c00) >> 10
  const f = h & 0x03ff
  if (e === 0) {
    const val = f === 0 ? 0 : Math.pow(2, -14) * (f / 1024)
    return s ? -val : val
  }
  if (e === 0x1f) {
    return f === 0 ? (s ? -Infinity : Infinity) : Number.NaN
  }
  const val = Math.pow(2, e - 15) * (1 + f / 1024)
  return s ? -val : val
}

function readRChannel(density: Uint16Array, index: number): number {
  return halfToFloat(density[index * 4]!)
}

function expectFinitePackedDensity(packed: { density: Uint16Array }): void {
  for (let i = 0; i < packed.density.length; i++) {
    const value = halfToFloat(packed.density[i]!)
    if (!Number.isFinite(value)) {
      throw new Error(`density[${i}] encoded non-finite half-float ${value}`)
    }
  }
}

function voxelIdx(x: number, y: number, z: number): number {
  const N = DENSITY_GRID_SIZE
  return (z * N + y) * N + x
}

function worldToIdx(w: number): number {
  const N = DENSITY_GRID_SIZE
  return Math.min(N - 1, Math.max(0, Math.round(((w + 1) * N) / 2 - 0.5)))
}

function hkllConfig(overrides: Partial<AntiDeSitterConfig> = {}): AntiDeSitterConfig {
  return {
    ...DEFAULT_ANTI_DE_SITTER_CONFIG,
    d: 4,
    hkllEnabled: true,
    hkllBoundarySource: 'eigenstate',
    ...overrides,
  }
}

describe('packAntiDeSitterDensityGrid (HKLL path)', () => {
  it('HKLL-enabled config produces a density grid distinct from the bound-state packing', () => {
    const boundState = packAntiDeSitterDensityGrid({
      ...DEFAULT_ANTI_DE_SITTER_CONFIG,
      d: 4,
      n: 0,
      l: 1,
      m: 0,
    })
    const hkll = packAntiDeSitterDensityGrid(hkllConfig({ n: 0, l: 1, m: 0 }))

    let diffCount = 0
    for (let i = 0; i < boundState.density.length; i += 4) {
      if (boundState.density[i] !== hkll.density[i]) diffCount++
    }
    // The HKLL reconstruction isn't a bit-exact match to the bound state —
    // different numerical path, different peak. Expect many voxels to differ.
    expect(diffCount).toBeGreaterThan(1000)
  })

  it('localized source peaks along the spot axis (+x)', () => {
    const packed = packAntiDeSitterDensityGrid(
      hkllConfig({ hkllBoundarySource: 'localized', hkllSourceSigma: 0.25 })
    )
    const zC = worldToIdx(0)
    const yC = worldToIdx(0)
    // +x mid-radius voxel (spot direction).
    const xPos = worldToIdx(0.6)
    // -x mid-radius voxel (opposite direction).
    const xNeg = worldToIdx(-0.6)
    const rPos = readRChannel(packed.density, voxelIdx(xPos, yC, zC))
    const rNeg = readRChannel(packed.density, voxelIdx(xNeg, yC, zC))
    // Beam direction must be brighter than the antipode — if the kernel
    // sign or the boundary-Ω geometry is flipped this fails.
    expect(rPos).toBeGreaterThan(rNeg)
    expect(rPos).toBeGreaterThan(0)
  })

  it('plane-wave source breaks the azimuthal symmetry', () => {
    const packed = packAntiDeSitterDensityGrid(
      hkllConfig({ hkllBoundarySource: 'planeWave', hkllPlaneWaveM: 3 })
    )
    const zC = worldToIdx(0)
    // Sample density at several φ positions around a mid-radius ring.
    const samples: number[] = []
    const N = DENSITY_GRID_SIZE
    const ringRadiusWorld = 0.5
    for (let k = 0; k < 12; k++) {
      const phi = (k / 12) * 2 * Math.PI
      const wx = ringRadiusWorld * Math.cos(phi)
      const wy = ringRadiusWorld * Math.sin(phi)
      const ix = Math.min(N - 1, Math.max(0, Math.round(((wx + 1) * N) / 2 - 0.5)))
      const iy = Math.min(N - 1, Math.max(0, Math.round(((wy + 1) * N) / 2 - 0.5)))
      samples.push(readRChannel(packed.density, voxelIdx(ix, iy, zC)))
    }
    const min = Math.min(...samples)
    const max = Math.max(...samples)
    // Rotational symmetry is broken when max >> min; isotropic would give
    // max ≈ min. Threshold gives plenty of margin against numerical noise.
    expect(max - min).toBeGreaterThan(0.05)
  })

  it('reports isTachyon=false and stable effectiveDelta for a BF-safe HKLL config', () => {
    const packed = packAntiDeSitterDensityGrid(hkllConfig())
    expect(packed.isTachyon).toBe(false)
    // d=4, mL=0 → Δ = 3.
    expect(packed.effectiveDelta).toBeCloseTo(3, 6)
  })

  it('eigenstate reconstruction at (d=3, l=1) is non-zero (S¹ basis regression)', () => {
    // Pre-fix the boundary evaluator called Y_1^0(π/2, φ) which is zero, so
    // the reconstructed bulk was identically zero. Post-fix the S¹-native
    // adsAngularHarmonic returns cos(φ)/√π and the reconstruction shows a
    // cos(φ)² azimuthal profile. Peak normalisation concentrates the R
    // channel near the HKLL peak (close to the boundary) so mid-bulk
    // samples are small in absolute terms — we assert the ANGULAR ratio.
    const packed = packAntiDeSitterDensityGrid(
      hkllConfig({ d: 3, n: 0, l: 1, m: 0, hkllBoundarySource: 'eigenstate' })
    )
    const zC = worldToIdx(0)
    // Find the peak along +x for this state, then compare that voxel's R
    // to the corresponding voxel rotated by 90° (φ=π/2) which should be at
    // a cos²(φ) node.
    const N = DENSITY_GRID_SIZE
    let peakX = 0
    let peakR = 0
    for (let x = 0; x < N; x++) {
      const wx = ((x + 0.5) / N) * 2 - 1
      if (wx <= 0.05 || wx >= 0.95) continue
      const r = readRChannel(packed.density, voxelIdx(x, worldToIdx(0), zC))
      if (r > peakR) {
        peakR = r
        peakX = wx
      }
    }
    // Compare the +x peak against the same-radius voxel on +y (cos²(π/2)=0).
    const rAtYNode = readRChannel(packed.density, voxelIdx(worldToIdx(0), worldToIdx(peakX), zC))
    expect(peakR).toBeGreaterThan(0)
    expect(peakR).toBeGreaterThan(rAtYNode + 1e-4)
  })

  it('sanitizes malformed HKLL config before CPU packing', () => {
    const packed = packAntiDeSitterDensityGrid(
      hkllConfig({
        d: Number.NaN,
        n: Number.POSITIVE_INFINITY,
        l: Number.POSITIVE_INFINITY,
        m: Number.NEGATIVE_INFINITY,
        mL: Number.POSITIVE_INFINITY,
        branch: 'bad-branch' as never,
        hkllBoundarySource: 'planeWave',
        hkllSourceSigma: Number.NaN,
        hkllPlaneWaveM: Number.POSITIVE_INFINITY,
      })
    )

    expect(packed.gridSize).toBe(DENSITY_GRID_SIZE)
    expect(Number.isFinite(packed.peakDensity)).toBe(true)
    expect(Number.isFinite(packed.effectiveDelta)).toBe(true)
    expectFinitePackedDensity(packed)
  })

  it('does not reuse incompatible HKLL scratch buffers', () => {
    const scratch = {
      ...createAdsPackerScratch(DENSITY_GRID_SIZE),
      hkllIm: new Float32Array(1),
    }

    const packed = packAntiDeSitterDensityGrid(
      hkllConfig({ hkllBoundarySource: 'localized' }),
      scratch
    )

    expect(packed.peakDensity).toBeGreaterThan(0)
    expectFinitePackedDensity(packed)
  })
})

describe('packAntiDeSitterDensityGrid malformed config defense', () => {
  it('sanitizes malformed bound-state config before CPU packing', () => {
    const packed = packAntiDeSitterDensityGrid({
      ...DEFAULT_ANTI_DE_SITTER_CONFIG,
      d: Number.NaN,
      n: Number.POSITIVE_INFINITY,
      l: Number.NEGATIVE_INFINITY,
      m: Number.POSITIVE_INFINITY,
      mL: Number.NEGATIVE_INFINITY,
      branch: 'bad-branch' as never,
      boundaryOverlay: true,
      btzEnabled: false,
      hkllEnabled: false,
    })

    expect(packed.gridSize).toBe(DENSITY_GRID_SIZE)
    expect(packed.peakDensity).toBeGreaterThan(0)
    expect(Number.isFinite(packed.peakDensity)).toBe(true)
    expect(Number.isFinite(packed.effectiveDelta)).toBe(true)
    expectFinitePackedDensity(packed)
  })
})
