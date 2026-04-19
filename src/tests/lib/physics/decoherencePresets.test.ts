/**
 * Tests for decoherence & monitoring scenario presets.
 *
 * Validates preset structure, required fields, and physical constraints
 * to catch copy-paste errors and incomplete preset definitions.
 */

import { describe, expect, it } from 'vitest'

import { DECOHERENCE_PRESETS } from '@/lib/physics/tdse/decoherencePresets'

describe('DECOHERENCE_PRESETS', () => {
  it('contains presets', () => {
    expect(DECOHERENCE_PRESETS.length).toBeGreaterThan(0)
  })

  it('all presets have unique ids', () => {
    const ids = DECOHERENCE_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all presets have non-empty name and description', () => {
    for (const preset of DECOHERENCE_PRESETS) {
      expect(preset.name.length).toBeGreaterThan(0)
      expect(preset.description.length).toBeGreaterThan(0)
    }
  })

  it('all presets specify latticeDim >= 1', () => {
    for (const preset of DECOHERENCE_PRESETS) {
      expect(preset.overrides.latticeDim).toBeGreaterThanOrEqual(1)
    }
  })

  it('all presets specify grid/spacing arrays matching latticeDim', () => {
    for (const preset of DECOHERENCE_PRESETS) {
      const dim = preset.overrides.latticeDim!
      expect(preset.overrides.gridSize).toHaveLength(dim)
      expect(preset.overrides.spacing).toHaveLength(dim)
    }
  })

  it('all presets specify positive dt', () => {
    for (const preset of DECOHERENCE_PRESETS) {
      expect(preset.overrides.dt).toBeGreaterThan(0)
    }
  })

  it('all presets have stochasticEnabled', () => {
    for (const preset of DECOHERENCE_PRESETS) {
      expect(preset.overrides.stochasticEnabled).toBe(true)
    }
  })

  it('branching presets have non-negative stochasticGamma', () => {
    for (const preset of DECOHERENCE_PRESETS) {
      if (preset.overrides.stochasticGamma !== undefined) {
        expect(preset.overrides.stochasticGamma).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('branching presets specify branch colors as 3-element arrays', () => {
    for (const preset of DECOHERENCE_PRESETS) {
      if (preset.overrides.branchingEnabled) {
        expect(preset.overrides.branchColorA).toHaveLength(3)
        expect(preset.overrides.branchColorB).toHaveLength(3)
      }
    }
  })

  it('packet arrays match latticeDim', () => {
    for (const preset of DECOHERENCE_PRESETS) {
      const dim = preset.overrides.latticeDim!
      if (preset.overrides.packetCenter) {
        expect(preset.overrides.packetCenter).toHaveLength(dim)
      }
      if (preset.overrides.packetMomentum) {
        expect(preset.overrides.packetMomentum).toHaveLength(dim)
      }
    }
  })

  it('stochasticGamma stays within the URL-serializer range [0, 10]', () => {
    // `sloc_g` in state-serializer.ts is clamped to [0, 10]. A preset that
    // leaked gamma above 10 would round-trip to 10 on URL export — no test
    // catches the drift today.
    for (const preset of DECOHERENCE_PRESETS) {
      if (preset.overrides.stochasticGamma !== undefined) {
        expect(preset.overrides.stochasticGamma).toBeLessThanOrEqual(10)
      }
    }
  })

  it('stochasticSigma stays within the URL-serializer range [0.5, 5]', () => {
    // `sloc_s` clamped to [0.5, 5]. Values at the boundary are allowed.
    for (const preset of DECOHERENCE_PRESETS) {
      const sigma = preset.overrides.stochasticSigma
      if (sigma !== undefined) {
        expect(sigma).toBeGreaterThanOrEqual(0.5)
        expect(sigma).toBeLessThanOrEqual(5)
      }
    }
  })

  it('stochasticNumSites is an integer within [1, 32] (URL spec)', () => {
    // `sloc_n` = int 1-32 per state-serializer. Violations would either get
    // URL-clamped silently or reject the preset at deserialize time.
    for (const preset of DECOHERENCE_PRESETS) {
      const n = preset.overrides.stochasticNumSites
      if (n !== undefined) {
        expect(Number.isInteger(n)).toBe(true)
        expect(n).toBeGreaterThanOrEqual(1)
        expect(n).toBeLessThanOrEqual(32)
      }
    }
  })

  it('canonical preset ids are all present (catalogue contract)', () => {
    // Hard-coded by the UI dropdown and the `stochastic-decoherence.spec.ts`
    // Playwright test. Pin the catalogue so a silent rename would surface.
    const expected = new Set([
      // branching (decoherence visualization)
      'doubleWellBranching',
      'barrierBranching',
      'schrodingersCat',
      'rapidCollapse',
      // continuous monitoring
      'boxMonitoring',
      'harmonicMonitoring',
      'latticeMonitoring',
      'chaoticMonitoring',
    ])
    const actual = new Set(DECOHERENCE_PRESETS.map((p) => p.id))
    expect(actual).toEqual(expected)
  })

  it('branching presets have branching enabled and monitoring presets have it disabled', () => {
    // Structural separation between the two categories. A preset flipped
    // into the wrong category would still compile — this test pins the
    // category by id.
    const branchingIds = new Set([
      'doubleWellBranching',
      'barrierBranching',
      'schrodingersCat',
      'rapidCollapse',
    ])
    for (const preset of DECOHERENCE_PRESETS) {
      const shouldBranch = branchingIds.has(preset.id)
      expect(
        preset.overrides.branchingEnabled ?? false,
        `preset "${preset.id}" branchingEnabled mismatch`
      ).toBe(shouldBranch)
    }
  })
})
