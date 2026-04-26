/**
 * Tests for CommandPalette — command search and keyboard navigation.
 */

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { CommandPalette } from '@/components/layout/CommandPalette'
import { useLayoutStore } from '@/stores/layoutStore'

describe('CommandPalette', () => {
  beforeEach(() => {
    useLayoutStore.getState().reset()
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
})
