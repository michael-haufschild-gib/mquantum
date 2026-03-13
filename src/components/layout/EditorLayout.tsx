import { CanvasContextMenu } from '@/components/layout/CanvasContextMenu'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { ShortcutsOverlay } from '@/components/layout/ShortcutsOverlay'
import { CropEditor } from '@/components/overlays/CropEditor'
import { ExportModal } from '@/components/overlays/ExportModal'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'
import { GlobalProgress } from '@/components/ui/GlobalProgress'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import { soundManager } from '@/lib/audio/SoundManager'
import { useLayoutStore, type LayoutStore } from '@/stores/layoutStore'
import { useThemeStore } from '@/stores/themeStore'
import { AnimatePresence, m } from 'motion/react'
import React, { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { EditorBottomPanel } from './EditorBottomPanel'
import { EditorLeftPanel } from './EditorLeftPanel'
import { EditorRightPanel } from './EditorRightPanel'
import { EditorTopBar } from './EditorTopBar'

interface EditorLayoutProps {
  children?: React.ReactNode
}

export const EditorLayout: React.FC<EditorLayoutProps> = React.memo(({ children }) => {
  const { accent, mode } = useThemeStore(
    useShallow((state) => ({ accent: state.accent, mode: state.mode }))
  )

  const {
    isCollapsed,
    toggleCollapsed,
    isCinematicMode,
    toggleCinematicMode,
    setCinematicMode,
    setCollapsed,
    showLeftPanel,
    setLeftPanel,
  } = useLayoutStore(
    useShallow((state: LayoutStore) => ({
      isCollapsed: state.isCollapsed,
      toggleCollapsed: state.toggleCollapsed,
      isCinematicMode: state.isCinematicMode,
      toggleCinematicMode: state.toggleCinematicMode,
      setCinematicMode: state.setCinematicMode,
      setCollapsed: state.setCollapsed,
      showLeftPanel: state.showLeftPanel,
      setLeftPanel: state.setLeftPanel,
    }))
  )

  const isDesktop = useIsDesktop()

  // Apply theme
  useEffect(() => {
    const applyTheme = () => {
      document.documentElement.setAttribute('data-accent', accent)

      let resolvedMode = mode
      if (mode === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        resolvedMode = systemTheme
      }
      document.documentElement.setAttribute('data-mode', resolvedMode)
    }

    applyTheme()

    if (mode === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = () => applyTheme()
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
    return undefined
  }, [accent, mode])

  // Sync fullscreen state with cinematic mode
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setCinematicMode(false)
      }
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [setCinematicMode])

  const handleOverlayClick = () => {
    if (!isDesktop) {
      setLeftPanel(false)
      setCollapsed(true)
      soundManager.playClick()
    }
  }

  // Auto-collapse on mobile init
  useEffect(() => {
    if (!isDesktop) {
      setLeftPanel(false)
      setCollapsed(true)
    } else {
      setLeftPanel(true)
      setCollapsed(false)
    }
  }, [isDesktop, setCollapsed, setLeftPanel])

  const panelVariants = {
    hiddenLeft: { x: -340, opacity: 0, scale: 0.95 },
    visible: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        type: 'spring' as const,
        damping: 25,
        stiffness: 300,
        mass: 0.8,
      },
    },
    hiddenRight: { x: 340, opacity: 0, scale: 0.95 },
  }

  // Animation variants for mobile bottom app bar
  const mobileBottomVariants = {
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: 'spring' as const,
        damping: 25,
        stiffness: 300,
        mass: 0.8,
      },
    },
    hidden: {
      y: 80, // Slide below viewport (h-16 = 64px + safe margin)
      opacity: 0,
      transition: {
        type: 'spring' as const,
        damping: 25,
        stiffness: 300,
        mass: 0.8,
      },
    },
  }

  // Mobile bottom panel visibility: shown when both side panels are closed
  const showMobileBottomPanel = !isCinematicMode && !isDesktop && isCollapsed && !showLeftPanel

  return (
    <div className="relative h-screen supports-[height:100dvh]:h-[100dvh] w-full bg-background overflow-hidden selection:bg-accent selection:text-white font-sans text-text-primary group/app">
      {/* Skip Navigation */}
      <a
        href="#inspector-panel"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-1/2 focus:-translate-x-1/2 focus:px-4 focus:py-2 focus:bg-accent focus:text-white focus:rounded-lg focus:text-sm focus:font-medium focus:shadow-lg pointer-events-auto"
      >
        Skip to Inspector
      </a>

      {/* 1. Full-screen Canvas Layer (The Curtain) */}
      <div className="absolute inset-0 z-0">{children}</div>

      {/* 2. UI Overlay Layer */}
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1 }}
        className="relative z-10 flex flex-col h-full w-full pointer-events-none"
      >
        <GlobalProgress />
        <ExportModal />
        <CropEditor />

        {!isCinematicMode && (
          <div className="pointer-events-auto shrink-0 z-50">
            <EditorTopBar showRightPanel={!isCollapsed} toggleRightPanel={toggleCollapsed} />
          </div>
        )}

        {/* Floating Exit Cinematic Button */}
        <AnimatePresence>
          {isCinematicMode && (
            <div className="absolute top-6 right-6 z-50 pointer-events-auto">
              <m.button
                initial={{ scale: 0, opacity: 0, rotate: -90 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 0, opacity: 0, rotate: 90 }}
                onClick={() => {
                  toggleCinematicMode()
                  soundManager.playClick()
                }}
                className="p-3 rounded-full glass-panel text-text-secondary hover:text-white hover:border-accent/50 transition-colors group shadow-2xl shadow-accent/20"
                title="Exit Cinematic Mode (C)"
                data-testid="exit-cinematic"
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </m.button>
            </div>
          )}
        </AnimatePresence>

        <div className="flex flex-1 min-h-0 overflow-hidden relative p-2 gap-2">
          {/* Mobile Overlay Backdrop */}
          <AnimatePresence>
            {!isDesktop && !isCinematicMode && (showLeftPanel || !isCollapsed) && (
              <m.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleOverlayClick}
                className="absolute inset-0 bg-[var(--bg-overlay)] backdrop-blur-sm z-20 pointer-events-auto"
              />
            )}
          </AnimatePresence>

          {/* Left Panel */}
          <AnimatePresence mode="popLayout">
            {!isCinematicMode && showLeftPanel && (
              <m.div
                initial="hiddenLeft"
                animate="visible"
                exit="hiddenLeft"
                variants={panelVariants}
                className={`
                            glass-panel rounded-xl
                            h-full overflow-hidden w-80 pointer-events-auto flex flex-col
                            ${!isDesktop ? 'absolute left-2 top-0 bottom-2 z-30 shadow-2xl' : 'relative z-20'}
                        `}
              >
                <ErrorBoundary fallback={<div className="p-4 text-sm text-danger">Explorer panel error. Reload to recover.</div>}>
                  <div className="w-full h-full overflow-hidden">
                    <EditorLeftPanel />
                  </div>
                </ErrorBoundary>
              </m.div>
            )}
          </AnimatePresence>

          {/* Center Area (Transparent, lets clicks pass to canvas) */}
          <div className="flex-1 flex flex-col min-w-0 relative z-0">
            <div className="flex-1 relative w-full min-h-0 pointer-events-none">
              {/* Loader */}
              {!children && (
                <div className="w-full h-full flex flex-col items-center justify-center text-text-tertiary">
                  <div className="relative w-32 h-32 mb-8">
                    <div className="absolute inset-0 border border-accent/20 rounded-full animate-[spin_8s_linear_infinite]"></div>
                    <div className="absolute inset-2 border-t border-accent rounded-full animate-[spin_3s_linear_infinite]"></div>
                    <div className="absolute inset-12 border border-accent/50 rounded-full animate-pulse"></div>
                    <div className="absolute inset-[40%] bg-accent/20 blur-xl rounded-full animate-pulse"></div>
                  </div>
                  <p className="text-xs font-mono tracking-[0.5em] text-accent/80 animate-pulse uppercase">
                    Initializing Core
                  </p>
                </div>
              )}
            </div>
            {!isCinematicMode && isDesktop && (
              <div className="pointer-events-auto shrink-0 mx-2">
                <EditorBottomPanel />
              </div>
            )}
          </div>

          {/* Right Panel */}
          <AnimatePresence mode="popLayout">
            {!isCinematicMode && !isCollapsed && (
              <m.div
                initial="hiddenRight"
                animate="visible"
                exit="hiddenRight"
                variants={panelVariants}
                className={`
                            glass-panel rounded-xl
                            h-full overflow-hidden w-80 pointer-events-auto flex flex-col
                            ${!isDesktop ? 'absolute right-2 top-0 bottom-2 z-30 shadow-2xl' : 'relative z-20'}
                        `}
              >
                <ErrorBoundary fallback={<div className="p-4 text-sm text-danger">Inspector panel error. Reload to recover.</div>}>
                  <div id="inspector-panel" className="w-full h-full overflow-hidden">
                    <EditorRightPanel />
                  </div>
                </ErrorBoundary>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </m.div>

      {/* Mobile Bottom App Bar - Timeline Controls */}
      <AnimatePresence>
        {showMobileBottomPanel && (
          <m.div
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={mobileBottomVariants}
            className="fixed bottom-0 left-0 right-0 z-30 pointer-events-auto pb-[env(safe-area-inset-bottom)]"
            data-testid="mobile-timeline-controls"
          >
            <EditorBottomPanel />
          </m.div>
        )}
      </AnimatePresence>

      <CommandPalette />
      <CanvasContextMenu />
      {!isCinematicMode && <ShortcutsOverlay />}
    </div>
  )
})

EditorLayout.displayName = 'EditorLayout'
