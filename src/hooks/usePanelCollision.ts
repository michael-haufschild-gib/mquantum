import { useEffect } from 'react'
import { useSpring, MotionValue } from 'motion/react'
import { useLayoutStore } from '@/stores/layoutStore'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { useShallow } from 'zustand/react/shallow'

const SIDEBAR_WIDTH = 320
const TOP_BAR_HEIGHT = 48
const BOTTOM_BAR_HEIGHT = 48
const GAP = 16 // Minimum gap between UI and monitor
const SPRING_CONFIG = { damping: 25, stiffness: 200 }

/**
 * Hook to manage collision between a floating element (PerformanceMonitor) and the application UI panels
 * (Sidebars, Top Bar, Bottom Bar).
 *
 * It simulates the panel animations using springs and "pushes" the floating element's
 * X and Y motion values if a collision is detected.
 *
 * @param x The MotionValue<number> controlling the element's X position.
 * @param y The MotionValue<number> controlling the element's Y position.
 * @param width The current width of the floating element.
 * @param height The current height of the floating element.
 * @param isDragging Whether the user is currently dragging the element.
 */
export function usePanelCollision(
  x: MotionValue<number>,
  y: MotionValue<number>,
  width: number,
  height: number,
  isDragging: boolean
) {
  const isDesktop = useIsDesktop()

  // 1. Get Layout States
  const { showLeftPanel, isRightPanelOpen, showTopBar, showBottomPanel } = useLayoutStore(
    useShallow((state) => ({
      showLeftPanel: state.showLeftPanel && !state.isCinematicMode,
      // Right panel is open if NOT collapsed AND NOT cinematic
      isRightPanelOpen: !state.isCollapsed && !state.isCinematicMode,
      // Top/Bottom bars are visible if NOT cinematic
      showTopBar: !state.isCinematicMode,
      showBottomPanel: !state.isCinematicMode && isDesktop, // Bottom panel only on desktop
    }))
  )

  // 2. Simulate Animations (0 -> 1)
  const leftSpring = useSpring(showLeftPanel ? 1 : 0, SPRING_CONFIG)
  const rightSpring = useSpring(isRightPanelOpen ? 1 : 0, SPRING_CONFIG)
  const topSpring = useSpring(showTopBar ? 1 : 0, SPRING_CONFIG)
  const bottomSpring = useSpring(showBottomPanel ? 1 : 0, SPRING_CONFIG)

  useEffect(() => {
    leftSpring.set(showLeftPanel ? 1 : 0)
  }, [showLeftPanel, leftSpring])
  useEffect(() => {
    rightSpring.set(isRightPanelOpen ? 1 : 0)
  }, [isRightPanelOpen, rightSpring])
  useEffect(() => {
    topSpring.set(showTopBar ? 1 : 0)
  }, [showTopBar, topSpring])
  useEffect(() => {
    bottomSpring.set(showBottomPanel ? 1 : 0)
  }, [showBottomPanel, bottomSpring])

  // 3. Collision Logic Loop
  useEffect(() => {
    const checkCollision = () => {
      if (isDragging) return

      const currentX = x.get()
      const currentY = y.get()

      const windowWidth = window.innerWidth
      const windowHeight = window.innerHeight

      // --- New Coordinate System: Top-Left Anchor ---
      // CSS: top-20 (80px), left-4 (16px)
      // Origin (0,0) corresponds to { top: 80, left: 16 }
      const ANCHOR_TOP = 80
      const ANCHOR_LEFT = 16

      // --- X Axis Constraints ---
      // Left Constraint: Must be to the right of the Left Panel (if visible)
      // Visual Left = ANCHOR_LEFT + x
      // Limit = (SIDEBAR_WIDTH * spring) + GAP
      // ANCHOR_LEFT + x >= Limit  ->  x >= Limit - ANCHOR_LEFT
      const leftPanelWidth = leftSpring.get() * SIDEBAR_WIDTH
      const minX = leftPanelWidth + GAP - ANCHOR_LEFT

      // Right Constraint: Must be to the left of the Right Panel (if visible)
      // Visual Right = ANCHOR_LEFT + x + width
      // Limit = WindowWidth - (SIDEBAR_WIDTH * spring) - GAP
      // ANCHOR_LEFT + x + width <= Limit  ->  x <= Limit - ANCHOR_LEFT - width
      const rightPanelWidth = rightSpring.get() * SIDEBAR_WIDTH
      const rightLimit = windowWidth - rightPanelWidth - GAP
      const maxX = rightLimit - ANCHOR_LEFT - width

      // --- Y Axis Constraints ---
      // Top Constraint: Must be below the Top Bar (if visible)
      // Visual Top = ANCHOR_TOP + y
      // Limit = (TOP_BAR_HEIGHT * spring) + GAP
      // ANCHOR_TOP + y >= Limit  ->  y >= Limit - ANCHOR_TOP
      const topBarHeight = topSpring.get() * TOP_BAR_HEIGHT
      const minY = topBarHeight + GAP - ANCHOR_TOP

      // Bottom Constraint: Must be above the Bottom Bar (if visible)
      // Visual Bottom = ANCHOR_TOP + y + height
      // Limit = WindowHeight - (BOTTOM_BAR_HEIGHT * spring) - GAP
      // ANCHOR_TOP + y + height <= Limit  ->  y <= Limit - ANCHOR_TOP - height
      const bottomBarHeight = bottomSpring.get() * BOTTOM_BAR_HEIGHT
      const bottomLimit = windowHeight - bottomBarHeight - GAP
      const maxY = bottomLimit - ANCHOR_TOP - height

      // Apply Constraints
      let newX = currentX
      let newY = currentY

      // X Clamping
      // If screen is too narrow (minX > maxX), prioritize Left visibility (stay at minX)
      if (minX > maxX) {
        newX = minX
      } else {
        if (currentX < minX) newX = minX
        else if (currentX > maxX) newX = maxX
      }

      // Y Clamping
      // If screen is too short (minY > maxY), prioritize Top visibility (stay at minY)
      // This ensures the header is always accessible to drag/collapse
      if (minY > maxY) {
        newY = minY
      } else {
        if (currentY < minY) newY = minY
        else if (currentY > maxY) newY = maxY
      }

      // Update if changed (with small threshold to avoid float jitter)
      if (Math.abs(newX - currentX) > 0.5) x.set(newX)
      if (Math.abs(newY - currentY) > 0.5) y.set(newY)
    }

    // Subscribe to all springs
    const unsubs = [
      leftSpring.on('change', checkCollision),
      rightSpring.on('change', checkCollision),
      topSpring.on('change', checkCollision),
      bottomSpring.on('change', checkCollision),
    ]

    const handleResize = () => checkCollision()
    window.addEventListener('resize', handleResize)

    // Initial check
    checkCollision()

    return () => {
      unsubs.forEach((u) => u())
      window.removeEventListener('resize', handleResize)
    }
  }, [leftSpring, rightSpring, topSpring, bottomSpring, x, y, width, height, isDragging])
}
