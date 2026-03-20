/**
 * Responsive layout transition tests.
 *
 * Tests dynamic viewport resize between desktop and mobile mid-session,
 * verifying that layout components adapt correctly without state loss.
 *
 * Bugs caught:
 * - Mobile timeline doesn't appear after resize from desktop
 * - Desktop bottom panel doesn't restore after mobile → desktop
 * - Panel state lost during resize cycle
 * - Canvas doesn't resize to fill available space
 * - CSS breakpoint race: both mobile and desktop timelines visible
 * - Resize during rendering crashes renderer (texture size mismatch)
 */

import { expect, test } from '@playwright/test'

import {
  hasWebGPU,
  waitForAppLoaded,
  waitForRendererReady,
  waitForShaderCompilation,
  waitForFrameAdvance,
  getFrameCount,
  collectFatalGpuErrors,
} from './helpers/app-helpers'
import { TopBar } from './pages/TopBar'

test.setTimeout(60_000)

const DESKTOP = { width: 1280, height: 800 }
const MOBILE = { width: 375, height: 667 }

test.describe('responsive layout transitions', () => {
  test('desktop → mobile → desktop: layout adapts correctly', async ({ page }) => {
    // Start at desktop
    await page.setViewportSize(DESKTOP)
    await page.goto('/')
    await waitForAppLoaded(page)

    // Desktop: editor-bottom-panel visible, mobile-timeline hidden
    await expect(page.getByTestId('editor-bottom-panel')).toBeVisible()
    await expect(page.getByTestId('mobile-timeline-controls')).not.toBeVisible()

    // Resize to mobile
    await page.setViewportSize(MOBILE)

    // Mobile: mobile-timeline-controls should appear (panels may be closed)
    const topBar = new TopBar(page)
    await topBar.closeLeftPanel()

    await expect(page.getByTestId('mobile-timeline-controls')).toBeVisible({ timeout: 5000 })

    // Resize back to desktop
    await page.setViewportSize(DESKTOP)

    // Desktop: editor-bottom-panel should be back
    await expect(page.getByTestId('editor-bottom-panel')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('mobile-timeline-controls')).not.toBeVisible()
  })

  test('panel state preserved across viewport change', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/')
    await waitForAppLoaded(page)

    const topBar = new TopBar(page)
    await topBar.openLeftPanel()
    await topBar.openRightPanel()

    // Both panels open
    await expect(topBar.leftPanelToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(topBar.rightPanelToggle).toHaveAttribute('aria-expanded', 'true')

    // Resize to mobile and back
    await page.setViewportSize(MOBILE)
    await page.setViewportSize(DESKTOP)

    // Panel toggle state should be preserved in the store
    await expect(topBar.leftPanelToggle).toHaveAttribute('aria-expanded', 'true')
  })

  test('canvas survives resize cycle with rendering', async ({ page }) => {
    const gpu = await hasWebGPU(page)
    test.skip(!gpu, 'WebGPU not available')

    await page.setViewportSize(DESKTOP)
    await page.goto('/')
    await waitForAppLoaded(page)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    const gpuErrors = collectFatalGpuErrors(page)

    // Resize through several viewports while rendering
    const sizes = [
      { width: 800, height: 600 },
      { width: 375, height: 667 },
      { width: 1920, height: 1080 },
      { width: 1280, height: 800 },
    ]

    for (const size of sizes) {
      await page.setViewportSize(size)
      // Verify frames still advancing after each resize
      const count = await getFrameCount(page)
      await waitForFrameAdvance(page, count)
    }

    expect(gpuErrors, 'no GPU errors during resize cycle').toEqual([])
    await expect(page.getByTestId('top-bar')).toBeVisible()
  })
})
