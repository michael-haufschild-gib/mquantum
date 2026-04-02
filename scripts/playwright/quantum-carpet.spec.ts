/**
 * Quantum Carpet panel e2e tests.
 *
 * Tests the spacetime diagram feature:
 * - Toggle switch in analysis section enables/disables the panel
 * - Panel controls (close, pause, clear, axis, colormap, log)
 * - Panel hidden in cinematic mode
 * - Switch not rendered for dimension < 3
 * - GPU: carpet accumulates frames, pause freezes count, clear resets
 *
 * Bugs caught:
 * - Switch not wired to carpet store
 * - Panel not mounting when store.enabled = true
 * - Panel not hiding in cinematic mode
 * - Close button not resetting store
 * - Frame accumulation not incrementing (GPU readback failure)
 * - Pause not stopping dispatch
 */

import { expect, test } from './fixtures'
import {
  gotoMode,
  requireWebGPU,
  waitForFirstFrame,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'
import { RightPanel } from './pages/RightPanel'
import { TopBar } from './pages/TopBar'

test.setTimeout(120_000)

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Navigate to TDSE 3D, open right panel Object tab, expand analysis section. */
async function setupTdseCarpetContext(page: import('@playwright/test').Page) {
  await gotoMode(page, 'tdseDynamics', 3)

  const topBar = new TopBar(page)
  await topBar.openRightPanel()

  const rightPanel = new RightPanel(page)
  await rightPanel.waitForVisible()
  // Object tab is default — analysis section should be visible
  await expect(page.getByTestId('analysis-section')).toBeVisible({ timeout: 5000 })
}

/** Enable the carpet via the toggle switch and wait for the panel to appear. */
async function enableCarpet(page: import('@playwright/test').Page) {
  const toggle = page.getByTestId('carpet-toggle')
  await expect(toggle).toBeVisible({ timeout: 5000 })
  await toggle.click()
  await expect(page.getByTestId('quantum-carpet-panel')).toBeVisible({ timeout: 5000 })
}

/** Read carpet frame count from the data attribute. */
async function getCarpetFrames(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-testid="quantum-carpet-panel"]')
    return parseInt(el?.getAttribute('data-carpet-frames') ?? '0', 10)
  })
}

// ─── DOM-only tests (no GPU required) ─────────────────────────────────────────

test.describe('quantum carpet: UI controls', () => {
  test('carpet toggle visible in TDSE 3D and enables panel', async ({ page }) => {
    await setupTdseCarpetContext(page)

    // Switch should be visible
    const toggle = page.getByTestId('carpet-toggle')
    await expect(toggle).toBeVisible()

    // Panel should NOT be visible before toggle
    await expect(page.getByTestId('quantum-carpet-panel')).not.toBeVisible()

    // Enable carpet
    await toggle.click()

    // Panel should appear
    await expect(page.getByTestId('quantum-carpet-panel')).toBeVisible({ timeout: 5000 })

    // Verify panel contains expected controls
    await expect(page.getByTestId('carpet-axis-select')).toBeVisible()
    await expect(page.getByTestId('carpet-colormap-select')).toBeVisible()
    await expect(page.getByTestId('carpet-log-toggle')).toBeVisible()
    await expect(page.getByTestId('carpet-play-pause')).toBeVisible()
    await expect(page.getByTestId('carpet-clear')).toBeVisible()
    await expect(page.getByTestId('carpet-close')).toBeVisible()
    await expect(page.getByTestId('carpet-canvas')).toBeVisible()
  })

  test('close button hides panel and resets carpet store', async ({ page }) => {
    await setupTdseCarpetContext(page)
    await enableCarpet(page)

    // Click close
    await page.getByTestId('carpet-close').click()

    // Panel should be hidden
    await expect(page.getByTestId('quantum-carpet-panel')).not.toBeVisible()

    // Store should be disabled
    const enabled = await page.evaluate(async () => {
      const mod = await import('/src/stores/carpetStore.ts')
      return mod.useCarpetStore.getState().enabled
    })
    expect(enabled).toBe(false)
  })

  test('carpet hidden in cinematic mode', async ({ page }) => {
    await setupTdseCarpetContext(page)
    await enableCarpet(page)

    // Enter cinematic mode via store
    await page.evaluate(async () => {
      const mod = await import('/src/stores/layoutStore.ts')
      mod.useLayoutStore.getState().setCinematicMode(true)
    })

    // Panel should be hidden
    await expect(page.getByTestId('quantum-carpet-panel')).not.toBeVisible()

    // Exit cinematic mode — panel should return
    await page.evaluate(async () => {
      const mod = await import('/src/stores/layoutStore.ts')
      mod.useLayoutStore.getState().setCinematicMode(false)
    })
    await expect(page.getByTestId('quantum-carpet-panel')).toBeVisible({ timeout: 5000 })
  })

  test('carpet toggle not present at dimension 2', async ({ page }) => {
    // At dim=2, analytic modes hide the analysis section entirely,
    // and compute modes auto-clamp to dim=3.
    // Verify that at dim=2, neither the analysis section nor the carpet toggle is visible.
    await gotoMode(page, 'harmonicOscillator', 2)

    const topBar = new TopBar(page)
    await topBar.openRightPanel()

    const rightPanel = new RightPanel(page)
    await rightPanel.waitForVisible()

    // Analysis section returns null for analytic modes at dim<=2
    await expect(page.getByTestId('analysis-section')).not.toBeVisible({ timeout: 3000 })

    // Carpet toggle is inside the analysis section, so also not visible
    await expect(page.getByTestId('carpet-toggle')).not.toBeVisible()
  })
})

