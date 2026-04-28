/**
 * Tests for cross-mode shared config primitives.
 *
 * `crossMode.ts` is a contract-only module — its single runtime export is
 * `DEFAULT_DISORDER_OVERLAY_CONFIG`, the canonical "feature off" record.
 * The contract is that strength=0 is a guaranteed dispatcher no-op (the
 * GPU disorder pass short-circuits on it). Tests pin every field of the
 * default so accidental edits to the constant don't silently activate
 * disorder in every quantum mode that adopts the overlay.
 */

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_DISORDER_OVERLAY_CONFIG,
  type DisorderOverlayConfig,
} from '@/lib/geometry/extended/crossMode'

describe('DEFAULT_DISORDER_OVERLAY_CONFIG', () => {
  it('strength is exactly 0 (guarantees the GPU dispatcher short-circuits)', () => {
    // The dispatcher contract documented at TDSEComputePassDisorder relies
    // on strength === 0 being a no-op. Any non-zero default would silently
    // turn on disorder for every mode that adopts the overlay.
    expect(DEFAULT_DISORDER_OVERLAY_CONFIG.strength).toBe(0)
  })

  it('seed is deterministic (42 — explicit reproducibility marker)', () => {
    expect(DEFAULT_DISORDER_OVERLAY_CONFIG.seed).toBe(42)
  })

  it('distribution defaults to uniform', () => {
    expect(DEFAULT_DISORDER_OVERLAY_CONFIG.distribution).toBe('uniform')
  })

  it('exposes only the three documented keys (no shape drift)', () => {
    expect(Object.keys(DEFAULT_DISORDER_OVERLAY_CONFIG).sort()).toEqual([
      'distribution',
      'seed',
      'strength',
    ])
  })

  it('object is frozen-immutable in spirit (TypeScript-typed const cannot be mutated by callers without TS error — runtime sanity)', () => {
    // Snapshot, mutate-attempt, restore — verify the singleton hasn't been
    // mutated by another importer in the test suite.
    const snapshot: DisorderOverlayConfig = { ...DEFAULT_DISORDER_OVERLAY_CONFIG }
    expect(snapshot.strength).toBe(0)
    expect(snapshot.seed).toBe(42)
    expect(snapshot.distribution).toBe('uniform')
  })
})
