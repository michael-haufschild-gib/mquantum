/**
 * EditorTopBar menu item builder tests.
 *
 * These are pure functions: data in, menu items out. No React rendering needed.
 * Tests verify correct menu structure, checked states, click callbacks, and
 * conditional items (mobile vs desktop, empty vs populated saved items).
 */
import { describe, expect, it, vi } from 'vitest'

import {
  buildAccentItems,
  buildExampleSceneItems,
  buildExampleStyleItems,
  buildFileItems,
  buildMobileMenuItems,
  buildModeItems,
  buildPresetItems,
  buildSavedSceneItems,
  buildSavedStyleItems,
  buildSceneSubmenuItems,
  buildStyleSubmenuItems,
  buildViewItems,
} from '@/components/layout/EditorTopBar/menuItems'

describe('buildAccentItems', () => {
  it('returns 7 accent color options', () => {
    const items = buildAccentItems('cyan', vi.fn())
    expect(items).toHaveLength(7)
    expect(items.map((i) => i.label)).toContain('Cyan')
    expect(items.map((i) => i.label)).toContain('Magenta')
  })

  it('marks the current accent as checked', () => {
    const items = buildAccentItems('green', vi.fn())
    const greenItem = items.find((i) => i.label === 'Green')
    const cyanItem = items.find((i) => i.label === 'Cyan')
    expect(greenItem?.checked).toBe(true)
    expect(cyanItem?.checked).toBe(false)
  })

  it('calls setAccent with the selected color', () => {
    const setAccent = vi.fn()
    const items = buildAccentItems('cyan', setAccent)
    items.find((i) => i.label === 'Magenta')?.onClick?.()
    expect(setAccent).toHaveBeenCalledWith('magenta')
  })
})

describe('buildModeItems', () => {
  it('returns light, dark, system options', () => {
    const items = buildModeItems('dark', vi.fn())
    expect(items).toHaveLength(3)
    expect(items.map((i) => i.label)).toEqual(['Light', 'Dark', 'System'])
  })

  it('marks current mode as checked', () => {
    const items = buildModeItems('dark', vi.fn())
    expect(items.find((i) => i.label === 'Dark')?.checked).toBe(true)
    expect(items.find((i) => i.label === 'Light')?.checked).toBe(false)
  })
})

describe('buildPresetItems', () => {
  it('includes theme presets followed by Advanced submenu', () => {
    const items = buildPresetItems(vi.fn(), [], [])
    // Should have preset entries + separator + Advanced
    expect(items.length).toBeGreaterThan(2)
    const advanced = items.find((i) => i.label === 'Advanced')
    expect(advanced?.label).toBe('Advanced')
    expect(advanced?.items?.length).toBeGreaterThan(0)
  })
})

describe('buildSavedSceneItems', () => {
  it('returns empty array for no saved scenes', () => {
    const items = buildSavedSceneItems([], vi.fn(), vi.fn())
    expect(items).toHaveLength(0)
  })

  it('returns menu items for each saved scene', () => {
    const scenes = [
      { id: '1', name: 'Scene A', timestamp: Date.now(), data: {} },
      { id: '2', name: 'Scene B', timestamp: Date.now(), data: {} },
    ]
    const items = buildSavedSceneItems(scenes, vi.fn(), vi.fn())
    expect(items).toHaveLength(2)
    expect(items[0].label).toBe('Scene A')
    expect(items[1].label).toBe('Scene B')
  })

  it('clicking a scene calls loadScene with its id and shows toast', () => {
    const loadScene = vi.fn()
    const addToast = vi.fn()
    const scenes = [{ id: 's1', name: 'My Scene', timestamp: Date.now(), data: {} }]

    const items = buildSavedSceneItems(scenes, loadScene, addToast)
    items[0].onClick?.()

    expect(loadScene).toHaveBeenCalledWith('s1')
    expect(addToast).toHaveBeenCalledWith('Loaded scene: My Scene', 'info')
  })
})

describe('buildSceneSubmenuItems', () => {
  it('shows "(None)" when no saved scenes exist', () => {
    const items = buildSceneSubmenuItems([], [], [], vi.fn(), vi.fn())
    const noneItem = items.find((i) => i.label === '(None)')
    expect(noneItem?.label).toBe('(None)')
    expect(noneItem?.disabled).toBe(true)
  })

  it('includes Save, Manage, Saved, and Examples sections', () => {
    const items = buildSceneSubmenuItems([], [], [{ label: 'Example 1' }], vi.fn(), vi.fn())
    expect(items.some((i) => i.label?.includes('Save'))).toBe(true)
    expect(items.some((i) => i.label?.includes('Manage'))).toBe(true)
    expect(items.find((i) => i.label === 'Examples')?.label).toBe('Examples')
  })

  it('Save Current Scene calls setSaveSceneOpen', () => {
    const setSaveSceneOpen = vi.fn()
    const items = buildSceneSubmenuItems([], [], [], setSaveSceneOpen, vi.fn())
    const saveItem = items.find((i) => i.label?.includes('Save Current'))
    saveItem?.onClick?.()
    expect(setSaveSceneOpen).toHaveBeenCalledWith(true)
  })
})

