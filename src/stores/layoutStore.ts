/**
 * Layout state management using Zustand
 *
 * Manages sidebar layout and sizing for responsive behavior:
 * - Sidebar width with min/max constraints
 * - Collapsed state
 * - Layout mode (overlay vs side-by-side)
 *
 * Constraints:
 * - Canvas must never shrink below MIN_CANVAS_WIDTH (300px)
 * - Sidebar width is dynamically clamped based on viewport
 * - User preferences persisted to localStorage
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ============================================================================
// Constants
// ============================================================================

/** Minimum canvas width in pixels - canvas cannot shrink below this */
export const MIN_CANVAS_WIDTH = 300

/** Minimum sidebar width in pixels */
export const MIN_SIDEBAR_WIDTH = 280

/** Default sidebar width in pixels (overlay mode) */
export const DEFAULT_SIDEBAR_WIDTH = 320

/** Default sidebar width in pixels for side-by-side mode (≥1024px) */
export const DEFAULT_SIDEBAR_WIDTH_LARGE = 420

/** Maximum sidebar width in pixels (absolute max, further constrained by viewport) */
export const MAX_SIDEBAR_WIDTH = 480

/** Breakpoint for side-by-side layout (matches Tailwind 'lg') */
export const SIDE_BY_SIDE_BREAKPOINT = 1024

// ============================================================================
// Types
// ============================================================================

/**
 * Responsive editor layout mode.
 */
export type LayoutMode = 'overlay' | 'side-by-side'

/**
 * Layout store state.
 */
export interface LayoutState {
  /** Current sidebar width in pixels */
  sidebarWidth: number
  /** Whether sidebar is collapsed */
  isCollapsed: boolean
  /** Whether left sidebar is visible */
  showLeftPanel: boolean
  /** Whether keyboard shortcuts overlay is visible */
  showShortcuts: boolean
  /** Whether cinematic mode is active (hides all UI) */
  isCinematicMode: boolean
}

/**
 * Layout store actions.
 */
export interface LayoutActions {
  /**
   * Set sidebar width with clamping.
   * Max width is dynamically calculated to ensure canvas stays >= MIN_CANVAS_WIDTH.
   * @param width - Desired width in pixels
   * @param viewportWidth - Current viewport width for max calculation
   */
  setSidebarWidth: (width: number, viewportWidth: number) => void

  /** Toggle sidebar collapsed state */
  toggleCollapsed: () => void

  /** Set collapsed state explicitly */
  setCollapsed: (collapsed: boolean) => void

  /** Toggle left sidebar visibility */
  toggleLeftPanel: () => void

  /** Set left sidebar visibility explicitly */
  setLeftPanel: (show: boolean) => void

  /** Toggle shortcuts overlay */
  toggleShortcuts: () => void

  /** Set shortcuts overlay explicitly */
  setShowShortcuts: (show: boolean) => void

  /** Toggle cinematic mode */
  toggleCinematicMode: () => void

  /** Set cinematic mode explicitly */
  setCinematicMode: (enabled: boolean) => void

  /** Reset to default values */
  reset: () => void
}

/**
 * Combined layout store type.
 */
export type LayoutStore = LayoutState & LayoutActions

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate the maximum allowed sidebar width for a given viewport.
 * Ensures canvas never shrinks below MIN_CANVAS_WIDTH.
 * @param viewportWidth - Current viewport width
 * @returns Maximum sidebar width in pixels
 */
export function getMaxSidebarWidth(viewportWidth: number): number {
  const safeViewportWidth = Number.isFinite(viewportWidth) ? viewportWidth : SIDE_BY_SIDE_BREAKPOINT
  // Account for some padding (the sidebar has right-4 = 16px margin in side-by-side mode)
  const maxForCanvas = safeViewportWidth - MIN_CANVAS_WIDTH - 16
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, maxForCanvas))
}

/**
 * Clamp sidebar width between min and dynamic max.
 * @param width - Desired width
 * @param viewportWidth - Current viewport width
 * @returns Clamped width
 */
export function clampSidebarWidth(width: number, viewportWidth: number): number {
  const safeViewportWidth = Number.isFinite(viewportWidth) ? viewportWidth : SIDE_BY_SIDE_BREAKPOINT
  const max = getMaxSidebarWidth(safeViewportWidth)
  if (!Number.isFinite(width)) {
    return Math.max(
      MIN_SIDEBAR_WIDTH,
      Math.min(max, getDefaultSidebarWidth(safeViewportWidth))
    )
  }
  return Math.max(MIN_SIDEBAR_WIDTH, Math.min(max, width))
}

/**
 * Determine layout mode based on viewport width.
 * @param viewportWidth - Current viewport width
 * @returns Layout mode
 */
export function getLayoutMode(viewportWidth: number): LayoutMode {
  return viewportWidth >= SIDE_BY_SIDE_BREAKPOINT ? 'side-by-side' : 'overlay'
}

/**
 * Get the default sidebar width based on viewport width.
 * Returns 420px for side-by-side mode, 320px for overlay mode.
 * @param viewportWidth - Current viewport width
 * @returns Default sidebar width in pixels
 */
export function getDefaultSidebarWidth(viewportWidth: number): number {
  return viewportWidth >= SIDE_BY_SIDE_BREAKPOINT
    ? DEFAULT_SIDEBAR_WIDTH_LARGE
    : DEFAULT_SIDEBAR_WIDTH
}

// ============================================================================
// Initial State
// ============================================================================

const INITIAL_STATE: LayoutState = {
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH_LARGE, // Default to large screen width (420px)
  isCollapsed: false,
  showLeftPanel: true,
  showShortcuts: false,
  isCinematicMode: false,
}

// ============================================================================
// Store
// ============================================================================

export const useLayoutStore = create<LayoutStore>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      setSidebarWidth: (width: number, viewportWidth: number) => {
        if (!Number.isFinite(width) || !Number.isFinite(viewportWidth)) {
          if (import.meta.env.DEV) {
            console.warn('[layoutStore] Ignoring non-finite sidebar width update:', {
              width,
              viewportWidth,
            })
          }
          return
        }
        const clampedWidth = clampSidebarWidth(width, viewportWidth)
        set({ sidebarWidth: clampedWidth })
      },

      toggleCollapsed: () => {
        set((state) => ({ isCollapsed: !state.isCollapsed }))
      },

      setCollapsed: (collapsed: boolean) => {
        set({ isCollapsed: collapsed })
      },

      toggleLeftPanel: () => {
        set((state) => ({ showLeftPanel: !state.showLeftPanel }))
      },

      setLeftPanel: (show: boolean) => {
        set({ showLeftPanel: show })
      },

      toggleShortcuts: () => {
        set((state) => ({ showShortcuts: !state.showShortcuts }))
      },

      setShowShortcuts: (show: boolean) => {
        set({ showShortcuts: show })
      },

      toggleCinematicMode: () => {
        set((state) => ({ isCinematicMode: !state.isCinematicMode }))
      },

      setCinematicMode: (enabled: boolean) => {
        set({ isCinematicMode: enabled })
      },

      reset: () => {
        set(INITIAL_STATE)
      },
    }),
    {
      name: 'mdimension-layout',
      // Only persist these fields
      partialize: (state) => ({
        sidebarWidth: state.sidebarWidth,
        isCollapsed: state.isCollapsed,
        showLeftPanel: state.showLeftPanel,
        // Cinematic mode should probably not be persisted, or maybe it should?
        // Let's not persist it for now to avoid confusion on reload.
      }),
    }
  )
)
