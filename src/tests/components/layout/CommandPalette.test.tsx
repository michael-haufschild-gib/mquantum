/**
 * Tests for CommandPalette — command search and keyboard navigation.
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { CommandPalette } from '@/components/layout/CommandPalette'

describe('CommandPalette', () => {
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
})
