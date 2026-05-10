/**
 * Tests for CommandPalette — command search and keyboard navigation.
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { CommandPalette } from '@/components/layout/CommandPalette'
import { useCameraStore } from '@/stores/scene/cameraStore'
import { useLayoutStore } from '@/stores/ui/layoutStore'
import { useThemeStore } from '@/stores/ui/themeStore'

describe('CommandPalette', () => {
  beforeEach(() => {
    useLayoutStore.getState().reset()
    useThemeStore.setState({ mode: 'dark', accent: 'magenta' })
    useCameraStore.setState({ camera: null, pendingState: null })
  })

  it('renders without crashing (closed by default)', () => {
    render(<CommandPalette />)
    // Palette is closed by default — no dialog visible
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument()
  })

  it('renders without visible palette initially', () => {
    render(<CommandPalette />)
    // No textbox visible when palette is closed
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('renders search UI when command palette state is open', () => {
    useLayoutStore.getState().setCommandPaletteOpen(true)
    render(<CommandPalette />)
    expect(screen.getByPlaceholderText(/type a command/i)).toBeInTheDocument()
  })

  it('opens from keyboard shortcut, filters commands, and closes on Escape', async () => {
    const user = userEvent.setup()
    render(<CommandPalette />)

    await user.keyboard('{Meta>}k{/Meta}')
    const input = screen.getByPlaceholderText(/type a command/i)
    await user.type(input, 'violet')

    expect(screen.getByRole('button', { name: /switch accent: violet/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reset camera view/i })).not.toBeInTheDocument()

    await user.keyboard('{Escape}')

    expect(screen.queryByPlaceholderText(/type a command/i)).not.toBeInTheDocument()
  })

  it('runs the filtered command with Enter and closes the palette', async () => {
    const user = userEvent.setup()
    useLayoutStore.getState().setCommandPaletteOpen(true)
    render(<CommandPalette />)

    const input = screen.getByPlaceholderText(/type a command/i)
    await user.click(input)
    await user.type(input, 'violet')
    await user.keyboard('{Enter}')

    expect(useThemeStore.getState().accent).toBe('violet')
    expect(useLayoutStore.getState().isCommandPaletteOpen).toBe(false)
    expect(screen.queryByPlaceholderText(/type a command/i)).not.toBeInTheDocument()
  })

  it('honors arrow navigation instead of always running the first command', async () => {
    const user = userEvent.setup()
    useLayoutStore.getState().setCommandPaletteOpen(true)
    render(<CommandPalette />)

    const input = screen.getByPlaceholderText(/type a command/i)
    await user.click(input)
    await user.keyboard('{ArrowDown}{Enter}')

    const layout = useLayoutStore.getState()
    expect(layout.isCollapsed).toBe(true)
    expect(layout.isCinematicMode).toBe(false)
    expect(layout.isCommandPaletteOpen).toBe(false)
  })

  it('clicking Reset Camera View calls the registered camera and closes', async () => {
    const user = userEvent.setup()
    const calls: string[] = []
    useCameraStore.getState().registerCamera({
      getState: () => ({ position: [9, 8, 7], target: [1, 2, 3] }),
      setPosition: (x, y, z) => calls.push(`position:${x},${y},${z}`),
      setTarget: (x, y, z) => calls.push(`target:${x},${y},${z}`),
    })
    useLayoutStore.getState().setCommandPaletteOpen(true)
    render(<CommandPalette />)

    await user.click(screen.getByRole('button', { name: /reset camera view/i }))

    expect(calls).toEqual(['position:0,3.125,7.5', 'target:0,0,0'])
    expect(useLayoutStore.getState().isCommandPaletteOpen).toBe(false)
  })
})
