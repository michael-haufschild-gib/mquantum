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
import { LHV_STRATEGIES } from '@/lib/physics/bell/lhv'
import { EBERHARD_THRESHOLD } from '@/lib/physics/bell/loopholes'
import { BELL_SCENARIO_PRESETS } from '@/lib/physics/bell/presets'

const byId = new Map(BELL_SCENARIO_PRESETS.map((p) => [p.id, p]))

describe('BELL_SCENARIO_PRESETS', () => {
  it('contains the seven curated presets with unique ids', () => {
    const ids = BELL_SCENARIO_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('chshSinglet')
    expect(ids).toContain('wernerMarginal')
    expect(ids).toContain('wernerBelowThreshold')
    expect(ids).toContain('eberhardMarginal')
    expect(ids).toContain('detectionLoopholeExploit')
    expect(ids).toContain('classicalLhvBaseline')
    expect(ids).toContain('precessingFields')
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
