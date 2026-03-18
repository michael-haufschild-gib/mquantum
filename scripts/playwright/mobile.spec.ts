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

import { expect, test } from '@playwright/test'

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
    expect(box).not.toBeNull()
    expect(box!.y + box!.height).toBeGreaterThan(MOBILE.height - 100)
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

    // Close left panel if open (default: open)
    await topBar.closeLeftPanel()
    await expect(timeline).toBeVisible({ timeout: 5000 })

    // Open left panel — timeline should hide
    await topBar.openLeftPanel()
    await expect(timeline).not.toBeVisible({ timeout: 5000 })
  })
})
