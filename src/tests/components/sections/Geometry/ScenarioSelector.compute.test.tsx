/**
 * Regression tests for computed scenario selection in Schroedinger compute modes.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ScenarioSelector } from '@/components/sections/Geometry/ScenarioSelector'
import type { TdseConfig } from '@/lib/geometry/extended/types'
import { TDSE_SCENARIO_PRESETS } from '@/lib/physics/tdse/presets'
import { useAppearanceStore } from '@/stores/appearanceStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'

function resetStores(): void {
  useAppearanceStore.setState(useAppearanceStore.getInitialState())
  useExtendedObjectStore.setState(useExtendedObjectStore.getInitialState())
  useGeometryStore.setState(useGeometryStore.getInitialState())
}

function enterTdseModeWithConfig(tdseOverrides: Partial<TdseConfig>): void {
  useExtendedObjectStore.setState((state) => ({
    schroedinger: {
      ...state.schroedinger,
      quantumMode: 'tdseDynamics',
      tdse: {
        ...state.schroedinger.tdse,
        ...tdseOverrides,
      },
    },
  }))
}

describe('ScenarioSelector - compute mode presets', () => {
  beforeEach(() => {
    resetStores()
  })

  afterEach(() => {
    resetStores()
  })

  it('shows a matching restored compute preset from current config', () => {
    const preset = TDSE_SCENARIO_PRESETS.find((candidate) => candidate.id === 'classicTunneling')
    if (!preset) throw new Error('classicTunneling preset missing')
    enterTdseModeWithConfig(preset.overrides)

    render(<ScenarioSelector />)

    expect(screen.getByRole('combobox', { name: /scenario/i })).toHaveValue('classicTunneling')
  })

  it('shows blank for restored custom compute config instead of first preset', () => {
    enterTdseModeWithConfig({
      dt: 0.012345,
      initialCondition: 'gaussianPacket',
      packetMomentum: [9.876, 0, 0],
      potentialType: 'free',
      fieldView: 'phase',
    })

    render(<ScenarioSelector />)

    expect(screen.getByRole('combobox', { name: /scenario/i })).toHaveValue('')
  })

  it('keeps a TDSE preset selected after applying it in a higher dimension', async () => {
    const user = userEvent.setup()
    useGeometryStore.setState({ dimension: 4 })
    enterTdseModeWithConfig({ latticeDim: 4 })

    render(<ScenarioSelector />)

    await user.selectOptions(
      screen.getByRole('combobox', { name: /scenario/i }),
      'classicTunneling'
    )

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /scenario/i })).toHaveValue('classicTunneling')
    })
  })

  it('keeps a Dirac preset selected when padded preset vectors are resized to live dimension', async () => {
    const user = userEvent.setup()
    useExtendedObjectStore.setState((state) => ({
      schroedinger: {
        ...state.schroedinger,
        quantumMode: 'diracEquation',
        dirac: { ...state.schroedinger.dirac, latticeDim: 3 },
      },
    }))

    render(<ScenarioSelector />)

    await user.selectOptions(screen.getByRole('combobox', { name: /scenario/i }), 'kleinParadox')

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /scenario/i })).toHaveValue('kleinParadox')
    })
  })
})
