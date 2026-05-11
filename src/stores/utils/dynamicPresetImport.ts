/**
 * Dynamic-import wrapper used by every preset setter.
 *
 * The setters that apply a preset by lazily loading the preset module
 * (`@/lib/physics/bec/presets`, `@/lib/physics/dirac/presets`, etc.) all
 * shared the same shape:
 *
 *   return import('@/...')
 *     .then(handler)
 *     .catch(err => logger.warn(`[label] Failed to load X for 'id':`, err))
 *
 * Centralised so the failure path is uniform across setters: same log
 * format, same swallow-then-let-state-stand semantics, and a single
 * place to add telemetry should that become necessary. Replaces five
 * near-identical try/catch blocks across:
 *
 *   - `becSetters.ts`
 *   - `diracSetters.ts` (preset apply + color-algo sync)
 *   - `wheelerDeWittSetters.ts`
 *   - `schroedingerSlice.applyQuantumWalkPreset`
 *
 * The first argument is a *thunk* that returns the import promise, not
 * a path string: Vite needs the literal `import('@/...')` to appear at
 * the call site for static-analysis chunking. Wrapping in a thunk keeps
 * that intact while letting the helper own the catch.
 *
 * @module stores/utils/dynamicPresetImport
 */

import { logger } from '@/lib/logger'

let dynamicPresetApplyGeneration = 0

/**
 * Start a dynamic preset apply and return a guard for stale async completions.
 */
export function beginDynamicPresetApply(): () => boolean {
  const generation = dynamicPresetApplyGeneration
  return () => generation === dynamicPresetApplyGeneration
}

/** Invalidate in-flight dynamic preset applies after store/session reset. */
export function invalidateDynamicPresetApplies(): void {
  dynamicPresetApplyGeneration += 1
}

/**
 * Lazy-load a preset module, run the handler, swallow load failures
 * with a contextual warn. The returned promise settles after the handler
 * completes, so tests and scripted flows can await preset application instead
 * of racing the dynamic import queue.
 *
 * @param importThunk - `() => import('@/lib/physics/.../presets')`. The
 *   literal `import(…)` MUST sit inside this thunk so Vite's bundler
 *   can statically analyse the chunk graph; passing a path string would
 *   defeat tree-shaking.
 * @param label       Setter identifier surfaced in the warn
 *                    (e.g. `becSetters`).
 * @param description One-line description of what's being loaded for
 *                    the warn message (e.g. `BEC presets for 'tightTrap'`).
 * @param onModule    Handler invoked with the resolved module exports.
 *                    Anything thrown / rejected from this callback is
 *                    treated the same as an import failure.
 */
export function loadPresetModule<T>(
  importThunk: () => Promise<T>,
  label: string,
  description: string,
  onModule: (mod: T) => void | Promise<void>
): Promise<void> {
  return (async () => {
    try {
      const mod = await importThunk()
      await onModule(mod)
    } catch (error) {
      // Chunk load can fail on network error or a stale chunk hash.
      // Log and leave the store untouched so a failed preset apply
      // doesn't bubble up as an unhandled rejection.
      logger.warn(`[${label}] Failed to load ${description}:`, error)
    }
  })()
}
