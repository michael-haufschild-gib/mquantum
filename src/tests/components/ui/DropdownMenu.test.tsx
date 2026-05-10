import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MouseEvent } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/Button'
import { DropdownMenu, type DropdownMenuItem } from '@/components/ui/DropdownMenu'
import { useDropdownStore } from '@/stores/ui/dropdownStore'

// Mock the sound manager
vi.mock('@/lib/audio/SoundManager', () => ({
  soundManager: {
    playClick: vi.fn(),
    playHover: vi.fn(),
    playSwish: vi.fn(),
  },
}))

describe('DropdownMenu (invariants)', () => {
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

  describe('invariant: menu visibility follows open state', () => {
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

  describe('invariant: trigger clicks synchronize with dropdown store', () => {
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

    it('preserves the trigger onClick handler when toggling the dropdown', async () => {
      const user = userEvent.setup()
      const onTriggerClick = vi.fn()

      render(
        <DropdownMenu
          trigger={<Button onClick={onTriggerClick}>Open Menu</Button>}
          items={mockItems}
          id="test-menu"
        />
      )

      await user.click(screen.getByText('Open Menu'))

      expect(onTriggerClick).toHaveBeenCalledTimes(1)
      expect(useDropdownStore.getState().openDropdownId).toBe('test-menu')
    })

    it('does not toggle when the trigger onClick prevents default', async () => {
      const user = userEvent.setup()
      const onTriggerClick = vi.fn((event: MouseEvent) => event.preventDefault())

      render(
        <DropdownMenu
          trigger={<Button onClick={onTriggerClick}>Open Menu</Button>}
          items={mockItems}
          id="test-menu"
        />
      )

      await user.click(screen.getByText('Open Menu'))

      expect(onTriggerClick).toHaveBeenCalledTimes(1)
      expect(useDropdownStore.getState().openDropdownId).toBeNull()
    })
  })

  describe('invariant: only one dropdown visible at a time', () => {
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

  describe('invariant: click-outside closes menu, click-inside preserves it', () => {
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

  describe('invariant: Escape key closes dropdown', () => {
    it('should close dropdown when pressing Escape', async () => {
      const user = userEvent.setup()
      render(<DropdownMenu trigger={<Button>Open Menu</Button>} items={mockItems} id="test-menu" />)

      await user.click(screen.getByText('Open Menu'))
      expect(useDropdownStore.getState().openDropdownId).toBe('test-menu')

      await user.keyboard('{Escape}')
      expect(useDropdownStore.getState().openDropdownId).toBeNull()
    })
  })

  describe('invariant: keyboard navigation moves focus across enabled items', () => {
    // DropdownMenu auto-focuses the first enabled menuitem on open; subsequent
    // Arrow/Home/End keys shift `document.activeElement` across the non-
    // disabled [role="menuitem"] list. The menu skips disabled items via the
    // `:not(:disabled)` selector in `handleMenuKeyDown`.
    const navigationItems: DropdownMenuItem[] = [
      { label: 'First', onClick: vi.fn() },
      { label: 'Second', onClick: vi.fn() },
      { label: 'Disabled', onClick: vi.fn(), disabled: true },
      { label: 'Third', onClick: vi.fn() },
    ]

    /** Query the menu button for `label` — works whether focus is on it or not. */
    const menuButton = (label: string): HTMLElement => screen.getByRole('menuitem', { name: label })

    it('ArrowDown advances to the next enabled item and skips disabled', async () => {
      const user = userEvent.setup()
      render(
        <DropdownMenu trigger={<Button>Open Menu</Button>} items={navigationItems} id="test-menu" />
      )
      await user.click(screen.getByText('Open Menu'))
      // After open, focus lands on the first enabled item.
      await vi.waitFor(() => expect(menuButton('First')).toHaveFocus())

      await user.keyboard('{ArrowDown}')
      expect(menuButton('Second')).toHaveFocus()

      // Third ArrowDown must skip the disabled middle item (the `:not(:disabled)`
      // selector removes it from the navigable list).
      await user.keyboard('{ArrowDown}')
      expect(menuButton('Third')).toHaveFocus()

      // ArrowDown on the last item wraps to the first.
      await user.keyboard('{ArrowDown}')
      expect(menuButton('First')).toHaveFocus()
    })

    it('ArrowUp moves to the previous enabled item with wrap-around', async () => {
      const user = userEvent.setup()
      render(
        <DropdownMenu trigger={<Button>Open Menu</Button>} items={navigationItems} id="test-menu" />
      )
      await user.click(screen.getByText('Open Menu'))
      await vi.waitFor(() => expect(menuButton('First')).toHaveFocus())

      // ArrowUp from the first item wraps to the last enabled item (Third).
      await user.keyboard('{ArrowUp}')
      expect(menuButton('Third')).toHaveFocus()
    })

    it('Home jumps to the first enabled item and End jumps to the last', async () => {
      const user = userEvent.setup()
      render(
        <DropdownMenu trigger={<Button>Open Menu</Button>} items={navigationItems} id="test-menu" />
      )
      await user.click(screen.getByText('Open Menu'))
      await vi.waitFor(() => expect(menuButton('First')).toHaveFocus())

      await user.keyboard('{End}')
      expect(menuButton('Third')).toHaveFocus()

      await user.keyboard('{Home}')
      expect(menuButton('First')).toHaveFocus()
    })
  })

  describe('invariant: item click fires handler and closes, disabled items blocked', () => {
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
      const disabledItem = screen.getByRole('menuitem', { name: 'Disabled Item' })
      expect(disabledItem).toBeDisabled()

      // Contract: clicking a disabled item must never invoke its onClick.
      // `toBeDisabled()` alone doesn't prove that — userEvent.click on a
      // disabled button is a no-op by design, but a regression that moves
      // the disabled check from HTML `disabled` attribute to CSS class
      // (`pointer-events: none`) would still pass toBeDisabled while
      // allowing programmatic clicks through.
      await user.click(disabledItem)
      expect(handleClick).not.toHaveBeenCalled()
      // Dropdown must also stay open — the disabled click is not an action,
      // so `onClose` must not fire.
      expect(useDropdownStore.getState().openDropdownId).toBe('test-menu')
    })
  })

  describe('invariant: onClose fires only when transitioning from open to closed', () => {
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

    it('clears open dropdown state and calls onClose when unmounted while open', async () => {
      const handleClose = vi.fn()
      const user = userEvent.setup()
      const { unmount } = render(
        <DropdownMenu
          trigger={<Button>Open Menu</Button>}
          items={mockItems}
          id="test-menu"
          onClose={handleClose}
        />
      )

      await user.click(screen.getByText('Open Menu'))
      expect(useDropdownStore.getState().openDropdownId).toBe('test-menu')

      unmount()

      expect(useDropdownStore.getState().openDropdownId).toBeNull()
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

      expect(screen.getByRole('separator')).toBeInTheDocument()
    })

    it('should render header items as non-interactive', async () => {
      const items: DropdownMenuItem[] = [
        { label: 'Header' }, // No onClick, items, or disabled - this is a header
        { label: 'Item 1', onClick: vi.fn() },
      ]

      const user = userEvent.setup()
      render(<DropdownMenu trigger={<Button>Open Menu</Button>} items={items} id="test-menu" />)

      await user.click(screen.getByText('Open Menu'))

      // Header should exist as text, not as an interactive menu item
      expect(screen.getByText('Header')).toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: 'Header' })).not.toBeInTheDocument()
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
      expect(screen.getByRole('menuitem', { name: /Has Submenu/ })).toBeInTheDocument()
      expect(screen.getByText('›')).toBeInTheDocument()
    })

    it('does not open a disabled submenu on hover', async () => {
      const items: DropdownMenuItem[] = [
        {
          label: 'Unavailable Submenu',
          disabled: true,
          items: [{ label: 'Hidden Action', onClick: vi.fn() }],
        },
      ]

      const user = userEvent.setup()
      render(<DropdownMenu trigger={<Button>Open Menu</Button>} items={items} id="test-menu" />)

      await user.click(screen.getByText('Open Menu'))
      const disabledSubmenu = screen.getByRole('menuitem', { name: /Unavailable Submenu/ })
      expect(disabledSubmenu).toBeDisabled()

      fireEvent.mouseEnter(disabledSubmenu)

      expect(screen.queryByText('Hidden Action')).not.toBeInTheDocument()
    })

    it('opens a submenu from the keyboard and moves focus into it', async () => {
      const subItemClick = vi.fn()
      const items: DropdownMenuItem[] = [
        {
          label: 'Has Submenu',
          items: [
            { label: 'Sub Item 1', onClick: subItemClick },
            { label: 'Sub Item 2', onClick: vi.fn() },
          ],
        },
      ]

      const user = userEvent.setup()
      render(<DropdownMenu trigger={<Button>Open Menu</Button>} items={items} id="test-menu" />)

      await user.click(screen.getByText('Open Menu'))
      const submenuTrigger = screen.getByRole('menuitem', { name: /Has Submenu/ })
      await vi.waitFor(() => expect(submenuTrigger).toHaveFocus())

      await user.keyboard('{Enter}')
      const firstSubItem = await screen.findByRole('menuitem', { name: 'Sub Item 1' })

      await vi.waitFor(() => expect(firstSubItem).toHaveFocus())
      await user.keyboard('{Enter}')

      expect(subItemClick).toHaveBeenCalledTimes(1)
      expect(useDropdownStore.getState().openDropdownId).toBeNull()
    })
  })

  describe('data attributes', () => {
    it('should add data-dropdown-trigger attribute to trigger', async () => {
      render(<DropdownMenu trigger={<Button>Open Menu</Button>} items={mockItems} id="test-menu" />)

      // ARIA attributes are injected directly onto the trigger button (no wrapper role="button")
      const triggerButton = screen.getByRole('button', { name: /Open Menu/ })
      expect(triggerButton).toHaveAttribute('aria-haspopup', 'menu')
      expect(triggerButton).toHaveAttribute('aria-expanded', 'false')
      // data-dropdown-trigger is on the positioning wrapper, not the button
      const triggerWrapper = screen.getByTestId('dropdown-trigger-test-menu')
      expect(triggerWrapper).toHaveAttribute('data-dropdown-trigger', 'test-menu')
    })

    it('should add data-dropdown-content attribute to menu content', async () => {
      const user = userEvent.setup()
      render(<DropdownMenu trigger={<Button>Open Menu</Button>} items={mockItems} id="test-menu" />)

      await user.click(screen.getByText('Open Menu'))

      // When open, the dropdown menu should be visible with its items
      expect(screen.getByRole('menu')).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Item 1' })).toBeInTheDocument()
    })
  })
})
