import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { createSkyboxSlice, SkyboxSlice } from './slices/skyboxSlice'

// Extended type with version tracking for dirty-flag optimization
export interface EnvironmentStore extends SkyboxSlice {
  /** Version counter for skybox/procedural setting changes */
  skyboxVersion: number
  /** Manually bump version counters (used after direct setState calls) */
  bumpAllVersions: () => void
}

/**
 * Environment store with automatic version tracking.
 *
 * Version counters are automatically incremented when settings change,
 * enabling dirty-flag optimization in mesh components.
 */
export const useEnvironmentStore = create<EnvironmentStore>()(
  subscribeWithSelector((set, get, api) => {
    /**
     * Wrapped setter that auto-increments version counters based on changed keys.
     * @param updater
     */
    const wrappedSet: typeof set = (updater) => {
      set((state) => {
        const update = typeof updater === 'function' ? updater(state) : updater

        // Check which keys are being updated and bump version as needed
        let skyboxBump = 0

        const keys = Object.keys(update)
        for (const key of keys) {
          if (
            key.startsWith('skybox') ||
            key === 'proceduralSettings' ||
            key === 'backgroundColor' ||
            key === 'backgroundBlendMode'
          ) {
            skyboxBump = 1
          }
        }

        return {
          ...update,
          skyboxVersion: state.skyboxVersion + skyboxBump,
        }
      })
    }

    // Create slice with the wrapped setter
    const skyboxSlice = createSkyboxSlice(wrappedSet, get, api)

    return {
      ...skyboxSlice,
      skyboxVersion: 0,
      bumpAllVersions: () => {
        set((state) => ({
          skyboxVersion: state.skyboxVersion + 1,
        }))
      },
    }
  })
)
