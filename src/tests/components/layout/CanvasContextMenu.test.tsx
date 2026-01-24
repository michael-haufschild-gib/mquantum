import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CanvasContextMenu } from '@/components/layout/CanvasContextMenu'
import { useDropdownStore } from '@/stores/dropdownStore'

// Mock the stores
vi.mock('@/stores/layoutStore', () => ({
  useLayoutStore: vi.fn((selector) =>
    selector({
      toggleCinematicMode: vi.fn(),
      toggleCollapsed: vi.fn(),
      toggleLeftPanel: vi.fn(),
    })
  ),
}))

vi.mock('@/stores/cameraStore', () => ({
  useCameraStore: vi.fn((selector) =>
    selector({
      reset: vi.fn(),
    })
  ),
}))

// Mock the sound manager
vi.mock('@/lib/audio/SoundManager', () => ({
  soundManager: {
    playClick: vi.fn(),
    playHover: vi.fn(),
    playSwish: vi.fn(),
  },
}))

describe('CanvasContextMenu', () => {
  const DROPDOWN_ID = 'canvas-context-menu'

  beforeEach(() => {
    // Reset store state before each test
    useDropdownStore.setState({ openDropdownId: null })
    vi.clearAllMocks()
  })

  /** Tracks created DOM elements for cleanup */
  let createdElements: HTMLElement[] = []

  afterEach(() => {
    cleanup()
    // Clean up any DOM elements created during tests
    createdElements.forEach((el) => {
      if (el.parentNode) el.parentNode.removeChild(el)
    })
    createdElements = []
  })

  /**
   * Helper to simulate right-click on canvas.
   * @returns The simulated MouseEvent
   */
  const rightClickCanvas = () => {
    // Create a container with id for the selector
    const container = document.createElement('div')
    container.id = 'canvas-container'
    document.body.appendChild(container)
    createdElements.push(container)

    // Create a mock canvas element inside container
    const canvas = document.createElement('canvas')
    canvas.id = 'test-canvas'
    container.appendChild(canvas)

    // Fire contextmenu event on canvas
    fireEvent.contextMenu(canvas, {
      clientX: 100,
      clientY: 200,
    })

    return { canvas, container }
  }

  describe('opening via right-click', () => {
    it('should open when right-clicking on canvas', () => {
      render(<CanvasContextMenu />)

      rightClickCanvas()

      expect(useDropdownStore.getState().openDropdownId).toBe(DROPDOWN_ID)
    })

    it('should not open when right-clicking outside canvas', () => {
      render(<CanvasContextMenu />)

      // Create a non-canvas element
      const div = document.createElement('div')
      div.id = 'not-canvas'
      document.body.appendChild(div)
      createdElements.push(div)

      fireEvent.contextMenu(div, {
        clientX: 100,
        clientY: 200,
      })

      expect(useDropdownStore.getState().openDropdownId).toBeNull()
    })

    it('should render menu items when open', () => {
      render(<CanvasContextMenu />)

      rightClickCanvas()

      expect(screen.getByText('Reset Camera')).toBeInTheDocument()
      expect(screen.getByText('Toggle Cinematic Mode')).toBeInTheDocument()
      expect(screen.getByText('Toggle Left Panel')).toBeInTheDocument()
      expect(screen.getByText('Toggle Right Panel')).toBeInTheDocument()
    })

    it('should position menu at click coordinates', () => {
      render(<CanvasContextMenu />)

      const container = document.createElement('div')
      container.id = 'canvas-container'
      document.body.appendChild(container)
      createdElements.push(container)

      const canvas = document.createElement('canvas')
      container.appendChild(canvas)

      fireEvent.contextMenu(canvas, {
        clientX: 150,
        clientY: 250,
      })

      const menu = document.querySelector('.glass-panel')
      expect(menu).toHaveStyle({ top: '250px', left: '150px' })
    })
  })

  describe('closing', () => {
    it('should close when clicking a menu item', async () => {
      const user = userEvent.setup()
      render(<CanvasContextMenu />)

      rightClickCanvas()
      expect(useDropdownStore.getState().openDropdownId).toBe(DROPDOWN_ID)

      await user.click(screen.getByText('Reset Camera'))

      expect(useDropdownStore.getState().openDropdownId).toBeNull()
    })

    it('should close when pressing Escape', async () => {
      const user = userEvent.setup()
      render(<CanvasContextMenu />)

      rightClickCanvas()
      expect(useDropdownStore.getState().openDropdownId).toBe(DROPDOWN_ID)

      await user.keyboard('{Escape}')

      expect(useDropdownStore.getState().openDropdownId).toBeNull()
    })
  })

  describe('store coordination', () => {
    it('should close when another dropdown opens', () => {
      render(<CanvasContextMenu />)

      // Open canvas context menu
      rightClickCanvas()
      expect(useDropdownStore.getState().openDropdownId).toBe(DROPDOWN_ID)

      // Simulate another dropdown opening (e.g., topbar menu)
      act(() => {
        useDropdownStore.getState().openDropdown('file-menu')
      })

      expect(useDropdownStore.getState().openDropdownId).toBe('file-menu')
      // Menu should no longer be visible since it's not the active dropdown
      expect(screen.queryByText('Reset Camera')).not.toBeInTheDocument()
    })

    it('should close other dropdowns when opening', () => {
      render(<CanvasContextMenu />)

      // Simulate another dropdown being open first
      useDropdownStore.getState().openDropdown('other-menu')
      expect(useDropdownStore.getState().openDropdownId).toBe('other-menu')

      // Open canvas context menu
      rightClickCanvas()

      // Canvas context menu should now be the active one
      expect(useDropdownStore.getState().openDropdownId).toBe(DROPDOWN_ID)
    })
  })

  describe('menu items', () => {
    it('should render separator between items', () => {
      render(<CanvasContextMenu />)

      rightClickCanvas()

      // Should have a separator element with the correct CSS class
      // The separator uses: h-[1px] bg-[var(--border-subtle)] my-1 mx-2
      const separator = document.querySelector('.h-\\[1px\\]')
      expect(separator).toBeInTheDocument()
    })

    it('should display keyboard shortcuts', () => {
      render(<CanvasContextMenu />)

      rightClickCanvas()

      expect(screen.getByText('R')).toBeInTheDocument()
      expect(screen.getByText('C')).toBeInTheDocument()
      expect(screen.getByText('Shift+\\')).toBeInTheDocument()
      expect(screen.getByText('\\')).toBeInTheDocument()
    })
  })

  describe('not visible when closed', () => {
    it('should not render menu content when closed', () => {
      render(<CanvasContextMenu />)

      // Don't open the menu
      expect(screen.queryByText('Reset Camera')).not.toBeInTheDocument()
    })
  })
})
