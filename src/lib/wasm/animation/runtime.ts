/**
 * Runtime singleton + initialization for the animation WASM module.
 *
 * The module is loaded once per page via {@link initAnimationWasm}. Every
 * wrapper in this directory consults {@link getWasmRuntime} to discover the
 * current state — the module is module-local so that test harnesses
 * (`import.meta.env.MODE === 'test'`) and Web Workers without `globalThis`
 * fall through to JS implementations without paying for a failed
 * `import()`.
 *
 * Initialization is idempotent: a second call returns the in-flight
 * promise rather than re-importing.
 *
 * @module lib/wasm/animation/runtime
 */

import { logger } from '@/lib/logger'

import type { WasmModule } from './types'

let wasmModule: WasmModule | null = null
let wasmInitPromise: Promise<void> | null = null
let wasmReady = false

/**
 * Snapshot of the WASM runtime exposed to per-phase wrappers.
 *
 * `module` is non-null exactly when `ready` is true; checking `ready` is
 * sufficient as a precondition for invoking a guarded binding.
 */
export interface WasmRuntime {
  readonly ready: boolean
  readonly module: WasmModule | null
}

/**
 * Returns the current WASM runtime view. Cheap (no allocation in the hot
 * path: callers should destructure or check `ready` directly).
 */
export function getWasmRuntime(): WasmRuntime {
  return { ready: wasmReady, module: wasmModule }
}

/**
 * Initialize the animation WASM module.
 *
 * Safe to call multiple times — concurrent callers see the same in-flight
 * promise and the second-call no-op once initialization has completed.
 * Skipped in Vitest (`MODE === 'test'`) so the JS fallbacks are exercised
 * instead of the WASM kernels.
 *
 * @returns Promise that resolves when WASM is ready or has failed to load
 *          (the failure path silently keeps the runtime in JS-fallback
 *          mode; callers must continue to handle null returns).
 */
export async function initAnimationWasm(): Promise<void> {
  if (wasmReady) {
    return
  }
  if (wasmInitPromise) {
    return wasmInitPromise
  }

  wasmInitPromise = (async () => {
    // Skip WASM loading in test environments. Web workers lack `window`
    // but should still load WASM — use `globalThis` as the universal check.
    if (import.meta.env.MODE === 'test' || typeof globalThis === 'undefined') {
      return
    }

    try {
      // Dynamic import — the module path must be a literal for Vite analysis.
      const wasm = await import('@/wasm/mdimension_core/pkg/mdimension_core.js')
      await wasm.default()
      wasmModule = wasm as unknown as WasmModule
      wasmReady = true
      logger.log('[AnimationWASM] Initialized successfully')
    } catch (err) {
      const wasmError = err instanceof Error ? err : new Error(String(err))
      logger.warn('[AnimationWASM] Initialization failed, using JS fallback:', wasmError.message)
    }
  })()

  return wasmInitPromise
}

/**
 * Returns true if the WASM module has finished loading and is ready for use.
 */
export function isAnimationWasmReady(): boolean {
  return wasmReady
}
