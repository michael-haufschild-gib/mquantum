import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '@/components/ui/Button'
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/DropdownMenu'
import { useDropdownStore } from '@/stores/dropdownStore'

// Mock the sound manager
vi.mock('@/lib/audio/SoundManager', () => ({
  soundManager: {
    playClick: vi.fn(),
    playHover: vi.fn(),
    playSwish: vi.fn(),
  },
}))

describe('DropdownMenu', () => {
  const mockItems: DropdownMenuItem[] = [
    { label: 'Item 1', onClick: vi.fn() },
    { label: 'Item 2', onClick: vi.fn() },
    { label: 'Item 3', onClick: vi.fn(), disabled: true },
  ]

  beforeEach(() => {
    // Reset store state before each test
    useDropdownStore.setState({ openDropdownId: null })
    // Clear all mocks
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  describe('rendering', () => {
    it('should not render menu content when closed', () => {
      render(<DropdownMenu trigger={<Button>Open Menu</Button>} items={mockItems} id="test-menu" />)

      expect(screen.queryByText('Item 1')).not.toBeInTheDocument()
    })

    it('should render menu content when trigger is clicked', async () => {
      const user = userEvent.setup()
      render(<DropdownMenu trigger={<Button>Open Menu</Button>} items={mockItems} id="test-menu" />)

      await user.click(screen.getByText('Open Menu'))

      expect(screen.getByText('Item 1')).toBeInTheDocument()
      expect(screen.getByText('Item 2')).toBeInTheDocument()
    })
  })

  describe('store integration', () => {
    it('should update store when opening dropdown', async () => {
      const user = userEvent.setup()
      render(<DropdownMenu trigger={<Button>Open Menu</Button>} items={mockItems} id="test-menu" />)

      await user.click(screen.getByText('Open Menu'))

      expect(useDropdownStore.getState().openDropdownId).toBe('test-menu')
    })

    it('should close dropdown when clicking trigger again', async () => {
      const user = userEvent.setup()
      render(<DropdownMenu trigger={<Button>Open Menu</Button>} items={mockItems} id="test-menu" />)

      await user.click(screen.getByText('Open Menu'))
      expect(useDropdownStore.getState().openDropdownId).toBe('test-menu')

      await user.click(screen.getByText('Open Menu'))
      expect(useDropdownStore.getState().openDropdownId).toBeNull()
    })
  })

  describe('multiple dropdowns', () => {
    it('should close first dropdown when opening second', async () => {
      const user = userEvent.setup()
      render(
        <div>
          <DropdownMenu trigger={<Button>Menu 1</Button>} items={mockItems} id="menu-1" />
          <DropdownMenu trigger={<Button>Menu 2</Button>} items={mockItems} id="menu-2" />
        </div>
      )

      // Open first menu
      await user.click(screen.getByText('Menu 1'))
      expect(useDropdownStore.getState().openDropdownId).toBe('menu-1')

      // Open second menu - first should close
      await user.click(screen.getByText('Menu 2'))
      expect(useDropdownStore.getState().openDropdownId).toBe('menu-2')
    })

    it('should only show one dropdown at a time', async () => {
      const user = userEvent.setup()
      render(
        <div>
          <DropdownMenu
            trigger={<Button>Menu 1</Button>}
            items={[{ label: 'Menu 1 Item', onClick: vi.fn() }]}
            id="menu-1"
          />
          <DropdownMenu
            trigger={<Button>Menu 2</Button>}
            items={[{ label: 'Menu 2 Item', onClick: vi.fn() }]}
            id="menu-2"
          />
        </div>
      )

      // Open first menu
      await user.click(screen.getByText('Menu 1'))
      expect(screen.getByText('Menu 1 Item')).toBeInTheDocument()

      // Open second menu
      await user.click(screen.getByText('Menu 2'))
      expect(screen.getByText('Menu 2 Item')).toBeInTheDocument()
      expect(screen.queryByText('Menu 1 Item')).not.toBeInTheDocument()
    })
  })

  describe('click outside', () => {
    it('should close dropdown when clicking outside', async () => {
      render(
        <div>
          <div data-testid="outside">Outside Area</div>
          <DropdownMenu trigger={<Button>Open Menu</Button>} items={mockItems} id="test-menu" />
        </div>
      )

      // Open dropdown
      fireEvent.click(screen.getByText('Open Menu'))
      expect(useDropdownStore.getState().openDropdownId).toBe('test-menu')

      // Click outside
      fireEvent.mouseDown(screen.getByTestId('outside'))
      expect(useDropdownStore.getState().openDropdownId).toBeNull()
    })

    it('should not close dropdown when clicking inside menu content', async () => {
      const user = userEvent.setup()
      render(<DropdownMenu trigger={<Button>Open Menu</Button>} items={mockItems} id="test-menu" />)

      await user.click(screen.getByText('Open Menu'))
      expect(useDropdownStore.getState().openDropdownId).toBe('test-menu')

      // Click on disabled item (inside menu but shouldn't close)
      fireEvent.mouseDown(screen.getByText('Item 3'))
      expect(useDropdownStore.getState().openDropdownId).toBe('test-menu')
    })
  })

  describe('escape key', () => {
    it('should close dropdown when pressing Escape', async () => {
      const user = userEvent.setup()
      render(<DropdownMenu trigger={<Button>Open Menu</Button>} items={mockItems} id="test-menu" />)

      await user.click(screen.getByText('Open Menu'))
      expect(useDropdownStore.getState().openDropdownId).toBe('test-menu')

      await user.keyboard('{Escape}')
      expect(useDropdownStore.getState().openDropdownId).toBeNull()
    })
  })

  describe('item clicks', () => {
    it('should call onClick handler and close menu when clicking item', async () => {
      const handleClick = vi.fn()
      const items: DropdownMenuItem[] = [{ label: 'Clickable Item', onClick: handleClick }]

      const user = userEvent.setup()
      render(<DropdownMenu trigger={<Button>Open Menu</Button>} items={items} id="test-menu" />)

      await user.click(screen.getByText('Open Menu'))
      await user.click(screen.getByText('Clickable Item'))

      expect(handleClick).toHaveBeenCalledTimes(1)
      expect(useDropdownStore.getState().openDropdownId).toBeNull()
    })

    it('should not call onClick handler for disabled items', async () => {
      const handleClick = vi.fn()
      const items: DropdownMenuItem[] = [
        { label: 'Disabled Item', onClick: handleClick, disabled: true },
      ]

      const user = userEvent.setup()
      render(<DropdownMenu trigger={<Button>Open Menu</Button>} items={items} id="test-menu" />)

      await user.click(screen.getByText('Open Menu'))

      // Disabled button should not be clickable
      const disabledButton = screen.getByText('Disabled Item').closest('button')
      expect(disabledButton).toBeDisabled()
    })
  })

  describe('onClose callback', () => {
    it('should call onClose when dropdown closes', async () => {
      const handleClose = vi.fn()
      const user = userEvent.setup()
      render(
        <DropdownMenu
          trigger={<Button>Open Menu</Button>}
          items={mockItems}
          id="test-menu"
          onClose={handleClose}
        />
      )

      // Open dropdown
      await user.click(screen.getByText('Open Menu'))
      expect(handleClose).not.toHaveBeenCalled()

      // Close dropdown
      await user.click(screen.getByText('Open Menu'))
      expect(handleClose).toHaveBeenCalledTimes(1)
    })
  })

  describe('separators and headers', () => {
    it('should render separator items', async () => {
      const items: DropdownMenuItem[] = [
        { label: 'Item 1', onClick: vi.fn() },
        { label: '---' },
        { label: 'Item 2', onClick: vi.fn() },
      ]

      const user = userEvent.setup()
      render(<DropdownMenu trigger={<Button>Open Menu</Button>} items={items} id="test-menu" />)

      await user.click(screen.getByText('Open Menu'))

      // Separator uses: h-px bg-[var(--border-subtle)] my-1.5 mx-2
      const separator = document.querySelector('.h-px')
      expect(separator).toBeInTheDocument()
    })

    it('should render header items as non-interactive', async () => {
      const items: DropdownMenuItem[] = [
        { label: 'Header' }, // No onClick, items, or disabled - this is a header
        { label: 'Item 1', onClick: vi.fn() },
      ]

      const user = userEvent.setup()
      render(<DropdownMenu trigger={<Button>Open Menu</Button>} items={items} id="test-menu" />)

      await user.click(screen.getByText('Open Menu'))

      // Header should exist as text, not as a button
      expect(screen.getByText('Header')).toBeInTheDocument()
      expect(screen.getByText('Header').closest('button')).toBeNull()
    })
  })

  describe('submenus', () => {
    it('should render submenu items with arrow indicator', async () => {
      const items: DropdownMenuItem[] = [
        {
          label: 'Has Submenu',
          items: [
            { label: 'Sub Item 1', onClick: vi.fn() },
            { label: 'Sub Item 2', onClick: vi.fn() },
          ],
        },
      ]

      const user = userEvent.setup()
      render(<DropdownMenu trigger={<Button>Open Menu</Button>} items={items} id="test-menu" />)

      await user.click(screen.getByText('Open Menu'))

      // Should show arrow indicator for submenu
      const submenuButton = screen.getByText('Has Submenu').closest('button')
      expect(submenuButton).toBeInTheDocument()
      expect(screen.getByText('›')).toBeInTheDocument()
    })
  })

  describe('data attributes', () => {
    it('should add data-dropdown-trigger attribute to trigger', async () => {
      render(<DropdownMenu trigger={<Button>Open Menu</Button>} items={mockItems} id="test-menu" />)

      const trigger = screen.getByText('Open Menu').closest('[data-dropdown-trigger]')
      expect(trigger).toHaveAttribute('data-dropdown-trigger', 'test-menu')
    })

    it('should add data-dropdown-content attribute to menu content', async () => {
      const user = userEvent.setup()
      render(<DropdownMenu trigger={<Button>Open Menu</Button>} items={mockItems} id="test-menu" />)

      await user.click(screen.getByText('Open Menu'))

      const content = document.querySelector('[data-dropdown-content]')
      expect(content).toBeInTheDocument()
      expect(content).toHaveAttribute('data-dropdown-id', 'test-menu')
    })
  })
})
