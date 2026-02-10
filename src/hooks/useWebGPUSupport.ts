/**
 * WebGPU Support Detection Hook
 *
 * Detects WebGPU availability and capabilities, integrating with the
 * renderer store for centralized state management.
 *
 * @module hooks/useWebGPUSupport
 */

import { useEffect, useRef } from 'react'
import { useRendererStore } from '@/stores/rendererStore'
import type { WebGPUCapabilityInfo, WebGPUAdapterMode } from '@/stores/rendererStore'

// ============================================================================
// Types
// ============================================================================

export interface UseWebGPUSupportResult {
  /** Whether detection is still in progress */
  isChecking: boolean
  /** Whether WebGPU is supported */
  isSupported: boolean
  /** Whether detection has completed */
  isComplete: boolean
  /** Detailed capability info */
  capabilities: WebGPUCapabilityInfo | null
  /** Current renderer mode */
  mode: 'webgpu'
}

// ============================================================================
// Detection Logic
// ============================================================================

/**
 * Check if WebGPU is available in the current browser.
 */
function isWebGPUInBrowser(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}

interface AdapterInfoWithFallback extends Partial<GPUAdapterInfo> {
  isFallbackAdapter?: boolean
}

interface AdapterWithFallbackHints extends GPUAdapter {
  isFallbackAdapter?: boolean
  info?: AdapterInfoWithFallback
}

interface AdapterModeDetectionResult {
  isFallbackAdapter?: boolean
  adapterMode: WebGPUAdapterMode
  adapterModeEstimated: boolean
}

/**
 * Derive hardware/software adapter mode.
 *
 * Priority:
 * 1) Explicit fallback flag (adapter or adapter.info)
 * 2) Heuristic estimate from adapter metadata tokens
 */
function detectAdapterMode(adapter: AdapterWithFallbackHints): AdapterModeDetectionResult {
  const adapterInfo = adapter.info

  const explicitFallbackFlag =
    typeof adapter.isFallbackAdapter === 'boolean'
      ? adapter.isFallbackAdapter
      : typeof adapterInfo?.isFallbackAdapter === 'boolean'
        ? adapterInfo.isFallbackAdapter
        : undefined

  if (typeof explicitFallbackFlag === 'boolean') {
    return {
      isFallbackAdapter: explicitFallbackFlag,
      adapterMode: explicitFallbackFlag ? 'software' : 'hardware',
      adapterModeEstimated: false,
    }
  }

  const adapterFingerprint = [
    adapterInfo?.vendor,
    adapterInfo?.architecture,
    adapterInfo?.device,
    adapterInfo?.description,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase()

  const looksLikeSoftwareAdapter =
    /(swiftshader|warp|llvmpipe|software adapter|software rasterizer)/i.test(adapterFingerprint)

  return {
    isFallbackAdapter: undefined,
    adapterMode: looksLikeSoftwareAdapter ? 'software' : 'hardware',
    adapterModeEstimated: true,
  }
}

/**
 * Perform full WebGPU capability detection.
 */
async function detectWebGPUCapabilities(): Promise<WebGPUCapabilityInfo> {
  // Check browser support
  if (!isWebGPUInBrowser()) {
    return {
      supported: false,
      unavailableReason: 'not_in_browser',
    }
  }

  try {
    // Request adapter
    const adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance',
    })

    if (!adapter) {
      return {
        supported: false,
        unavailableReason: 'no_adapter',
      }
    }

    // Get adapter info - use synchronous info property (modern WebGPU)
    // Cast to access info property which may not be in all type definitions
    const adapterWithHints = adapter as AdapterWithFallbackHints
    const adapterInfo = adapterWithHints.info
    const adapterModeResult = detectAdapterMode(adapterWithHints)

    // Try to create a device to verify full support
    try {
      const device = await adapter.requestDevice()

      // Device created successfully - WebGPU is fully supported
      // Destroy the test device immediately
      device.destroy()

      return {
        supported: true,
        vendor: adapterInfo?.vendor || undefined,
        architecture: adapterInfo?.architecture || undefined,
        device: adapterInfo?.device || undefined,
        isFallbackAdapter: adapterModeResult.isFallbackAdapter,
        adapterMode: adapterModeResult.adapterMode,
        adapterModeEstimated: adapterModeResult.adapterModeEstimated,
      }
    } catch (deviceError) {
      console.warn('[useWebGPUSupport] Failed to create device:', deviceError)
      return {
        supported: false,
        vendor: adapterInfo?.vendor || undefined,
        architecture: adapterInfo?.architecture || undefined,
        device: adapterInfo?.device || undefined,
        isFallbackAdapter: adapterModeResult.isFallbackAdapter,
        adapterMode: adapterModeResult.adapterMode,
        adapterModeEstimated: adapterModeResult.adapterModeEstimated,
        unavailableReason: 'initialization_error',
      }
    }
  } catch (error) {
    console.warn('[useWebGPUSupport] Detection error:', error)
    return {
      supported: false,
      unavailableReason: 'initialization_error',
    }
  }
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for detecting WebGPU support and managing renderer selection.
 *
 * On mount, this hook:
 * 1. Checks if WebGPU is available in the browser
 * 2. Attempts to request an adapter and create a test device
 * 3. Updates the renderer store with capabilities
 * 4. Applies the appropriate renderer mode based on user preference
 *
 * @example
 * ```tsx
 * function App() {
 *   const { isChecking, isSupported, mode } = useWebGPUSupport()
 *
 *   if (isChecking) {
 *     return <LoadingSpinner />
 *   }
 *
 *   return mode === 'webgpu' ? <WebGPUScene /> : <WebGPUUnavailableNotice />
 * }
 * ```
 */
export function useWebGPUSupport(): UseWebGPUSupportResult {
  const hasDetected = useRef(false)

  const webgpuStatus = useRendererStore((state) => state.webgpuStatus)
  const capabilities = useRendererStore((state) => state.webgpuCapabilities)
  const detectionComplete = useRendererStore((state) => state.detectionComplete)
  const mode = useRendererStore((state) => state.mode)

  const setWebGPUStatus = useRendererStore((state) => state.setWebGPUStatus)
  const completeDetection = useRendererStore((state) => state.completeDetection)

  useEffect(() => {
    // Only run detection once
    if (hasDetected.current || detectionComplete) {
      return
    }
    hasDetected.current = true

    const runDetection = async () => {
      setWebGPUStatus('checking')

      const caps = await detectWebGPUCapabilities()

      if (caps.supported) {
        console.log('[useWebGPUSupport] WebGPU supported:', caps)
      } else {
        console.log('[useWebGPUSupport] WebGPU not available:', caps.unavailableReason)
      }

      completeDetection(caps)
    }

    runDetection()
  }, [detectionComplete, setWebGPUStatus, completeDetection])

  return {
    isChecking: webgpuStatus === 'checking' || webgpuStatus === 'unknown',
    isSupported: capabilities?.supported ?? false,
    isComplete: detectionComplete,
    capabilities,
    mode,
  }
}

/**
 * Synchronous check for WebGPU browser API availability.
 * Does not verify adapter/device - use useWebGPUSupport for full detection.
 */
export function hasWebGPUAPI(): boolean {
  return isWebGPUInBrowser()
}
