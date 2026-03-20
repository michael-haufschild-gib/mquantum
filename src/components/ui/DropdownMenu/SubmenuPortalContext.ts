import type React from 'react'
import { createContext } from 'react'

/**
 * Context to provide portal container for submenus.
 * When inside a popover (top layer), submenus should portal to the popover element
 * rather than document.body to maintain correct stacking.
 */
export const SubmenuPortalContext = createContext<React.RefObject<HTMLDivElement | null> | null>(
  null
)
