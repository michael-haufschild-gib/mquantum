import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useLayoutStore } from '@/stores/layoutStore'

/** State required to decide whether mobile timeline controls are visible. */
export interface MobileBottomPanelVisibilityState {
  /** Whether current viewport uses the desktop layout. */
  isDesktop: boolean
  /** Whether the right inspector panel is collapsed. */
  isCollapsed: boolean
  /** Whether the left explorer panel is open. */
  showLeftPanel: boolean
  /** Whether cinematic mode is hiding chrome. */
  isCinematicMode: boolean
}

/** Return whether the mobile bottom timeline panel should be visible. */
export function shouldShowMobileBottomPanel(state: MobileBottomPanelVisibilityState): boolean {
  return !state.isCinematicMode && !state.isDesktop && state.isCollapsed && !state.showLeftPanel
}

/**
 * Computes whether the mobile bottom panel (timeline controls)
 * should be visible based on viewport size and panel state.
 *
 * @returns `true` when: mobile viewport, both side panels closed, not cinematic mode.
 */
export function useMobileBottomPanel(): boolean {
  const isCollapsed = useLayoutStore((s) => s.isCollapsed)
  const showLeftPanel = useLayoutStore((s) => s.showLeftPanel)
  const isCinematicMode = useLayoutStore((s) => s.isCinematicMode)
  const isDesktop = useIsDesktop()

  return shouldShowMobileBottomPanel({
    isDesktop,
    isCollapsed,
    showLeftPanel,
    isCinematicMode,
  })
}
