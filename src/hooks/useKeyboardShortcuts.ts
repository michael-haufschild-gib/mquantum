/**
 * Keyboard Shortcuts Hook
 * Provides keyboard shortcuts for common actions
 */

import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { MAX_DIMENSION, MIN_DIMENSION } from '@/constants/dimension'
import { logger } from '@/lib/logger'
import { getModifierSymbols, getPlatformKeyLabel } from '@/lib/platform'
import { useExportStore } from '@/stores/runtime/exportStore'
import { useCameraStore } from '@/stores/scene/cameraStore'
import { useGeometryStore } from '@/stores/scene/geometryStore'
import { useLightingStore } from '@/stores/scene/lightingStore'
import { useLayoutStore } from '@/stores/ui/layoutStore'

/** Configuration for a single keyboard shortcut binding. */
export interface ShortcutConfig {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  description: string
  action: () => void
}

/** Options for the {@link useKeyboardShortcuts} hook. */
export interface UseKeyboardShortcutsOptions {
  enabled?: boolean
}

/**
 * Shortcut configuration for display (grouped by category).
 *
 * INVARIANT: every entry must have a working handler *somewhere* in the app
 * — the help overlay (`ShortcutsOverlay.tsx`) reads this list verbatim, so a
 * documented-but-unimplemented entry would teach the user that a key does
 * something it does not.
 * Previously this list contained WASD camera movement, Shift+WASD camera
 * rotation, and `0`/`Shift+0` camera-to-origin entries that were never wired
 * up anywhere — `WebGPUCamera` exposes orbit/zoom/pan but no
 * forward/strafe/translate-to-origin primitives. Those entries were removed.
 * If you re-add a shortcut here, make sure its handler actually exists.
 */
export const SHORTCUTS: Omit<ShortcutConfig, 'action'>[] = [
  { key: 'k', ctrl: true, description: 'Open command palette' },
  { key: '?', description: 'Show keyboard shortcuts' },
  { key: '\\', description: 'Toggle right sidebar' },
  { key: '\\', shift: true, description: 'Toggle left sidebar' },
  // Camera Reset
  { key: 'r', description: 'Reset camera view' },
  // Geometry
  { key: 'ArrowUp', description: 'Increase dimension' },
  { key: 'ArrowDown', description: 'Decrease dimension' },
  // View
  { key: 'c', description: 'Toggle cinematic mode' },
  // Export
  { key: 's', ctrl: true, description: 'Export PNG' },
  { key: 'e', ctrl: true, shift: true, description: 'Export Video (MP4)' },
  // Light controls (when light selected)
  { key: 'w', description: 'Light: Move mode*' },
  { key: 'e', description: 'Light: Rotate mode*' },
  { key: 'd', description: 'Light: Duplicate*' },
  { key: 'Delete', description: 'Light: Remove*' },
  { key: 'Escape', description: 'Light: Deselect*' },
]

/**
 *
 * @param options
 */
