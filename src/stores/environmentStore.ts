import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createGroundSlice, GroundSlice } from './slices/groundSlice';
import { createSkyboxSlice, SkyboxSlice } from './slices/skyboxSlice';

// Extended type with version tracking for dirty-flag optimization
export interface EnvironmentStore extends GroundSlice, SkyboxSlice {
  /** Version counter for IBL setting changes (iblQuality, iblIntensity) */
  iblVersion: number;
  /** Version counter for ground plane setting changes */
  groundVersion: number;
  /** Version counter for skybox/procedural setting changes */
  skyboxVersion: number;
  /** Manually bump all version counters (used after direct setState calls) */
  bumpAllVersions: () => void;
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
     */
    const wrappedSet: typeof set = (updater) => {
      set((state) => {
        const update = typeof updater === 'function' ? updater(state) : updater;

        // Check which categories are being updated and bump appropriate versions
        let iblBump = 0;
        let groundBump = 0;
        let skyboxBump = 0;

        const keys = Object.keys(update);
        for (const key of keys) {
          if (key === 'iblQuality' || key === 'iblIntensity') {
            iblBump = 1;
          } else if (
            key.startsWith('groundPlane') ||
            key.startsWith('groundGrid') ||
            key === 'activeWalls' ||
            key === 'showGroundGrid'
          ) {
            groundBump = 1;
          } else if (
            key.startsWith('skybox') ||
            key === 'proceduralSettings' ||
            key === 'backgroundColor' ||
            key === 'backgroundBlendMode'
          ) {
            skyboxBump = 1;
          }
        }

        return {
          ...update,
          iblVersion: state.iblVersion + iblBump,
          groundVersion: state.groundVersion + groundBump,
          skyboxVersion: state.skyboxVersion + skyboxBump,
        };
      });
    };

    // Create slices with the wrapped setter
    const groundSlice = createGroundSlice(wrappedSet, get, api);
    const skyboxSlice = createSkyboxSlice(wrappedSet, get, api);

    return {
      ...groundSlice,
      ...skyboxSlice,
      iblVersion: 0,
      groundVersion: 0,
      skyboxVersion: 0,
      bumpAllVersions: () => {
        set((state) => ({
          iblVersion: state.iblVersion + 1,
          groundVersion: state.groundVersion + 1,
          skyboxVersion: state.skyboxVersion + 1,
        }));
      },
    };
  })
);
