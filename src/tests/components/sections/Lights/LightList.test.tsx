/**
 * Tests for LightList — light list with ambient entry, add/remove, and selection.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { LightList } from '@/components/sections/Lights/LightList'
import { useLightingStore } from '@/stores/lightingStore'

function resetStore() {
  useLightingStore.setState({
    lights: [],
    selectedLightId: null,
    ambientEnabled: true,
    ambientIntensity: 0.3,
    ambientColor: '#ffffff',
  })
}

beforeEach(() => {
  resetStore()
})

describe('LightList', () => {
  it('always renders the ambient light entry', () => {
    render(<LightList />)
    expect(screen.getByText('Ambient Light')).toBeInTheDocument()
  })

  it('renders Add Light select', () => {
    render(<LightList />)
    // The select shows "Add Light..." placeholder
    expect(screen.getByText('Add Light...')).toBeInTheDocument()
  })

  it('disables Add Light select when at max lights', () => {
    // Fill up to MAX_LIGHTS (4) by adding lights
    useLightingStore.setState({
      lights: [
        {
          id: 'l1',
          type: 'point',
          name: 'Point 1',
          color: '#fff',
          intensity: 1,
          enabled: true,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          coneAngle: 45,
          penumbra: 0.5,
          range: 10,
          decay: 2,
        },
        {
          id: 'l2',
          type: 'point',
          name: 'Point 2',
          color: '#fff',
          intensity: 1,
          enabled: true,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          coneAngle: 45,
          penumbra: 0.5,
          range: 10,
          decay: 2,
        },
        {
          id: 'l3',
          type: 'point',
          name: 'Point 3',
          color: '#fff',
          intensity: 1,
          enabled: true,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          coneAngle: 45,
          penumbra: 0.5,
          range: 10,
          decay: 2,
        },
        {
          id: 'l4',
          type: 'point',
          name: 'Point 4',
          color: '#fff',
          intensity: 1,
          enabled: true,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          coneAngle: 45,
          penumbra: 0.5,
          range: 10,
          decay: 2,
        },
      ],
    })
    render(<LightList />)
    const select = screen
      .getAllByRole('combobox')
      .find((el) => el.getAttribute('disabled') !== null)
    // At max lights, the Add Light select is disabled
    expect(select).not.toBeUndefined()
  })

  it('adds a light when a type is selected', async () => {
    const user = userEvent.setup()
    render(<LightList />)
    const select = screen.getAllByRole('combobox')[0]!
    await user.selectOptions(select, 'point')
    expect(useLightingStore.getState().lights.length).toBe(1)
    expect(useLightingStore.getState().lights[0]!.type).toBe('point')
  })

  it('renders added lights in the list', () => {
    useLightingStore.setState({
      lights: [
        {
          id: 'test-1',
          type: 'directional',
          name: 'Sun',
          color: '#fff',
          intensity: 1,
          enabled: true,
          position: [0, 2, 0],
          rotation: [0, 0, 0],
          coneAngle: 45,
          penumbra: 0.5,
          range: 10,
          decay: 2,
        },
      ],
    })
    render(<LightList />)
    expect(screen.getByText('Sun')).toBeInTheDocument()
  })

  it('selects ambient light when its entry is clicked', async () => {
    const user = userEvent.setup()
    render(<LightList />)
    await user.click(screen.getByText('Ambient Light'))
    expect(useLightingStore.getState().selectedLightId).toBe('__ambient__')
  })

  it('toggles ambient enabled when ambient toggle button clicked', async () => {
    const user = userEvent.setup()
    useLightingStore.setState({ ambientEnabled: true })
    render(<LightList />)
    // Find the toggle button for the ambient light (Disable light button)
    const buttons = screen.getAllByRole('button', { name: /disable light/i })
    await user.click(buttons[0]!)
    expect(useLightingStore.getState().ambientEnabled).toBe(false)
  })
})
