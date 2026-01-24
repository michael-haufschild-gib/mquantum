import { Button } from '@/components/ui/Button'
import { SHORTCUTS, getShortcutLabel } from '@/hooks/useKeyboardShortcuts'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { useLayoutStore, type LayoutStore } from '@/stores/layoutStore'
import { AnimatePresence, m } from 'motion/react'
import React, { useEffect, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

export const ShortcutsOverlay: React.FC = React.memo(() => {
  const isMobile = useIsMobile()
  const { showShortcuts, setShowShortcuts } = useLayoutStore(
    useShallow((state: LayoutStore) => ({
      showShortcuts: state.showShortcuts,
      setShowShortcuts: state.setShowShortcuts,
    }))
  )

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showShortcuts) {
        setShowShortcuts(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showShortcuts, setShowShortcuts])

  const handleClose = useCallback(() => {
    setShowShortcuts(false)
  }, [setShowShortcuts])

  const handleOverlayClick = useCallback(() => {
    setShowShortcuts(false)
  }, [setShowShortcuts])

  const handlePropagationStop = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  // Don't render on mobile devices - keyboard shortcuts are not useful without a physical keyboard
  if (isMobile) {
    return null
  }

  return (
    <AnimatePresence>
      {showShortcuts && (
        <m.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg-overlay)] backdrop-blur-sm p-4"
          onClick={handleOverlayClick}
          data-testid="shortcuts-overlay"
        >
          <m.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="glass-panel rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto custom-scrollbar flex flex-col"
            onClick={handlePropagationStop}
          >
            <div className="flex items-center justify-between p-6 border-b border-[var(--border-subtle)] sticky top-0 bg-[var(--bg-panel)] backdrop-blur z-10">
              <h2 className="text-xl font-bold text-accent tracking-tight">Keyboard Shortcuts</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                ariaLabel="Close"
                data-testid="shortcuts-close"
                className="p-1.5"
              >
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
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </Button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              {SHORTCUTS.map((shortcut, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between group py-2 border-b border-[var(--border-subtle)] last:border-0"
                >
                  <span className="text-sm text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                    {shortcut.description}
                  </span>
                  <div className="flex gap-1">
                    {getShortcutLabel(shortcut)
                      .split(' ')
                      .map((key, i) => (
                        <kbd
                          key={i}
                          className="min-w-[24px] px-2 py-1 bg-[var(--bg-active)] border border-[var(--border-subtle)] rounded text-xs font-mono text-accent text-center shadow-sm"
                        >
                          {key}
                        </kbd>
                      ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-hover)] text-center text-xs text-[var(--text-tertiary)]">
              Press{' '}
              <kbd className="px-1 py-0.5 bg-[var(--bg-active)] rounded font-mono text-[var(--text-secondary)]">
                ?
              </kbd>{' '}
              to toggle this menu anytime
            </div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
})

ShortcutsOverlay.displayName = 'ShortcutsOverlay'
