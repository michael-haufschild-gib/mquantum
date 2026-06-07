/**
 * Tests for BELL_SCENARIO_PRESETS.
 *
 * Verifies that each preset's overrides match the physics it claims to
 * demonstrate. A regression here means a preset advertises (e.g.) "Werner
 * threshold" but actually sits on the wrong side of 1/√2 — failing the
 * pedagogical intent.
 */
import { describe, expect, it } from 'vitest'

import { WERNER_VIOLATION_THRESHOLD } from '@/lib/physics/bell/analytic'
import { computeWernerChsh } from '@/lib/physics/bell/chshCaustic'
import { LHV_STRATEGIES } from '@/lib/physics/bell/lhv'
import { EBERHARD_THRESHOLD } from '@/lib/physics/bell/loopholes'
import { BELL_SCENARIO_PRESETS } from '@/lib/physics/bell/presets'

const byId = new Map(BELL_SCENARIO_PRESETS.map((p) => [p.id, p]))

describe('BELL_SCENARIO_PRESETS', () => {
  it('contains the nine curated presets with unique ids', () => {
    const ids = BELL_SCENARIO_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(9)
    expect(ids).toContain('chshCausticTsirelsonLens')
    expect(ids).toContain('chshCausticWernerCusp')
    expect(ids).toContain('chshSinglet')
    expect(ids).toContain('wernerMarginal')
    expect(ids).toContain('wernerBelowThreshold')
    expect(ids).toContain('eberhardMarginal')
    expect(ids).toContain('detectionLoopholeExploit')
    expect(ids).toContain('classicalLhvBaseline')
    expect(ids).toContain('precessingFields')
  })

  it('orders caustic presets before broad chshSinglet matching', () => {
    const ids = BELL_SCENARIO_PRESETS.map((p) => p.id)
    expect(ids.indexOf('chshCausticTsirelsonLens')).toBeLessThan(ids.indexOf('chshSinglet'))
    expect(ids.indexOf('chshCausticWernerCusp')).toBeLessThan(ids.indexOf('chshSinglet'))
  })

  it('chshCausticTsirelsonLens carries high positive CHSH slack', () => {
    const preset = byId.get('chshCausticTsirelsonLens')!
    expect(preset.overrides.chshCausticEnabled).toBe(true)
    expect(preset.overrides.chshCausticStrength).toBeGreaterThan(1)
    expect(preset.overrides.chshCausticFoldScale).toBeGreaterThan(8)
    const chsh = computeWernerChsh({
      aliceAxis: preset.overrides.aliceAxis!,
      aliceAxisPrime: preset.overrides.aliceAxisPrime!,
      bobAxis: preset.overrides.bobAxis!,
      bobAxisPrime: preset.overrides.bobAxisPrime!,
      visibility: preset.overrides.visibility!,
    })
    expect(chsh.positiveSlack).toBeCloseTo(1, 10)
  })

  it('chshCausticWernerCusp is subthreshold with zero positive slack', () => {
    const preset = byId.get('chshCausticWernerCusp')!
    expect(preset.overrides.chshCausticEnabled).toBe(true)
    expect(preset.overrides.chshCausticFoldScale).toBeLessThan(5)
    expect(preset.overrides.visibility).toBeLessThan(WERNER_VIOLATION_THRESHOLD)
    const chsh = computeWernerChsh({
      aliceAxis: preset.overrides.aliceAxis!,
      aliceAxisPrime: preset.overrides.aliceAxisPrime!,
      bobAxis: preset.overrides.bobAxis!,
      bobAxisPrime: preset.overrides.bobAxisPrime!,
      visibility: preset.overrides.visibility!,
    })
    expect(chsh.absS).toBeLessThan(2)
    expect(chsh.positiveSlack).toBe(0)
  })

  it('non-caustic presets explicitly disable caustic state to prevent sticky merges', () => {
    const nonCaustic = BELL_SCENARIO_PRESETS.filter((p) => !p.id.startsWith('chshCaustic'))
    for (const preset of nonCaustic) {
      expect(preset.overrides.chshCausticEnabled, preset.id).toBe(false)
    }
  })

  it('wernerMarginal sits strictly above 1/√2', () => {
    const v = byId.get('wernerMarginal')!.overrides.visibility!
    expect(v).toBeGreaterThan(WERNER_VIOLATION_THRESHOLD)
    // Margin must be small enough to be "marginal" — within 5% of threshold.
    expect(v - WERNER_VIOLATION_THRESHOLD).toBeLessThan(0.05)
  })

  it('wernerBelowThreshold sits strictly below 1/√2', () => {
    const v = byId.get('wernerBelowThreshold')!.overrides.visibility!
    expect(v).toBeLessThan(WERNER_VIOLATION_THRESHOLD)
  })

  it('eberhardMarginal sits strictly above 2/(1+√2)', () => {
    const eta = byId.get('eberhardMarginal')!.overrides.detectionEfficiency!
    expect(eta).toBeGreaterThan(EBERHARD_THRESHOLD)
    expect(eta - EBERHARD_THRESHOLD).toBeLessThan(0.05)
  })

  it('detectionLoopholeExploit selects the fair-sampling LHV loophole path', () => {
    const preset = byId.get('detectionLoopholeExploit')!
    expect(preset.overrides.samplerMode).toBe('lhv')
    expect(preset.overrides.analysisMode).toBe('fairSampling')
    expect(preset.overrides.detectionEfficiency).toBeLessThan(EBERHARD_THRESHOLD)
    const ids = LHV_STRATEGIES.map((s) => s.id)
    expect(ids).toContain(preset.overrides.lhvStrategyId)
  })

  it('classicalLhvBaseline uses the deterministic LHV strategy', () => {
    const preset = byId.get('classicalLhvBaseline')!
    expect(preset.overrides.samplerMode).toBe('lhv')
    expect(preset.overrides.lhvStrategyId).toBe('deterministicBell')
  })

  it('precessingFields has non-zero per-particle field components', () => {
    const preset = byId.get('precessingFields')!
    const fa = preset.overrides.fieldA!
    const fb = preset.overrides.fieldB!
    const magA = Math.hypot(fa[0], fa[1], fa[2])
    const magB = Math.hypot(fb[0], fb[1], fb[2])
    expect(magA).toBeGreaterThan(0)
    expect(magB).toBeGreaterThan(0)
  })
})
