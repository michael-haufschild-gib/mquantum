/**
 * Integration tests for the BTZ thermal-state density-grid packer.
 *
 * These tests feed a known configuration into `packAntiDeSitterDensityGrid`
 * and verify the structural signature required by Stage 2A:
 *
 *   - Inside the rendered horizon shell, the bulk R channel is zero
 *     (we don't paint density inside the hole).
 *   - On the horizon shell the amplitude is very high (opaque marker).
 *   - Just outside the shell the amplitude drops (no stray marker bleed)
 *     yet the thermal profile is non-zero somewhere in the bulk annulus.
 *   - The BTZ-enabled density differs substantively from the AdS bound-
 *     state density for the same (d, n, ℓ, m, mL).
 *   - The isTachyon / kwFallbackApplied flags are turned off in BTZ mode
 *     (those diagnostics describe the bound-state path, not the thermal
 *     render).
 *
 * @module tests/lib/physics/antiDeSitter/btzDensityGrid
 */

import { describe, expect, it } from 'vitest'

import { DENSITY_GRID_SIZE } from '@/constants/densityGrid'
import {
  type AntiDeSitterConfig,
  DEFAULT_ANTI_DE_SITTER_CONFIG,
} from '@/lib/geometry/extended/antiDeSitter'
import { packAntiDeSitterDensityGrid } from '@/lib/physics/antiDeSitter/densityGrid'

// The R (normalised |ψ|²) channel lives at byte offset 0 in each RGBA16F
// texel. `packRGBA16F` encodes as half-float so we read it back as such.
function readRChannel(density: Uint16Array, index: number): number {
  return halfToFloat(density[index * 4]!)
}

function halfToFloat(h: number): number {
  const s = (h & 0x8000) >> 15
  const e = (h & 0x7c00) >> 10
  const f = h & 0x03ff
  if (e === 0) {
    // Subnormal / zero
    const val = f === 0 ? 0 : Math.pow(2, -14) * (f / 1024)
    return s ? -val : val
  }
  if (e === 0x1f) {
    // Inf / NaN
    return f === 0 ? (s ? -Infinity : Infinity) : Number.NaN
  }
  const val = Math.pow(2, e - 15) * (1 + f / 1024)
  return s ? -val : val
}

function btzConfig(overrides: Partial<AntiDeSitterConfig> = {}): AntiDeSitterConfig {
  return {
    ...DEFAULT_ANTI_DE_SITTER_CONFIG,
    d: 3,
    btzEnabled: true,
    btzHorizonRadius: 0.3,
    btzOmega: 1.0,
    btzAngularM: 0,
    ...overrides,
  }
}

function voxelIdx(x: number, y: number, z: number): number {
  const N = DENSITY_GRID_SIZE
  return (z * N + y) * N + x
}

/** Convert a world coordinate in [−1, 1] into its voxel index. */
function worldToIdx(w: number): number {
  const N = DENSITY_GRID_SIZE
  // Inverse of `wx = ((x + 0.5) / N) * 2 - 1` ⇒ x = (wx + 1) * N / 2 − 0.5.
  return Math.min(N - 1, Math.max(0, Math.round(((w + 1) * N) / 2 - 0.5)))
}

