import React from 'react'

import { useIsMobile } from '@/hooks/useMediaQuery'

import type { DropdownMenuItem } from './types'

/**
 * Individual menu item button with proper memoization.
 * Renders a single item in a dropdown menu with support for
 * submenus, shortcuts, checkmarks, and disabled state.
 */
export const MenuItemButton = React.memo(
  ({
    item,
    hasSubmenu,
    isSubmenuOpen,
    onItemClick,
    onMouseEnter,
    itemRef,
  }: {
    item: DropdownMenuItem
    hasSubmenu: boolean
    isSubmenuOpen: boolean
    onItemClick: () => void
    onMouseEnter: () => void
    itemRef: (el: HTMLButtonElement | null) => void
  }) => {
    const isMobile = useIsMobile()

    return (
      <button
        type="button"
        ref={itemRef}
        role="menuitem"
        tabIndex={-1}
        onClick={onItemClick}
        onMouseEnter={onMouseEnter}
        disabled={item.disabled}
        className={`
        w-full text-left px-3 py-1.5 text-sm flex items-center justify-between group
        outline-none focus-visible:bg-[var(--bg-hover)] focus-visible:text-[var(--text-primary)]
        ${item.disabled ? 'text-[var(--text-tertiary)] cursor-not-allowed' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] cursor-pointer'}
        ${isSubmenuOpen ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]' : ''}
      `}
        data-testid={item['data-testid']}
      >
        <span className="flex items-center gap-2">
          {item.checked !== undefined && (
            <span className={`text-[10px] ${item.checked ? 'text-accent' : 'opacity-0'}`}>
              {'\u2022'}
            </span>
          )}
          {item.label}
        </span>
        {hasSubmenu ? (
          <span className="ml-2 opacity-50 text-xs">{'\u203A'}</span>
        ) : !isMobile && item.shortcut ? (
          <span className="text-xs text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)] font-mono ml-4">
            {item.shortcut}
          </span>
        ) : null}
      </button>
    )
  }
)

MenuItemButton.displayName = 'MenuItemButton'
