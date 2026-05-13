/**
 * Device Capabilities Detection Hook
 *
 * Runs once at app startup to detect device capabilities and apply
 * appropriate defaults for constrained devices.
 *
 * This hook:
 * 1. Detects GPU tier via detect-gpu benchmark database
 * 2. Stores results in performanceStore
 * 3. Applies constrained defaults (resolution scale, max FPS)
 *
 * @module hooks/useDeviceCapabilities
 */

import { useEffect, useRef } from 'react'

import {
  detectDeviceCapabilities,
  MOBILE_DEFAULT_MAX_FPS,
  MOBILE_DEFAULT_RESOLUTION_SCALE,
} from '@/lib/deviceCapabilities'
import { logger } from '@/lib/logger'
import {
  hasPersistedMaxFps,
  hasPersistedResolutionScale,
  loadPersistedMaxFps,
  loadPersistedResolutionScale,
  usePerformanceStore,
} from '@/stores/runtime/performanceStore'
import { useLightingStore } from '@/stores/scene/lightingStore'

/**
 * Hook to detect device capabilities and apply constrained defaults.
 *
 * Should be called once in the root App component.
 * Detection is async but non-blocking.
 */
export function useDeviceCapabilities(): void {
  const hasRun = useRef(false)

  useEffect(() => {
    // Only run once
    if (hasRun.current) return
    hasRun.current = true

    const runDetection = async () => {
      const capabilities = await detectDeviceCapabilities()

      // Store capabilities
      usePerformanceStore.getState().setDeviceCapabilities(capabilities)

      // Apply constrained defaults if detected AND user hasn't set a preference
      // This ensures user's explicit choices are preserved across page loads
      const useConstrainedDefaults = capabilities.isMobileGPU || capabilities.gpuTier <= 1
      if (useConstrainedDefaults) {
        const persistedResolutionScale = loadPersistedResolutionScale()
        const persistedMaxFps = loadPersistedMaxFps()
        const userHasResolutionPreference = hasPersistedResolutionScale()
        const userHasFpsPreference = hasPersistedMaxFps()
        const perfStore = usePerformanceStore.getState()

        if (persistedResolutionScale !== null) {
          perfStore.setRenderResolutionScale(persistedResolutionScale)
        } else {
          perfStore.setRenderResolutionScale(MOBILE_DEFAULT_RESOLUTION_SCALE)
        }
        if (persistedMaxFps !== null) {
          perfStore.setMaxFps(persistedMaxFps)
        } else {
          perfStore.setMaxFps(MOBILE_DEFAULT_MAX_FPS)
        }

        // Remove spotlight on constrained devices - keep only point light for performance
        const lightingStore = useLightingStore.getState()
        const spotlights = lightingStore.lights.filter((l) => l.type === 'spot')
        for (const spotlight of spotlights) {
          lightingStore.removeLight(spotlight.id)
        }

        logger.log('[DeviceCapabilities] Constrained GPU detected:', {
          tier: capabilities.gpuTier,
          gpu: capabilities.gpuName,
          isMobile: capabilities.isMobileGPU,
          userHasResolutionPreference,
          userHasFpsPreference,
          renderResolutionScale: userHasResolutionPreference
            ? perfStore.renderResolutionScale
            : MOBILE_DEFAULT_RESOLUTION_SCALE,
          maxFps: userHasFpsPreference ? 'preserved' : MOBILE_DEFAULT_MAX_FPS,
          spotlightsRemoved: spotlights.length,
        })
      } else {
        logger.log('[DeviceCapabilities] Detection complete:', {
          tier: capabilities.gpuTier,
          gpu: capabilities.gpuName,
          isMobile: capabilities.isMobileGPU,
          type: capabilities.detectionType,
        })
      }
    }

    void runDetection()
  }, [])
}
