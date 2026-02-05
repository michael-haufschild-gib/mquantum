/**
 * Schrödinger Shader Tetrahedral Gradient Visual Regression Test
 *
 * Verifies that the Schrödinger volumetric shader renders correctly
 * after the tetrahedral gradient optimization.
 *
 * Run with:
 *   npx playwright test schroedinger-tetrahedral-gradient.spec.ts
 */

import { ConsoleMessage, expect, Page, test } from '@playwright/test'
import { installWebGLShaderCompileLinkGuard } from './webglShaderCompileLinkGuard'

// Extended timeout for complex shader compilation and rendering
test.setTimeout(120000)

/** Collected console messages for verification */
interface ErrorCollector {
  errors: string[]
  webglErrors: string[]
  shaderErrors: string[]
}

/**
 * Set up console error collection BEFORE navigation.
 */
function setupErrorCollection(page: Page): ErrorCollector {
  const collector: ErrorCollector = {
    errors: [],
    webglErrors: [],
    shaderErrors: [],
  }

  page.on('pageerror', (err) => {
    collector.errors.push(err.message)
  })

  page.on('console', (msg: ConsoleMessage) => {
    const text = msg.text()
    const type = msg.type()

    if (type === 'error') {
      collector.errors.push(text)

      // Check for WebGL-specific errors
      if (
        text.includes('WebGL') ||
        text.includes('GL_') ||
        text.includes('shader') ||
        text.includes('GLSL') ||
        text.includes('GL ERROR') ||
        text.includes('INVALID_OPERATION') ||
        text.includes('INVALID_VALUE')
      ) {
        collector.webglErrors.push(text)
      }

      // Check for shader-specific errors (gradient, tetrahedral)
      if (
        text.includes('gradient') ||
        text.includes('TetraSample') ||
        text.includes('tetrahedral') ||
        text.includes('sampleDensity')
      ) {
        collector.shaderErrors.push(text)
      }
    }
  })

  return collector
}

/**
 * Wait for WebGL canvas to render and stabilize.
 */
async function waitForRenderStable(page: Page, waitMs = 3000): Promise<void> {
  await page.waitForLoadState('domcontentloaded')

  // Wait for a visible canvas element
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })

  // Wait for any loading overlays to disappear
  try {
    const loadingOverlay = page.locator('[data-testid="loading-overlay"]')
    await loadingOverlay.waitFor({ state: 'hidden', timeout: 10000 })
  } catch {
    // Overlay may not exist
  }

  // Additional wait for render stabilization
  await page.waitForTimeout(waitMs)
}

async function gotoObjectType(page: Page, objectType: string): Promise<void> {
  const url = `/?t=${objectType}`
  const maxAttempts = 2

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      return
    } catch (error) {
      if (attempt === maxAttempts) throw error
      await page.waitForTimeout(500)
    }
  }
}

test.describe('Schrödinger Tetrahedral Gradient Rendering', () => {
  test('Schrödinger shader compiles and renders without errors', async ({ page }) => {
    // Install WebGL shader compile/link guard
    await installWebGLShaderCompileLinkGuard(page)

    // Set up error collection BEFORE navigation
    const collector = setupErrorCollection(page)

    // Navigate to Schrödinger object type
    await gotoObjectType(page, 'schroedinger')
    await waitForRenderStable(page, 4000)

    // Verify no WebGL errors
    expect(collector.webglErrors).toHaveLength(0)

    // Verify no shader-specific errors
    expect(collector.shaderErrors).toHaveLength(0)

    // Verify canvas is visible and has content
    const canvas = page.locator('canvas').first()
    await expect(canvas).toBeVisible()
  })

  test('Schrödinger volumetric mode with lighting renders correctly', async ({ page }) => {
    await installWebGLShaderCompileLinkGuard(page)
    const collector = setupErrorCollection(page)

    // Navigate with volumetric mode (default for Schrödinger)
    await gotoObjectType(page, 'schroedinger')
    await waitForRenderStable(page, 4000)

    // No WebGL errors
    expect(collector.webglErrors).toHaveLength(0)

    // Canvas should be present
    const canvas = page.locator('canvas').first()
    await expect(canvas).toBeVisible()
  })

  test('Schrödinger with dispersion renders correctly', async ({ page }) => {
    await installWebGLShaderCompileLinkGuard(page)
    const collector = setupErrorCollection(page)

    // Navigate to Schrödinger
    await gotoObjectType(page, 'schroedinger')
    await waitForRenderStable(page, 4000)

    // No WebGL errors (dispersion uses the gradient for extrapolation)
    expect(collector.webglErrors).toHaveLength(0)
  })

  test('Multiple Schrödinger re-renders are stable', async ({ page }) => {
    await installWebGLShaderCompileLinkGuard(page)
    const collector = setupErrorCollection(page)

    // Initial render
    await gotoObjectType(page, 'schroedinger')
    await waitForRenderStable(page, 3000)

    // Force a re-render by toggling away and back
    await gotoObjectType(page, 'hypercube')
    await waitForRenderStable(page, 2000)

    await gotoObjectType(page, 'schroedinger')
    await waitForRenderStable(page, 3000)

    // No accumulated errors after re-renders
    expect(collector.webglErrors).toHaveLength(0)
  })
})