export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}): void {
  const { enabled = true } = options

  // Grouped geometry store subscription
  const { dimension, setDimension } = useGeometryStore(
    useShallow((state) => ({
      dimension: state.dimension,
      setDimension: state.setDimension,
    }))
  )

  // Grouped layout store subscription
  const {
    toggleCinematicMode,
    toggleCollapsed,
    toggleLeftPanel,
    toggleShortcuts,
    toggleCommandPalette,
  } = useLayoutStore(
    useShallow((state) => ({
      toggleCinematicMode: state.toggleCinematicMode,
      toggleCollapsed: state.toggleCollapsed,
      toggleLeftPanel: state.toggleLeftPanel,
      toggleShortcuts: state.toggleShortcuts,
      toggleCommandPalette: state.toggleCommandPalette,
    }))
  )

  // Camera reset
  const resetCamera = useCameraStore((state) => state.reset)

  // Grouped lighting store subscription
  const { selectedLightId, setTransformMode, selectLight, removeLight, duplicateLight } =
    useLightingStore(
      useShallow((state) => ({
        selectedLightId: state.selectedLightId,
        setTransformMode: state.setTransformMode,
        selectLight: state.selectLight,
        removeLight: state.removeLight,
        duplicateLight: state.duplicateLight,
      }))
    )

  useEffect(() => {
    if (!enabled) {
      return
    }

    /** Handle light-specific shortcuts. Returns true if event was consumed. */
    const handleLightShortcut = (event: KeyboardEvent, lowerKey: string): boolean => {
      if (!selectedLightId) return false

      const { key, shiftKey, ctrlKey, metaKey } = event

      if (key === 'Delete' || key === 'Backspace') {
        event.preventDefault()
        removeLight(selectedLightId)
        return true
      }

      if (key === 'Escape') {
        event.preventDefault()
        selectLight(null)
        return true
      }

      if (shiftKey || ctrlKey || metaKey) return false

      const lightActions: Record<string, () => void> = {
        w: () => setTransformMode('translate'),
        e: () => setTransformMode('rotate'),
        d: () => {
          const newId = duplicateLight(selectedLightId)
          if (newId) selectLight(newId)
        },
      }

      const action = lightActions[lowerKey]
      if (!action) return false

      event.preventDefault()
      action()
      return true
    }

    /** Handle global shortcuts. Returns true if event was consumed. */
    const handleGlobalShortcut = (event: KeyboardEvent, lowerKey: string): boolean => {
      const { key, ctrlKey, metaKey, shiftKey } = event
      const isCtrlOrMeta = ctrlKey || metaKey

      // Modifier-specific actions dispatched via lookup table
      const modifierActions: Record<string, () => void> = {
        ...(isCtrlOrMeta && { k: toggleCommandPalette }),
        ...(isCtrlOrMeta && {
          s: () => {
            void import('@/lib/export/image')
              .then(({ exportSceneToPNG, generateTimestampFilename }) =>
                exportSceneToPNG({ filename: generateTimestampFilename('ndimensional') })
              )
              .catch((error: unknown) => {
                logger.error('[Shortcuts] Ctrl/Cmd+S PNG export failed', error)
              })
          },
        }),
        ...(isCtrlOrMeta && shiftKey && { e: () => useExportStore.getState().setModalOpen(true) }),
      }

      const modAction = modifierActions[lowerKey]
      if (modAction) {
        event.preventDefault()
        modAction()
        return true
      }

      if (isCtrlOrMeta) return false

      // Backslash sidebar-toggles are matched on event.code (physical key
      // position) rather than event.key (layout-dependent character).
      // US layouts produce `\\` (unshifted) and `|` (shifted); German /
      // French / Swiss / etc. layouts produce different characters for
      // the same physical key, which would break the key-based match
      // and leave the documented shortcut dead for non-US users.
      if (event.code === 'Backslash' || event.code === 'IntlBackslash') {
        event.preventDefault()
        if (shiftKey) {
          toggleLeftPanel()
        } else {
          toggleCollapsed()
        }
        return true
      }

      // Plain or shift-only actions
      const plainActions: Record<string, () => void> = {
        ...(!shiftKey && { c: toggleCinematicMode }),
        ...(!shiftKey && !selectedLightId && { r: resetCamera }),
        '?': toggleShortcuts,
        ArrowUp: () => {
          if (dimension < MAX_DIMENSION) setDimension(dimension + 1)
        },
        ArrowDown: () => {
          if (dimension > MIN_DIMENSION) setDimension(dimension - 1)
        },
      }

      const plainAction = plainActions[key] ?? plainActions[lowerKey]
      if (!plainAction) return false

      event.preventDefault()
      plainAction()
      return true
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      const lowerKey = event.key.toLowerCase()
      if (handleLightShortcut(event, lowerKey)) return
      handleGlobalShortcut(event, lowerKey)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    enabled,
    dimension,
    setDimension,
    selectedLightId,
    setTransformMode,
    selectLight,
    removeLight,
    duplicateLight,
    toggleCinematicMode,
    toggleCollapsed,
    toggleLeftPanel,
    toggleShortcuts,
    toggleCommandPalette,
    resetCamera,
  ])
}

/**
 * Get a human-readable label for a keyboard shortcut
 * Uses platform-specific symbols (⌘/⇧/⌥ on Mac, Ctrl/Shift/Alt on Windows/Linux)
 * @param shortcut - The shortcut configuration
 * @returns Human-readable shortcut label (e.g., "⌘ ⇧ A" on Mac, "Ctrl + Shift + A" on Windows)
 */
export function getShortcutLabel(shortcut: Omit<ShortcutConfig, 'action'>): string {
  const modifiers = getModifierSymbols()
  const parts: string[] = []

  if (shortcut.ctrl) parts.push(modifiers.ctrl)
  if (shortcut.shift) parts.push(modifiers.shift)
  if (shortcut.alt) parts.push(modifiers.alt)

  // Get platform-specific key label
  const keyLabel = getPlatformKeyLabel(shortcut.key)
  parts.push(keyLabel.toUpperCase())

  return parts.join(' ')
}