// ─── GPU tests (require WebGPU) ──────────────────────────────────────────────

test.describe('quantum carpet: GPU accumulation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?t=schroedinger&d=3&qm=tdseDynamics')
    await requireWebGPU(page, test.info())
  })

  test('carpet accumulates frames in TDSE mode', async ({ page }) => {
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    const topBar = new TopBar(page)
    await topBar.openRightPanel()

    const rightPanel = new RightPanel(page)
    await rightPanel.waitForVisible()
    await expect(page.getByTestId('analysis-section')).toBeVisible({ timeout: 5000 })

    await enableCarpet(page)

    // Wait for carpet to accumulate some frames (readback is throttled to every 3 frames)
    await expect(async () => {
      const frames = await getCarpetFrames(page)
      expect(frames).toBeGreaterThan(5)
    }).toPass({ timeout: 15_000 })
  })

  test('pause freezes frame count, resume continues', async ({ page }) => {
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    const topBar = new TopBar(page)
    await topBar.openRightPanel()
    await expect(page.getByTestId('analysis-section')).toBeVisible({ timeout: 5000 })

    await enableCarpet(page)

    // Wait for some frames to accumulate
    await expect(async () => {
      expect(await getCarpetFrames(page)).toBeGreaterThan(3)
    }).toPass({ timeout: 15_000 })

    // Pause
    await page.getByTestId('carpet-play-pause').click()

    // Let any in-flight dispatch complete by waiting for 2 render frames to pass.
    // The carpet dispatch runs on the render loop, so after 2 frames any
    // in-flight work has drained and the carpet count has stabilized.
    const renderCountAtPause = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
      return parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10)
    })
    await page.waitForFunction(
      (min: number) => {
        const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
        return parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10) > min
      },
      renderCountAtPause + 2,
      { timeout: 10_000 }
    )
    const frozenCount = await getCarpetFrames(page)

    // Verify carpet count stays frozen while render frames continue advancing.
    // Wait for 5 more render frames — carpet count must not change.
    const renderCountAfterFreeze = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
      return parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10)
    })
    await page.waitForFunction(
      (min: number) => {
        const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
        return parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10) > min
      },
      renderCountAfterFreeze + 5,
      { timeout: 10_000 }
    )
    const afterWait = await getCarpetFrames(page)
    expect(afterWait, 'Carpet frame count must not advance while paused').toBe(frozenCount)

    // Resume
    await page.getByTestId('carpet-play-pause').click()

    // Frames should increase again
    await expect(async () => {
      expect(await getCarpetFrames(page)).toBeGreaterThan(frozenCount)
    }).toPass({ timeout: 10_000 })
  })

  test('clear resets frame count', async ({ page }) => {
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    const topBar = new TopBar(page)
    await topBar.openRightPanel()
    await expect(page.getByTestId('analysis-section')).toBeVisible({ timeout: 5000 })

    await enableCarpet(page)

    // Accumulate frames
    await expect(async () => {
      expect(await getCarpetFrames(page)).toBeGreaterThan(5)
    }).toPass({ timeout: 15_000 })

    // Clear
    await page.getByTestId('carpet-clear').click()

    // Frame count should reset to near 0.
    // A few frames may accumulate between clear and readback since the
    // animation loop runs asynchronously.
    const afterClear = await getCarpetFrames(page)
    expect(afterClear).toBeLessThan(5)
  })
})
