/**
 * Tests for PortaledSubmenu component
 */

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { PortaledSubmenu } from '@/components/ui/DropdownMenu/PortaledSubmenu'
import { SubmenuPortalContext } from '@/components/ui/DropdownMenu/SubmenuPortalContext'
import type { DropdownMenuItem } from '@/components/ui/DropdownMenu/types'

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

const ITEMS: DropdownMenuItem[] = [
  { label: 'Sub Item 1', onClick: vi.fn() },
  { label: 'Sub Item 2', onClick: vi.fn() },
]

describe('PortaledSubmenu', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders submenu items into a portal target', () => {
    render(
      <PortaledSubmenu
        items={ITEMS}
        triggerRect={makeTriggerRect()}
        onClose={vi.fn()}
        depth={1}
        onMouseEnter={vi.fn()}
        onMouseLeave={vi.fn()}
      />
    )

    expect(screen.getByText('Sub Item 1')).toBeInTheDocument()
    expect(screen.getByText('Sub Item 2')).toBeInTheDocument()
  })

  it('renders into document.body by default (no context)', () => {
    render(
      <PortaledSubmenu
        items={ITEMS}
        triggerRect={makeTriggerRect()}
        onClose={vi.fn()}
        depth={1}
        onMouseEnter={vi.fn()}
        onMouseLeave={vi.fn()}
      />
    )

    // Content should appear in document body
    expect(screen.getByText('Sub Item 1')).toBeInTheDocument()
  })

  it('uses portal container from SubmenuPortalContext when provided', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const containerRef = { current: container } as React.RefObject<HTMLDivElement>

    render(
      <SubmenuPortalContext.Provider value={containerRef}>
        <PortaledSubmenu
          items={ITEMS}
          triggerRect={makeTriggerRect()}
          onClose={vi.fn()}
          depth={1}
          onMouseEnter={vi.fn()}
          onMouseLeave={vi.fn()}
        />
      </SubmenuPortalContext.Provider>
    )

    // Items should be reachable in document body (portal goes to container)
    expect(screen.getByText('Sub Item 1')).toBeInTheDocument()
    document.body.removeChild(container)
  })

  it('calls onClose when a menu item is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()

    render(
      <PortaledSubmenu
        items={ITEMS}
        triggerRect={makeTriggerRect()}
        onClose={onClose}
        depth={1}
        onMouseEnter={vi.fn()}
        onMouseLeave={vi.fn()}
      />
    )

    await user.click(screen.getByText('Sub Item 1'))
    expect(onClose).toHaveBeenCalled()
  })

  it('fires onMouseEnter and onMouseLeave handlers', async () => {
    const user = userEvent.setup()
    const onMouseEnter = vi.fn()
    const onMouseLeave = vi.fn()

    render(
      <PortaledSubmenu
        items={ITEMS}
        triggerRect={makeTriggerRect()}
        onClose={vi.fn()}
        depth={1}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      />
    )

    const menu = screen.getByTestId('portaled-submenu')
    await user.hover(menu)
    expect(onMouseEnter).toHaveBeenCalled()

    await user.unhover(menu)
    expect(onMouseLeave).toHaveBeenCalled()
  })

  it('renders with correct data-dropdown-content attribute', () => {
    render(
      <PortaledSubmenu
        items={ITEMS}
        triggerRect={makeTriggerRect()}
        onClose={vi.fn()}
        depth={1}
        onMouseEnter={vi.fn()}
        onMouseLeave={vi.fn()}
      />
    )

    const menuEl = screen.getByTestId('portaled-submenu')
    expect(menuEl).toHaveAttribute('data-dropdown-content', 'true')
  })

  it('applies fixed position styling', () => {
    render(
      <PortaledSubmenu
        items={ITEMS}
        triggerRect={makeTriggerRect()}
        onClose={vi.fn()}
        depth={1}
        onMouseEnter={vi.fn()}
        onMouseLeave={vi.fn()}
      />
    )

    const menuEl = screen.getByTestId('portaled-submenu')
    expect(menuEl).toHaveStyle({ position: 'fixed' })
  })

  it('increments zIndex by depth', () => {
    render(
      <PortaledSubmenu
        items={ITEMS}
        triggerRect={makeTriggerRect()}
        onClose={vi.fn()}
        depth={3}
        onMouseEnter={vi.fn()}
        onMouseLeave={vi.fn()}
      />
    )

    const menuEl = screen.getByTestId('portaled-submenu')
    // zIndex = 200 + depth * 10 = 200 + 30 = 230
    expect(menuEl).toHaveStyle({ zIndex: 230 })
  })
})
