import { describe, expect, it } from 'vitest'

import { isTdsePresetCompatibleWithDimension, TDSE_SCENARIO_PRESETS } from '@/lib/physics/tdse/presets'

const TIME_TRAVEL_PRESET_IDS = ['postselectedCtcNovikovLoop', 'postselectedCtcParadoxGate'] as const
const CTC_RESIDUAL_PRESET_IDS = ['ctcResidualNovikovMap', 'ctcResidualParadoxMap'] as const
const CTC_LOOP_GAIN_PRESET_IDS = [
  'ctcLoopGainConstructiveHorizon',
  'ctcLoopGainShearedProtection',
] as const
const CTC_DEUTSCH_ENTROPY_PRESET_IDS = [
  'ctcDeutschEntropyParadoxMixer',
  'ctcDeutschEntropyShearedMixer',
] as const

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

  it('exposes fixed-3D CTC residual maps that differ only by loop holonomy', () => {
    const novikov = TDSE_SCENARIO_PRESETS.find((p) => p.id === CTC_RESIDUAL_PRESET_IDS[0])
    const paradox = TDSE_SCENARIO_PRESETS.find((p) => p.id === CTC_RESIDUAL_PRESET_IDS[1])
    if (!novikov || !paradox) throw new Error('CTC residual presets missing')

    for (const preset of [novikov, paradox]) {
      expect(preset.maxDim).toBe(3)
      expect(preset.overrides.latticeDim).toBe(3)
      expect(preset.overrides.gridSize).toEqual([64, 64, 64])
      expect(preset.overrides.fieldView).toBe('ctcResidual')
      expect(preset.overrides.initialCondition).toBe('superposition')
      expect(preset.overrides.ctcPostselectionEnabled).toBe(true)
      expect(preset.overrides.ctcPostselectionStrength).toBeGreaterThan(0)
      expect(preset.overrides.ctcPostselectionStrength).toBeLessThan(0.02)
      expect(isTdsePresetCompatibleWithDimension(preset, 3)).toBe(true)
      expect(isTdsePresetCompatibleWithDimension(preset, 4)).toBe(false)
    }

    expect(novikov.overrides.ctcLoopPhase).toBe(0)
    expect(paradox.overrides.ctcLoopPhase).toBeCloseTo(Math.PI, 12)

    const novikovGeometry = { ...novikov.overrides, ctcLoopPhase: undefined }
    const paradoxGeometry = { ...paradox.overrides, ctcLoopPhase: undefined }
    expect(paradoxGeometry).toEqual(novikovGeometry)
  })

  it('exposes fixed-3D CTC loop-gain maps with high feedback and distinct holonomy shear', () => {
    const constructive = TDSE_SCENARIO_PRESETS.find((p) => p.id === CTC_LOOP_GAIN_PRESET_IDS[0])
    const sheared = TDSE_SCENARIO_PRESETS.find((p) => p.id === CTC_LOOP_GAIN_PRESET_IDS[1])
    if (!constructive || !sheared) throw new Error('CTC loop-gain presets missing')

    for (const preset of [constructive, sheared]) {
      expect(preset.maxDim).toBe(3)
      expect(preset.overrides.latticeDim).toBe(3)
      expect(preset.overrides.gridSize).toEqual([64, 64, 64])
      expect(preset.overrides.fieldView).toBe('ctcLoopGain')
      expect(preset.overrides.initialCondition).toBe('superposition')
      expect(preset.overrides.ctcPostselectionStrength).toBeGreaterThan(0.9)
      expect(preset.overrides.wormholeMirrorAxis).toBe(0)
      expect(isTdsePresetCompatibleWithDimension(preset, 3)).toBe(true)
      expect(isTdsePresetCompatibleWithDimension(preset, 4)).toBe(false)
    }

    expect(constructive.overrides.ctcLoopPhase).toBe(0)
    expect(constructive.overrides.packetMomentum).toEqual([0, 0, 0])
    expect(sheared.overrides.ctcLoopPhase).toBeCloseTo(Math.PI / 2, 12)
    expect(sheared.overrides.packetMomentum?.[1]).toBeGreaterThan(0)

    const constructiveGeometry = {
      ...constructive.overrides,
      ctcLoopPhase: undefined,
      packetMomentum: undefined,
    }
    const shearedGeometry = {
      ...sheared.overrides,
      ctcLoopPhase: undefined,
      packetMomentum: undefined,
    }
    expect(shearedGeometry).toEqual(constructiveGeometry)
  })

  it('exposes fixed-3D Deutsch entropy maps with high feedback and distinct holonomy shear', () => {
    const paradox = TDSE_SCENARIO_PRESETS.find((p) => p.id === CTC_DEUTSCH_ENTROPY_PRESET_IDS[0])
    const sheared = TDSE_SCENARIO_PRESETS.find((p) => p.id === CTC_DEUTSCH_ENTROPY_PRESET_IDS[1])
    if (!paradox || !sheared) throw new Error('CTC Deutsch entropy presets missing')

    for (const preset of [paradox, sheared]) {
      expect(preset.maxDim).toBe(3)
      expect(preset.overrides.latticeDim).toBe(3)
      expect(preset.overrides.gridSize).toEqual([64, 64, 64])
      expect(preset.overrides.fieldView).toBe('ctcDeutschEntropy')
      expect(preset.overrides.initialCondition).toBe('superposition')
      expect(preset.overrides.ctcPostselectionEnabled).toBe(false)
      expect(preset.overrides.ctcPostselectionStrength).toBeGreaterThan(0.9)
      expect(preset.overrides.wormholeMirrorAxis).toBe(0)
      expect(isTdsePresetCompatibleWithDimension(preset, 3)).toBe(true)
      expect(isTdsePresetCompatibleWithDimension(preset, 4)).toBe(false)
    }

    expect(paradox.overrides.ctcLoopPhase).toBeCloseTo(Math.PI, 12)
    expect(paradox.overrides.packetMomentum).toEqual([0, 0, 0])
    expect(sheared.overrides.ctcLoopPhase).toBeCloseTo(Math.PI / 2, 12)
    expect(sheared.overrides.packetMomentum?.[1]).toBeGreaterThan(0)

    const paradoxGeometry = {
      ...paradox.overrides,
      ctcLoopPhase: undefined,
      packetMomentum: undefined,
    }
    const shearedGeometry = {
      ...sheared.overrides,
      ctcLoopPhase: undefined,
      packetMomentum: undefined,
    }
    expect(shearedGeometry).toEqual(paradoxGeometry)
  })
})
