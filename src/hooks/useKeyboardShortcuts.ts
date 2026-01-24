/**
 * Keyboard Shortcuts Hook
 * Provides keyboard shortcuts for common actions
 */

import { exportSceneToPNG, generateTimestampFilename } from '@/lib/export'
import { getModifierSymbols, getPlatformKeyLabel } from '@/lib/platform'
import { useCameraStore } from '@/stores/cameraStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useLayoutStore } from '@/stores/layoutStore'
import { useLightingStore } from '@/stores/lightingStore'
import { useExportStore } from '@/stores/exportStore'
import { useCallback, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'

export interface ShortcutConfig {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  description: string
  action: () => void
}

export interface UseKeyboardShortcutsOptions {
  enabled?: boolean
}

/** Shortcut configuration for display (grouped by category) */
export const SHORTCUTS: Omit<ShortcutConfig, 'action'>[] = [
  // UI Navigation
  { key: 'k', ctrl: true, description: 'Open command palette' },
  { key: '?', description: 'Show keyboard shortcuts' },
  { key: '\\', description: 'Toggle right sidebar' },
  { key: '\\', shift: true, description: 'Toggle left sidebar' },
  // Camera Movement
  { key: 'w', description: 'Move camera forward' },
  { key: 'a', description: 'Strafe camera left' },
  { key: 's', description: 'Move camera backward' },
  { key: 'd', description: 'Strafe camera right' },
  // Camera Rotation (Shift + WASD)
  { key: 'w', shift: true, description: 'Rotate camera up' },
  { key: 'a', shift: true, description: 'Rotate camera left' },
  { key: 's', shift: true, description: 'Rotate camera down' },
  { key: 'd', shift: true, description: 'Rotate camera right' },
  // Camera Origin & Reset
  { key: '0', description: 'Move camera to origin' },
  { key: '0', shift: true, description: 'Look at origin' },
  { key: 'r', description: 'Reset camera view' },
  // Geometry
  { key: 'ArrowUp', description: 'Increase dimension' },
  { key: 'ArrowDown', description: 'Decrease dimension' },
  { key: '1', description: 'Select hypercube' },
  { key: '2', description: 'Select simplex' },
  { key: '3', description: 'Select cross-polytope' },
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
  const { dimension, setDimension, setObjectType } = useGeometryStore(
    useShallow((state) => ({
      dimension: state.dimension,
      setDimension: state.setDimension,
      setObjectType: state.setObjectType,
    }))
  )

  // Grouped layout store subscription
  const { toggleCinematicMode, toggleCollapsed, toggleLeftPanel, toggleShortcuts } = useLayoutStore(
    useShallow((state) => ({
      toggleCinematicMode: state.toggleCinematicMode,
      toggleCollapsed: state.toggleCollapsed,
      toggleLeftPanel: state.toggleLeftPanel,
      toggleShortcuts: state.toggleShortcuts,
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

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in input fields
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }

      const { key, ctrlKey, metaKey, shiftKey } = event
      const isCtrlOrMeta = ctrlKey || metaKey
      const lowerKey = key.toLowerCase()

      // --- Light-specific shortcuts (High Priority) ---
      if (selectedLightId) {
        // Actions that ignore modifiers (mostly) or handle them specifically
        if (key === 'Delete' || key === 'Backspace') {
          event.preventDefault()
          removeLight(selectedLightId)
          return
        }

        if (key === 'Escape') {
          event.preventDefault()
          selectLight(null)
          return
        }

        // Mode switching / Actions requiring NO modifiers
        if (!shiftKey && !isCtrlOrMeta) {
          const lightActions: Record<string, () => void> = {
            w: () => setTransformMode('translate'),
            e: () => setTransformMode('rotate'),
            d: () => {
              const newId = duplicateLight(selectedLightId)
              if (newId) selectLight(newId)
            },
          }

          if (lightActions[lowerKey]) {
            event.preventDefault()
            lightActions[lowerKey]()
            return
          }
        }
      }

      // --- Global Shortcuts ---

      // 1. Modifier-specific actions
      if (isCtrlOrMeta && lowerKey === 's') {
        event.preventDefault()
        const filename = generateTimestampFilename('ndimensional')
        exportSceneToPNG({ filename })
        return
      }

      if (isCtrlOrMeta && shiftKey && lowerKey === 'e') {
        event.preventDefault()
        useExportStore.getState().setModalOpen(true)
        return
      }

      if (!isCtrlOrMeta && !shiftKey && lowerKey === 'c') {
        event.preventDefault()
        toggleCinematicMode()
        return
      }

      // Toggle right sidebar: \
      if (!isCtrlOrMeta && !shiftKey && key === '\\') {
        event.preventDefault()
        toggleCollapsed()
        return
      }

      // Toggle left sidebar: Shift+\
      if (!isCtrlOrMeta && shiftKey && key === '|') {
        // Shift+\ produces '|' on most keyboards
        event.preventDefault()
        toggleLeftPanel()
        return
      }

      // Reset camera: R (only when no light is selected)
      if (!isCtrlOrMeta && !shiftKey && lowerKey === 'r' && !selectedLightId) {
        event.preventDefault()
        resetCamera()
        return
      }

      // Show shortcuts: ? (Shift+/ on most keyboards)
      if (!isCtrlOrMeta && key === '?') {
        event.preventDefault()
        toggleShortcuts()
        return
      }

      // 2. Simple Key Map (Modifiers ignored/allowed as per original implementation)
      // Note: Original implementation allowed modifiers for Arrows and Numbers
      const globalKeyMap: Record<string, () => void> = {
        ArrowUp: () => {
          if (dimension < 6) setDimension(dimension + 1)
        },
        ArrowDown: () => {
          if (dimension > 3) setDimension(dimension - 1)
        },
        '1': () => setObjectType('hypercube'),
        '2': () => setObjectType('simplex'),
        '3': () => setObjectType('cross-polytope'),
      }

      if (globalKeyMap[key]) {
        event.preventDefault()
        globalKeyMap[key]()
        return
      }

      // Note: WASD keys are handled by useCameraMovement hook for camera movement
    },
    [
      dimension,
      setDimension,
      setObjectType,
      selectedLightId,
      setTransformMode,
      selectLight,
      removeLight,
      duplicateLight,
      toggleCinematicMode,
      toggleCollapsed,
      toggleLeftPanel,
      toggleShortcuts,
      resetCamera,
    ]
  )

  useEffect(() => {
    if (!enabled) {
      return
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [enabled, handleKeyDown])
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