describe('buildSavedStyleItems', () => {
  it('clicking a style calls loadStyle and shows toast', () => {
    const loadStyle = vi.fn()
    const addToast = vi.fn()
    const styles = [{ id: 'st1', name: 'Neon', timestamp: Date.now(), data: {} }]

    const items = buildSavedStyleItems(styles, loadStyle, addToast)
    items[0].onClick?.()

    expect(loadStyle).toHaveBeenCalledWith('st1')
    expect(addToast).toHaveBeenCalledWith('Applied style: Neon', 'info')
  })
})

describe('buildStyleSubmenuItems', () => {
  it('shows "(None)" when no saved styles exist', () => {
    const items = buildStyleSubmenuItems([], [], [], vi.fn(), vi.fn())
    const noneItem = items.find((i) => i.label === '(None)')
    expect(noneItem?.label).toBe('(None)')
    expect(noneItem?.disabled).toBe(true)
  })
})

describe('buildExampleSceneItems / buildExampleStyleItems', () => {
  it('buildExampleSceneItems returns non-empty array with labels', () => {
    const items = buildExampleSceneItems(vi.fn())
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].label?.length).toBeGreaterThan(0)
  })

  it('buildExampleStyleItems returns non-empty array with labels', () => {
    const items = buildExampleStyleItems(vi.fn())
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].label?.length).toBeGreaterThan(0)
  })
})

describe('buildFileItems', () => {
  it('returns Export Image and Export Video items with shortcuts', () => {
    const items = buildFileItems(vi.fn(), vi.fn())
    expect(items).toHaveLength(2)
    expect(items[0].label).toContain('Export Image')
    expect(items[1].label).toContain('Export Video')
    expect(items[0].shortcut?.length).toBeGreaterThan(0)
    expect(items[1].shortcut?.length).toBeGreaterThan(0)
  })

  it('clicking Export Image calls the handler', () => {
    const handleExport = vi.fn()
    const items = buildFileItems(handleExport, vi.fn())
    items[0].onClick?.()
    expect(handleExport).toHaveBeenCalled()
  })
})

describe('buildViewItems', () => {
  it('includes Explorer, Inspector, Cinematic, and Theme items', () => {
    const ctx = {
      showLeftPanel: true,
      toggleLeftPanel: vi.fn(),
      showRightPanel: true,
      toggleRightPanel: vi.fn(),
      toggleCinematicMode: vi.fn(),
      toggleShortcuts: vi.fn(),
      isMobile: false,
    }
    const items = buildViewItems(ctx, [])
    expect(items.some((i) => i.label?.includes('Explorer'))).toBe(true)
    expect(items.some((i) => i.label?.includes('Inspector'))).toBe(true)
    expect(items.some((i) => i.label === 'Cinematic Mode')).toBe(true)
    expect(items.some((i) => i.label === 'Theme')).toBe(true)
  })

  it('shows "Hide" when panels are visible, "Show" when hidden', () => {
    const ctx = {
      showLeftPanel: false,
      toggleLeftPanel: vi.fn(),
      showRightPanel: true,
      toggleRightPanel: vi.fn(),
      toggleCinematicMode: vi.fn(),
      toggleShortcuts: vi.fn(),
      isMobile: false,
    }
    const items = buildViewItems(ctx, [])
    expect(items.some((i) => i.label === 'Show Explorer')).toBe(true)
    expect(items.some((i) => i.label === 'Hide Inspector')).toBe(true)
  })

  it('includes Keyboard Shortcuts on desktop, omits on mobile', () => {
    const desktopCtx = {
      showLeftPanel: true,
      toggleLeftPanel: vi.fn(),
      showRightPanel: true,
      toggleRightPanel: vi.fn(),
      toggleCinematicMode: vi.fn(),
      toggleShortcuts: vi.fn(),
      isMobile: false,
    }
    const mobileCtx = { ...desktopCtx, isMobile: true }

    const desktopItems = buildViewItems(desktopCtx, [])
    const mobileItems = buildViewItems(mobileCtx, [])

    expect(desktopItems.some((i) => i.label === 'Keyboard Shortcuts')).toBe(true)
    expect(mobileItems.find((i) => i.label === 'Keyboard Shortcuts')).toBeUndefined()
  })
})

describe('buildMobileMenuItems', () => {
  it('builds unified menu with all sections', () => {
    const items = buildMobileMenuItems(
      [{ label: 'Export' }],
      [{ label: 'Toggle' }],
      [{ label: 'Save' }],
      [{ label: 'Style' }],
      true,
      vi.fn()
    )

    expect(items.some((i) => i.label === 'FILE')).toBe(true)
    expect(items.some((i) => i.label === 'VIEW')).toBe(true)
    expect(items.some((i) => i.label === 'SCENES')).toBe(true)
    expect(items.some((i) => i.label === 'STYLES')).toBe(true)
    expect(items.some((i) => i.label === 'TOOLS')).toBe(true)
  })

  it('shows "Mute Sound" when enabled, "Enable Sound" when disabled', () => {
    const enabledItems = buildMobileMenuItems([], [], [], [], true, vi.fn())
    const disabledItems = buildMobileMenuItems([], [], [], [], false, vi.fn())

    expect(enabledItems.some((i) => i.label === 'Mute Sound')).toBe(true)
    expect(disabledItems.some((i) => i.label === 'Enable Sound')).toBe(true)
  })

  it('sound toggle calls the callback', () => {
    const toggleSound = vi.fn()
    const items = buildMobileMenuItems([], [], [], [], true, toggleSound)
    items.find((i) => i.label === 'Mute Sound')?.onClick?.()
    expect(toggleSound).toHaveBeenCalled()
  })
})
