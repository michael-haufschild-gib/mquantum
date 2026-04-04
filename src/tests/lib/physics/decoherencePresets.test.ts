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
})
