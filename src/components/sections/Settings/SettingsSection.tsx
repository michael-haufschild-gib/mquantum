/**
 * Settings Section Component
 * Section wrapper for app settings controls
 */

import { Section } from '@/components/sections/Section'
import { Button } from '@/components/ui/Button'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { useToast } from '@/hooks/useToast'
import { useDismissedDialogsStore } from '@/stores/dismissedDialogsStore'
import { usePerformanceStore } from '@/stores/performanceStore'
import { useUIStore } from '@/stores/uiStore'
import { clearMemoryCache } from '@/lib/geometry/wythoff/cache'
import React, { useState, useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

/** Database name - must match IndexedDBCache.ts */
const GEOMETRY_CACHE_DB_NAME = 'mdimension-cache'

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
    const [showClearIndexDBModal, setShowClearIndexDBModal] = useState(false)
    const [showClearLocalStorageModal, setShowClearLocalStorageModal] = useState(false)
    const { addToast } = useToast()

    const { dismissedCount, resetAllDismissed } = useDismissedDialogsStore(
      useShallow((state) => ({
        dismissedCount: state.getDismissedCount(),
        resetAllDismissed: state.resetAll,
      }))
    )

    const { showAxisHelper, setShowAxisHelper } = useUIStore(
      useShallow((state) => ({
        showAxisHelper: state.showAxisHelper,
        setShowAxisHelper: state.setShowAxisHelper,
      }))
    )
    const { renderResolutionScale, setRenderResolutionScale, maxFps, setMaxFps } =
      usePerformanceStore(
        useShallow((state) => ({
          renderResolutionScale: state.renderResolutionScale,
          setRenderResolutionScale: state.setRenderResolutionScale,
          maxFps: state.maxFps,
          setMaxFps: state.setMaxFps,
        }))
      )

    const handleClearGeometryCache = useCallback(async () => {
      try {
        // Clear in-memory cache first
        clearMemoryCache()

        // Delete only our app's geometry cache database
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase(GEOMETRY_CACHE_DB_NAME)
          request.onsuccess = () => resolve()
          request.onerror = () => reject(request.error)
          request.onblocked = () => {
            // Database is in use - will be deleted on next app load
            console.warn('[Settings] Database delete blocked, will clear on next load')
            resolve()
          }
        })

        addToast('Geometry cache cleared', 'success')
      } catch {
        addToast('Failed to clear geometry cache', 'error')
      }
    }, [addToast])

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

    const handleOpenClearIndexDBModal = useCallback(() => {
      setShowClearIndexDBModal(true)
    }, [])

    const handleCloseClearIndexDBModal = useCallback(() => {
      setShowClearIndexDBModal(false)
    }, [])

    const handleOpenClearLocalStorageModal = useCallback(() => {
      setShowClearLocalStorageModal(true)
    }, [])

    const handleCloseClearLocalStorageModal = useCallback(() => {
      setShowClearLocalStorageModal(false)
    }, [])

    return (
      <Section title="Settings" defaultOpen={defaultOpen}>
        <div className="mt-3 pt-3 border-t border-panel-border">
          <Switch
            checked={showAxisHelper}
            onCheckedChange={setShowAxisHelper}
            label="Show Axis Helper"
          />
        </div>
        <div className="mt-3 pt-3 border-t border-panel-border">
          <Slider
            label="Max FPS"
            value={maxFps}
            min={15}
            max={120}
            step={1}
            onChange={setMaxFps}
            unit=" fps"
            tooltip="Limit frame rate to reduce power consumption"
            data-testid="max-fps-slider"
          />
        </div>
        <div className="mt-3 pt-3 border-t border-panel-border">
          <Slider
            label="Render Resolution"
            value={renderResolutionScale}
            min={0.1}
            max={1.0}
            step={0.05}
            onChange={setRenderResolutionScale}
            formatValue={(v) => `${Math.round(v * 100)}%`}
            tooltip="100% = native resolution. Lower values reduce GPU load for mobile/low-end devices."
            data-testid="render-resolution-slider"
          />
        </div>
        <div className="mt-3 pt-3 border-t border-panel-border flex flex-col gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRestoreDismissedHints}
            disabled={dismissedCount === 0}
            data-testid="restore-hints-button"
          >
            Restore Dismissed Hints{dismissedCount > 0 ? ` (${dismissedCount})` : ''}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleOpenClearIndexDBModal}
            data-testid="clear-cache-button"
          >
            Clear Geometry Cache
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleOpenClearLocalStorageModal}
            data-testid="clear-localstorage-button"
          >
            Clear localStorage
          </Button>
        </div>

        <ConfirmModal
          isOpen={showClearIndexDBModal}
          onClose={handleCloseClearIndexDBModal}
          onConfirm={handleClearGeometryCache}
          title="Clear Geometry Cache"
          message="This will delete all cached polytope geometry. Next loads will regenerate from scratch."
          confirmText="Clear Cache"
          isDestructive
        />

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
