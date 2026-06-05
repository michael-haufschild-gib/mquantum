/**
 * Regression guard for `computePotentialHash`, the dirty-tracking key used
 * by `TDSEComputePass.render` to decide whether to rebuild the V(x) buffer.
 *
 * Why this exists
 * ───────────────
 * The potential buffer is expensive: it's a per-site GPU allocation that
 * holds `latticeDim`-D scalar samples of V(x), regenerated either via a
 * GPU compute dispatch (built-in shape presets) or a CPU-side expression
 * evaluator (custom) or a seeded disorder generator (andersonDisorder).
 * On every frame `TDSEComputePass.render` computes a hash from the current
 * config and only rebuilds when it differs from the previous hash. If the
 * hash drops a parameter that affects V(x), the rebuild is skipped and the
 * simulation evolves under a stale potential until an *unrelated* param
 * change (or grid resize) kicks the hash.
 *
 * The bug this file guards against
 * ────────────────────────────────
 * Before this suite existed, `computePotentialHash` took a fast path for
 * driven mode:
 *
 *     const base = isDriven ? `driven_${simTime}` : [...fullParamList].join('|')
 *
 * That collapsed *every* base parameter into a single `simTime` stamp. While
 * the sim was playing the stamp advanced every frame and masked the hole —
 * but while paused, `simTime` is frozen (it only advances inside the
 * `if (isPlaying)` block in `TDSEComputePass.render`). A user who paused and
 * tweaked `barrierHeight`, `driveAmplitude`, `driveFrequency`, etc. would see
 * nothing update until they hit play again. Classic frozen-clock hazard.
 *
 * The tests below lock the post-fix contract: every V(x)-shaping parameter
 * must affect the hash at a *frozen* `simTime`, including the drive-specific
 * fields that only apply in driven mode.
 *
 * @module tests/rendering/webgpu/passes/TDSEComputePassCustomPotential
 */

import { describe, expect, it } from 'vitest'

import { DEFAULT_TDSE_CONFIG } from '@/lib/geometry/extended/tdse'
import type { TdseConfig } from '@/lib/geometry/extended/types'
import { computePotentialHash } from '@/rendering/webgpu/passes/TDSEComputePassCustomPotential'

/** Frozen `simTime` value — mimics a paused simulation. */
const FROZEN = 1.2345

function cfg(overrides: Partial<TdseConfig> = {}): TdseConfig {
  return { ...DEFAULT_TDSE_CONFIG, ...overrides }
}

describe('computePotentialHash — identity and basic determinism', () => {
  it('produces the same hash for two calls with the same config and simTime', () => {
    const a = computePotentialHash(cfg(), 0)
    const b = computePotentialHash(cfg(), 0)
    expect(a).toBe(b)
  })

  it('distinguishes different potential types at the same simTime', () => {
    const h1 = computePotentialHash(cfg({ potentialType: 'harmonicTrap' }), 0)
    const h2 = computePotentialHash(cfg({ potentialType: 'barrier' }), 0)
    expect(h1).not.toBe(h2)
  })
})

