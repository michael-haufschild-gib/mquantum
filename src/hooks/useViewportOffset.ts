import { FRAME_PRIORITY } from '@/rendering/core/framePriorities'
import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { useSpring } from 'framer-motion'
import { useLayoutStore } from '@/stores/layoutStore'
import { useShallow } from 'zustand/react/shallow'
import { PerspectiveCamera } from 'three'

/** Threshold for detecting offset changes (in pixels) */
const OFFSET_THRESHOLD = 0.001

const PANEL_WIDTH = 320
const SPRING_CONFIG = { damping: 25, stiffness: 200 }

/**
 * Hook to animate the camera view offset based on UI layout state.
 * This creates a smooth "curtain" effect where the canvas remains full-screen
 * but the viewport shifts to center the content in the available space.
 */
export function useViewportOffset() {
  const { camera, size } = useThree()

  // Get layout state
  const { showLeftPanel, isCollapsed, isCinematicMode } = useLayoutStore(
    useShallow((state) => ({
      showLeftPanel: state.showLeftPanel,
      isCollapsed: state.isCollapsed,
      isCinematicMode: state.isCinematicMode,
    }))
  )

  // Calculate target offset
  // If left panel is open, we shift right (+). If right panel is open, we shift left (-).
  // Formula: (LeftWidth - RightWidth) / 2
  const targetOffsetX = isCinematicMode
    ? 0
    : ((showLeftPanel ? PANEL_WIDTH : 0) - (!isCollapsed ? PANEL_WIDTH : 0)) / 2

  // Spring animation for the offset
  const springOffset = useSpring(0, SPRING_CONFIG)

  // Track last offset to skip unnecessary setViewOffset calls
  const lastOffsetRef = useRef(0)

  useEffect(() => {
    springOffset.set(targetOffsetX)
  }, [targetOffsetX, springOffset])

  // Apply offset on every frame (only when changed)
  useFrame(() => {
    if (!(camera instanceof PerspectiveCamera)) return

    const currentOffset = springOffset.get()

    // Skip if offset hasn't changed significantly
    if (Math.abs(currentOffset - lastOffsetRef.current) < OFFSET_THRESHOLD) {
      return
    }
    lastOffsetRef.current = currentOffset

    // Skip entirely if offset is 0 (default state)
    if (Math.abs(currentOffset) < OFFSET_THRESHOLD) {
      camera.clearViewOffset()
      return
    }

    // Apply view offset - shifts the projection window
    // offset > 0 (Left panel open) -> Shift subject RIGHT.
    // setViewOffset x = -offset
    if (camera.setViewOffset) {
      camera.setViewOffset(size.width, size.height, -currentOffset, 0, size.width, size.height)
    }
  }, FRAME_PRIORITY.ANIMATION)

  // Cleanup: Reset view offset when unmounting or changing modes significantly
  useEffect(() => {
    return () => {
      if (camera instanceof PerspectiveCamera) {
        camera.clearViewOffset()
      }
    }
  }, [camera])
}
