/**
 * EditorTopBar Component
 *
 * Top bar component for the editor layout.
 * Provides main navigation menus (File, View, Scenes, Styles), global controls,
 * and panel toggle buttons. Responsive design with mobile-friendly unified menu.
 */

import { TopBarControls } from '@/components/layout/TopBarControls'
import { SceneManager } from '@/components/presets/SceneManager'
import { StyleManager } from '@/components/presets/StyleManager'
import { Button } from '@/components/ui/Button'
import { DropdownMenu } from '@/components/ui/DropdownMenu'
import { InputModal } from '@/components/ui/InputModal'
import { Modal } from '@/components/ui/Modal'
import { BREAKPOINTS, useIsMobile, useMediaQuery } from '@/hooks/useMediaQuery'
import { useToast } from '@/hooks/useToast'
import { soundManager } from '@/lib/audio/SoundManager'
import { exportSceneToPNG, generateTimestampFilename } from '@/lib/export'
import { captureScreenshotAsync } from '@/hooks/useScreenshotCapture'
import { OBJECT_TYPE_REGISTRY } from '@/lib/geometry/registry/registry'
import { useExportStore } from '@/stores/exportStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useGeometryStore } from '@/stores/geometryStore'
import { useLayoutStore, type LayoutStore } from '@/stores/layoutStore'
import { usePresetManagerStore, type PresetManagerState } from '@/stores/presetManagerStore'
import { useThemeStore } from '@/stores/themeStore'
import React, { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  useFileMenuItems,
  useMobileMenuItems,
  useSceneMenuItems,
  useStyleMenuItems,
  useThemeMenuItems,
  useViewMenuItems,
} from './useMenuItems'

/** Props for EditorTopBar component */
interface EditorTopBarProps {
  /** Whether the right panel (Inspector) is visible */
  showRightPanel: boolean
  /** Callback to toggle the right panel visibility */
  toggleRightPanel: () => void
}

/**
 * Top bar component for the editor layout.
 * @param props - Component props
 * @returns The editor top bar component
 */
