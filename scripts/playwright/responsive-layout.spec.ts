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

import { expect, test } from './fixtures'
import {
  getFrameCount,
  requireWebGPU,
  waitForAppLoaded,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
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

    // Desktop: editor-bottom-panel visible, mobile-timeline hidden.
    // Use .first() because the mobile-timeline-controls may contain a nested
    // editor-bottom-panel, causing strict mode violations.
    await expect(page.getByTestId('editor-bottom-panel').first()).toBeVisible()
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
    await expect(page.getByTestId('editor-bottom-panel').first()).toBeVisible({ timeout: 5000 })
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
    await requireWebGPU(page, test.info())

    await page.setViewportSize(DESKTOP)
    await page.goto('/')
    await waitForAppLoaded(page)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

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

    await expect(page.getByTestId('top-bar')).toBeVisible()
  })

  test('canvas dimensions adapt to viewport size', async ({ page }) => {
    await requireWebGPU(page, test.info())

    // Start at desktop with both panels closed to maximize canvas area
    await page.setViewportSize(DESKTOP)
    await page.goto('/')
    await waitForAppLoaded(page)
    await waitForRendererReady(page)

    const topBar = new TopBar(page)
    await topBar.closeLeftPanel()
    await topBar.closeRightPanel()

    const canvas = page.getByTestId('webgpu-canvas')
    const desktopBox = await canvas.boundingBox()
    if (!desktopBox) throw new Error('Canvas bounding box is null at desktop size')

    // Resize to a smaller viewport
    const SMALL = { width: 640, height: 480 }
    await page.setViewportSize(SMALL)

    // Wait for resize to take effect (frame must render at new size)
    const count = await getFrameCount(page)
    await waitForFrameAdvance(page, count)

    const smallBox = await canvas.boundingBox()
    if (!smallBox) throw new Error('Canvas bounding box is null at small size')

    // Canvas width must be smaller after viewport shrink.
    // We can't assert exact dimensions (CSS layout depends on padding, chrome),
    // but the canvas must not stay at the old size.
    expect(smallBox.width, 'Canvas width must decrease when viewport shrinks').toBeLessThan(
      desktopBox.width
    )
  })
})