describe('packAntiDeSitterDensityGrid (BTZ path)', () => {
  it('writes zero R inside the horizon shell at d=3', () => {
    const packed = packAntiDeSitterDensityGrid(btzConfig())
    // Sample the origin and a nearby voxel well inside the horizon.
    const zCenter = worldToIdx(0)
    const xCenter = worldToIdx(0)
    const yCenter = worldToIdx(0)
    const centerIdx = voxelIdx(xCenter, yCenter, zCenter)
    expect(readRChannel(packed.density, centerIdx)).toBe(0)
  })

  it('peaks somewhere near the horizon shell (world radius ≈ 0.37)', () => {
    const packed = packAntiDeSitterDensityGrid(btzConfig())
    const zCenter = worldToIdx(0)
    // Traverse along +x axis and assert there's a voxel with R close to 1
    // inside the expected horizon annulus.
    const yCenter = worldToIdx(0)
    let peakR = 0
    let peakX = 0
    const N = DENSITY_GRID_SIZE
    for (let x = 0; x < N; x++) {
      const wx = ((x + 0.5) / N) * 2 - 1
      if (wx < 0.1 || wx > 0.9) continue
      const r = readRChannel(packed.density, voxelIdx(x, yCenter, zCenter))
      if (r > peakR) {
        peakR = r
        peakX = wx
      }
    }
    // Horizon at world radius ≈ 0.35–0.39 (BTZ_WORLD_HORIZON + shell).
    expect(peakR).toBeGreaterThan(0.5)
    expect(peakX).toBeGreaterThan(0.2)
    expect(peakX).toBeLessThan(0.5)
  })

  it('has non-zero thermal density outside the horizon in the bulk annulus', () => {
    const packed = packAntiDeSitterDensityGrid(btzConfig())
    const zCenter = worldToIdx(0)
    const yCenter = worldToIdx(0)
    // Sample just outside the visible-horizon shell. The thermal profile
    // decays steeply away from the horizon (n_β · (r_+/r)^{2Δ}), so far-out
    // samples land below half-float precision after peak normalisation.
    const xOuter = worldToIdx(0.45)
    const r = readRChannel(packed.density, voxelIdx(xOuter, yCenter, zCenter))
    expect(r).toBeGreaterThan(0)
  })

  it('differs substantively from the bound-state packing at the same (d, n, ℓ, m, mL)', () => {
    const boundState: AntiDeSitterConfig = {
      ...DEFAULT_ANTI_DE_SITTER_CONFIG,
      d: 3,
      btzEnabled: false,
    }
    const btz = btzConfig()
    const p1 = packAntiDeSitterDensityGrid(boundState)
    const p2 = packAntiDeSitterDensityGrid(btz)

    // Count voxels where the R channel differs by more than a small threshold.
    let diffCount = 0
    const total = p1.density.length / 4
    for (let i = 0; i < total; i++) {
      const r1 = readRChannel(p1.density, i)
      const r2 = readRChannel(p2.density, i)
      if (Math.abs(r1 - r2) > 0.05) diffCount++
    }
    // Expect thousands of voxels to differ — single-voxel jitter would mean
    // the BTZ branch accidentally fell through to the bound-state path.
    expect(diffCount).toBeGreaterThan(1000)
  })

  it('reports isTachyon=false and kwFallbackApplied=false (BTZ diagnostics orthogonal to bound-state ones)', () => {
    const packed = packAntiDeSitterDensityGrid(btzConfig({ mL: -1.5 }))
    expect(packed.isTachyon).toBe(false)
    expect(packed.kwFallbackApplied).toBe(false)
  })

  it('ignores btzEnabled when d !== 3 and falls back to the bound-state path', () => {
    const boundStateD4 = packAntiDeSitterDensityGrid({
      ...DEFAULT_ANTI_DE_SITTER_CONFIG,
      d: 4,
      btzEnabled: true, // Honoured only at d=3.
    })
    const boundStateD4Plain = packAntiDeSitterDensityGrid({
      ...DEFAULT_ANTI_DE_SITTER_CONFIG,
      d: 4,
      btzEnabled: false,
    })
    // Both should produce identical density grids because btzEnabled is
    // silently ignored at d=4. Bulk-compare with a single typed-array
    // reduction — using per-byte expect() would time out on a 2 MiB buffer.
    expect(boundStateD4.density.length).toBe(boundStateD4Plain.density.length)
    let firstDiff = -1
    for (let i = 0; i < boundStateD4.density.length; i++) {
      if (boundStateD4.density[i] !== boundStateD4Plain.density[i]) {
        firstDiff = i
        break
      }
    }
    expect(firstDiff).toBe(-1)
  })

  it('varies with horizon radius: doubling r₊ changes the peak position', () => {
    const pSmall = packAntiDeSitterDensityGrid(btzConfig({ btzHorizonRadius: 0.1 }))
    const pLarge = packAntiDeSitterDensityGrid(btzConfig({ btzHorizonRadius: 1.5 }))
    // Different horizon radii imply different temperatures ⇒ different
    // thermal profiles. At least the packed bytes should differ in many voxels.
    let diffCount = 0
    for (let i = 0; i < pSmall.density.length; i += 4) {
      if (pSmall.density[i] !== pLarge.density[i]) diffCount++
    }
    expect(diffCount).toBeGreaterThan(500)
  })

  it('visible horizon scales with r₊: small r₊ draws horizon closer to origin than large r₊', () => {
    // The physical thermal profile in dimensionless BTZ coordinates is r₊-
    // invariant by construction (β·ω√f and (r_+/r)^{2Δ} cancel). To honour
    // the UI tooltip's promise that larger r₊ looks bigger, the packer scales
    // the world-space horizon with r₊. This test locks in that scaling.
    const pSmall = packAntiDeSitterDensityGrid(btzConfig({ btzHorizonRadius: 0.1 }))
    const pLarge = packAntiDeSitterDensityGrid(btzConfig({ btzHorizonRadius: 1.5 }))

    // Scan outward along +x from origin; the first non-zero voxel marks the
    // horizon's outer edge on the +x axis (inside the horizon is a zero disk).
    function rightHorizonEdge(packed: { density: Uint16Array }): number {
      const zCenter = worldToIdx(0)
      const yCenter = worldToIdx(0)
      const N = DENSITY_GRID_SIZE
      const xCenter = worldToIdx(0)
      for (let x = xCenter; x < N; x++) {
        const r = readRChannel(packed.density, voxelIdx(x, yCenter, zCenter))
        if (r > 0) {
          return ((x + 0.5) / N) * 2 - 1
        }
      }
      return Number.POSITIVE_INFINITY
    }

    const smallEdge = rightHorizonEdge(pSmall)
    const largeEdge = rightHorizonEdge(pLarge)
    expect(Number.isFinite(smallEdge)).toBe(true)
    expect(Number.isFinite(largeEdge)).toBe(true)
    // Large r₊ pushes the horizon further along +x; the edge gap should be
    // comfortably above voxel quantisation (1 voxel ≈ 0.03 world units at
    // N=64, so a 0.15 margin catches the intended scaling).
    expect(largeEdge - smallEdge).toBeGreaterThan(0.15)
  })

  it('varies with m_angular: non-zero m_A breaks the rotational symmetry', () => {
    const pIso = packAntiDeSitterDensityGrid(btzConfig({ btzAngularM: 0 }))
    const pAniso = packAntiDeSitterDensityGrid(btzConfig({ btzAngularM: 3 }))
    let diffCount = 0
    for (let i = 0; i < pIso.density.length; i += 4) {
      if (pIso.density[i] !== pAniso.density[i]) diffCount++
    }
    expect(diffCount).toBeGreaterThan(500)
  })
})

