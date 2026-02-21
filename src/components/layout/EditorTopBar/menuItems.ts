/**
 * Menu item definitions for EditorTopBar
 *
 * Extracted from EditorTopBar.tsx to reduce file size and improve maintainability.
 * Contains all menu item builders for File, View, Scenes, Styles, and Mobile menus.
 */

import type { ToastType } from '@/contexts/ToastContextInstance'
import { soundManager } from '@/lib/audio/SoundManager'
import { getModifierSymbols } from '@/lib/platform'
import { applySceneExample, getSceneExamples } from '@/lib/sceneExamples'
import { applyStyleExample, getStyleExamples } from '@/lib/styleExamples'
import type { SavedScene, SavedStyle } from '@/stores/presetManagerStore'
import { THEME_PRESETS, type ThemeAccent, type ThemeMode } from '@/stores/themeStore'
import type { MenuContext, MenuItem } from './types'

/**
 * Build accent color menu items
 * @param accent
 * @param setAccent
 */
export function buildAccentItems(
  accent: ThemeAccent,
  setAccent: (accent: ThemeAccent) => void
): MenuItem[] {
  const accents: ThemeAccent[] = ['cyan', 'blue', 'green', 'magenta', 'orange', 'violet', 'red']
  return accents.map((a) => ({
    label: (accent === a ? '[x] ' : '[ ] ') + a.charAt(0).toUpperCase() + a.slice(1),
    onClick: () => setAccent(a),
  }))
}

/**
 * Build theme mode menu items
 * @param mode
 * @param setMode
 */
export function buildModeItems(mode: ThemeMode, setMode: (mode: ThemeMode) => void): MenuItem[] {
  const modes: ThemeMode[] = ['light', 'dark', 'system']
  return modes.map((m) => ({
    label: (mode === m ? '[x] ' : '[ ] ') + m.charAt(0).toUpperCase() + m.slice(1),
    onClick: () => setMode(m),
  }))
}

/**
 * Build theme preset menu items
 * @param setPreset
 * @param modeItems
 * @param accentItems
 */
export function buildPresetItems(
  setPreset: (presetId: string) => void,
  modeItems: MenuItem[],
  accentItems: MenuItem[]
): MenuItem[] {
  return [
    ...THEME_PRESETS.map((p) => ({
      label: p.label,
      onClick: () => {
        setPreset(p.id)
        soundManager.playClick()
      },
    })),
    { label: '---' },
    {
      label: 'Advanced',
      items: [
        { label: 'Mode', items: modeItems },
        { label: 'Accent', items: accentItems },
      ],
    },
  ]
}

/**
 * Build saved scene menu items
 * @param savedScenes
 * @param loadScene
 * @param addToast
 */
export function buildSavedSceneItems(
  savedScenes: SavedScene[],
  loadScene: (id: string) => void,
  addToast: (message: string, type?: ToastType) => void
): MenuItem[] {
  return savedScenes.map((s: SavedScene) => ({
    label: s.name,
    onClick: () => {
      loadScene(s.id)
      soundManager.playClick()
      addToast(`Loaded scene: ${s.name}`, 'info')
    },
  }))
}

/**
 * Build example scene menu items
 * @param addToast
 */
export function buildExampleSceneItems(
  addToast: (message: string, type?: ToastType) => void
): MenuItem[] {
  const sceneExamples = getSceneExamples()
  return sceneExamples.map((scene) => ({
    label: scene.name,
    onClick: () => {
      applySceneExample(scene.id)
      addToast(`Loaded example: ${scene.name}`, 'info')
    },
  }))
}

/**
 * Build scenes submenu items
 * @param savedScenes
 * @param savedSceneItems
 * @param exampleSceneItems
 * @param setSaveSceneOpen
 * @param setIsSceneManagerOpen
 */
export function buildSceneSubmenuItems(
  savedScenes: SavedScene[],
  savedSceneItems: MenuItem[],
  exampleSceneItems: MenuItem[],
  setSaveSceneOpen: (open: boolean) => void,
  setIsSceneManagerOpen: (open: boolean) => void
): MenuItem[] {
  return [
    { label: 'Actions' },
    { label: '+ Save Current Scene...', onClick: () => setSaveSceneOpen(true) },
    {
      label: 'Manage Scenes...',
      onClick: () => {
        setIsSceneManagerOpen(true)
        soundManager.playClick()
      },
    },
    { label: '---' },
    { label: 'Saved Scenes' },
    ...(savedScenes.length === 0 ? [{ label: '(None)', disabled: true }] : savedSceneItems),
    { label: '---' },
    { label: 'Examples' },
    ...exampleSceneItems,
  ]
}

/**
 * Build saved style menu items
 * @param savedStyles
 * @param loadStyle
 * @param addToast
 */
