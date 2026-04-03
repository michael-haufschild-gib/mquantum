/**
 * Device Capabilities Detection Hook
 *
 * Runs once at app startup to detect device capabilities and apply
 * appropriate defaults for mobile devices.
 *
 * This hook:
 * 1. Detects GPU tier via detect-gpu benchmark database
 * 2. Stores results in performanceStore
 * 3. Applies mobile-optimized defaults (resolution scale, max FPS)
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
import { useLightingStore } from '@/stores/lightingStore'
import {
  hasPersistedMaxFps,
  hasPersistedResolutionScale,
  usePerformanceStore,
} from '@/stores/performanceStore'

/**
 * Hook to detect device capabilities and apply mobile defaults.
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

      // Apply mobile defaults if detected AND user hasn't set a preference
      // This ensures user's explicit choices are preserved across page loads
      if (capabilities.isMobileGPU) {
        const userHasResolutionPreference = hasPersistedResolutionScale()
        const userHasFpsPreference = hasPersistedMaxFps()
        const perfStore = usePerformanceStore.getState()

        if (!userHasResolutionPreference) {
          perfStore.setRenderResolutionScale(MOBILE_DEFAULT_RESOLUTION_SCALE)
        }
        if (!userHasFpsPreference) {
          perfStore.setMaxFps(MOBILE_DEFAULT_MAX_FPS)
        }

        // Remove spotlight on mobile - keep only point light for performance
        const lightingStore = useLightingStore.getState()
        const spotlights = lightingStore.lights.filter((l) => l.type === 'spot')
        for (const spotlight of spotlights) {
          lightingStore.removeLight(spotlight.id)
        }

        logger.log('[DeviceCapabilities] Mobile GPU detected:', {
          tier: capabilities.gpuTier,
          gpu: capabilities.gpuName,
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
