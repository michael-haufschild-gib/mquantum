/**
 * Mobile layout tests.
 *
 * Verifies responsive behavior at mobile viewport (375×667):
 * - Mobile timeline controls visible when panels closed
 * - Timeline hides when left or right panel opens
 * - Timeline reappears when panels close
 * - Not visible on desktop (desktop uses inline bottom panel)
 *
 * Bugs caught:
 * - Mobile timeline z-index wrong (renders under panel)
 * - Timeline doesn't reappear after panel close (state not reset)
 * - Both mobile and desktop timeline visible simultaneously
 */

import { expect, test } from './fixtures'
import { waitForAppLoaded } from './helpers/app-helpers'
import { TopBar } from './pages/TopBar'

test.setTimeout(30_000)

const MOBILE = { width: 375, height: 667 }
const DESKTOP = { width: 1280, height: 800 }

test.describe('mobile timeline controls', () => {
  test('visible on mobile when panels are closed', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/')
    await waitForAppLoaded(page)

    const timeline = page.getByTestId('mobile-timeline-controls')
    await expect(timeline).toBeVisible({ timeout: 5000 })

    // Should be near the bottom of the viewport
    const box = await timeline.boundingBox()
    if (!box) throw new Error('Timeline bounding box is null — element may not be visible')
    expect(box.y + box.height).toBeGreaterThan(MOBILE.height - 100)
  })

  test('bottom timeline controls do not overflow horizontally', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/')
    await waitForAppLoaded(page)

    const timeline = page.getByTestId('mobile-timeline-controls')
    await expect(timeline).toBeVisible({ timeout: 5000 })

    const metrics = await timeline.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        clientWidth: element.clientWidth,
        left: rect.left,
        right: rect.right,
        scrollWidth: element.scrollWidth,
        viewportWidth: window.innerWidth,
      }
    })

    expect(metrics.left).toBeGreaterThanOrEqual(0)
    expect(Math.ceil(metrics.right)).toBeLessThanOrEqual(metrics.viewportWidth)
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1)
  })

  test('hidden on desktop — desktop uses editor-bottom-panel', async ({ page }) => {
    await page.setViewportSize(DESKTOP)
    await page.goto('/')
    await waitForAppLoaded(page)

    await expect(page.getByTestId('mobile-timeline-controls')).not.toBeVisible()
    await expect(page.getByTestId('editor-bottom-panel')).toBeVisible()
  })

  test('hides when right panel opens, reappears when closed', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/')
    await waitForAppLoaded(page)

    const timeline = page.getByTestId('mobile-timeline-controls')
    await expect(timeline).toBeVisible({ timeout: 5000 })

    // Open right panel
    const topBar = new TopBar(page)
    await topBar.toggleRightPanel()
    await expect(timeline).not.toBeVisible({ timeout: 5000 })

    // Close right panel
    await topBar.toggleRightPanel()
    await expect(timeline).toBeVisible({ timeout: 5000 })
  })

  test('hides when left panel opens', async ({ page }) => {
    await page.setViewportSize(MOBILE)
    await page.goto('/')
    await waitForAppLoaded(page)

    const timeline = page.getByTestId('mobile-timeline-controls')
    const topBar = new TopBar(page)

    // EditorLayout auto-collapses the left panel on mobile init via useEffect.
    // Wait for that effect to complete — the mobile timeline appears only when
    // both side panels are closed (useMobileBottomPanel condition).
    await expect(timeline).toBeVisible({ timeout: 5000 })
    await expect(topBar.leftPanelToggle).toHaveAttribute('aria-expanded', 'false', {
      timeout: 3000,
    })

    // Open left panel — timeline should hide
    await topBar.toggleLeftPanel()
    await expect(topBar.leftPanelToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(timeline).not.toBeVisible({ timeout: 5000 })
  })
})
