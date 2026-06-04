import { describe, expect, it } from 'vitest'

import { isTdsePresetCompatibleWithDimension, TDSE_SCENARIO_PRESETS } from '@/lib/physics/tdse/presets'

const TIME_TRAVEL_PRESET_IDS = ['postselectedCtcNovikovLoop', 'postselectedCtcParadoxGate'] as const

describe('TDSE time-travel scenario presets', () => {
  it('exposes P-CTC scenarios that enable the nonlinear postselection operator', () => {
    for (const id of TIME_TRAVEL_PRESET_IDS) {
      const preset = TDSE_SCENARIO_PRESETS.find((candidate) => candidate.id === id)
      expect(preset?.id).toBe(id)
      if (!preset) throw new Error(`${id} preset missing`)
      expect(preset.overrides.ctcPostselectionEnabled).toBe(true)
      expect(preset.overrides.ctcPostselectionStrength).toBeGreaterThan(0)
      expect(preset.overrides.wormholeMirrorAxis).toBe(0)
      const mirrorAxisSize = preset.overrides.gridSize?.[0] ?? -1
      expect(mirrorAxisSize).toBe(64)
      expect(mirrorAxisSize % 2).toBe(0)
      expect(preset.renderingOverrides?.densityGain).toBeGreaterThanOrEqual(3)
    }
  })

  it('separates Novikov and paradox-gate holonomies so phase renders are physically distinct', () => {
    const novikov = TDSE_SCENARIO_PRESETS.find((p) => p.id === 'postselectedCtcNovikovLoop')
    const paradox = TDSE_SCENARIO_PRESETS.find((p) => p.id === 'postselectedCtcParadoxGate')

    expect(novikov?.overrides.ctcLoopPhase).toBe(0)
    expect(paradox?.overrides.ctcLoopPhase).toBeCloseTo(Math.PI, 12)
    expect(paradox?.overrides.fieldView).toBe('phase')
    expect(novikov?.overrides.fieldView).toBe('density')
  })

  it('keeps fixed P-CTC physics in 3D and hides it above the supported renderer dimension', () => {
    for (const id of TIME_TRAVEL_PRESET_IDS) {
      const preset = TDSE_SCENARIO_PRESETS.find((candidate) => candidate.id === id)
      if (!preset) throw new Error(`${id} preset missing`)

      expect(isTdsePresetCompatibleWithDimension(preset, 3)).toBe(true)
      expect(isTdsePresetCompatibleWithDimension(preset, 5)).toBe(false)
    }
  })
})
