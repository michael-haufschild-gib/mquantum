/**
 * Regression tests for computed scenario selection in Schroedinger compute modes.
 */

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ScenarioSelector } from '@/components/sections/Geometry/ScenarioSelector'
import { findTdsePresetId } from '@/components/sections/Geometry/ScenarioSelector.matching'
import { DEFAULT_TDSE_CONFIG, type TdseConfig } from '@/lib/geometry/extended/types'
import { BEC_SCENARIO_PRESETS } from '@/lib/physics/bec/presets'
import { DIRAC_SCENARIO_PRESETS } from '@/lib/physics/dirac/presets'
import { FREE_SCALAR_PRESETS } from '@/lib/physics/freeScalar/presets'
import { QUANTUM_WALK_PRESETS } from '@/lib/physics/quantumWalk/presets'
import {
  isTdsePresetCompatibleWithDimension,
  TDSE_SCENARIO_PRESETS,
} from '@/lib/physics/tdse/presets'
import { WDW_SCENARIO_PRESETS } from '@/lib/physics/wheelerDeWitt/presets'
import { useAppearanceStore } from '@/stores/scene/appearanceStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'
import { resizeTdseArrays } from '@/stores/slices/geometry/setters/tdseSetters'

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

type ScenarioMode =
  | 'tdseDynamics'
  | 'becDynamics'
  | 'diracEquation'
  | 'freeScalarField'
  | 'quantumWalk'
  | 'wheelerDeWitt'

function enterScenarioMode(mode: ScenarioMode, dimension: number): void {
  useGeometryStore.setState({ dimension })
  useExtendedObjectStore.setState((state) => ({
    schroedinger: {
      ...state.schroedinger,
      quantumMode: mode,
      tdse: { ...state.schroedinger.tdse, latticeDim: dimension },
      bec: { ...state.schroedinger.bec, latticeDim: dimension },
      dirac: { ...state.schroedinger.dirac, latticeDim: dimension },
      freeScalar: { ...state.schroedinger.freeScalar, latticeDim: dimension },
      quantumWalk: { ...state.schroedinger.quantumWalk, latticeDim: dimension },
    },
  }))
}

function getTdsePresetName(id: string): string {
  const preset = TDSE_SCENARIO_PRESETS.find((candidate) => candidate.id === id)
  if (!preset) throw new Error(`TDSE preset ${id} missing`)
  return preset.name
}

const SCENARIO_MATRIX: {
  mode: ScenarioMode
  dimension: number
  presetIds: string[]
}[] = [
  {
    mode: 'tdseDynamics',
    dimension: 5,
    presetIds: TDSE_SCENARIO_PRESETS.filter((preset) =>
      isTdsePresetCompatibleWithDimension(preset, 5)
    ).map((preset) => preset.id),
  },
  {
    mode: 'becDynamics',
    dimension: 5,
    presetIds: BEC_SCENARIO_PRESETS.map((preset) => preset.id),
  },
  {
    mode: 'diracEquation',
    dimension: 5,
    presetIds: DIRAC_SCENARIO_PRESETS.map((preset) => preset.id),
  },
  {
    mode: 'freeScalarField',
    dimension: 3,
    presetIds: FREE_SCALAR_PRESETS.filter(
      (preset) => preset.overrides.latticeDim === undefined || preset.overrides.latticeDim === 3
    ).map((preset) => preset.id),
  },
  {
    mode: 'quantumWalk',
    dimension: 5,
    presetIds: QUANTUM_WALK_PRESETS.map((preset) => preset.id),
  },
  {
    mode: 'wheelerDeWitt',
    dimension: 5,
    presetIds: WDW_SCENARIO_PRESETS.map((preset) => preset.id),
  },
]

describe('ScenarioSelector - compute mode presets', () => {
  beforeEach(() => {
    resetStores()
  })

  afterEach(() => {
    act(() => {
      resetStores()
    })
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

  it('keeps de Sitter Bunch-Davies selected instead of the broader vacuum preset', async () => {
    const user = userEvent.setup()
    useExtendedObjectStore.setState((state) => ({
      schroedinger: {
        ...state.schroedinger,
        quantumMode: 'freeScalarField',
        freeScalar: { ...state.schroedinger.freeScalar, latticeDim: 3 },
      },
    }))

    render(<ScenarioSelector />)

    await user.selectOptions(screen.getByRole('combobox', { name: /scenario/i }), 'deSitterVacuum')

    await waitFor(() => {
      expect(useExtendedObjectStore.getState().schroedinger.freeScalar.cosmology.preset).toBe(
        'deSitter'
      )
    })
    expect(screen.getByRole('combobox', { name: /scenario/i })).toHaveValue('deSitterVacuum')
  })

  it.each(SCENARIO_MATRIX)(
    'keeps every visible $mode scenario selected after applying it',
    async ({ mode, dimension, presetIds }) => {
      const user = userEvent.setup()
      enterScenarioMode(mode, dimension)
      render(<ScenarioSelector />)

      const select = screen.getByRole('combobox', { name: /scenario/i })
      for (const presetId of presetIds) {
        await user.selectOptions(select, presetId)

        await waitFor(() => {
          expect(select).toHaveValue(presetId)
        })
      }
    }
  )

  it('hides fixed-lattice free scalar presets outside their required dimension', () => {
    enterScenarioMode('freeScalarField', 5)

    render(<ScenarioSelector />)

    expect(screen.queryByRole('option', { name: 'Bianchi-I Kasner Cigar (vacuum)' })).toBeNull()
  })

  it('hides fixed-dimensional TDSE physics presets above their valid dimension', () => {
    enterScenarioMode('tdseDynamics', 5)

    render(<ScenarioSelector />)

    expect(
      screen.queryByRole('option', { name: getTdsePresetName('andersonTransition4D') })
    ).toBeNull()
    expect(
      screen.queryByRole('option', { name: getTdsePresetName('wormholeWavepacket') })
    ).toBeNull()
    expect(
      screen.getByRole('option', { name: getTdsePresetName('andersonTransition5D') })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: getTdsePresetName('classicTunneling') })
    ).toBeInTheDocument()
  })

  it('does not restore a fixed-dimensional TDSE preset label above its valid dimension', () => {
    const preset = TDSE_SCENARIO_PRESETS.find(
      (candidate) => candidate.id === 'andersonTransition4D'
    )
    if (!preset) throw new Error('andersonTransition4D preset missing')
    const { latticeDim: _presetDim, ...safeOverrides } = preset.overrides
    const base = {
      ...DEFAULT_TDSE_CONFIG,
      ...safeOverrides,
      slicePositions: [0, 0],
      needsReset: true,
    }
    const resized = resizeTdseArrays(base, 5)
    const liveConfig = { ...base, ...resized, needsReset: true }

    expect(findTdsePresetId(liveConfig, 5)).toBeNull()
  })
})
