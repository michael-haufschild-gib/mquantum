import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useLayoutStore } from '@/stores/layoutStore'

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

  return !isCinematicMode && !isDesktop && isCollapsed && !showLeftPanel
}
