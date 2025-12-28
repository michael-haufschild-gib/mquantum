import { describe, it, expect, beforeEach } from 'vitest';
import { useDropdownStore } from '@/stores/dropdownStore';

describe('dropdownStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useDropdownStore.setState({ openDropdownId: null });
  });

  describe('initial state', () => {
    it('should have null openDropdownId by default', () => {
      expect(useDropdownStore.getState().openDropdownId).toBeNull();
    });
  });

  describe('openDropdown', () => {
    it('should set openDropdownId to the given id', () => {
      useDropdownStore.getState().openDropdown('menu-1');
      expect(useDropdownStore.getState().openDropdownId).toBe('menu-1');
    });

    it('should replace previously open dropdown when opening new one', () => {
      useDropdownStore.getState().openDropdown('menu-1');
      expect(useDropdownStore.getState().openDropdownId).toBe('menu-1');

      useDropdownStore.getState().openDropdown('menu-2');
      expect(useDropdownStore.getState().openDropdownId).toBe('menu-2');
    });
  });

  describe('closeDropdown', () => {
    it('should close dropdown if id matches current open dropdown', () => {
      useDropdownStore.getState().openDropdown('menu-1');
      expect(useDropdownStore.getState().openDropdownId).toBe('menu-1');

      useDropdownStore.getState().closeDropdown('menu-1');
      expect(useDropdownStore.getState().openDropdownId).toBeNull();
    });

    it('should not close dropdown if id does not match current open dropdown', () => {
      useDropdownStore.getState().openDropdown('menu-1');
      expect(useDropdownStore.getState().openDropdownId).toBe('menu-1');

      useDropdownStore.getState().closeDropdown('menu-2');
      expect(useDropdownStore.getState().openDropdownId).toBe('menu-1');
    });

    it('should do nothing if no dropdown is open', () => {
      useDropdownStore.getState().closeDropdown('menu-1');
      expect(useDropdownStore.getState().openDropdownId).toBeNull();
    });
  });

  describe('closeAllDropdowns', () => {
    it('should close the open dropdown', () => {
      useDropdownStore.getState().openDropdown('menu-1');
      expect(useDropdownStore.getState().openDropdownId).toBe('menu-1');

      useDropdownStore.getState().closeAllDropdowns();
      expect(useDropdownStore.getState().openDropdownId).toBeNull();
    });

    it('should do nothing if no dropdown is open', () => {
      useDropdownStore.getState().closeAllDropdowns();
      expect(useDropdownStore.getState().openDropdownId).toBeNull();
    });
  });

  describe('toggleDropdown', () => {
    it('should open dropdown if it is closed', () => {
      expect(useDropdownStore.getState().openDropdownId).toBeNull();

      useDropdownStore.getState().toggleDropdown('menu-1');
      expect(useDropdownStore.getState().openDropdownId).toBe('menu-1');
    });

    it('should close dropdown if it is already open', () => {
      useDropdownStore.getState().openDropdown('menu-1');
      expect(useDropdownStore.getState().openDropdownId).toBe('menu-1');

      useDropdownStore.getState().toggleDropdown('menu-1');
      expect(useDropdownStore.getState().openDropdownId).toBeNull();
    });

    it('should close current dropdown and open new one when toggling different dropdown', () => {
      useDropdownStore.getState().openDropdown('menu-1');
      expect(useDropdownStore.getState().openDropdownId).toBe('menu-1');

      useDropdownStore.getState().toggleDropdown('menu-2');
      expect(useDropdownStore.getState().openDropdownId).toBe('menu-2');
    });
  });

  describe('mutual exclusion', () => {
    it('should enforce only one dropdown open at a time', () => {
      const store = useDropdownStore.getState();

      store.openDropdown('file-menu');
      expect(useDropdownStore.getState().openDropdownId).toBe('file-menu');

      store.openDropdown('view-menu');
      expect(useDropdownStore.getState().openDropdownId).toBe('view-menu');

      store.openDropdown('scenes-menu');
      expect(useDropdownStore.getState().openDropdownId).toBe('scenes-menu');

      // Only one should be open
      const state = useDropdownStore.getState();
      expect(state.openDropdownId).toBe('scenes-menu');
    });
  });
});
