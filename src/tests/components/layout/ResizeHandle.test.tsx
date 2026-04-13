/**
 * ResizeHandle component tests.
 *
 * Verifies: renders with aria attributes, visual state changes on drag,
 * pointerdown starts drag (body class added), pointerup ends drag,
 * pointermove calls setSidebarWidth, pointer cancel ends drag like pointerup.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ResizeHandle } from '@/components/layout/ResizeHandle'
import { useLayoutStore } from '@/stores/layoutStore'

vi.mock('@/lib/audio/SoundManager', () => ({
  soundManager: { playClick: vi.fn(), playHover: vi.fn() },
}))

// RAF mock — execute callback synchronously
const rafSpy = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
  cb(0)
  return 0
})
vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})

describe('ResizeHandle', () => {
  beforeEach(() => {
    useLayoutStore.setState({ sidebarWidth: 320 } as unknown as Parameters<
      typeof useLayoutStore.setState
    >[0])
    document.body.classList.remove('resize-dragging')
    rafSpy.mockClear()
  })

  it('renders with role="separator" and aria attributes', () => {
    render(<ResizeHandle />)
    const handle = screen.getByRole('separator')
    expect(handle).toHaveAttribute('aria-orientation', 'vertical')
    expect(handle).toHaveAttribute('aria-label', 'Resize sidebar')
  })

  it('adds resize-dragging class to body on pointerdown', () => {
    render(<ResizeHandle />)
    const handle = screen.getByRole('separator')
    fireEvent.pointerDown(handle, { clientX: 320, pointerId: 1 })
    expect(document.body).toHaveClass('resize-dragging')
  })

  it('removes resize-dragging class from body on pointerup', () => {
    render(<ResizeHandle />)
    const handle = screen.getByRole('separator')
    fireEvent.pointerDown(handle, { clientX: 320, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: 320, pointerId: 1 })
    expect(document.body).not.toHaveClass('resize-dragging')
  })

  it('removes resize-dragging class on pointercancel', () => {
    render(<ResizeHandle />)
    const handle = screen.getByRole('separator')
    fireEvent.pointerDown(handle, { clientX: 320, pointerId: 1 })
    fireEvent.pointerCancel(handle, { pointerId: 1 })
    expect(document.body).not.toHaveClass('resize-dragging')
  })

  it('calls setSidebarWidth on pointermove after pointerdown', () => {
    const setSidebarWidth = vi.fn()
    useLayoutStore.setState({ sidebarWidth: 320, setSidebarWidth } as unknown as Parameters<
      typeof useLayoutStore.setState
    >[0])

    render(<ResizeHandle />)
    const handle = screen.getByRole('separator')
    // Start at x=400, sidebar starts at 320
    fireEvent.pointerDown(handle, { clientX: 400, pointerId: 1 })
    // Move left by 40px → deltaX = 400 - 360 = 40 → newWidth = 320 + 40 = 360
    fireEvent.pointerMove(handle, { clientX: 360, pointerId: 1 })

    expect(setSidebarWidth).toHaveBeenCalled()
    const [newWidth] = setSidebarWidth.mock.calls[0] as [number]
    expect(newWidth).toBeGreaterThan(320) // moved handle left → sidebar grows
  })

  it('does not call setSidebarWidth on pointermove before pointerdown', () => {
    const setSidebarWidth = vi.fn()
    useLayoutStore.setState({ sidebarWidth: 320, setSidebarWidth } as unknown as Parameters<
      typeof useLayoutStore.setState
    >[0])

    render(<ResizeHandle />)
    const handle = screen.getByRole('separator')
    fireEvent.pointerMove(handle, { clientX: 300, pointerId: 1 })
    expect(setSidebarWidth).not.toHaveBeenCalled()
  })

  it('does not call setSidebarWidth on pointermove after pointerup', () => {
    const setSidebarWidth = vi.fn()
    useLayoutStore.setState({ sidebarWidth: 320, setSidebarWidth } as unknown as Parameters<
      typeof useLayoutStore.setState
    >[0])

    render(<ResizeHandle />)
    const handle = screen.getByRole('separator')
    fireEvent.pointerDown(handle, { clientX: 400, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: 360, pointerId: 1 })
    setSidebarWidth.mockClear()
    fireEvent.pointerMove(handle, { clientX: 300, pointerId: 1 })
    expect(setSidebarWidth).not.toHaveBeenCalled()
  })

  it('clamps width via clampSidebarWidth — never below MIN_SIDEBAR_WIDTH', () => {
    const setSidebarWidth = vi.fn()
    useLayoutStore.setState({ sidebarWidth: 280, setSidebarWidth } as unknown as Parameters<
      typeof useLayoutStore.setState
    >[0])
    // Mock window.innerWidth
    Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true })

    render(<ResizeHandle />)
    const handle = screen.getByRole('separator')
    // Start at x=300, move far right to shrink sidebar below minimum
    fireEvent.pointerDown(handle, { clientX: 300, pointerId: 1 })
    fireEvent.pointerMove(handle, { clientX: 600, pointerId: 1 })

    expect(setSidebarWidth).toHaveBeenCalled()
    const [newWidth] = setSidebarWidth.mock.calls[0] as [number]
    expect(newWidth).toBeGreaterThanOrEqual(280) // MIN_SIDEBAR_WIDTH
  })

  it('accepts optional className prop', () => {
    render(<ResizeHandle className="test-class" />)
    const handle = screen.getByRole('separator')
    expect(handle).toHaveClass('test-class')
  })
})
