/**
 * Structured logger that tree-shakes in production builds.
 *
 * All methods are no-ops when `import.meta.env.DEV` is false,
 * which Vite statically replaces and dead-code-eliminates at build time.
 * This replaces scattered `console.log/warn/error` calls throughout the
 * codebase with a single, controllable logging interface.
 *
 * Usage:
 * ```ts
 * import { logger } from '@/lib/logger'
 * logger.warn('[StoreName]', 'Invalid value:', value)
 * logger.error('[WebGPU]', 'Pipeline creation failed:', err)
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
 * Log an error. Stripped in production.
 * @param args - Arguments passed to console.error
 */
export function error(...args: unknown[]): void {
  if (import.meta.env.DEV) {
    console.error(...args)
  }
}

/**
 * Structured logger namespace.
 * All methods are no-ops in production (tree-shaken by Vite).
 */
export const logger = { log, warn, error } as const
