import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { createAppearanceSlice, AppearanceSlice } from './slices/appearanceSlice';

// Extended type with version tracking for dirty-flag optimization
export interface AppearanceStoreState extends AppearanceSlice {
  /** Version counter for dirty-flag tracking (incremented on any appearance change) */
  appearanceVersion: number;
  /** Manually bump version counter (used after direct setState calls) */
  bumpVersion: () => void;
}

export type { AppearanceSlice };

/**
 * Appearance store with automatic version tracking.
 *
 * The version counter is automatically incremented whenever any appearance
 * property changes, enabling dirty-flag optimization in mesh components.
 */
export const useAppearanceStore = create<AppearanceStoreState>()(
  subscribeWithSelector((set, get, api) => {
    /**
     * Wrapped setter that auto-increments appearanceVersion on any change.
     * This avoids manually adding version increment to 50+ individual setters.
     */
    const wrappedSet: typeof set = (updater) => {
      set((state) => {
        const update = typeof updater === 'function' ? updater(state) : updater;
        // Always bump version on any update (appearance changes are user-initiated)
        return { ...update, appearanceVersion: state.appearanceVersion + 1 };
      });
    };

    // Re-create the slice with the wrapped setter
    const wrappedSlice = createAppearanceSlice(wrappedSet, get, api);

    return {
      ...wrappedSlice,
      appearanceVersion: 0,
      bumpVersion: () => {
        set((state) => ({ appearanceVersion: state.appearanceVersion + 1 }));
      },
    };
  })
);
