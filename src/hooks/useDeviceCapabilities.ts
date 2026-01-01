/**
 * Device Capabilities Detection Hook
 *
 * Runs once at app startup to detect device capabilities and apply
 * appropriate defaults for mobile devices.
 *
 * This hook:
 * 1. Detects WebGL2 support and GPU tier
 * 2. Stores results in performanceStore
 * 3. Applies mobile-optimized defaults (resolution scale, max FPS)
 *
 * @module hooks/useDeviceCapabilities
 */

import {
  detectDeviceCapabilities,
  MOBILE_DEFAULT_MAX_FPS,
  MOBILE_DEFAULT_RESOLUTION_SCALE,
} from '@/lib/deviceCapabilities'
import { useLightingStore } from '@/stores/lightingStore'
import {
  hasPersistedMaxFps,
  hasPersistedResolutionScale,
  usePerformanceStore,
} from '@/stores/performanceStore'
import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

/**
 * Hook to detect device capabilities and apply mobile defaults.
 *
 * Should be called once in the root App component.
 * Detection is async but non-blocking.
 *
 * @returns Object with webgl2Supported boolean for conditional rendering
 */
export function useDeviceCapabilities(): { webgl2Supported: boolean } {
  const hasRun = useRef(false)

  // Combined selector with useShallow to prevent unnecessary re-renders (CIB-002)
  const { deviceCapabilitiesDetected, gpuTier } = usePerformanceStore(
    useShallow((s) => ({
      deviceCapabilitiesDetected: s.deviceCapabilitiesDetected,
      gpuTier: s.gpuTier,
    }))
  )

  // Get webgl2 support from detection result, default to true until detected
  const webgl2Supported = deviceCapabilitiesDetected ? gpuTier > 0 : true

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
      if (capabilities.isMobileGPU && capabilities.webgl2Supported) {
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

        if (import.meta.env.DEV) {
          console.log('[DeviceCapabilities] Mobile GPU detected:', {
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
        }
      } else if (import.meta.env.DEV) {
        console.log('[DeviceCapabilities] Detection complete:', {
          webgl2: capabilities.webgl2Supported,
          tier: capabilities.gpuTier,
          gpu: capabilities.gpuName,
          isMobile: capabilities.isMobileGPU,
          type: capabilities.detectionType,
        })
      }
    }

    runDetection()
  }, [])

  return { webgl2Supported }
}
