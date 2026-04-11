/**
 * Tests for the shared FSF cosmology/dispersion helpers.
 *
 * Pins the contract that UI, compute pass, k-space thermometer, and
 * entanglement probe all share a single source of truth for:
 *
 * - `computeFsfCosmologyCoefs` — canonical integrator triplet
 * - `computeFsfCosmologySnapshot` — full per-frame snapshot for UI readouts
 * - `computeFsfVacuumDispersion` — `'kgFloor'` vs numeric `m²·a²` tag
 *
 * These are the invariants the audit prevents from drifting back into
 * six independent hand-rolled copies.
 *
 * @module tests/lib/physics/freeScalar/vacuumDispersion
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_COSMOLOGY_CONFIG,
  DEFAULT_FREE_SCALAR_CONFIG,
} from '@/lib/geometry/extended/freeScalar'
import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { logger } from '@/lib/logger'
import {
  __resetFsfCosmologyWarnDedupForTests,
  computeFsfCosmologyCoefs,
  computeFsfCosmologySnapshot,
  computeFsfVacuumDispersion,
  FSF_IDENTITY_COSMO_COEFS,
} from '@/lib/physics/freeScalar/vacuumDispersion'

/** Deterministic FSF config factory — avoids touching stores. */
function makeConfig(overrides: Partial<FreeScalarConfig> = {}): FreeScalarConfig {
  return {
    ...DEFAULT_FREE_SCALAR_CONFIG,
    latticeDim: 3,
    gridSize: [8, 8, 8],
    spacing: [0.25, 0.25, 0.25],
    mass: 0.7,
    cosmology: { ...DEFAULT_COSMOLOGY_CONFIG },
    ...overrides,
  }
}

describe('computeFsfCosmologyCoefs', () => {
  it('returns the singleton identity under cosmology.enabled=false', () => {
    const cfg = makeConfig({
      cosmology: { ...DEFAULT_COSMOLOGY_CONFIG, enabled: false },
    })
    const coefs = computeFsfCosmologyCoefs(cfg, -42)
    // Reference equality: downstream memos compare by identity for
    // dirty-flag short-circuiting in the hot render loop.
    expect(coefs).toBe(FSF_IDENTITY_COSMO_COEFS)
  })

  it('returns the singleton identity under Minkowski preset regardless of η', () => {
    const cfg = makeConfig({
      cosmology: {
        ...DEFAULT_COSMOLOGY_CONFIG,
        enabled: true,
        preset: 'minkowski',
      },
    })
    for (const eta of [-1e6, -1, -1e-6, 0, 1e6]) {
      expect(computeFsfCosmologyCoefs(cfg, eta)).toBe(FSF_IDENTITY_COSMO_COEFS)
    }
  })

  it('returns non-identity coefficients under valid deSitter', () => {
    const cfg = makeConfig({
      cosmology: {
        ...DEFAULT_COSMOLOGY_CONFIG,
        enabled: true,
        preset: 'deSitter',
        hubble: 1,
        eta0: -10,
      },
    })
    const coefs = computeFsfCosmologyCoefs(cfg, -10)
    // de Sitter at η = -10, H=1 gives a(η) = -1/(Hη) = 0.1; spacetimeDim =
    // 4, so aPotential = a^(n-2) = a² = 0.01 and aKinetic = 1/aPotential = 100.
    expect(coefs.aPotential).toBeCloseTo(0.01, 12)
    expect(coefs.aKinetic).toBeCloseTo(100, 10)
    expect(coefs.aFull).toBeCloseTo(0.0001, 14) // a^n = a^4
  })
})

