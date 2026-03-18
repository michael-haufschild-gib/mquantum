/**
 * Panel toggle tests.
 *
 * Uses aria-expanded on toggle buttons and data-testid on panel wrappers
 * for reliable state detection independent of animations.
 *
 * Bugs caught:
 * - Toggle doesn't flip layout store state
 * - Panel renders but animation never completes (stuck in exit)
 * - Left panel default-open state not reflected in button aria-expanded
 */

import { expect, test } from '@playwright/test'

import { waitForAppLoaded } from './helpers/app-helpers'
import { TopBar } from './pages/TopBar'

test.setTimeout(30_000)

test('left panel is open by default, toggle closes it', async ({ page }) => {
  await page.goto('/')
  await waitForAppLoaded(page)

  const topBar = new TopBar(page)

  // Left panel defaults to open (showLeftPanel: true in layoutStore)
  await expect(topBar.leftPanelToggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('left-panel')).toBeVisible()

  // Click closes it
  await topBar.toggleLeftPanel()
  await expect(topBar.leftPanelToggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('left-panel')).not.toBeVisible({ timeout: 5000 })

  // Click reopens it
  await topBar.toggleLeftPanel()
  await expect(topBar.leftPanelToggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('left-panel')).toBeVisible({ timeout: 5000 })
})

test('right panel toggle opens and closes', async ({ page }) => {
  await page.goto('/')
  await waitForAppLoaded(page)

  const topBar = new TopBar(page)

  // Ensure panel is closed first
  await topBar.closeRightPanel()

  // Open it
  await topBar.toggleRightPanel()
  await expect(topBar.rightPanelToggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('right-panel')).toBeVisible({ timeout: 5000 })

  // Close it
  await topBar.toggleRightPanel()
  await expect(topBar.rightPanelToggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('right-panel')).not.toBeVisible({ timeout: 5000 })
})

test('both panels can be open simultaneously', async ({ page }) => {
  await page.goto('/')
  await waitForAppLoaded(page)

  const topBar = new TopBar(page)
  await topBar.openLeftPanel()
  await topBar.openRightPanel()

  await expect(page.getByTestId('left-panel')).toBeVisible()
  await expect(page.getByTestId('right-panel')).toBeVisible()
})
