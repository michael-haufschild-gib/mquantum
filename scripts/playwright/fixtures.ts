/**
 * Shared Playwright test fixtures for the mquantum app.
 *
 * MANDATORY: All spec files MUST import { test, expect } from './fixtures'
 * instead of '@playwright/test'. This ensures every test automatically
 * collects and asserts on GPU/shader/WGSL errors.
 *
 * Provides reusable `test` and `expect` exports that pre-wire common setup:
 * - Automatic GPU/shader/WGSL error collection on every `page` (mandatory)
 * - `appPage`: navigates to `/` and waits for top bar (React mount)
 * - `hoPage`: navigates to HO 3D mode and waits for app load
 * - `gpuPage`: navigates, waits for renderer ready + first pipeline, skips when no WebGPU
 *
 * Usage:
 * ```ts
 * import { test, expect } from './fixtures'
 *
 * test('my test', async ({ page }) => {
 *   // GPU/shader errors are collected automatically.
 *   // Test fails after completion if any were detected.
 * })
 * ```
 */

import type { Page } from '@playwright/test'
import { expect, test as base } from '@playwright/test'

import {
  requireWebGPU,
  waitForAppLoaded,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

// ─── GPU Error Patterns ──────────────────────────────────────────────────────

/**
 * Regex patterns that indicate GPU/shader/WGSL problems in console output.
 *
 * These MUST catch real Dawn/WebGPU validation messages. Chrome emits these as
 * console warnings with raw Dawn error text — not wrapped in JS error types.
 * Examples that must match:
 *   "Copy source and destination are overlapping layer ranges..."
 *   "[Invalid CommandBuffer from CommandEncoder "frame-5"] is invalid..."
 *   "[WGSL ERROR] unresolved value 'foo'"
 */
const GPU_ERROR_PATTERNS = [
  // Dawn/WebGPU validation: invalid resources, overlapping copies, encoder errors
  /Invalid CommandBuffer|Invalid.*Encoder|is invalid due to/i,
  /overlapping.*layer|overlapping.*range/i,
  /CommandEncoder|CommandBuffer.*error/i,
  // WGSL shader errors
  /\[WGSL ERROR\]|unresolved value|shader.*error/i,
  // Shader / pipeline errors
  /GPUPipelineError|shader.*compil|pipeline.*fail|binding.*doesn.*exist/i,
  // WebGPU validation errors (JS API level)
  /GPUValidationError|validation.*error/i,
  // Renderer-level errors
  /\[SchrodingerRenderer\].*fail|\[WebGPU.*\].*fail|\[WebGPU.*\].*error/i,
  // Device lost / fatal
  /device.*lost|rendergraph.*cycle|unhandled.*gpu/i,
  // Dawn context lines — any "While ..." prefix indicates a GPU validation problem
  /While encoding|While finishing|While calling|While initializing/i,
  // Catch-all for any console error (not warning) — console.error in production is a bug
  // This is the last pattern; warnings are filtered by the patterns above.
]

/** Console error types that should always be captured regardless of content. */
const ALWAYS_CAPTURE_TYPES = new Set(['error'])

/**
 * Attach GPU/shader error listeners to a page.
 * Captures ALL console errors unconditionally, plus warnings that match GPU patterns.
 * Returns the mutable array that accumulates issues.
 */
function attachGpuErrorCollection(page: Page): string[] {
  const issues: string[] = []

  page.on('console', (msg) => {
    const type = msg.type()
    const text = msg.text()

    // All console.error messages are captured unconditionally
    if (ALWAYS_CAPTURE_TYPES.has(type)) {
      issues.push(`[${type}] ${text}`)
      return
    }

    // Warnings only captured if they match GPU/shader patterns
    if (type === 'warning') {
      for (const pattern of GPU_ERROR_PATTERNS) {
        if (pattern.test(text)) {
          issues.push(`[${type}] ${text}`)
          return
        }
      }
    }
  })

  page.on('pageerror', (err) => {
    issues.push(`[pageerror] ${err.message}`)
  })

  return issues
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

/**
 * Extended fixture types available in tests.
 */
export interface AppFixtures {
  /** GPU/shader issues collected during the test (auto-asserted after test). */
  gpuErrors: string[]
  /** Page navigated to `/` with React tree mounted. */
  appPage: Page
  /** Page navigated to HO 3D mode with app loaded. */
  hoPage: Page
  /** Page with WebGPU ready — hard-fails if GPU unavailable (skip only with ALLOW_GPU_SKIP=1). */
  gpuPage: Page
}

export const test = base.extend<AppFixtures>({
  // Override the base `page` fixture to attach GPU error collection.
  // This runs for EVERY test — no opt-in required.
  page: async ({ page }, use) => {
    const issues = attachGpuErrorCollection(page)
    await use(page)
    // After the test body completes, fail if any GPU/shader issues were detected
    if (issues.length > 0) {
      throw new Error(
        `GPU/shader errors detected during test:\n${issues.map((i) => `  • ${i}`).join('\n')}`
      )
    }
  },

  // Expose the collected errors array for tests that want to inspect mid-test
  gpuErrors: async ({ page }, use) => {
    // The page fixture already attached listeners, but we need the array reference.
    // Re-attach is safe — multiple listeners just add to their own arrays.
    const issues = attachGpuErrorCollection(page)
    await use(issues)
  },

  appPage: async ({ page }, use) => {
    await page.goto('/')
    await waitForAppLoaded(page)
    await use(page)
  },

  hoPage: async ({ page }, use) => {
    await page.goto('/?t=schroedinger&d=3&qm=harmonicOscillator')
    await waitForAppLoaded(page)
    await use(page)
  },

  gpuPage: async ({ page }, use, testInfo) => {
    await page.goto('/')
    await waitForAppLoaded(page)
    await requireWebGPU(page, testInfo)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await use(page)
  },
})

export { expect }