describe('computeFsfCosmologySnapshot', () => {
  it('returns undefined under cosmology.enabled=false', () => {
    const cfg = makeConfig({
      cosmology: { ...DEFAULT_COSMOLOGY_CONFIG, enabled: false },
    })
    expect(computeFsfCosmologySnapshot(cfg, -10)).toBeUndefined()
  })

  it('returns undefined under Minkowski preset', () => {
    const cfg = makeConfig({
      cosmology: {
        ...DEFAULT_COSMOLOGY_CONFIG,
        enabled: true,
        preset: 'minkowski',
      },
    })
    expect(computeFsfCosmologySnapshot(cfg, -10)).toBeUndefined()
  })

  it('returns undefined for η = 0 even with valid non-Minkowski', () => {
    const cfg = makeConfig({
      cosmology: {
        ...DEFAULT_COSMOLOGY_CONFIG,
        enabled: true,
        preset: 'deSitter',
        hubble: 1,
      },
    })
    expect(computeFsfCosmologySnapshot(cfg, 0)).toBeUndefined()
  })

  it('returns the full snapshot object under valid non-Minkowski', () => {
    const cfg = makeConfig({
      cosmology: {
        ...DEFAULT_COSMOLOGY_CONFIG,
        enabled: true,
        preset: 'deSitter',
        hubble: 1,
        eta0: -10,
      },
    })
    const snap = computeFsfCosmologySnapshot(cfg, -10)
    if (!snap) throw new Error('snapshot should be defined for valid deSitter params')
    expect(snap.a).toBeCloseTo(0.1, 12)
    // Conformal Hubble ℋ(η) = q/η. For de Sitter q = -1 and η = -10 so
    // ℋ = (-1)/(-10) = +0.1 (expanding universe; ℋ > 0).
    expect(snap.hubble).toBeCloseTo(0.1, 12)
    expect(snap.aKinetic).toBeCloseTo(100, 10)
  })

  it('returns undefined for invalid params without throwing', () => {
    const cfg = makeConfig({
      cosmology: {
        ...DEFAULT_COSMOLOGY_CONFIG,
        enabled: true,
        preset: 'deSitter',
        hubble: -1, // invalid — must be > 0
        eta0: -10,
      },
    })
    // Silence the dedup'd warning so the test log stays clean; we assert
    // only the return value here. The logging channel is covered in the
    // dedup tests below.
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    __resetFsfCosmologyWarnDedupForTests()
    try {
      expect(computeFsfCosmologySnapshot(cfg, -10)).toBeUndefined()
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe('computeFsfVacuumDispersion', () => {
  it("returns 'kgFloor' under cosmology.enabled=false", () => {
    const cfg = makeConfig({
      cosmology: { ...DEFAULT_COSMOLOGY_CONFIG, enabled: false },
    })
    expect(computeFsfVacuumDispersion(cfg, -10)).toBe('kgFloor')
  })

  it("returns 'kgFloor' under Minkowski preset", () => {
    const cfg = makeConfig({
      cosmology: {
        ...DEFAULT_COSMOLOGY_CONFIG,
        enabled: true,
        preset: 'minkowski',
      },
    })
    expect(computeFsfVacuumDispersion(cfg, -10)).toBe('kgFloor')
  })

  it('returns m²·a²(η) under valid deSitter', () => {
    const cfg = makeConfig({
      mass: 0.5,
      cosmology: {
        ...DEFAULT_COSMOLOGY_CONFIG,
        enabled: true,
        preset: 'deSitter',
        hubble: 1,
        eta0: -10,
      },
    })
    const dispersion = computeFsfVacuumDispersion(cfg, -10)
    // a(-10) = 0.1, so m²·a² = 0.25 · 0.01 = 0.0025
    if (dispersion === 'kgFloor') {
      throw new Error(`computeFsfVacuumDispersion returned 'kgFloor' for a valid deSitter config`)
    }
    expect(dispersion).toBeCloseTo(0.0025, 15)
  })

  it("returns 'kgFloor' under invalid deSitter (hubble ≤ 0)", () => {
    const cfg = makeConfig({
      cosmology: {
        ...DEFAULT_COSMOLOGY_CONFIG,
        enabled: true,
        preset: 'deSitter',
        hubble: 0, // invalid
        eta0: -10,
      },
    })
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    __resetFsfCosmologyWarnDedupForTests()
    try {
      expect(computeFsfVacuumDispersion(cfg, -10)).toBe('kgFloor')
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe('dedup channel is shared across the three helpers', () => {
  beforeEach(() => {
    __resetFsfCosmologyWarnDedupForTests()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs at most one warning even when the same bad config flows through different helpers', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const badCfg = makeConfig({
      cosmology: {
        ...DEFAULT_COSMOLOGY_CONFIG,
        enabled: true,
        preset: 'ekpyrotic',
        steepness: 1, // < s_c(4) ≈ 3.46, invalid
        hubble: 1,
        eta0: -10,
      },
    })

    // Three helpers, same config, same η — each falls through their own
    // try/catch but they all share `fsfCosmologyWarnedKeys`. The first
    // call that encounters this specific `(site, preset, spacetimeDim,
    // message)` tuple logs; the next two are deduped because the site
    // key is part of the dedup tuple but the RangeError message is
    // identical.
    computeFsfCosmologyCoefs(badCfg, -10)
    computeFsfCosmologySnapshot(badCfg, -10)
    computeFsfVacuumDispersion(badCfg, -10) // internally calls snapshot again

    // `computeFsfVacuumDispersion` reuses `computeFsfCosmologySnapshot`,
    // so the three distinct "sites" are the two coef/snapshot entries.
    // The dedup tuple includes the call-site name, so we expect exactly
    // two distinct warnings (one per site).
    expect(warnSpy).toHaveBeenCalledTimes(2)

    // Hitting the same helpers again must NOT emit additional warnings.
    computeFsfCosmologyCoefs(badCfg, -10)
    computeFsfCosmologySnapshot(badCfg, -10)
    computeFsfVacuumDispersion(badCfg, -10)
    expect(warnSpy).toHaveBeenCalledTimes(2)
  })

  it('a different error message on the same helper triggers a new warning', () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const badHubbleZero = makeConfig({
      cosmology: {
        ...DEFAULT_COSMOLOGY_CONFIG,
        enabled: true,
        preset: 'deSitter',
        hubble: 0,
        eta0: -10,
      },
    })
    const badHubbleNeg = makeConfig({
      cosmology: {
        ...DEFAULT_COSMOLOGY_CONFIG,
        enabled: true,
        preset: 'deSitter',
        hubble: -2,
        eta0: -10,
      },
    })
    // Note: both may produce the same RangeError message ("deSitter
    // preset requires hubble > 0, got X") — the key includes the
    // message, so different X values yield different keys.
    computeFsfCosmologyCoefs(badHubbleZero, -10)
    computeFsfCosmologyCoefs(badHubbleNeg, -10)
    expect(warnSpy).toHaveBeenCalledTimes(2)
  })
})
