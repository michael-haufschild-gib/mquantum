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

test.setTimeout(30_000)

test('left panel is open by default, toggle closes it', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 15_000 })

  // Left panel defaults to open (showLeftPanel: true in layoutStore)
  const toggle = page.getByTestId('toggle-left-panel')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('left-panel')).toBeVisible()

  // Click closes it
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('left-panel')).not.toBeVisible({ timeout: 5000 })

  // Click reopens it
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('left-panel')).toBeVisible({ timeout: 5000 })
})

test('right panel toggle opens and closes', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 15_000 })

  const toggle = page.getByTestId('toggle-right-panel')

  // Check initial state from aria-expanded
  const initialExpanded = await toggle.getAttribute('aria-expanded')

  if (initialExpanded === 'true') {
    // Already open — close it first
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('right-panel')).not.toBeVisible({ timeout: 5000 })
  }

  // Open it
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('right-panel')).toBeVisible({ timeout: 5000 })

  // Close it
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('right-panel')).not.toBeVisible({ timeout: 5000 })
})