describe('computePotentialHash — base shape parameters', () => {
  // Every base field the shader reads to build V(x) at least once.
  // Each case edits a single field and asserts the hash changes. The
  // defaults are irrelevant — only the delta matters. A bug that drops
  // any one of these from the hash fails the corresponding case.
  //
  // NOTE: These tests intentionally mutate parameters without switching
  // `potentialType` to match. The hash must be sensitive to ALL parameters
  // regardless of the currently active type, because a user can change a
  // slider value while in type A, then switch to type B — the cache must
  // invalidate. Scoping hash sensitivity to the active type would create
  // subtle stale-data bugs on type switches.
  const cases: { field: keyof TdseConfig; mutate: (c: TdseConfig) => TdseConfig }[] = [
    { field: 'barrierHeight', mutate: (c) => ({ ...c, barrierHeight: c.barrierHeight + 1 }) },
    { field: 'barrierWidth', mutate: (c) => ({ ...c, barrierWidth: c.barrierWidth + 0.1 }) },
    { field: 'barrierCenter', mutate: (c) => ({ ...c, barrierCenter: c.barrierCenter + 0.2 }) },
    { field: 'harmonicOmega', mutate: (c) => ({ ...c, harmonicOmega: c.harmonicOmega + 0.3 }) },
    { field: 'wellDepth', mutate: (c) => ({ ...c, wellDepth: c.wellDepth + 0.4 }) },
    { field: 'wellWidth', mutate: (c) => ({ ...c, wellWidth: c.wellWidth + 0.5 }) },
    { field: 'stepHeight', mutate: (c) => ({ ...c, stepHeight: c.stepHeight + 0.6 }) },
    { field: 'mass', mutate: (c) => ({ ...c, mass: c.mass * 2 }) },
    {
      field: 'interactionStrength',
      mutate: (c) => ({ ...c, interactionStrength: (c.interactionStrength ?? 0) + 0.7 }),
    },
    { field: 'slitSeparation', mutate: (c) => ({ ...c, slitSeparation: c.slitSeparation + 0.8 }) },
    { field: 'slitWidth', mutate: (c) => ({ ...c, slitWidth: c.slitWidth + 0.9 }) },
    { field: 'wallThickness', mutate: (c) => ({ ...c, wallThickness: c.wallThickness + 1 }) },
    { field: 'wallHeight', mutate: (c) => ({ ...c, wallHeight: c.wallHeight + 1.1 }) },
    { field: 'latticeDepth', mutate: (c) => ({ ...c, latticeDepth: c.latticeDepth + 1.2 }) },
    { field: 'latticePeriod', mutate: (c) => ({ ...c, latticePeriod: c.latticePeriod + 1.3 }) },
    {
      field: 'doubleWellLambda',
      mutate: (c) => ({ ...c, doubleWellLambda: c.doubleWellLambda + 1.4 }),
    },
    {
      field: 'doubleWellSeparation',
      mutate: (c) => ({ ...c, doubleWellSeparation: c.doubleWellSeparation + 1.5 }),
    },
    {
      field: 'doubleWellAsymmetry',
      mutate: (c) => ({ ...c, doubleWellAsymmetry: c.doubleWellAsymmetry + 1.6 }),
    },
    {
      field: 'radialWellInner',
      mutate: (c) => ({ ...c, radialWellInner: c.radialWellInner + 0.1 }),
    },
    {
      field: 'radialWellOuter',
      mutate: (c) => ({ ...c, radialWellOuter: c.radialWellOuter + 0.1 }),
    },
    {
      field: 'radialWellDepth',
      mutate: (c) => ({ ...c, radialWellDepth: c.radialWellDepth + 0.1 }),
    },
    {
      field: 'radialWellTilt',
      mutate: (c) => ({ ...c, radialWellTilt: c.radialWellTilt + 0.1 }),
    },
    {
      field: 'anharmonicLambda',
      mutate: (c) => ({ ...c, anharmonicLambda: c.anharmonicLambda + 0.1 }),
    },
    { field: 'bhMass', mutate: (c) => ({ ...c, bhMass: c.bhMass + 0.1 }) },
    { field: 'bhMultipoleL', mutate: (c) => ({ ...c, bhMultipoleL: c.bhMultipoleL + 1 }) },
    {
      field: 'bhSpin',
      // bhSpin is typed as `0 | 1 | 2` (scalar / EM / gravitational) — swap
      // to a different literal from whatever the default config uses.
      mutate: (c) => ({ ...c, bhSpin: c.bhSpin === 2 ? 0 : 2 }),
    },
    {
      field: 'disorderStrength',
      mutate: (c) => ({ ...c, disorderStrength: c.disorderStrength + 0.1 }),
    },
    { field: 'disorderSeed', mutate: (c) => ({ ...c, disorderSeed: c.disorderSeed + 1 }) },
  ]

  for (const { field, mutate } of cases) {
    it(`hash changes when \`${String(field)}\` changes`, () => {
      const base = cfg()
      const before = computePotentialHash(base, FROZEN)
      const after = computePotentialHash(mutate(base), FROZEN)
      expect(after).not.toBe(before)
    })
  }

  it('hash changes when `trapAnisotropy[i]` changes', () => {
    const base = cfg({ trapAnisotropy: [1, 1, 1] })
    const before = computePotentialHash(base, FROZEN)
    const after = computePotentialHash(cfg({ trapAnisotropy: [1, 2, 1] }), FROZEN)
    expect(after).not.toBe(before)
  })

  it('hash changes when `spacing[i]` changes', () => {
    const base = cfg({ spacing: [0.1, 0.1, 0.1] })
    const before = computePotentialHash(base, FROZEN)
    const after = computePotentialHash(cfg({ spacing: [0.1, 0.2, 0.1] }), FROZEN)
    expect(after).not.toBe(before)
  })

  it('hash changes when `compactDims[i]` toggles', () => {
    const base = cfg({ compactDims: [false, false, false] })
    const before = computePotentialHash(base, FROZEN)
    const after = computePotentialHash(cfg({ compactDims: [false, true, false] }), FROZEN)
    expect(after).not.toBe(before)
  })

  it('hash changes when `compactRadii[i]` changes', () => {
    const base = cfg({ compactRadii: [1, 1, 1] })
    const before = computePotentialHash(base, FROZEN)
    const after = computePotentialHash(cfg({ compactRadii: [1, 2, 1] }), FROZEN)
    expect(after).not.toBe(before)
  })
})