export function buildSavedStyleItems(
  savedStyles: SavedStyle[],
  loadStyle: (id: string) => void,
  addToast: (message: string, type?: ToastType) => void
): MenuItem[] {
  return savedStyles.map((s: SavedStyle) => ({
    label: s.name,
    onClick: () => {
      loadStyle(s.id)
      soundManager.playClick()
      addToast(`Applied style: ${s.name}`, 'info')
    },
  }))
}

/**
 * Build example style menu items
 * @param addToast
 */
export function buildExampleStyleItems(
  addToast: (message: string, type?: ToastType) => void
): MenuItem[] {
  const styleExamples = getStyleExamples()
  return styleExamples.map((style) => ({
    label: style.name,
    onClick: () => {
      applyStyleExample(style.id)
      addToast(`Applied preset: ${style.name}`, 'info')
    },
  }))
}

/**
 * Build styles submenu items
 * @param savedStyles
 * @param savedStyleItems
 * @param exampleStyleItems
 * @param setSaveStyleOpen
 * @param setIsStyleManagerOpen
 */
export function buildStyleSubmenuItems(
  savedStyles: SavedStyle[],
  savedStyleItems: MenuItem[],
  exampleStyleItems: MenuItem[],
  setSaveStyleOpen: (open: boolean) => void,
  setIsStyleManagerOpen: (open: boolean) => void
): MenuItem[] {
  return [
    { label: 'Actions' },
    { label: '+ Save Current Style...', onClick: () => setSaveStyleOpen(true) },
    {
      label: 'Manage Styles...',
      onClick: () => {
        setIsStyleManagerOpen(true)
        soundManager.playClick()
      },
    },
    { label: '---' },
    { label: 'Saved Styles' },
    ...(savedStyles.length === 0 ? [{ label: '(None)', disabled: true }] : savedStyleItems),
    { label: '---' },
    { label: 'Presets' },
    ...exampleStyleItems,
  ]
}

/**
 * Build File menu items
 * @param handleExport
 * @param handleExportVideo
 */
export function buildFileItems(
  handleExport: () => void,
  handleExportVideo: () => void
): MenuItem[] {
  const m = getModifierSymbols()
  return [
    {
      label: 'Export Image (PNG)',
      onClick: handleExport,
      shortcut: `${m.ctrl}S`,
      'data-testid': 'menu-export',
    },
    {
      label: 'Export Video (MP4)',
      onClick: handleExportVideo,
      shortcut: `${m.ctrl}${m.shift}E`,
      'data-testid': 'menu-export-video',
    },
  ]
}

/**
 * Build View menu items
 * @param ctx
 * @param presetItems
 */
export function buildViewItems(
  ctx: Pick<
    MenuContext,
    | 'showLeftPanel'
    | 'toggleLeftPanel'
    | 'showRightPanel'
    | 'toggleRightPanel'
    | 'toggleCinematicMode'
    | 'toggleShortcuts'
    | 'isMobile'
  >,
  presetItems: MenuItem[]
): MenuItem[] {
  const items: MenuItem[] = [
    {
      label: ctx.showLeftPanel ? 'Hide Explorer' : 'Show Explorer',
      onClick: () => {
        ctx.toggleLeftPanel()
        soundManager.playClick()
      },
    },
    {
      label: ctx.showRightPanel ? 'Hide Inspector' : 'Show Inspector',
      onClick: () => {
        ctx.toggleRightPanel()
        soundManager.playClick()
      },
    },
    { label: 'Cinematic Mode', onClick: ctx.toggleCinematicMode, shortcut: 'C' },
  ]

  // Only show keyboard shortcuts option on desktop (not useful on mobile)
  if (!ctx.isMobile) {
    items.push({ label: 'Keyboard Shortcuts', onClick: ctx.toggleShortcuts, shortcut: '?' })
  }

  items.push({ label: '---' })
  items.push({ label: 'Theme', items: presetItems })

  return items
}

/**
 * Build mobile unified menu items
 * @param fileItems
 * @param viewItems
 * @param sceneSubmenuItems
 * @param styleSubmenuItems
 * @param isSoundEnabled
 * @param toggleSound
 */
export function buildMobileMenuItems(
  fileItems: MenuItem[],
  viewItems: MenuItem[],
  sceneSubmenuItems: MenuItem[],
  styleSubmenuItems: MenuItem[],
  isSoundEnabled: boolean,
  toggleSound: () => void
): MenuItem[] {
  return [
    { label: 'FILE', items: fileItems },
    { label: 'VIEW', items: viewItems },
    { label: 'SCENES', items: sceneSubmenuItems },
    { label: 'STYLES', items: styleSubmenuItems },
    { label: '---' },
    { label: 'TOOLS' },
    { label: isSoundEnabled ? 'Mute Sound' : 'Enable Sound', onClick: toggleSound },
  ]
}
