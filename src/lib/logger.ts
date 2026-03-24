/**
 * Structured logger with level-based production behavior.
 *
 * Level semantics:
 * - `log` / `warn`: development-only, tree-shaken in production via
 *   `import.meta.env.DEV` guard (Vite dead-code-eliminates the branch).
 * - `error`: always emits to `console.error` in both dev and production.
 *   Errors represent conditions that need diagnosability (GPU device lost,
 *   shader compilation failures, initialization errors). Stripping them
 *   in production makes failures invisible.
 *
 * Do NOT wrap logger calls in `if (import.meta.env.DEV)` — the logger
 * already handles gating internally. Redundant guards are dead code.
 *
 * Enforced by `no-console` ESLint rule: raw `console.*` calls are banned
 * in source files. Only ErrorBoundary files and this logger are exempt.
 *
 * Usage:
 * ```ts
 * import { logger } from '@/lib/logger'
 * logger.log('[Rendering]', 'Frame time:', ms)    // dev only
 * logger.warn('[StoreName]', 'Invalid value:', v)  // dev only
 * logger.error('[WebGPU]', 'Device lost:', reason) // always emits
 * ```
 *
 * @module lib/logger
 */

/**
 * Log a debug message. Stripped in production.
 * @param args - Arguments passed to console.log
 */
export function log(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.log(...args)
  }
}

/**
 * Log a warning. Stripped in production.
 * @param args - Arguments passed to console.warn
 */
export function warn(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.warn(...args)
  }
}

/**
 * Log an error. Emits in both development and production.
 *
 * Unlike `log` and `warn`, error-level messages are never stripped.
 * GPU device loss, shader compilation failures, and initialization
 * errors must remain diagnosable in production builds.
 *
 * @param args - Arguments passed to console.error
 */
export function error(...args: unknown[]): void {
  console.error(...args)
}

/**
 * Structured logger namespace.
 *
 * - `log`, `warn`: dev-only (tree-shaken in production)
 * - `error`: always emits (production-safe)
 */
export const logger = { log, warn, error } as const
