/**
 * Unified Device Capability Detection
 *
 * Single source of truth for all device capability detection:
 * - GPU tier classification (for performance scaling)
 * - Mobile device detection (for default settings)
 *
 * Uses detect-gpu library for GPU benchmarking:
 * @see https://github.com/pmndrs/detect-gpu
 */

import { logger } from '@/lib/logger'

// detect-gpu is loaded dynamically to keep it out of the critical bundle path (~134KB).
// It's only needed once at startup for GPU tier classification.
type TierResult = Awaited<ReturnType<(typeof import('detect-gpu'))['getGPUTier']>>

// ============================================================================
// Types
// ============================================================================

/** GPU performance tier (0-3) */
export type GPUTier = 0 | 1 | 2 | 3

/** Complete device capability information */
export interface DeviceCapabilities {
  /** GPU performance tier (0=fallback, 1=low, 2=medium, 3=high) */
  gpuTier: GPUTier

  /** Whether device has a mobile GPU */
  isMobileGPU: boolean

  /** GPU name/identifier (for debugging) */
  gpuName: string

  /** Detection method used by detect-gpu */
  detectionType: string

  /** Estimated FPS capability */
  estimatedFps: number | undefined
}

/** Default capabilities (conservative until detection completes) */
export const DEFAULT_CAPABILITIES: DeviceCapabilities = {
  gpuTier: 3, // Assume best until proven otherwise
  isMobileGPU: false,
  gpuName: 'unknown',
  detectionType: 'pending',
  estimatedFps: undefined,
}

// ============================================================================
// GPU Tier Detection
// ============================================================================

/**
 * Detect GPU capabilities using detect-gpu library.
 *
 * This is an async operation that queries a benchmark database
 * to classify the GPU into performance tiers.
 *
 * Tier meanings:
 * - 0: No WebGL, blocklisted, or <15 FPS (show fallback)
 * - 1: >= 15 FPS (basic graphics)
 * - 2: >= 30 FPS (intermediate)
 * - 3: >= 60 FPS (full quality)
 *
 * @returns Promise resolving to TierResult from detect-gpu
 */
export async function detectGPUTier(): Promise<TierResult> {
  const { getGPUTier } = await import('detect-gpu')
  return getGPUTier({
    benchmarksURL: '/gpu-benchmarks',
    failIfMajorPerformanceCaveat: false,
  })
}

// ============================================================================
// Unified Detection
// ============================================================================

/**
 * Detect all device capabilities.
 *
 * Combines WebGL2 check with GPU tier detection into a single
 * unified result. Should be called once at app startup.
 *
 * @returns Promise resolving to complete DeviceCapabilities
 */
export async function detectDeviceCapabilities(): Promise<DeviceCapabilities> {
  try {
    const tierResult = await detectGPUTier()

    return {
      gpuTier: tierResult.tier as GPUTier,
      isMobileGPU: tierResult.isMobile ?? false,
      gpuName: tierResult.gpu ?? 'unknown',
      detectionType: tierResult.type,
      estimatedFps: tierResult.fps,
    }
  } catch (error) {
    // Detection failed - assume desktop tier 3 for best experience
    logger.warn('[DeviceCapabilities] GPU detection failed:', error)

    return {
      gpuTier: 3,
      isMobileGPU: false,
      gpuName: 'detection-failed',
      detectionType: 'error',
      estimatedFps: undefined,
    }
  }
}

// ============================================================================
// Mobile Defaults
// ============================================================================

/** Default render resolution scale for mobile devices */
export const MOBILE_DEFAULT_RESOLUTION_SCALE = 0.5

/** Default render resolution scale for desktop devices */
export const DESKTOP_DEFAULT_RESOLUTION_SCALE = 0.75

/** Default max FPS for mobile devices */
export const MOBILE_DEFAULT_MAX_FPS = 30
