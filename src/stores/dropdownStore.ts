import { create } from 'zustand';

// ============================================================================
// Types
// ============================================================================

interface DropdownState {
  /** ID of the currently open dropdown, or null if none open */
  openDropdownId: string | null;
}

interface DropdownActions {
  /** Open a dropdown by ID (closes any other open dropdown) */
  openDropdown: (id: string) => void;
  /** Close a specific dropdown by ID */
  closeDropdown: (id: string) => void;
  /** Close all dropdowns */
  closeAllDropdowns: () => void;
  /** Toggle a dropdown - opens if closed, closes if open */
  toggleDropdown: (id: string) => void;
}

export type DropdownStore = DropdownState & DropdownActions;

// ============================================================================
// Store
// ============================================================================

/**
 * Global store for coordinating dropdown menu state.
 * Ensures only one dropdown can be open at a time across the entire app.
 *
 * @returns Store with openDropdownId state and action methods
 *
 * @example
 * ```tsx
 * const { isOpen, toggleDropdown } = useDropdownStore(
 *   useShallow((state) => ({
 *     isOpen: state.openDropdownId === 'my-menu',
 *     toggleDropdown: state.toggleDropdown,
 *   }))
 * );
 * ```
 */
export const useDropdownStore = create<DropdownStore>((set, get) => ({
  openDropdownId: null,

  openDropdown: (id: string) => {
    set({ openDropdownId: id });
  },

  closeDropdown: (id: string) => {
    const { openDropdownId } = get();
    if (openDropdownId === id) {
      set({ openDropdownId: null });
    }
  },

  closeAllDropdowns: () => {
    set({ openDropdownId: null });
  },

  toggleDropdown: (id: string) => {
    const { openDropdownId } = get();
    if (openDropdownId === id) {
      set({ openDropdownId: null });
    } else {
      set({ openDropdownId: id });
    }
  },
}));