describe('computePotentialHash — driven-mode pause-edit regression', () => {
  // These are the tests the old `driven_${simTime}` fast path could not
  // satisfy. With the bug in place, every one of these would return
  // `driven_${FROZEN}` for both snapshots and the assertions would fail.

  function drivenBase(): TdseConfig {
    return cfg({ potentialType: 'driven', driveEnabled: true })
  }

  it('driven + frozen simTime + `barrierHeight` change → hash differs', () => {
    const base = drivenBase()
    const before = computePotentialHash(base, FROZEN)
    const after = computePotentialHash({ ...base, barrierHeight: base.barrierHeight + 1 }, FROZEN)
    expect(after).not.toBe(before)
  })

  it('driven + frozen simTime + `barrierCenter` change → hash differs', () => {
    const base = drivenBase()
    const before = computePotentialHash(base, FROZEN)
    const after = computePotentialHash({ ...base, barrierCenter: base.barrierCenter + 0.5 }, FROZEN)
    expect(after).not.toBe(before)
  })

  it('driven + frozen simTime + `driveAmplitude` change → hash differs', () => {
    const base = drivenBase()
    const before = computePotentialHash(base, FROZEN)
    const after = computePotentialHash({ ...base, driveAmplitude: base.driveAmplitude + 1 }, FROZEN)
    expect(after).not.toBe(before)
  })

  it('driven + frozen simTime + `driveFrequency` change → hash differs', () => {
    const base = drivenBase()
    const before = computePotentialHash(base, FROZEN)
    const after = computePotentialHash({ ...base, driveFrequency: base.driveFrequency + 1 }, FROZEN)
    expect(after).not.toBe(before)
  })

  it('driven + frozen simTime + `driveWaveform` change → hash differs', () => {
    // Waveform is a string enum; swap to a different literal that the
    // default config definitely is not. We don't need to know the enum
    // values — just that the new value is !== the default.
    const base = drivenBase()
    const before = computePotentialHash(base, FROZEN)
    const alt: TdseConfig['driveWaveform'] = base.driveWaveform === 'sine' ? 'pulse' : 'sine'
    const after = computePotentialHash({ ...base, driveWaveform: alt }, FROZEN)
    expect(after).not.toBe(before)
  })

  it('driven + playing: simTime advance alone rebuilds the hash', () => {
    // Regression guard for the happy path we never want to lose: while
    // playing, the suffix must still change every frame.
    const base = drivenBase()
    const t0 = computePotentialHash(base, 0)
    const t1 = computePotentialHash(base, 0.01)
    expect(t1).not.toBe(t0)
  })

  it('driven + `driveEnabled === false`: hash is simTime-independent', () => {
    // When driveEnabled is false, the shader treats driven mode as a
    // static slab barrier — the per-frame simTime stamp must NOT be in
    // the hash, otherwise we'd re-upload the same bytes every frame.
    const base = cfg({ potentialType: 'driven', driveEnabled: false })
    const t0 = computePotentialHash(base, 0)
    const t1 = computePotentialHash(base, 42)
    expect(t1).toBe(t0)
  })
})

