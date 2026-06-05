/**
 * Tests for PortaledSubmenu component
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/Button'
import { PortaledSubmenu } from '@/components/ui/DropdownMenu/PortaledSubmenu'
import { SubmenuPortalContext } from '@/components/ui/DropdownMenu/SubmenuPortalContext'
import { Z_INDEX } from '@/constants/zIndex'

// Mock motion/react to avoid animation issues in tests
vi.mock('motion/react', () => ({
  m: {
    div: React.forwardRef(
      (
        props: React.HTMLAttributes<HTMLDivElement> & {
          initial?: unknown
          animate?: unknown
          exit?: unknown
          transition?: unknown
        },
        ref: React.Ref<HTMLDivElement>
      ) => {
        const { initial: _i, animate: _a, exit: _e, transition: _t, ...rest } = props
        return <div ref={ref} {...rest} />
      }
    ),
    button: React.forwardRef(
      (
        props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
          whileHover?: unknown
          whileTap?: unknown
        },
        ref: React.Ref<HTMLButtonElement>
      ) => {
        const { whileHover: _h, whileTap: _t, ...rest } = props
        // eslint-disable-next-line project-rules/no-raw-html-controls -- motion/react test shim mirrors native m.button output.
        return <button ref={ref} type="button" {...rest} />
      }
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock SoundManager if referenced
vi.mock('@/lib/audio/SoundManager', () => ({
  soundManager: { playClick: vi.fn(), playHover: vi.fn(), playSwish: vi.fn() },
}))

const makeTriggerRect = (overrides: Partial<DOMRect> = {}): DOMRect =>
  ({
    top: 100,
    bottom: 120,
    left: 50,
    right: 200,
    width: 150,
    height: 20,
    x: 50,
    y: 100,
    toJSON: () => ({}),
    ...overrides,
  }) as DOMRect

const testMenuItems = (onClose?: () => void) => (
  <>
    <Button type="button" role="menuitem" onClick={onClose} variant="ghost" size="sm">
      Sub Item 1
    </Button>
    <Button type="button" role="menuitem" variant="ghost" size="sm">
      Sub Item 2
    </Button>
  </>
)

const renderSubmenu = ({
  children = testMenuItems(),
  triggerRect = makeTriggerRect(),
  onClose = vi.fn(),
  depth = 1,
  onRequestClose,
  onMouseEnter = vi.fn(),
  onMouseLeave = vi.fn(),
}: {
  children?: React.ReactNode
  triggerRect?: DOMRect
  onClose?: () => void
  depth?: number
  onRequestClose?: () => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
} = {}) => {
  const submenuProps = {
    triggerRect,
    onClose,
    depth,
    onMouseEnter,
    onMouseLeave,
    ...(onRequestClose ? { onRequestClose } : {}),
  }

  return render(<PortaledSubmenu {...submenuProps}>{children}</PortaledSubmenu>)
}

describe('PortaledSubmenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders child submenu items into a portal target', () => {
    renderSubmenu()

    expect(screen.getByText('Sub Item 1')).toBeInTheDocument()
    expect(screen.getByText('Sub Item 2')).toBeInTheDocument()
  })

  it('renders into document.body by default (no context)', () => {
    renderSubmenu()

    expect(document.body).toContainElement(screen.getByTestId('portaled-submenu'))
  })

  it('uses portal container from SubmenuPortalContext when provided', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const containerRef = { current: container } as React.RefObject<HTMLDivElement>

    render(
      <SubmenuPortalContext.Provider value={containerRef}>
        <PortaledSubmenu
          triggerRect={makeTriggerRect()}
          onClose={vi.fn()}
          depth={1}
          onMouseEnter={vi.fn()}
          onMouseLeave={vi.fn()}
        >
          {testMenuItems()}
        </PortaledSubmenu>
      </SubmenuPortalContext.Provider>
    )

    const submenu = screen.getByTestId('portaled-submenu')
    expect(container).toContainElement(submenu)
    expect(screen.getByText('Sub Item 1')).toBeInTheDocument()
    document.body.removeChild(container)
  })

  it('preserves child click handlers', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    renderSubmenu({ children: testMenuItems(onClose), onClose })

    await user.click(screen.getByText('Sub Item 1'))
    expect(onClose).toHaveBeenCalled()
  })

  it('fires onMouseEnter and onMouseLeave handlers', async () => {
    const user = userEvent.setup()
    const onMouseEnter = vi.fn()
    const onMouseLeave = vi.fn()

    renderSubmenu({ onMouseEnter, onMouseLeave })

    const menu = screen.getByTestId('portaled-submenu')
    await user.hover(menu)
    expect(onMouseEnter).toHaveBeenCalled()

    await user.unhover(menu)
    expect(onMouseLeave).toHaveBeenCalled()
  })

  it('renders with correct data-dropdown-content attribute', () => {
    renderSubmenu()

    const menuEl = screen.getByTestId('portaled-submenu')
    expect(menuEl).toHaveAttribute('data-dropdown-content', 'true')
  })

  it('applies fixed position styling', () => {
    renderSubmenu()

    const menuEl = screen.getByTestId('portaled-submenu')
    expect(menuEl).toHaveStyle({ position: 'fixed' })
  })

  it('increments zIndex by depth', () => {
    renderSubmenu({ depth: 3 })

    const menuEl = screen.getByTestId('portaled-submenu')
    expect(menuEl).toHaveStyle({ zIndex: Z_INDEX.TOOLTIP + 30 })
  })
})
