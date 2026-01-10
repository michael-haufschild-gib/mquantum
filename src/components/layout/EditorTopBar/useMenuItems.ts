/**
 * Custom hooks for building menu items in EditorTopBar
 *
 * These hooks memoize menu item construction to prevent unnecessary re-renders.
 */

import type { ToastType } from '@/contexts/ToastContextInstance'
import type { SavedScene, SavedStyle } from '@/stores/presetManagerStore'
import type { ThemeAccent, ThemeMode } from '@/stores/themeStore'
import { useMemo } from 'react'
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
} from './menuItems'
import type { MenuItem } from './types'

/**
 * Hook for theme-related menu items (accent, mode, presets)
 */
export function useThemeMenuItems(
  accent: ThemeAccent,
  setAccent: (accent: ThemeAccent) => void,
  mode: ThemeMode,
  setMode: (mode: ThemeMode) => void,
  setPreset: (presetId: string) => void
) {
  const accentItems = useMemo(() => buildAccentItems(accent, setAccent), [accent, setAccent])

  const modeItems = useMemo(() => buildModeItems(mode, setMode), [mode, setMode])

  const presetItems = useMemo(
    () => buildPresetItems(setPreset, modeItems, accentItems),
    [setPreset, modeItems, accentItems]
  )

  return { accentItems, modeItems, presetItems }
}

/**
 * Hook for scene menu items
 */
export function useSceneMenuItems(
  savedScenes: SavedScene[],
  loadScene: (id: string) => void,
  addToast: (message: string, type?: ToastType) => void,
  setSaveSceneOpen: (open: boolean) => void,
  setIsSceneManagerOpen: (open: boolean) => void
) {
  const savedSceneItems = useMemo(
    () => buildSavedSceneItems(savedScenes, loadScene, addToast),
    [savedScenes, loadScene, addToast]
  )

  const exampleSceneItems = useMemo(() => buildExampleSceneItems(addToast), [addToast])

  const sceneSubmenuItems = useMemo(
    () =>
      buildSceneSubmenuItems(
        savedScenes,
        savedSceneItems,
        exampleSceneItems,
        setSaveSceneOpen,
        setIsSceneManagerOpen
      ),
    [savedScenes, savedSceneItems, exampleSceneItems, setSaveSceneOpen, setIsSceneManagerOpen]
  )

  return { savedSceneItems, exampleSceneItems, sceneSubmenuItems }
}

/**
 * Hook for style menu items
 */
export function useStyleMenuItems(
  savedStyles: SavedStyle[],
  loadStyle: (id: string) => void,
  addToast: (message: string, type?: ToastType) => void,
  setSaveStyleOpen: (open: boolean) => void,
  setIsStyleManagerOpen: (open: boolean) => void
) {
  const savedStyleItems = useMemo(
    () => buildSavedStyleItems(savedStyles, loadStyle, addToast),
    [savedStyles, loadStyle, addToast]
  )

  const exampleStyleItems = useMemo(() => buildExampleStyleItems(addToast), [addToast])

  const styleSubmenuItems = useMemo(
    () =>
      buildStyleSubmenuItems(
        savedStyles,
        savedStyleItems,
        exampleStyleItems,
        setSaveStyleOpen,
        setIsStyleManagerOpen
      ),
    [savedStyles, savedStyleItems, exampleStyleItems, setSaveStyleOpen, setIsStyleManagerOpen]
  )

  return { savedStyleItems, exampleStyleItems, styleSubmenuItems }
}

/**
 * Hook for file menu items
 */
export function useFileMenuItems(handleExport: () => void, handleExportVideo: () => void) {
  return useMemo(
    () => buildFileItems(handleExport, handleExportVideo),
    [handleExport, handleExportVideo]
  )
}

/**
 * Hook for view menu items
 */
export function useViewMenuItems(
  showLeftPanel: boolean,
  toggleLeftPanel: () => void,
  showRightPanel: boolean,
  toggleRightPanel: () => void,
  toggleCinematicMode: () => void,
  toggleShortcuts: () => void,
  isMobile: boolean,
  presetItems: MenuItem[]
) {
  return useMemo(
    () =>
      buildViewItems(
        {
          showLeftPanel,
          toggleLeftPanel,
          showRightPanel,
          toggleRightPanel,
          toggleCinematicMode,
          toggleShortcuts,
          isMobile,
        },
        presetItems
      ),
    [
      showLeftPanel,
      toggleLeftPanel,
      showRightPanel,
      toggleRightPanel,
      toggleCinematicMode,
      toggleShortcuts,
      isMobile,
      presetItems,
    ]
  )
}

/**
 * Hook for mobile menu items
 */
export function useMobileMenuItems(
  fileItems: MenuItem[],
  viewItems: MenuItem[],
  sceneSubmenuItems: MenuItem[],
  styleSubmenuItems: MenuItem[],
  isSoundEnabled: boolean,
  toggleSound: () => void
) {
  return useMemo(
    () =>
      buildMobileMenuItems(
        fileItems,
        viewItems,
        sceneSubmenuItems,
        styleSubmenuItems,
        isSoundEnabled,
        toggleSound
      ),
    [fileItems, viewItems, sceneSubmenuItems, styleSubmenuItems, isSoundEnabled, toggleSound]
  )
}
