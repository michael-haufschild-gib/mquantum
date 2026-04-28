/**
 * Pure-logic tests for AntiDeSitterStrategy.
 *
 * The strategy class itself is GPU-coupled (createTexture, queue.writeTexture)
 * and is exercised by Playwright. Here we lock in the deterministic-hash
 * helper that drives the CPU-packed path's dirty check — a stale or
 * insensitive hash would silently render stale BTZ/HKLL densities after a
 * config change, which the eye cannot easily diagnose.
 */
import { describe, expect, it } from 'vitest'

import type { AntiDeSitterConfig } from '@/lib/geometry/extended/antiDeSitter'
import { computeAdsConfigHash } from '@/rendering/webgpu/renderers/strategies/AntiDeSitterStrategy'

const baseConfig: AntiDeSitterConfig = {
  d: 3,
  n: 0,
  l: 0,
  m: 0,
  mL: 0.5,
  branch: 'plus',
  boundaryOverlay: false,
  btzEnabled: false,
  btzHorizonRadius: 1.0,
  btzOmega: 1.0,
  btzAngularM: 0,
  hkllEnabled: false,
  hkllBoundarySource: 'eigenstate',
  hkllSourceSigma: 0.3,
  hkllPlaneWaveM: 0,
} as never

describe('computeAdsConfigHash', () => {
  it('produces a stable hash for an identical config', () => {
    const a = computeAdsConfigHash({ ...baseConfig })
    const b = computeAdsConfigHash({ ...baseConfig })
    expect(a).toBe(b)
  })

  it.each([
    ['d', { d: 4 }],
    ['n', { n: 3 }],
    ['l', { l: 2 }],
    ['m', { m: -1 }],
    ['mL', { mL: 0.500001 }], // 6 decimals of precision
    ['branch', { branch: 'minus' as const }],
    ['boundaryOverlay', { boundaryOverlay: true }],
    ['btzEnabled', { btzEnabled: true }],
    ['btzHorizonRadius', { btzHorizonRadius: 1.000001 }],
    ['btzOmega', { btzOmega: 0.999999 }],
    ['btzAngularM', { btzAngularM: 4 }],
    ['hkllEnabled', { hkllEnabled: true }],
    ['hkllBoundarySource', { hkllBoundarySource: 'localized' as const }],
    ['hkllSourceSigma', { hkllSourceSigma: 0.300001 }],
    ['hkllPlaneWaveM', { hkllPlaneWaveM: 5 }],
  ])('changes when %s changes (so the dirty check sees the new config)', (_field, patch) => {
    const a = computeAdsConfigHash(baseConfig)
    const b = computeAdsConfigHash({ ...baseConfig, ...(patch as Partial<AntiDeSitterConfig>) })
    expect(a).not.toBe(b)
  })

  it('quantizes floating-point fields to 6 decimal places (denoise sub-µ jitter)', () => {
    // Differences smaller than the 6-decimal precision should NOT change the
    // hash — otherwise every floating-point round-trip through the URL would
    // re-render the BTZ texture even when the user did not alter anything.
    const a = computeAdsConfigHash(baseConfig)
    const b = computeAdsConfigHash({ ...baseConfig, mL: 0.5 + 1e-8 })
    expect(a).toBe(b)
  })

  it('includes integer fields verbatim (m, btzAngularM)', () => {
    // Integers don't go through toFixed — the hash should distinguish a 0 from a
    // 0.000001 m_A even though the float-side fields use 6-decimal rounding.
    expect(computeAdsConfigHash({ ...baseConfig, m: 1 })).not.toBe(
      computeAdsConfigHash({ ...baseConfig, m: 2 })
    )
  })
})
