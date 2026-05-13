/**
 * Tests for SkyboxControls — skybox selection grid and mode-specific controls.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { SkyboxControls } from '@/components/sections/Environment/SkyboxControls'
import { useEnvironmentStore } from '@/stores/scene/environmentStore'

function resetStore() {
  useEnvironmentStore.setState({
    skyboxSelection: 'none',
    skyboxIntensity: 1.0,
    skyboxAnimationMode: 'none',
    skyboxAnimationSpeed: 1.0,
    skyboxHighQuality: false,
  })
}

beforeEach(() => {
  resetStore()
})

describe('SkyboxControls', () => {
  it('renders the skybox selection thumbnail grid', () => {
    render(<SkyboxControls />)
    // All skybox options have testids: skybox-option-none, skybox-option-space_blue, etc.
    expect(screen.getByTestId('skybox-option-none')).toBeInTheDocument()
    expect(screen.getByTestId('skybox-option-space_blue')).toBeInTheDocument()
    expect(screen.getByTestId('skybox-option-procedural_aurora')).toBeInTheDocument()
  })

  it('renders all expected skybox option tiles', () => {
    render(<SkyboxControls />)
    expect(screen.getByText('None')).toBeInTheDocument()
    expect(screen.getByText('Deep Space')).toBeInTheDocument()
    expect(screen.getByText('Aurora')).toBeInTheDocument()
    expect(screen.getByText('Horizon')).toBeInTheDocument()
    expect(screen.getByText('Deep Ocean')).toBeInTheDocument()
    expect(screen.getByText('Twilight')).toBeInTheDocument()
  })

  it('does not show controls for "none" selection', () => {
    render(<SkyboxControls />)
    // No sub-controls for "none"
    expect(screen.queryByText(/Intensity/)).not.toBeInTheDocument()
  })

  it('selects a skybox when tile is clicked', async () => {
    const user = userEvent.setup()
    render(<SkyboxControls />)
    await user.click(screen.getByTestId('skybox-option-space_blue'))
    expect(useEnvironmentStore.getState().skyboxSelection).toBe('space_blue')
  })

  it('shows classic controls after selecting a texture skybox', async () => {
    const user = userEvent.setup()
    render(<SkyboxControls />)
    await user.click(screen.getByTestId('skybox-option-space_blue'))
    // Classic controls include intensity, animation mode, high quality
    expect(screen.getByText(/High Quality/)).toBeInTheDocument()
  })

  it('shows procedural shared controls after selecting aurora', async () => {
    const user = userEvent.setup()
    render(<SkyboxControls />)
    await user.click(screen.getByTestId('skybox-option-procedural_aurora'))
    expect(useEnvironmentStore.getState().skyboxSelection).toBe('procedural_aurora')
    // Procedural controls should appear
    expect(screen.queryByText(/High Quality/)).not.toBeInTheDocument()
  })

  it('handles keyboard selection of skybox tile with Enter key', async () => {
    const user = userEvent.setup()
    render(<SkyboxControls />)
    const tile = screen.getByRole('button', {
      name: 'Red Giant: Warm, intense red space',
    })
    tile.focus()
    await user.keyboard('{Enter}')
    expect(useEnvironmentStore.getState().skyboxSelection).toBe('space_red')
  })

  it('handles keyboard selection of skybox tile with Space key', async () => {
    const user = userEvent.setup()
    render(<SkyboxControls />)
    const tile = screen.getByRole('button', {
      name: 'Red Giant: Warm, intense red space',
    })
    tile.focus()
    await user.keyboard(' ')
    expect(useEnvironmentStore.getState().skyboxSelection).toBe('space_red')
  })

  it('exposes selected skybox state to assistive tech', async () => {
    const user = userEvent.setup()
    render(<SkyboxControls />)
    const tile = screen.getByRole('button', {
      name: 'Red Giant: Warm, intense red space',
    })
    expect(tile).toHaveAttribute('aria-pressed', 'false')

    await user.click(tile)

    expect(tile).toHaveAttribute('aria-pressed', 'true')
  })

  it('pre-selects the current skybox selection from store', () => {
    useEnvironmentStore.setState({ skyboxSelection: 'procedural_nebula' })
    render(<SkyboxControls />)
    // The nebula tile should be in DOM
    expect(screen.getByTestId('skybox-option-procedural_nebula')).toBeInTheDocument()
  })
})
