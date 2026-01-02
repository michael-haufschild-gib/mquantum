/**
 * Hook for frame callbacks with enforced priority constants.
 *
 * This hook wraps React Three Fiber's `useFrame` to enforce the use of
 * typed priority constants from the FRAME_PRIORITY enum. This ensures
 * all frame callbacks are explicitly ordered, preventing hidden dependencies
 * on component mount timing.
 *
 * @module rendering/renderers/base/useFramePriority
 *
 * ## Important: Callback Stability
 *
 * For best performance, callers should memoize their callbacks with useCallback:
 *
 * ```tsx
 * // ✅ Good - stable callback, reads state inside
 * const callback = useCallback((state, delta) => {
 *   const { value } = useMyStore.getState()
 *   // use value...
 * }, []) // Empty deps - state read via getState()
 *
 * useFramePriority('ANIMATION', callback)
 * ```
 *
 * ```tsx
 * // ❌ Avoid - inline callbacks recreated every render
 * useFramePriority('ANIMATION', (state, delta) => {
 *   // ...
 * })
 * ```
 *
 * @example
 * ```tsx
 * import { useFramePriority } from '@/rendering/renderers/base';
 *
 * // Renderer uniform updates
 * useFramePriority(
 *   'RENDERER_UNIFORMS',
 *   (state, delta) => {
 *     // Update uniforms here
 *   }
 * );
 *
 * // Post-processing updates (runs later)
 * useFramePriority(
 *   'POST_EFFECTS',
 *   () => {
 *     // Post-processing logic
 *   }
 * );
 * ```
 */

import type { RootState } from '@react-three/fiber'
import { useFrame } from '@react-three/fiber'
import { useCallback } from 'react'

import { FRAME_PRIORITY, type FramePriority } from '@/rendering/core/framePriorities'

/**
 * Priority key type - ensures only valid FRAME_PRIORITY keys are used.
 */
export type FramePriorityKey = keyof typeof FRAME_PRIORITY

/**
 * Frame callback function signature.
 * Matches the R3F useFrame callback signature.
 */
export type FrameCallback = (state: RootState, delta: number) => void

/**
 * Options for the useFramePriority hook.
 */
export interface UseFramePriorityOptions {
  /**
   * Whether the frame callback is enabled.
   * When false, the callback is not executed.
   * @default true
   */
  enabled?: boolean

  /**
   * Optional name for debugging purposes.
   * Helps identify the callback in performance profiling.
   */
  debugName?: string
}

/**
 * Hook for executing frame callbacks with enforced priority ordering.
 *
 * This hook wraps R3F's `useFrame` to ensure all frame callbacks use
 * the centralized FRAME_PRIORITY constants. This makes execution order
 * explicit and prevents subtle bugs from hidden mount-order dependencies.
 *
 * Lower priority numbers run first:
 * - ENVIRONMENT_CAPTURE (-30): Cubemap capture
 * - SKYBOX_CAPTURE (-20): Skybox to cubemap
 * - BLACK_HOLE_UNIFORMS (-10): Black hole env map dependencies
 * - CAMERA (0): Camera controller
 * - ANIMATION (0): Animation state
 * - RENDERERS (0): General renderers
 * - RENDERER_UNIFORMS (1): Renderer uniform updates
 * - POST_EFFECTS (10): Post-processing
 * - STATS (20): Performance stats (last)
 *
 * @param priorityKey - Key from FRAME_PRIORITY enum (type-safe)
 * @param callback - Frame callback function
 * @param options - Optional configuration
 *
 * @example
 * ```tsx
 * // Use string literal for type-safe priority
 * useFramePriority('RENDERER_UNIFORMS', (state, delta) => {
 *   updateMaterialUniforms(state, delta);
 * });
 *
 * // Disable callback conditionally
 * useFramePriority(
 *   'ANIMATION',
 *   (state, delta) => { animate(delta); },
 *   { enabled: isPlaying }
 * );
 *
 * // Add debug name for profiling
 * useFramePriority(
 *   'RENDERER_UNIFORMS',
 *   callback,
 *   { debugName: 'MandelbulbUniforms' }
 * );
 * ```
 */
export function useFramePriority(
  priorityKey: FramePriorityKey,
  callback: FrameCallback,
  options: UseFramePriorityOptions = {}
): void {
  const { enabled = true } = options

  // Resolve the numeric priority from the key
  const priority: FramePriority = FRAME_PRIORITY[priorityKey]

  // Memoize the wrapper callback to prevent unnecessary re-subscriptions.
  // The wrapper only changes when callback or enabled changes.
  const wrappedCallback = useCallback(
    (state: RootState, delta: number) => {
      if (!enabled) return
      callback(state, delta)
    },
    [callback, enabled]
  )

  // Use R3F's useFrame with the resolved priority
  useFrame(wrappedCallback, priority)
}

/**
 * Hook for executing frame callbacks with a numeric priority value.
 *
 * This variant accepts the numeric priority directly for cases where
 * you have already resolved the priority or need to use a computed value.
 * Prefer `useFramePriority` with string keys for better type safety.
 *
 * @param priority - Numeric priority value from FRAME_PRIORITY
 * @param callback - Frame callback function
 * @param options - Optional configuration
 *
 * @example
 * ```tsx
 * // When you have the numeric value
 * const priority = FRAME_PRIORITY.RENDERER_UNIFORMS;
 * useFramePriorityValue(priority, callback);
 * ```
 */
export function useFramePriorityValue(
  priority: FramePriority,
  callback: FrameCallback,
  options: UseFramePriorityOptions = {}
): void {
  const { enabled = true } = options

  // Memoize the wrapper callback to prevent unnecessary re-subscriptions.
  const wrappedCallback = useCallback(
    (state: RootState, delta: number) => {
      if (!enabled) return
      callback(state, delta)
    },
    [callback, enabled]
  )

  useFrame(wrappedCallback, priority)
}

/**
 * Type guard to check if a value is a valid FramePriorityKey.
 *
 * @param key - Value to check
 * @returns True if the value is a valid FRAME_PRIORITY key
 *
 * @example
 * ```tsx
 * const key = 'RENDERER_UNIFORMS';
 * if (isFramePriorityKey(key)) {
 *   const priority = FRAME_PRIORITY[key]; // Type-safe access
 * }
 * ```
 */
export function isFramePriorityKey(key: string): key is FramePriorityKey {
  return key in FRAME_PRIORITY
}

/**
 * Get the numeric priority value for a given key.
 * Useful for logging or debugging.
 *
 * @param key - FRAME_PRIORITY key
 * @returns Numeric priority value
 *
 * @example
 * ```tsx
 * console.log(getFramePriorityValue('RENDERER_UNIFORMS')); // 1
 * console.log(getFramePriorityValue('POST_EFFECTS')); // 10
 * ```
 */
export function getFramePriorityValue(key: FramePriorityKey): FramePriority {
  return FRAME_PRIORITY[key]
}

/**
 * Get all priority keys sorted by execution order (lowest first).
 * Useful for debugging and documentation.
 *
 * @returns Array of priority keys sorted by execution order
 *
 * @example
 * ```tsx
 * const order = getFramePriorityOrder();
 * // ['ENVIRONMENT_CAPTURE', 'SKYBOX_CAPTURE', 'BLACK_HOLE_UNIFORMS', ...]
 * ```
 */
export function getFramePriorityOrder(): FramePriorityKey[] {
  const entries = Object.entries(FRAME_PRIORITY) as [FramePriorityKey, FramePriority][]
  return entries.sort(([, a], [, b]) => a - b).map(([key]) => key)
}
