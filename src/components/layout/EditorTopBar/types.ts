/**
 * Shared types for EditorTopBar components
 */

import type { SavedScene, SavedStyle } from '@/stores/presetManagerStore';

/**
 * Menu item that can be used in dropdown menus
 */
export interface MenuItem {
  label: string;
  onClick?: () => void;
  shortcut?: string;
  disabled?: boolean;
  items?: MenuItem[];
  'data-testid'?: string;
}

/**
 * Context for building menu items - provides access to all necessary state and actions
 */
export interface MenuContext {
  // Layout actions
  toggleShortcuts: () => void;
  showLeftPanel: boolean;
  toggleLeftPanel: () => void;
  showRightPanel: boolean;
  toggleRightPanel: () => void;
  toggleCinematicMode: () => void;

  // Theme state and actions
  accent: string;
  setAccent: (accent: string) => void;
  mode: string;
  setMode: (mode: string) => void;
  setPreset: (presetId: string) => void;

  // Preset management
  savedStyles: SavedStyle[];
  loadStyle: (id: string) => void;
  savedScenes: SavedScene[];
  loadScene: (id: string) => void;

  // Modal state setters
  setSaveStyleOpen: (open: boolean) => void;
  setSaveSceneOpen: (open: boolean) => void;
  setIsStyleManagerOpen: (open: boolean) => void;
  setIsSceneManagerOpen: (open: boolean) => void;

  // Export handlers
  handleExport: () => void;
  handleExportVideo: () => void;
  handleShare: () => void;

  // Sound state
  isSoundEnabled: boolean;
  toggleSound: () => void;

  // Platform
  isMobile: boolean;

  // Toast
  addToast: (message: string, type: string) => void;
}
