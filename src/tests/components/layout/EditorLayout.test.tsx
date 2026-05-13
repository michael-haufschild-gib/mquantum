/**
 * Tests for EditorLayout — main application layout with panels.
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EditorLayout } from '@/components/layout/EditorLayout'
import { ToastProvider } from '@/contexts/ToastContext'
import { BREAKPOINTS } from '@/hooks/useMediaQuery'
import { useLayoutStore } from '@/stores/ui/layoutStore'
import { useThemeStore } from '@/stores/ui/themeStore'

function renderLayout() {
  return render(
    <ToastProvider>
      <EditorLayout>
        <div data-testid="child-content">Canvas</div>
      </EditorLayout>
    </ToastProvider>
  )
}

describe('EditorLayout', () => {
  const originalMatchMedia = window.matchMedia

  beforeEach(() => {
    useLayoutStore.getState().reset()
    useThemeStore.setState({ mode: 'dark', accent: 'magenta' })
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    useLayoutStore.getState().reset()
    vi.restoreAllMocks()
  })

  function mockDesktopViewport(matchesDesktop: boolean) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === BREAKPOINTS.lg ? matchesDesktop : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  }

  it('renders children in the canvas area', () => {
    renderLayout()
    expect(screen.getByTestId('child-content')).toBeInTheDocument()
  })

  it('renders without crashing when children are null', () => {
    // Verifies the component tree mounts without throwing.
    // EditorLayout imports lazy panels and Motion animations — this test ensures
    // all dependencies resolve in the test environment.
    expect(() => {
      render(
        <ToastProvider>
          <EditorLayout />
        </ToastProvider>
      )
    }).not.toThrow()
  })

  it('honors persisted closed panel state on desktop mount', async () => {
    mockDesktopViewport(true)
    useLayoutStore.setState({ showLeftPanel: false, isCollapsed: true, isCinematicMode: false })

    renderLayout()

    await waitFor(() => {
      expect(screen.getByTestId('top-bar')).toBeInTheDocument()
    })
    expect(useLayoutStore.getState().showLeftPanel).toBe(false)
    expect(useLayoutStore.getState().isCollapsed).toBe(true)
  })

  it('applies theme mode and accent to the document root', async () => {
    mockDesktopViewport(true)
    useThemeStore.setState({ mode: 'light', accent: 'green' })

    renderLayout()

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-mode', 'light')
    })
    expect(document.documentElement).toHaveAttribute('data-accent', 'green')
  })

  it('clears cinematic mode when fullscreen exits', async () => {
    mockDesktopViewport(true)
    useLayoutStore.setState({ isCinematicMode: true })
    renderLayout()

    expect(useLayoutStore.getState().isCinematicMode).toBe(true)
    document.dispatchEvent(new Event('fullscreenchange'))

    await waitFor(() => {
      expect(useLayoutStore.getState().isCinematicMode).toBe(false)
    })
  })

  it('cinematic mode hides top bar and exit button restores chrome', async () => {
    mockDesktopViewport(true)
    const user = userEvent.setup()
    useLayoutStore.setState({ isCinematicMode: true })
    renderLayout()

    expect(screen.queryByTestId('top-bar')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('exit-cinematic'))

    expect(useLayoutStore.getState().isCinematicMode).toBe(false)
    await waitFor(() => {
      expect(screen.getByTestId('top-bar')).toBeInTheDocument()
    })
  })
})
