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
import { usePerformanceStore } from '@/stores/performanceStore'
import { useUIStore } from '@/stores/uiStore'
import { useEffect, useRef } from 'react'

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
  const deviceCapabilitiesDetected = usePerformanceStore(
    (s) => s.deviceCapabilitiesDetected
  )

  // Get webgl2 support from detection result, default to true until detected
  const gpuTier = usePerformanceStore((s) => s.gpuTier)
  const webgl2Supported = deviceCapabilitiesDetected ? gpuTier > 0 : true

  useEffect(() => {
    // Only run once
    if (hasRun.current) return
    hasRun.current = true

    const runDetection = async () => {
      const capabilities = await detectDeviceCapabilities()

      // Store capabilities
      usePerformanceStore.getState().setDeviceCapabilities(capabilities)

      // Apply mobile defaults if detected
      if (capabilities.isMobileGPU && capabilities.webgl2Supported) {
        usePerformanceStore
          .getState()
          .setRenderResolutionScale(MOBILE_DEFAULT_RESOLUTION_SCALE)
        useUIStore.getState().setMaxFps(MOBILE_DEFAULT_MAX_FPS)

        if (import.meta.env.DEV) {
          console.log('[DeviceCapabilities] Mobile GPU detected, applied defaults:', {
            tier: capabilities.gpuTier,
            gpu: capabilities.gpuName,
            renderResolutionScale: MOBILE_DEFAULT_RESOLUTION_SCALE,
            maxFps: MOBILE_DEFAULT_MAX_FPS,
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
