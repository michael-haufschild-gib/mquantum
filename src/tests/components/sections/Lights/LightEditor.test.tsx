/**
 * LightEditor component tests.
 *
 * Verifies: shows placeholder when no light selected, shows ambient editor
 * for __ambient__ selection, shows name/type/intensity for point light,
 * shows rotation for directional/spot, shows cone/penumbra for spot only,
 * name input change calls updateLight, duplicate button calls duplicateLight.
 */
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LightEditor } from '@/components/sections/Lights/LightEditor'
import { AMBIENT_LIGHT_ID } from '@/components/sections/Lights/LightListItem'
import { useLightingStore } from '@/stores/scene/lightingStore'
import { createLightingInitialState } from '@/stores/slices/lightingSlice'

vi.mock('@/components/ui/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`}>{name}</span>,
}))

vi.mock('@/lib/audio/SoundManager', () => ({
  soundManager: { playClick: vi.fn(), playHover: vi.fn() },
}))

const POINT_LIGHT = {
  id: 'light-test-1',
  name: 'Test Point',
  type: 'point' as const,
  enabled: true,
  position: [0, 5, 0] as [number, number, number],
  rotation: [0, 0, 0] as [number, number, number],
  color: '#FFFFFF',
  intensity: 1.0,
  coneAngle: 30,
  penumbra: 0.5,
  range: 100,
  decay: 2.0,
}

const DIRECTIONAL_LIGHT = {
  ...POINT_LIGHT,
  id: 'light-test-dir',
  name: 'Dir Light',
  type: 'directional' as const,
}

const SPOT_LIGHT = {
  ...POINT_LIGHT,
  id: 'light-test-spot',
  name: 'Spot Light',
  type: 'spot' as const,
}

describe('LightEditor', () => {
  beforeEach(() => {
    useLightingStore.setState(createLightingInitialState())
  })

  it('shows placeholder when no light is selected', () => {
    useLightingStore.setState({ selectedLightId: null, lights: [POINT_LIGHT] })
    render(<LightEditor />)
    expect(screen.getByText('Select a light to edit')).toBeInTheDocument()
  })

  it('shows ambient editor when __ambient__ is selected', () => {
    useLightingStore.setState({ selectedLightId: AMBIENT_LIGHT_ID })
    render(<LightEditor />)
    // Ambient editor shows Intensity slider label
    expect(screen.getByText('Intensity')).toBeInTheDocument()
    // No name input for ambient
    expect(screen.queryByLabelText('Light name')).not.toBeInTheDocument()
  })

  it('renders name input for selected point light', () => {
    useLightingStore.setState({ selectedLightId: POINT_LIGHT.id, lights: [POINT_LIGHT] })
    render(<LightEditor />)
    expect(screen.getByDisplayValue('Test Point')).toBeInTheDocument()
  })

  it('renders type selector for point light', () => {
    useLightingStore.setState({ selectedLightId: POINT_LIGHT.id, lights: [POINT_LIGHT] })
    render(<LightEditor />)
    // Select with label "Type" should be present
    expect(screen.getByText('Type')).toBeInTheDocument()
  })

  it('does not show rotation for point light', () => {
    useLightingStore.setState({ selectedLightId: POINT_LIGHT.id, lights: [POINT_LIGHT] })
    render(<LightEditor />)
    expect(screen.queryByText('Rotation')).not.toBeInTheDocument()
  })

  it('shows rotation for directional light', () => {
    useLightingStore.setState({
      selectedLightId: DIRECTIONAL_LIGHT.id,
      lights: [DIRECTIONAL_LIGHT],
    })
    render(<LightEditor />)
    expect(screen.getByText('Rotation')).toBeInTheDocument()
  })

  it('shows rotation for spot light', () => {
    useLightingStore.setState({ selectedLightId: SPOT_LIGHT.id, lights: [SPOT_LIGHT] })
    render(<LightEditor />)
    expect(screen.getByText('Rotation')).toBeInTheDocument()
  })

  it('does not show Cone Angle for point light', () => {
    useLightingStore.setState({ selectedLightId: POINT_LIGHT.id, lights: [POINT_LIGHT] })
    render(<LightEditor />)
    expect(screen.queryByText('Cone Angle')).not.toBeInTheDocument()
  })

  it('shows Cone Angle and Penumbra for spot light', () => {
    useLightingStore.setState({ selectedLightId: SPOT_LIGHT.id, lights: [SPOT_LIGHT] })
    render(<LightEditor />)
    expect(screen.getByText('Cone Angle')).toBeInTheDocument()
    expect(screen.getByText('Penumbra')).toBeInTheDocument()
  })

  it('shows Range and Decay for point light', () => {
    useLightingStore.setState({ selectedLightId: POINT_LIGHT.id, lights: [POINT_LIGHT] })
    render(<LightEditor />)
    expect(screen.getByText('Range')).toBeInTheDocument()
    expect(screen.getByText('Decay')).toBeInTheDocument()
  })

  it('does not show Range/Decay for directional light', () => {
    useLightingStore.setState({
      selectedLightId: DIRECTIONAL_LIGHT.id,
      lights: [DIRECTIONAL_LIGHT],
    })
    render(<LightEditor />)
    expect(screen.queryByText('Range')).not.toBeInTheDocument()
    expect(screen.queryByText('Decay')).not.toBeInTheDocument()
  })

  it('name input change calls updateLight with new name', async () => {
    const user = userEvent.setup()
    const updateLight = vi.fn()
    useLightingStore.setState({
      selectedLightId: POINT_LIGHT.id,
      lights: [POINT_LIGHT],
      updateLight,
    })
    render(<LightEditor />)
    const nameInput = screen.getByLabelText('Light name')
    await user.clear(nameInput)
    await user.type(nameInput, 'New Name')
    expect(updateLight).toHaveBeenCalledWith(
      POINT_LIGHT.id,
      expect.objectContaining({ name: expect.stringContaining('N') })
    )
  })

  it('duplicate button calls duplicateLight and selectLight', async () => {
    const user = userEvent.setup()
    const duplicateLight = vi.fn().mockReturnValue('light-new-id')
    const selectLight = vi.fn()
    useLightingStore.setState({
      selectedLightId: POINT_LIGHT.id,
      lights: [POINT_LIGHT],
      duplicateLight,
      selectLight,
    })
    render(<LightEditor />)
    await user.click(screen.getByRole('button', { name: /Duplicate light/i }))
    expect(duplicateLight).toHaveBeenCalledWith(POINT_LIGHT.id)
    expect(selectLight).toHaveBeenCalledWith('light-new-id')
  })
})