describe('computePotentialHash — custom expression', () => {
  it('custom expression change → hash differs', () => {
    const base = cfg({ potentialType: 'custom', customPotentialExpression: 'x*x' })
    const before = computePotentialHash(base, FROZEN)
    const after = computePotentialHash({ ...base, customPotentialExpression: 'x*x + y*y' }, FROZEN)
    expect(after).not.toBe(before)
  })

  it('custom expression is ignored for non-custom potential types', () => {
    // If this ever regresses to include the expression for every type,
    // harmonic/barrier modes would rebuild needlessly every time the user
    // edited the expression in the UI without switching to custom.
    const hA = computePotentialHash(
      cfg({ potentialType: 'harmonicTrap', customPotentialExpression: 'x' }),
      FROZEN
    )
    const hB = computePotentialHash(
      cfg({ potentialType: 'harmonicTrap', customPotentialExpression: 'y' }),
      FROZEN
    )
    expect(hA).toBe(hB)
  })
})

describe('computePotentialHash — Anderson disorder', () => {
  it('disorder distribution change → hash differs (Anderson mode)', () => {
    const uniform = cfg({
      potentialType: 'andersonDisorder',
      disorderDistribution: 'uniform',
    })
    const gaussian = cfg({
      potentialType: 'andersonDisorder',
      disorderDistribution: 'gaussian',
    })
    expect(computePotentialHash(uniform, FROZEN)).not.toBe(computePotentialHash(gaussian, FROZEN))
  })

  it('`hbar` change → hash differs (Anderson mode, because t_eff = ℏ²/(2m dx²))', () => {
    const a = cfg({ potentialType: 'andersonDisorder', hbar: 1 })
    const b = cfg({ potentialType: 'andersonDisorder', hbar: 2 })
    expect(computePotentialHash(a, FROZEN)).not.toBe(computePotentialHash(b, FROZEN))
  })

  it('`hbar` change is ignored for non-Anderson types when disorder overlay is off', () => {
    const a = cfg({ potentialType: 'harmonicTrap', disorderStrength: 0, hbar: 1 })
    const b = cfg({ potentialType: 'harmonicTrap', disorderStrength: 0, hbar: 2 })
    expect(computePotentialHash(a, FROZEN)).toBe(computePotentialHash(b, FROZEN))
  })

  it('seed change → hash differs (already covered by base, but Anderson mode specifically)', () => {
    const a = cfg({ potentialType: 'andersonDisorder', disorderSeed: 1 })
    const b = cfg({ potentialType: 'andersonDisorder', disorderSeed: 2 })
    expect(computePotentialHash(a, FROZEN)).not.toBe(computePotentialHash(b, FROZEN))
  })

  it('`hbar` change → hash differs for non-Anderson disorder overlays', () => {
    const a = cfg({ potentialType: 'barrier', disorderStrength: 3, hbar: 1 })
    const b = cfg({ potentialType: 'barrier', disorderStrength: 3, hbar: 2 })
    expect(computePotentialHash(a, FROZEN)).not.toBe(computePotentialHash(b, FROZEN))
  })

  it('disorder distribution change → hash differs for non-Anderson disorder overlays', () => {
    const uniform = cfg({
      potentialType: 'barrier',
      disorderStrength: 3,
      disorderDistribution: 'uniform',
    })
    const gaussian = cfg({
      potentialType: 'barrier',
      disorderStrength: 3,
      disorderDistribution: 'gaussian',
    })
    expect(computePotentialHash(uniform, FROZEN)).not.toBe(computePotentialHash(gaussian, FROZEN))
  })
})
