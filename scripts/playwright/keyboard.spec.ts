/**
 * Keyboard shortcut tests.
 *
 * Bugs caught:
 * - ArrowUp/Down dimension change not wired to store
 * - ArrowUp goes above MAX_DIMENSION (11)
 * - ArrowDown goes below MIN_DIMENSION (2)
 * - 'C' key doesn't toggle cinematic mode
 * - '?' key doesn't open shortcuts overlay
 * - Shortcuts fire while typing in input fields
 */

import { expect, test } from '@playwright/test'

test.setTimeout(30_000)

/** Read dimension from geometry store. */
async function getDimension(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/geometryStore.ts')
    return mod.useGeometryStore.getState().dimension
  })
}

test.describe('keyboard shortcuts', () => {
  test('ArrowUp increases dimension by 1', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=3')
    await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 15_000 })

    expect(await getDimension(page)).toBe(3)

    await page.keyboard.press('ArrowUp')

    // Poll for store update (may not be instant)
    await expect(async () => {
      expect(await getDimension(page)).toBe(4)
    }).toPass({ timeout: 3000 })
  })

  test('ArrowDown decreases dimension by 1', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=5')
    await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 15_000 })

    expect(await getDimension(page)).toBe(5)

    await page.keyboard.press('ArrowDown')

    await expect(async () => {
      expect(await getDimension(page)).toBe(4)
    }).toPass({ timeout: 3000 })
  })

  test('ArrowUp does not exceed MAX_DIMENSION (11)', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=11')
    await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 15_000 })

    await page.keyboard.press('ArrowUp')
    await page.waitForTimeout(500)

    expect(await getDimension(page)).toBe(11)
  })

  test('ArrowDown does not go below MIN_DIMENSION (2)', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=2')
    await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 15_000 })

    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(500)

    expect(await getDimension(page)).toBe(2)
  })

  test('C toggles cinematic mode on and off', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 15_000 })

    // Enter cinematic mode
    await page.keyboard.press('c')
    await expect(page.getByTestId('exit-cinematic')).toBeVisible({ timeout: 3000 })
    // Top bar should be hidden
    await expect(page.getByTestId('top-bar')).not.toBeVisible()

    // Exit cinematic mode
    await page.keyboard.press('c')
    await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 3000 })
    await expect(page.getByTestId('exit-cinematic')).not.toBeVisible()
  })

  test('? opens shortcuts overlay', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 15_000 })

    await page.keyboard.press('?')
    await expect(page.getByTestId('shortcuts-overlay')).toBeVisible({ timeout: 3000 })

    // Close via the close button
    await page.getByTestId('shortcuts-close').click()
    await expect(page.getByTestId('shortcuts-overlay')).not.toBeVisible({ timeout: 3000 })
  })
})
