/**
 * Quantum rendering tests with pixel verification.
 *
 * Verifies that each quantum mode:
 * 1. Initializes the WebGPU renderer (data-renderer-state="ready")
 * 2. Produces rendered frames (data-frame-count > 0)
 * 3. Emits no fatal GPU errors
 * 4. Actually renders visible content (pixel readback shows >1 color)
 *
 * Pixel verification uses the app's own GPU buffer readback
 * (captureScreenshotAsync) — the only reliable way to read a WebGPU canvas.
 *
 * Bugs caught:
 * - Shader compilation error for a specific quantum mode
 * - Pipeline workgroup size exceeds device limit
 * - Render loop runs but produces blank frames (clear color only)
 * - Dimension change triggers crash in shader recompilation
 * - Renderer stuck in "initializing" (async init never resolves)
 * - Fatal GPU errors (render graph cycles, device lost)
 * - Mode switch leaves stale pipeline producing wrong output
 */

import { expect, test } from '@playwright/test'

import {
  collectFatalGpuErrors,
  collectGpuWarningsAndErrors,
  expectCanvasNotBlank,
  getFrameCount,
  gotoMode,
  hasWebGPU,
  waitForFirstFrame,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForRendererSettled,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.setTimeout(360_000)

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('quantum mode rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    test.skip(!(await hasWebGPU(page)), 'WebGPU not available')
  })

  const modes = [
    { mode: 'harmonicOscillator', dim: 3, label: 'HO 3D' },
    { mode: 'harmonicOscillator', dim: 5, label: 'HO 5D' },
    { mode: 'hydrogenND', dim: 3, label: 'Hydrogen 3D' },
    { mode: 'hydrogenND', dim: 4, label: 'Hydrogen 4D' },
    { mode: 'hydrogenND', dim: 5, label: 'Hydrogen 5D (odd D, half-int λ)' },
    { mode: 'hydrogenND', dim: 7, label: 'Hydrogen 7D' },
    { mode: 'hydrogenND', dim: 11, label: 'Hydrogen 11D (max dim)' },
    { mode: 'freeScalarField', dim: 3, label: 'Free Scalar Field' },
    { mode: 'tdseDynamics', dim: 3, label: 'TDSE' },
    { mode: 'becDynamics', dim: 3, label: 'BEC' },
    { mode: 'diracEquation', dim: 3, label: 'Dirac' },
    { mode: 'harmonicOscillator', dim: 11, label: 'HO 11D (max dim)' },
  ] as const

  for (const { mode, dim, label } of modes) {
    test(`${label}: renders non-blank pixels with no fatal errors`, async ({ page }) => {
      const gpuErrors = collectFatalGpuErrors(page)
      const gpuWarnings = collectGpuWarningsAndErrors(page)

      await gotoMode(page, mode, dim)
      await waitForRendererReady(page)

      // Wait for shader compilation to finish AND at least one frame
      // rendered with the new pipeline. This is critical: the render loop
      // keeps showing the old graph during compilation, so pixel checks
      // before this point would measure the wrong configuration.
      await waitForShaderCompilation(page)

      // Assert shader/pipeline health BEFORE pixel check — a blank canvas
      // caused by a shader compilation error should report the shader error,
      // not "canvas is blank".
      expect(gpuErrors, `${label}: no fatal GPU errors`).toEqual([])
      expect(gpuWarnings, `${label}: no shader/pipeline warnings or errors`).toEqual([])

      // Verify actual pixels were rendered (not just blank clear color)
      await expectCanvasNotBlank(page)
    })
  }

  test('switching modes: renderer recovers and renders each mode', async ({ page }) => {
    const gpuErrors = collectFatalGpuErrors(page)
    const gpuWarnings = collectGpuWarningsAndErrors(page)

    for (const mode of ['harmonicOscillator', 'hydrogenND', 'harmonicOscillator'] as const) {
      await gotoMode(page, mode, 3)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)
      await expectCanvasNotBlank(page)
    }

    expect(gpuErrors).toEqual([])
    expect(gpuWarnings, 'no shader/pipeline warnings during mode switching').toEqual([])
  })

  test('animation loop: frame count increases over time', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForFirstFrame(page)

    const count1 = await getFrameCount(page)
    const count2 = await waitForFrameAdvance(page, count1)

    expect(count2, 'Frame count should increase').toBeGreaterThan(count1)
  })

  test('renderer settles to ready or error, never stuck at initializing', async ({ page }) => {
    await page.goto('/')
    const state = await waitForRendererSettled(page)
    expect(['ready', 'error']).toContain(state)
  })

  test('dimension change does not crash renderer and renders new dimension', async ({ page }) => {
    const gpuErrors = collectFatalGpuErrors(page)

    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await gotoMode(page, 'harmonicOscillator', 7)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await expectCanvasNotBlank(page)

    expect(gpuErrors).toEqual([])
  })

  test('rapid mode switching does not crash renderer', async ({ page }) => {
    const gpuErrors = collectFatalGpuErrors(page)

    // Quick succession — only the last navigation's shader needs to compile
    const modeSequence = ['harmonicOscillator', 'tdseDynamics', 'becDynamics', 'hydrogenND']

    for (const mode of modeSequence) {
      await gotoMode(page, mode, 3)
    }

    // After the last navigation, wait for full pipeline compilation
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await expectCanvasNotBlank(page)

    expect(gpuErrors).toEqual([])
  })
})

test.describe('WebGPU fallback', () => {
  test('shows fallback message when WebGPU unavailable', async ({ page }) => {
    await page.goto('/')
    test.skip(await hasWebGPU(page), 'WebGPU is available — fallback not triggered')

    await expect(page.getByText('WebGPU Required')).toBeVisible({ timeout: 15_000 })
  })
})
