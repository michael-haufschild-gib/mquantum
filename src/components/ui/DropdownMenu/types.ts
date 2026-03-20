import type React from 'react'

/** Single item in a {@link DropdownMenu}, optionally with nested submenu items. */
export interface DropdownMenuItem {
  label: string
  onClick?: () => void
  disabled?: boolean
  shortcut?: string
  checked?: boolean
  'data-testid'?: string
  items?: DropdownMenuItem[] // Submenu support
}

/** Props for the portal-rendered dropdown menu with submenu support. */
export interface DropdownMenuProps {
  trigger: React.ReactNode
  items: DropdownMenuItem[]
  className?: string
  align?: 'left' | 'right'
  maxHeight?: number
  onClose?: () => void
  /** Optional unique identifier for this dropdown */
  id?: string
}
