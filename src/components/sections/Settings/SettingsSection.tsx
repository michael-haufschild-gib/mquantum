/**
 * Settings Section Component
 * Section wrapper for app settings controls
 */

import React, { useCallback, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Section } from '@/components/sections/Section'
import { Button } from '@/components/ui/Button'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useToast } from '@/hooks/useToast'
import { useDismissedDialogsStore } from '@/stores/ui/dismissedDialogsStore'

/** Props for the application settings section. */
export interface SettingsSectionProps {
  defaultOpen?: boolean
}

/**
 * Settings section containing theme selector and developer tools.
 * Note: Debug buffer visualization has been moved to Performance Monitor > Buffers tab.
 *
 * @param props - Component props
 * @param props.defaultOpen - Whether the section is initially expanded
 * @returns Settings section
 */
export const SettingsSection: React.FC<SettingsSectionProps> = React.memo(
  ({ defaultOpen = true }) => {
    const [showClearLocalStorageModal, setShowClearLocalStorageModal] = useState(false)
    const { addToast } = useToast()

    const { dismissedCount, resetAllDismissed } = useDismissedDialogsStore(
      useShallow((state) => ({
        dismissedCount: state.getDismissedCount(),
        resetAllDismissed: state.resetAll,
      }))
    )

    const handleClearLocalStorage = useCallback(() => {
      try {
        localStorage.clear()
        addToast('localStorage cleared', 'success')
      } catch {
        addToast('Failed to clear localStorage', 'error')
      }
    }, [addToast])

    const handleRestoreDismissedHints = useCallback(() => {
      resetAllDismissed()
      addToast('All hints restored', 'success')
    }, [resetAllDismissed, addToast])

    const handleOpenClearLocalStorageModal = useCallback(() => {
      setShowClearLocalStorageModal(true)
    }, [])

    const handleCloseClearLocalStorageModal = useCallback(() => {
      setShowClearLocalStorageModal(false)
    }, [])

    return (
      <Section title="Settings" defaultOpen={defaultOpen} data-testid="section-settings">
        <div className="mt-3 pt-3 border-t border-panel-border flex flex-col gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRestoreDismissedHints}
            disabled={dismissedCount === 0}
            tooltip="Re-show all previously dismissed hint dialogs and info banners."
            data-testid="restore-hints-button"
          >
            Restore Dismissed Hints{dismissedCount > 0 ? ` (${dismissedCount})` : ''}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleOpenClearLocalStorageModal}
            tooltip="Delete all saved preferences, presets, and cached data from the browser."
            data-testid="clear-localstorage-button"
          >
            Clear localStorage
          </Button>
        </div>

        <ConfirmModal
          isOpen={showClearLocalStorageModal}
          onClose={handleCloseClearLocalStorageModal}
          onConfirm={handleClearLocalStorage}
          title="Clear localStorage"
          message="This will clear all localStorage data. This action cannot be undone."
          confirmText="Clear"
          isDestructive
        />
      </Section>
    )
  }
)

SettingsSection.displayName = 'SettingsSection'
