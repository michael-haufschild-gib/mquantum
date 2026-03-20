/**
 * ShortcutsOverlay component tests.
 *
 * Verifies: hidden when showShortcuts=false, renders keyboard shortcut list when
 * open, close button sets showShortcuts=false, Escape key closes, overlay click closes,
 * shortcut descriptions and key labels are displayed.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ShortcutsOverlay } from '@/components/layout/ShortcutsOverlay'
import { SHORTCUTS } from '@/hooks/useKeyboardShortcuts'
import { useLayoutStore } from '@/stores/layoutStore'

describe('ShortcutsOverlay', () => {
  let matchMediaSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    useLayoutStore.setState(useLayoutStore.getInitialState())
    // Mock matchMedia to simulate desktop viewport (>768px) so isMobile=false
    matchMediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
      matches: query.includes('min-width'), // all min-width queries match
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  })

  afterEach(() => {
    matchMediaSpy.mockRestore()
  })

  it('renders nothing when showShortcuts is false', () => {
    useLayoutStore.setState({ showShortcuts: false })
    render(<ShortcutsOverlay />)
    expect(screen.queryByTestId('shortcuts-overlay')).not.toBeInTheDocument()
    expect(screen.queryByText('Keyboard Shortcuts')).not.toBeInTheDocument()
  })

  it('renders the shortcut list when showShortcuts is true', () => {
    useLayoutStore.setState({ showShortcuts: true })
    render(<ShortcutsOverlay />)

    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument()

    // Should display at least some of the registered shortcuts
    if (SHORTCUTS.length > 0) {
      expect(screen.getByText(SHORTCUTS[0].description)).toBeInTheDocument()
    }

    // Each shortcut should have a <kbd> element for the key
    const kbdElements = screen.getAllByText(/./, { selector: 'kbd' })
    expect(kbdElements.length).toBeGreaterThan(0)
  })

  it('close button sets showShortcuts to false', async () => {
    useLayoutStore.setState({ showShortcuts: true })
    const user = userEvent.setup()
    render(<ShortcutsOverlay />)

    const closeBtn = screen.getByTestId('shortcuts-close')
    await user.click(closeBtn)

    expect(useLayoutStore.getState().showShortcuts).toBe(false)
  })

  it('Escape key closes the overlay', () => {
    useLayoutStore.setState({ showShortcuts: true })
    render(<ShortcutsOverlay />)

    fireEvent.keyDown(window, { key: 'Escape' })

    expect(useLayoutStore.getState().showShortcuts).toBe(false)
  })

  it('clicking the backdrop overlay closes it', async () => {
    useLayoutStore.setState({ showShortcuts: true })
    const user = userEvent.setup()
    render(<ShortcutsOverlay />)

    const overlay = screen.getByTestId('shortcuts-overlay')
    await user.click(overlay)

    expect(useLayoutStore.getState().showShortcuts).toBe(false)
  })

  it('clicking inside the modal content does NOT close it', async () => {
    useLayoutStore.setState({ showShortcuts: true })
    const user = userEvent.setup()
    render(<ShortcutsOverlay />)

    // Click on the title text (inside the modal content)
    await user.click(screen.getByText('Keyboard Shortcuts'))

    // Should still be open
    expect(useLayoutStore.getState().showShortcuts).toBe(true)
  })

  it('shows the toggle hint at the bottom', () => {
    useLayoutStore.setState({ showShortcuts: true })
    render(<ShortcutsOverlay />)

    expect(screen.getByText(/to toggle this menu anytime/)).toBeInTheDocument()
  })
})
