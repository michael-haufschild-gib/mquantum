import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CanvasContextMenu } from '@/components/layout/CanvasContextMenu'
import { Z_INDEX } from '@/constants/zIndex'
import { useDropdownStore } from '@/stores/ui/dropdownStore'

// Mock the stores
vi.mock('@/stores/ui/layoutStore', () => ({
  useLayoutStore: vi.fn((selector) =>
    selector({
      toggleCinematicMode: vi.fn(),
      toggleCollapsed: vi.fn(),
      toggleLeftPanel: vi.fn(),
    })
  ),
}))

vi.mock('@/stores/scene/cameraStore', () => ({
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

describe('CanvasContextMenu (invariants)', () => {
  const DROPDOWN_ID = 'canvas-context-menu'

  beforeEach(() => {
    // Reset store state before each test
    useDropdownStore.setState({ openDropdownId: null })
    vi.clearAllMocks()
  })

  /** Tracks created DOM elements for cleanup */
  let createdElements: HTMLElement[] = []

  afterEach(() => {
    // Clean up any DOM elements created during tests
    createdElements.forEach((el) => el.remove())
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

  const findResetCameraItem = () => screen.findByText('Reset Camera', undefined, { timeout: 5_000 })

  describe('invariant: opens only on canvas right-click with correct positioning', () => {
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

    it('should render menu items when open', async () => {
      render(<CanvasContextMenu />)

      rightClickCanvas()

      expect(await findResetCameraItem()).toBeInTheDocument()
      expect(screen.getByText('Toggle Cinematic Mode')).toBeInTheDocument()
      expect(screen.getByText('Toggle Left Panel')).toBeInTheDocument()
      expect(screen.getByText('Toggle Right Panel')).toBeInTheDocument()
    })

    it('exposes context menu semantics to assistive tech', async () => {
      render(<CanvasContextMenu />)

      rightClickCanvas()

      expect(await screen.findByRole('menu', { name: 'Canvas context menu' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Reset Camera' })).toBeInTheDocument()
    })

    it('should position menu at click coordinates', async () => {
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

      const menu = await screen.findByTestId('canvas-context-menu')
      expect(menu).toHaveStyle({ top: '250px', left: '150px' })
    })

    it('renders on the central popover layer', async () => {
      render(<CanvasContextMenu />)

      rightClickCanvas()

      expect(await screen.findByTestId('canvas-context-menu')).toHaveStyle({
        zIndex: Z_INDEX.TOOLTIP,
      })
    })
  })

  describe('invariant: closes on item click and Escape key', () => {
    it('should close when clicking a menu item', async () => {
      const user = userEvent.setup()
      render(<CanvasContextMenu />)

      rightClickCanvas()
      expect(useDropdownStore.getState().openDropdownId).toBe(DROPDOWN_ID)

      await user.click(await findResetCameraItem())

      expect(useDropdownStore.getState().openDropdownId).toBeNull()
    })

    it('should close when pressing Escape', async () => {
      const user = userEvent.setup()
      render(<CanvasContextMenu />)

      rightClickCanvas()
      expect(useDropdownStore.getState().openDropdownId).toBe(DROPDOWN_ID)
      expect(await findResetCameraItem()).toBeInTheDocument()

      await user.keyboard('{Escape}')

      expect(useDropdownStore.getState().openDropdownId).toBeNull()
    })
  })

  describe('invariant: mutual exclusion with other dropdowns', () => {
    it('should close when another dropdown opens', async () => {
      render(<CanvasContextMenu />)

      // Open canvas context menu
      rightClickCanvas()
      expect(useDropdownStore.getState().openDropdownId).toBe(DROPDOWN_ID)
      expect(await findResetCameraItem()).toBeInTheDocument()

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
    it('should render separator between items', async () => {
      render(<CanvasContextMenu />)

      rightClickCanvas()

      expect(await screen.findByRole('separator')).toBeInTheDocument()
    })

    it('should display keyboard shortcuts', async () => {
      render(<CanvasContextMenu />)

      rightClickCanvas()

      expect(await screen.findByText('R')).toBeInTheDocument()
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