export const EditorTopBar: React.FC<EditorTopBarProps> = React.memo(
  ({ showRightPanel, toggleRightPanel }) => {
    const { addToast } = useToast()

    const { toggleShortcuts, showLeftPanel, toggleLeftPanel, toggleCinematicMode } = useLayoutStore(
      useShallow((state: LayoutStore) => ({
        toggleShortcuts: state.toggleShortcuts,
        showLeftPanel: state.showLeftPanel,
        toggleLeftPanel: state.toggleLeftPanel,
        toggleCinematicMode: state.toggleCinematicMode,
      }))
    )

    // New Preset Manager Store
    const { savedStyles, saveStyle, loadStyle, savedScenes, saveScene, loadScene } =
      usePresetManagerStore(
        useShallow((state: PresetManagerState) => ({
          savedStyles: state.savedStyles,
          saveStyle: state.saveStyle,
          loadStyle: state.loadStyle,
          savedScenes: state.savedScenes,
          saveScene: state.saveScene,
          loadScene: state.loadScene,
        }))
      )

    // Theme store - consolidated subscription
    const { accent, setAccent, mode, setMode, setPreset } = useThemeStore(
      useShallow((state) => ({
        accent: state.accent,
        setAccent: state.setAccent,
        mode: state.mode,
        setMode: state.setMode,
        setPreset: state.setPreset,
      }))
    )

    const [isStyleManagerOpen, setIsStyleManagerOpen] = useState(false)
    const [isSceneManagerOpen, setIsSceneManagerOpen] = useState(false)

    // Modal states for inputs
    const [saveStyleOpen, setSaveStyleOpen] = useState(false)
    const [saveSceneOpen, setSaveSceneOpen] = useState(false)

    // Store subscriptions needed for video export
    const { dimension, objectType } = useGeometryStore(
      useShallow((state) => ({
        dimension: state.dimension,
        objectType: state.objectType,
      }))
    )

    const quantumMode = useExtendedObjectStore((state) => state.schroedinger.quantumMode)

    const isDesktop = useMediaQuery(BREAKPOINTS.sm)
    const isMobile = useIsMobile()

    // Refs for measuring sections to determine center positioning
    const topBarRef = useRef<HTMLDivElement>(null)
    const leftSectionRef = useRef<HTMLDivElement>(null)
    const centerSectionRef = useRef<HTMLDivElement>(null)

    // Update CSS variables for center positioning
    useLayoutEffect(() => {
      const updateCSSVariables = () => {
        if (!topBarRef.current || !leftSectionRef.current || !centerSectionRef.current) return

        const leftWidth = leftSectionRef.current.offsetWidth
        const centerWidth = centerSectionRef.current.offsetWidth
        const gap = 16

        topBarRef.current.style.setProperty('--left-edge', `${leftWidth + gap}px`)
        topBarRef.current.style.setProperty('--center-half-width', `${centerWidth / 2}px`)
      }

      updateCSSVariables()

      const resizeObserver = new ResizeObserver(updateCSSVariables)
      if (topBarRef.current) resizeObserver.observe(topBarRef.current)
      if (leftSectionRef.current) resizeObserver.observe(leftSectionRef.current)
      if (centerSectionRef.current) resizeObserver.observe(centerSectionRef.current)

      return () => resizeObserver.disconnect()
    }, [])

    // Sync sound state for menu toggle
    const [isSoundEnabled, setIsSoundEnabled] = useState(soundManager.isEnabled)

    // --- Handlers ---

    const handleExport = useCallback(async () => {
      soundManager.playSuccess()
      await new Promise((resolve) => setTimeout(resolve, 50))
      const filename = generateTimestampFilename('ndimensional')
      exportSceneToPNG({ filename })
    }, [])

    const { setExportModalOpen, setPreviewImage, updateExportSettings } = useExportStore(
      useShallow((state) => ({
        setExportModalOpen: state.setModalOpen,
        setPreviewImage: state.setPreviewImage,
        updateExportSettings: state.updateSettings,
      }))
    )

    const handleExportVideo = useCallback(async () => {
      // Capture preview using on-demand screenshot system
      try {
        const dataUrl = await captureScreenshotAsync()
        setPreviewImage(dataUrl)
      } catch (e) {
        console.error('Failed to capture preview for video export:', e)
      }

      let defaultText = ''
      if (objectType === 'schroedinger') {
        const modeName =
          quantumMode === 'freeScalarField'
            ? 'Free Scalar Field'
            : quantumMode === 'tdseDynamics'
              ? 'TDSE Dynamics'
              : quantumMode === 'hydrogenND'
                ? 'Hydrogen ND'
                : 'Harmonic Oscillator'
        defaultText = `${dimension}D ${modeName}`
      } else {
        const entry = OBJECT_TYPE_REGISTRY.get(objectType)
        const typeName = entry?.name ?? objectType
        defaultText = `${dimension}D ${typeName}`
      }

      updateExportSettings((prev) => ({
        textOverlay: { ...prev.textOverlay, text: defaultText },
      }))

      setExportModalOpen(true)
      soundManager.playClick()
    }, [
      setExportModalOpen,
      setPreviewImage,
      dimension,
      objectType,
      quantumMode,
      updateExportSettings,
    ])

    const toggleSound = useCallback(() => {
      const newState = !isSoundEnabled
      soundManager.toggle(newState)
      setIsSoundEnabled(newState)
      if (newState) {
        soundManager.playClick()
        addToast('Sound Enabled', 'info')
      } else {
        addToast('Sound Muted', 'info')
      }
    }, [isSoundEnabled, addToast])

    // --- Menu Items (using extracted hooks) ---

    const { presetItems } = useThemeMenuItems(accent, setAccent, mode, setMode, setPreset)

    const { sceneSubmenuItems } = useSceneMenuItems(
      savedScenes,
      loadScene,
      addToast,
      setSaveSceneOpen,
      setIsSceneManagerOpen
    )

    const { styleSubmenuItems } = useStyleMenuItems(
      savedStyles,
      loadStyle,
      addToast,
      setSaveStyleOpen,
      setIsStyleManagerOpen
    )

    const fileItems = useFileMenuItems(handleExport, handleExportVideo)

    const viewItems = useViewMenuItems(
      showLeftPanel,
      toggleLeftPanel,
      showRightPanel,
      toggleRightPanel,
      toggleCinematicMode,
      toggleShortcuts,
      isMobile,
      presetItems
    )

    const mobileMenuItems = useMobileMenuItems(
      fileItems,
      viewItems,
      sceneSubmenuItems,
      styleSubmenuItems,
      isSoundEnabled,
      toggleSound
    )

    // --- Save Handlers ---

    const onConfirmSaveStyle = useCallback(
      (name: string) => {
        const trimmedName = name.trim()
        if (trimmedName) {
          saveStyle(trimmedName)
          addToast(`Style "${trimmedName}" saved!`, 'success')
          soundManager.playSuccess()
        }
      },
      [saveStyle, addToast]
    )

    const onConfirmSaveScene = useCallback(
      (name: string) => {
        const trimmedName = name.trim()
        if (trimmedName) {
          saveScene(trimmedName)
          addToast(`Scene "${trimmedName}" saved!`, 'success')
          soundManager.playSuccess()
        }
      },
      [saveScene, addToast]
    )

    const handleCloseStyleManager = useCallback(() => {
      setIsStyleManagerOpen(false)
    }, [])

    const handleCloseSceneManager = useCallback(() => {
      setIsSceneManagerOpen(false)
    }, [])

    const handleCloseSaveStyle = useCallback(() => {
      setSaveStyleOpen(false)
    }, [])

    const handleCloseSaveScene = useCallback(() => {
      setSaveSceneOpen(false)
    }, [])

    return (
      <>
        <div
          ref={topBarRef}
          className="glass-panel h-12 flex items-center px-4 z-40 shrink-0 select-none relative mb-2 rounded-xl mx-2 mt-2"
          data-testid="top-bar"
        >
          {/* Left: Branding & Menu */}
          <div ref={leftSectionRef} className="flex items-center gap-4 shrink-0">
            {/* Left Panel Toggle */}
            <Button
              variant={showLeftPanel ? 'primary' : 'ghost'}
              size="icon"
              onClick={toggleLeftPanel}
              ariaLabel="Toggle Explorer"
              data-testid="toggle-left-panel"
              className={`p-1.5 ${
                showLeftPanel
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-secondary hover:text-text-primary hover:bg-[var(--bg-hover)]'
              }`}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </Button>

            {/* Desktop Menus (Hidden on Mobile) */}
            <div className="hidden sm:flex items-center gap-2 text-xs text-text-secondary">
              <DropdownMenu
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="menu-file"
                    className="px-2 py-1 font-medium tracking-wide"
                  >
                    FILE
                  </Button>
                }
                items={fileItems}
              />
              <DropdownMenu
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="menu-view"
                    className="px-2 py-1 font-medium tracking-wide"
                  >
                    VIEW
                  </Button>
                }
                items={viewItems}
              />
              <DropdownMenu
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="menu-scenes"
                    className="px-2 py-1 font-medium tracking-wide"
                  >
                    SCENES
                  </Button>
                }
                items={sceneSubmenuItems}
              />
              <DropdownMenu
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    data-testid="menu-styles"
                    className="px-2 py-1 font-medium tracking-wide"
                  >
                    STYLES
                  </Button>
                }
                items={styleSubmenuItems}
              />
            </div>

            {/* Mobile Unified Menu (Visible only on Mobile) */}
            <div className="flex sm:hidden">
              <DropdownMenu
                trigger={
                  <Button variant="ghost" size="icon" ariaLabel="Menu" className="p-1.5">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="3" y1="12" x2="21" y2="12"></line>
                      <line x1="3" y1="6" x2="21" y2="6"></line>
                      <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                  </Button>
                }
                items={mobileMenuItems}
              />
            </div>
          </div>

          {/* Center: Global Controls */}
          <div
            ref={centerSectionRef}
            className="absolute flex items-center"
            style={{
              left: 'max(var(--left-edge, 0px), calc(50% - var(--center-half-width, 0px)))',
            }}
          >
            <TopBarControls compact={!isDesktop} />
          </div>

          {/* Right: Panel Toggle */}
          <div className="flex items-center shrink-0 ml-auto">
            <Button
              variant={showRightPanel ? 'primary' : 'ghost'}
              size="icon"
              onClick={toggleRightPanel}
              ariaLabel="Toggle Inspector"
              data-testid="toggle-right-panel"
              className={`p-1.5 ${
                showRightPanel
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-secondary hover:text-text-primary hover:bg-[var(--bg-hover)]'
              }`}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="15" y1="3" x2="15" y2="21" />
              </svg>
            </Button>
          </div>
        </div>

        <Modal isOpen={isStyleManagerOpen} onClose={handleCloseStyleManager} title="Manage Styles">
          <StyleManager onClose={handleCloseStyleManager} />
        </Modal>

        <Modal isOpen={isSceneManagerOpen} onClose={handleCloseSceneManager} title="Manage Scenes">
          <SceneManager onClose={handleCloseSceneManager} />
        </Modal>

        <InputModal
          isOpen={saveStyleOpen}
          onClose={handleCloseSaveStyle}
          onConfirm={onConfirmSaveStyle}
          title="Save Style"
          placeholder="Enter style name..."
          confirmText="Save"
        />

        <InputModal
          isOpen={saveSceneOpen}
          onClose={handleCloseSaveScene}
          onConfirm={onConfirmSaveScene}
          title="Save Scene"
          placeholder="Enter scene name..."
          confirmText="Save"
        />
      </>
    )
  }
)

EditorTopBar.displayName = 'EditorTopBar'
