/**
 * Regression tests for Bell-pair scenario selection.
 *
 * Catches the original bug: when objectType is bellPair, the dropdown
 * previously fell through to schroedinger.quantumMode and showed HO
 * presets. These tests assert the bellPair branch is selected.
 */
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ScenarioSelector } from '@/components/sections/Geometry/ScenarioSelector'
import { WERNER_VIOLATION_THRESHOLD } from '@/lib/physics/bell/analytic'
import { BELL_SCENARIO_PRESETS } from '@/lib/physics/bell/presets'
import { useAppearanceStore } from '@/stores/scene/appearanceStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'

function enterBellMode(): void {
  useGeometryStore.getState().setObjectType('bellPair')
}

function resetStores(): void {
  useAppearanceStore.setState(useAppearanceStore.getInitialState())
  useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
  useGeometryStore.setState(useGeometryStore.getInitialState())
}

describe('ScenarioSelector - Bell presets', () => {
  beforeEach(() => {
    resetStores()
    enterBellMode()
  })

  afterEach(() => {
    act(() => {
      resetStores()
    })
  })

  it('exposes every Bell scenario preset by display name', () => {
    render(<ScenarioSelector />)
    const select = screen.getByRole('combobox', { name: /scenario/i }) as HTMLSelectElement
    const optionValues = Array.from(select.options).map((o) => o.value)
    for (const preset of BELL_SCENARIO_PRESETS) {
      expect(optionValues).toContain(preset.id)
    }
  })

  it('matches the canonical default to chshSinglet on mount', () => {
    render(<ScenarioSelector />)
    expect(screen.getByRole('combobox', { name: /scenario/i })).toHaveValue('chshSinglet')
  })

  it('applying wernerBelowThreshold writes a sub-threshold visibility to the store', async () => {
    const user = userEvent.setup()
    render(<ScenarioSelector />)
    await user.selectOptions(
      screen.getByRole('combobox', { name: /scenario/i }),
      'wernerBelowThreshold'
    )
    const cfg = useExtendedObjectStore.getState().bellPair
    expect(cfg.visibility).toBeLessThan(WERNER_VIOLATION_THRESHOLD)
    expect(cfg.needsReset).toBe(true)
  })

  it('applying detectionLoopholeExploit switches the sampler to LHV', async () => {
    const user = userEvent.setup()
    render(<ScenarioSelector />)
    await user.selectOptions(
      screen.getByRole('combobox', { name: /scenario/i }),
      'detectionLoopholeExploit'
    )
    const cfg = useExtendedObjectStore.getState().bellPair
    expect(cfg.samplerMode).toBe('lhv')
    expect(cfg.lhvStrategyId).toBe('detectionLoophole_0.500')
    expect(cfg.analysisMode).toBe('assignNonDetection')
  })
})
