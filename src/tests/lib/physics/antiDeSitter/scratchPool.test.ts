/**
 * Regression tests for the pooled-scratch API added to the AdS density packer.
 *
 * The scratch pool reuses Float32 / Uint16 buffers across repeated packs. The
 * real failure mode of a misuse (forgetting to clear stale voxels, wrong-sized
 * coarse grid, strategy adoption dropping the pool) is stale density bleeding
 * from a prior pack into the current one. These tests confirm:
 *
 *   - Pooled and unpooled paths produce bit-identical density bytes.
 *   - The pool survives heterogeneous pack sequences (HKLL → BTZ → bound-state
 *     at d=3, and a bound-state-at-d=4 pass afterwards) without leaking voxels
 *     from one path into the next.
 *   - Calling the boundary-overlay path without a scratch pool still returns a
 *     clean alpha channel (no boundary data leaks through the `null` branch).
 *
 * @module tests/lib/physics/antiDeSitter/scratchPool
 */

import { describe, expect, it } from 'vitest'

import {
  type AntiDeSitterConfig,
  DEFAULT_ANTI_DE_SITTER_CONFIG,
} from '@/lib/geometry/extended/antiDeSitter'
import {
  createAdsPackerScratch,
  packAntiDeSitterDensityGrid,
} from '@/lib/physics/antiDeSitter/densityGrid'

function cfg(overrides: Partial<AntiDeSitterConfig>): AntiDeSitterConfig {
  return { ...DEFAULT_ANTI_DE_SITTER_CONFIG, ...overrides }
}

describe('AdS packer scratch pool', () => {
  it('pooled pack matches unpooled pack for bound-state config', () => {
    const config = cfg({ d: 4, n: 0, l: 1, m: 0, boundaryOverlay: true })
    const scratch = createAdsPackerScratch()
    const pooled = packAntiDeSitterDensityGrid(config, scratch)
    const fresh = packAntiDeSitterDensityGrid(config)
    // The packer writes every voxel in both branches; the returned density
    // buffer must be byte-identical. Compare with a typed-array walk rather
    // than `toEqual` — the 2 MiB buffer would blow up the Vitest diff.
    expect(pooled.density.length).toBe(fresh.density.length)
    for (let i = 0; i < pooled.density.length; i++) {
      if (pooled.density[i] !== fresh.density[i]) {
        throw new Error(`density[${i}] pooled=${pooled.density[i]} fresh=${fresh.density[i]}`)
      }
    }
    expect(pooled.peakDensity).toBeCloseTo(fresh.peakDensity, 12)
  })

  it('pooled pack matches unpooled pack for BTZ config', () => {
    const config = cfg({
      d: 3,
      btzEnabled: true,
      btzHorizonRadius: 0.3,
      btzOmega: 2,
      btzAngularM: 2,
    })
    const scratch = createAdsPackerScratch()
    const pooled = packAntiDeSitterDensityGrid(config, scratch)
    const fresh = packAntiDeSitterDensityGrid(config)
    expect(pooled.density.length).toBe(fresh.density.length)
    for (let i = 0; i < pooled.density.length; i++) {
      if (pooled.density[i] !== fresh.density[i]) {
        throw new Error(`BTZ density[${i}] pooled=${pooled.density[i]} fresh=${fresh.density[i]}`)
      }
    }
  })

  it('pooled pack matches unpooled pack for HKLL config', () => {
    const config = cfg({
      d: 4,
      hkllEnabled: true,
      hkllBoundarySource: 'localized',
      hkllSourceSigma: 0.3,
    })
    const scratch = createAdsPackerScratch()
    const pooled = packAntiDeSitterDensityGrid(config, scratch)
    const fresh = packAntiDeSitterDensityGrid(config)
    expect(pooled.density.length).toBe(fresh.density.length)
    for (let i = 0; i < pooled.density.length; i++) {
      if (pooled.density[i] !== fresh.density[i]) {
        throw new Error(`HKLL density[${i}] pooled=${pooled.density[i]} fresh=${fresh.density[i]}`)
      }
    }
  })

  // Five sequential AdS packs (HKLL planeWave + BTZ + bound-state d=5 +
  // bound-state d=3 reused + bound-state d=3 fresh); v8 coverage in CI
  // pushes wall time past the default 5 s budget.
  it('reused scratch does not leak voxels across heterogeneous packs', { timeout: 30000 }, () => {
    // Drive the scratch through every code path in a sequence that exercises
    // each buffer, then confirm the final pack (a small bound-state with
    // no boundary overlay) matches a fresh pack bit-for-bit. A buggy clear
    // would leave stale HKLL / BTZ data haunting the bound-state voxels.
    const scratch = createAdsPackerScratch()
    packAntiDeSitterDensityGrid(
      cfg({ d: 4, hkllEnabled: true, hkllBoundarySource: 'planeWave', hkllPlaneWaveM: 2 }),
      scratch
    )
    packAntiDeSitterDensityGrid(
      cfg({ d: 3, btzEnabled: true, btzHorizonRadius: 1.2, btzAngularM: -3 }),
      scratch
    )
    packAntiDeSitterDensityGrid(cfg({ d: 5, n: 1, l: 0, m: 0, boundaryOverlay: true }), scratch)

    const reusedFinal = packAntiDeSitterDensityGrid(
      cfg({ d: 3, n: 0, l: 0, m: 0, boundaryOverlay: false }),
      scratch
    )
    const freshFinal = packAntiDeSitterDensityGrid(
      cfg({ d: 3, n: 0, l: 0, m: 0, boundaryOverlay: false })
    )

    for (let i = 0; i < reusedFinal.density.length; i++) {
      if (reusedFinal.density[i] !== freshFinal.density[i]) {
        throw new Error(
          `leak at density[${i}] reused=${reusedFinal.density[i]} fresh=${freshFinal.density[i]}`
        )
      }
    }
  })

  it('bound-state pack with boundaryOverlay=false writes zero alpha channel', () => {
    const packed = packAntiDeSitterDensityGrid(
      cfg({ d: 4, n: 0, l: 1, m: 0, boundaryOverlay: false })
    )
    // Alpha is the 4th half-float in each RGBA16F texel. A half-float 0 is
    // exactly 16-bit 0. A stale boundary write would show up as ≠ 0.
    let nonZero = 0
    for (let i = 3; i < packed.density.length; i += 4) {
      if (packed.density[i] !== 0) nonZero++
    }
    expect(nonZero).toBe(0)
  })
})