describe('packAntiDeSitterDensityGrid (d=3 S¹ angular regression)', () => {
  it('bound-state (d=3, l=1, m=0) produces a cos²(φ) ribbon, not Y_ℓm(π/2) zeros', () => {
    // Pre-fix the bulk pack evaluated sphericalHarmonicReal(1, 0, θ, φ) with
    // θ = acos(wz / |v|). At the z=0 equator this reduces to cos(π/2) = 0
    // — the entire equatorial slab read zero density. Post-fix the S¹-native
    // adsAngularHarmonic renders cos²(φ) regardless of wz, so +x and +y
    // differ while both remain non-zero.
    const packed = packAntiDeSitterDensityGrid({
      ...DEFAULT_ANTI_DE_SITTER_CONFIG,
      d: 3,
      n: 0,
      l: 1,
      m: 0,
      btzEnabled: false,
    })
    const zC = worldToIdx(0)
    const yC = worldToIdx(0)
    const xPos = readRChannel(packed.density, voxelIdx(worldToIdx(0.4), yC, zC))
    const yPos = readRChannel(packed.density, voxelIdx(worldToIdx(0), worldToIdx(0.4), zC))
    // +x (φ=0) should sit near the cos² maximum; +y (φ=π/2) near the node.
    expect(xPos).toBeGreaterThan(0.1)
    expect(xPos).toBeGreaterThan(yPos + 0.05)
  })
})
