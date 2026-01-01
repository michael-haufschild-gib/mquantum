/**
 * Animation state management using Zustand
 * Manages auto-rotation animation for n-dimensional objects
 */

import { getRotationPlanes } from '@/lib/math/rotation'
import { create } from 'zustand'

/** Minimum animation speed multiplier */
export const MIN_SPEED = 0.1

/** Maximum animation speed multiplier */
export const MAX_SPEED = 3.0

/** Default animation speed (1x = one full rotation per 10 seconds) */
export const DEFAULT_SPEED = 0.4

/** Base rotation rate in radians per second at 1x speed */
export const BASE_ROTATION_RATE = (2 * Math.PI) / 10 // Full rotation in 10 seconds

export interface AnimationState {
  /** Whether animation is currently playing */
  isPlaying: boolean

  /** Speed multiplier (0.1 to 5.0) */
  speed: number

  /** Rotation direction: 1 = clockwise, -1 = counter-clockwise */
  direction: 1 | -1

  /** Set of planes currently being animated */
  animatingPlanes: Set<string>

  /** Global accumulated animation time in seconds (synced across objects) */
  accumulatedTime: number

  // Actions
  play: () => void
  pause: () => void
  toggle: () => void
  setSpeed: (speed: number) => void
  toggleDirection: () => void
  togglePlane: (plane: string) => void
  setPlaneAnimating: (plane: string, animating: boolean) => void
  animateAll: (dimension: number) => void
  randomizePlanes: (dimension: number) => void
  resetToFirstPlane: (dimension: number) => void
  clearAllPlanes: () => void
  stopAll: () => void
  setDimension: (dimension: number) => void
  updateAccumulatedTime: (delta: number) => void
  reset: () => void

  /** Calculate the rotation delta for a given time delta */
  getRotationDelta: (deltaTimeMs: number) => number
}

/**
 * Clamps speed to valid range
 * @param speed - Speed value to clamp
 * @returns Clamped speed value between MIN_SPEED and MAX_SPEED
 */
function clampSpeed(speed: number): number {
  return Math.max(MIN_SPEED, Math.min(MAX_SPEED, speed))
}

/**
 * Gets all rotation plane names for a given dimension
 * @param dimension - The dimension to get planes for
 * @returns Array of rotation plane names
 */
function getAllPlaneNames(dimension: number): string[] {
  return getRotationPlanes(dimension).map((p) => p.name)
}

export const useAnimationStore = create<AnimationState>((set, get) => ({
  isPlaying: true,
  speed: DEFAULT_SPEED,
  direction: 1,
  // Initialize with 3D-valid planes (default dimension is 3D)
  // ZW is 4D+ only, so use XZ for 3D compatibility
  animatingPlanes: new Set(['XY', 'YZ', 'XZ']),
  accumulatedTime: 0,

  play: () => {
    set({ isPlaying: true })
  },

  pause: () => {
    set({ isPlaying: false })
  },

  toggle: () => {
    set((state) => ({ isPlaying: !state.isPlaying }))
  },

  setSpeed: (speed: number) => {
    set({ speed: clampSpeed(speed) })
  },

  toggleDirection: () => {
    set((state) => ({ direction: state.direction === 1 ? -1 : 1 }))
  },

  togglePlane: (plane: string) => {
    set((state) => {
      const newPlanes = new Set(state.animatingPlanes)
      if (newPlanes.has(plane)) {
        newPlanes.delete(plane)
      } else {
        newPlanes.add(plane)
      }
      return { animatingPlanes: newPlanes }
    })
  },

  setPlaneAnimating: (plane: string, animating: boolean) => {
    set((state) => {
      const newPlanes = new Set(state.animatingPlanes)
      if (animating) {
        newPlanes.add(plane)
      } else {
        newPlanes.delete(plane)
      }
      return { animatingPlanes: newPlanes }
    })
  },

  animateAll: (dimension: number) => {
    const planes = getAllPlaneNames(dimension)
    set({ animatingPlanes: new Set(planes), isPlaying: true })
  },

  randomizePlanes: (dimension: number) => {
    const planeNames = getAllPlaneNames(dimension)

    // Each plane has 50% chance of being selected
    const selected = planeNames.filter(() => Math.random() < 0.5)

    // Ensure at least one plane is selected
    if (selected.length === 0 && planeNames.length > 0) {
      const randomIndex = Math.floor(Math.random() * planeNames.length)
      const randomPlane = planeNames[randomIndex]
      if (randomPlane) {
        selected.push(randomPlane)
      }
    }

    set({ animatingPlanes: new Set(selected), isPlaying: true })
  },

  resetToFirstPlane: (dimension: number) => {
    const planes = getAllPlaneNames(dimension)
    if (planes.length > 0 && planes[0]) {
      set({ animatingPlanes: new Set([planes[0]]), isPlaying: true })
    }
  },

  clearAllPlanes: () => {
    // Clear all planes and stop animation to prevent invalid state
    // where isPlaying=true but animatingPlanes is empty
    set({ animatingPlanes: new Set(), isPlaying: false })
  },

  stopAll: () => {
    set({ animatingPlanes: new Set(), isPlaying: false })
  },

  setDimension: (dimension: number) => {
    set((state) => {
      // Filter animating planes to only include valid planes for new dimension
      const validPlanes = new Set(getAllPlaneNames(dimension))
      const newAnimatingPlanes = new Set<string>()

      for (const plane of state.animatingPlanes) {
        if (validPlanes.has(plane)) {
          newAnimatingPlanes.add(plane)
        }
      }

      // If no valid planes remain and animation was playing, stop it
      // This prevents isPlaying=true with empty animatingPlanes set
      const shouldStopPlaying = newAnimatingPlanes.size === 0 && state.isPlaying

      return {
        animatingPlanes: newAnimatingPlanes,
        isPlaying: shouldStopPlaying ? false : state.isPlaying,
      }
    })
  },

  updateAccumulatedTime: (delta: number) => {
    const { isPlaying, speed, direction } = get()
    if (isPlaying) {
      set((state) => ({ 
        accumulatedTime: state.accumulatedTime + delta * speed * direction 
      }))
    }
  },

  reset: () => {
    set({
      isPlaying: true,
      speed: DEFAULT_SPEED,
      direction: 1,
      // Reset to 3D-valid planes (default dimension is 3D)
      animatingPlanes: new Set(['XY', 'YZ', 'XZ']),
      accumulatedTime: 0,
    })
  },

  getRotationDelta: (deltaTimeMs: number) => {
    const state = get()
    const deltaTimeSec = deltaTimeMs / 1000
    return BASE_ROTATION_RATE * state.speed * state.direction * deltaTimeSec
  },
}))
