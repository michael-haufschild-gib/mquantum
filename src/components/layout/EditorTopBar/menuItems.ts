/**
 * Menu item definitions for EditorTopBar
 *
 * Extracted from EditorTopBar.tsx to reduce file size and improve maintainability.
 * Contains all menu item builders for File, View, Scenes, Styles, and Mobile menus.
 */

import { soundManager } from '@/lib/audio/SoundManager';
import { getModifierSymbols } from '@/lib/platform';
import { PRESETS } from '@/lib/presets';
import { THEME_PRESETS } from '@/stores/themeStore';
import type { SavedScene, SavedStyle } from '@/stores/presetManagerStore';
import type { MenuItem, MenuContext } from './types';

/**
 * Build accent color menu items
 */
export function buildAccentItems(accent: string, setAccent: (accent: string) => void): MenuItem[] {
  const accents = ['cyan', 'blue', 'green', 'magenta', 'orange', 'violet', 'red'];
  return accents.map(a => ({
    label: (accent === a ? '\u2713 ' : '  ') + a.charAt(0).toUpperCase() + a.slice(1),
    onClick: () => setAccent(a),
  }));
}

/**
 * Build theme mode menu items
 */
export function buildModeItems(
  mode: string,
  setMode: (mode: string) => void
): MenuItem[] {
  const modes = ['light', 'dark', 'system'];
  return modes.map(m => ({
    label: (mode === m ? '\u2713 ' : '  ') + m.charAt(0).toUpperCase() + m.slice(1),
    onClick: () => setMode(m),
  }));
}

/**
 * Build theme preset menu items
 */
export function buildPresetItems(
  setPreset: (presetId: string) => void,
  modeItems: MenuItem[],
  accentItems: MenuItem[]
): MenuItem[] {
  return [
    ...THEME_PRESETS.map(p => ({
      label: p.label,
      onClick: () => {
        setPreset(p.id);
        soundManager.playClick();
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
  ];
}

/**
 * Build saved scene menu items
 */
export function buildSavedSceneItems(
  savedScenes: SavedScene[],
  loadScene: (id: string) => void,
  addToast: (message: string, type: string) => void
): MenuItem[] {
  return savedScenes.map((s: SavedScene) => ({
    label: s.name,
    onClick: () => {
      loadScene(s.id);
      soundManager.playClick();
      addToast(`Loaded scene: ${s.name}`, 'info');
    },
  }));
}

/**
 * Build example scene menu items
 */
export function buildExampleSceneItems(
  handleApplyPreset: (preset: typeof PRESETS[0]) => void
): MenuItem[] {
  return PRESETS.map(p => ({
    label: p.label,
    onClick: () => handleApplyPreset(p),
  }));
}

/**
 * Build scenes submenu items
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
        setIsSceneManagerOpen(true);
        soundManager.playClick();
      },
    },
    { label: '---' },
    { label: 'Saved Scenes' },
    ...(savedScenes.length === 0
      ? [{ label: '(None)', disabled: true }]
      : savedSceneItems),
    { label: '---' },
    { label: 'Examples' },
    ...exampleSceneItems,
  ];
}

/**
 * Build saved style menu items
 */
export function buildSavedStyleItems(
  savedStyles: SavedStyle[],
  loadStyle: (id: string) => void,
  addToast: (message: string, type: string) => void
): MenuItem[] {
  return savedStyles.map((s: SavedStyle) => ({
    label: s.name,
    onClick: () => {
      loadStyle(s.id);
      soundManager.playClick();
      addToast(`Applied style: ${s.name}`, 'info');
    },
  }));
}

/**
 * Build styles submenu items
 */
export function buildStyleSubmenuItems(
  savedStyles: SavedStyle[],
  savedStyleItems: MenuItem[],
  setSaveStyleOpen: (open: boolean) => void,
  setIsStyleManagerOpen: (open: boolean) => void
): MenuItem[] {
  return [
    { label: 'Actions' },
    { label: '+ Save Current Style...', onClick: () => setSaveStyleOpen(true) },
    {
      label: 'Manage Styles...',
      onClick: () => {
        setIsStyleManagerOpen(true);
        soundManager.playClick();
      },
    },
    { label: '---' },
    { label: 'Saved Styles' },
    ...(savedStyles.length === 0
      ? [{ label: '(None)', disabled: true }]
      : savedStyleItems),
  ];
}

/**
 * Build File menu items
 */
export function buildFileItems(
  handleExport: () => void,
  handleExportVideo: () => void,
  handleShare: () => void
): MenuItem[] {
  const m = getModifierSymbols();
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
    {
      label: 'Copy Share Link',
      onClick: handleShare,
      'data-testid': 'menu-share',
    },
  ];
}

/**
 * Build View menu items
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
        ctx.toggleLeftPanel();
        soundManager.playClick();
      },
    },
    {
      label: ctx.showRightPanel ? 'Hide Inspector' : 'Show Inspector',
      onClick: () => {
        ctx.toggleRightPanel();
        soundManager.playClick();
      },
    },
    { label: 'Cinematic Mode', onClick: ctx.toggleCinematicMode, shortcut: 'C' },
  ];

  // Only show keyboard shortcuts option on desktop (not useful on mobile)
  if (!ctx.isMobile) {
    items.push({ label: 'Keyboard Shortcuts', onClick: ctx.toggleShortcuts, shortcut: '?' });
  }

  items.push({ label: '---' });
  items.push({ label: 'Theme', items: presetItems });

  return items;
}

/**
 * Build mobile unified menu items
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
  ];
}
