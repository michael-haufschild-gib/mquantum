/**
 * Type-safe store access for WebGPU render passes.
 *
 * Provides a single accessor function and shared snapshot interfaces
 * so that all passes (post-processing, renderers, compute) access
 * frame-context stores consistently instead of raw `ctx.frame?.stores?.['…']` casts.
 *
 * @module rendering/webgpu/core/storeAccess
 */

import type { WebGPURenderContext } from './types'

/**
 * Type-safe store snapshot accessor from the frame context.
 *
 * @param ctx - Current render context
 * @param key - Store name as registered via `graph.setStoreGetter()`
 * @returns The store snapshot cast to `T`, or `undefined` if unavailable
 */
export function getStoreSnapshot<T>(ctx: WebGPURenderContext, key: string): T | undefined {
  const snapshot = ctx.frame?.stores?.[key]
  return snapshot as T | undefined
}

// ---------------------------------------------------------------------------
// Shared snapshot interfaces
// ---------------------------------------------------------------------------

/** Camera matrix container (accepts both Float32Array and number[]) */
export type CameraMatrix = { elements: ArrayLike<number> }

/** Camera state snapshot from the frame context. */
export interface CameraSnapshot {
  viewMatrix?: CameraMatrix
  projectionMatrix?: CameraMatrix
  viewProjectionMatrix?: CameraMatrix
  inverseViewMatrix?: CameraMatrix
  inverseProjectionMatrix?: CameraMatrix
  position?: { x: number; y: number; z: number }
  target?: { x: number; y: number; z: number }
  near?: number
  far?: number
  fov?: number
}

/**
 * Lightweight animation snapshot for passes that only need timing / play state.
 * Full AnimationState lives in the store — this captures only what passes commonly read.
 */
export interface AnimationSnapshot {
  isPlaying?: boolean
  accumulatedTime?: number
}
