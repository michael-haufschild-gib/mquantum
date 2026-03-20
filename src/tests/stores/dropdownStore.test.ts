import { beforeEach, describe, expect, it } from 'vitest'

import { useDropdownStore } from '@/stores/dropdownStore'

describe('dropdownStore', () => {
  beforeEach(() => {
    useDropdownStore.setState({ openDropdownId: null })
  })

  it('starts with no dropdown open', () => {
    expect(useDropdownStore.getState().openDropdownId).toBeNull()
  })

  it('openDropdown sets the active dropdown', () => {
    useDropdownStore.getState().openDropdown('menu-1')
    expect(useDropdownStore.getState().openDropdownId).toBe('menu-1')
  })

  it('opening a second dropdown closes the first (only one open at a time)', () => {
    const { openDropdown } = useDropdownStore.getState()
    openDropdown('menu-1')
    openDropdown('menu-2')
    expect(useDropdownStore.getState().openDropdownId).toBe('menu-2')
  })

  it('closeDropdown only closes the specified dropdown', () => {
    const { openDropdown, closeDropdown } = useDropdownStore.getState()
    openDropdown('menu-1')
    closeDropdown('menu-2') // different ID — should not close menu-1
    expect(useDropdownStore.getState().openDropdownId).toBe('menu-1')
  })

  it('closeDropdown closes the dropdown when ID matches', () => {
    const { openDropdown, closeDropdown } = useDropdownStore.getState()
    openDropdown('menu-1')
    closeDropdown('menu-1')
    expect(useDropdownStore.getState().openDropdownId).toBeNull()
  })

  it('closeAllDropdowns closes any open dropdown', () => {
    const { openDropdown, closeAllDropdowns } = useDropdownStore.getState()
    openDropdown('menu-1')
    closeAllDropdowns()
    expect(useDropdownStore.getState().openDropdownId).toBeNull()
  })

  it('toggleDropdown opens a closed dropdown', () => {
    useDropdownStore.getState().toggleDropdown('menu-1')
    expect(useDropdownStore.getState().openDropdownId).toBe('menu-1')
  })

  it('toggleDropdown closes an open dropdown', () => {
    const { openDropdown, toggleDropdown } = useDropdownStore.getState()
    openDropdown('menu-1')
    toggleDropdown('menu-1')
    expect(useDropdownStore.getState().openDropdownId).toBeNull()
  })

  it('toggleDropdown switches from one dropdown to another', () => {
    const { openDropdown, toggleDropdown } = useDropdownStore.getState()
    openDropdown('menu-1')
    toggleDropdown('menu-2')
    expect(useDropdownStore.getState().openDropdownId).toBe('menu-2')
  })
})
