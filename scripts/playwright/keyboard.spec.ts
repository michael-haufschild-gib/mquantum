/**
 * Keyboard shortcut tests.
 *
 * Bugs caught:
 * - ArrowUp/Down dimension change not wired to store
 * - ArrowUp goes above MAX_DIMENSION (11)
 * - ArrowDown goes below MIN_DIMENSION (2)
 * - 'C' key doesn't toggle cinematic mode
 * - '?' key doesn't open shortcuts overlay
 * - Shortcuts fire while typing in input fields (focus guard)
 */

import { expect, test } from '@playwright/test'

import { getDimension, waitForAppLoaded } from './helpers/app-helpers'
import { TopBar } from './pages/TopBar'

test.setTimeout(30_000)

test.describe('keyboard shortcuts', () => {
  test('ArrowUp increases dimension by 1', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=3')
    await waitForAppLoaded(page)

    expect(await getDimension(page)).toBe(3)

    await page.keyboard.press('ArrowUp')

    await expect(async () => {
      expect(await getDimension(page)).toBe(4)
    }).toPass({ timeout: 3000 })
  })

  test('ArrowDown decreases dimension by 1', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=5')
    await waitForAppLoaded(page)

    expect(await getDimension(page)).toBe(5)

    await page.keyboard.press('ArrowDown')

    await expect(async () => {
      expect(await getDimension(page)).toBe(4)
    }).toPass({ timeout: 3000 })
  })

  test('ArrowUp does not exceed MAX_DIMENSION (11)', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=11')
    await waitForAppLoaded(page)

    await page.keyboard.press('ArrowUp')

    // Poll instead of waitForTimeout — dimension must still be 11
    await expect(async () => {
      expect(await getDimension(page)).toBe(11)
    }).toPass({ timeout: 2000 })
  })

  test('ArrowDown does not go below MIN_DIMENSION (2)', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=2')
    await waitForAppLoaded(page)

    await page.keyboard.press('ArrowDown')

    await expect(async () => {
      expect(await getDimension(page)).toBe(2)
    }).toPass({ timeout: 2000 })
  })

  test('C toggles cinematic mode on and off', async ({ page }) => {
    await page.goto('/')
    const topBar = new TopBar(page)
    await topBar.waitForVisible()

    // Enter cinematic mode
    await page.keyboard.press('c')
    await expect(page.getByTestId('exit-cinematic')).toBeVisible({ timeout: 3000 })
    await expect(topBar.root).not.toBeVisible()

    // Exit cinematic mode
    await page.keyboard.press('c')
    await expect(topBar.root).toBeVisible({ timeout: 3000 })
    await expect(page.getByTestId('exit-cinematic')).not.toBeVisible()
  })

  test('? opens shortcuts overlay and close button dismisses it', async ({ page }) => {
    await page.goto('/')
    await waitForAppLoaded(page)

    await page.keyboard.press('?')
    await expect(page.getByTestId('shortcuts-overlay')).toBeVisible({ timeout: 3000 })

    await page.getByTestId('shortcuts-close').click()
    await expect(page.getByTestId('shortcuts-overlay')).not.toBeVisible({ timeout: 3000 })
  })

  test('shortcuts do not fire when a text input is focused', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=5')
    await waitForAppLoaded(page)

    const initialDim = await getDimension(page)

    // Find any input field in the app — use the iso threshold slider input if available
    // Open the right panel to get access to inputs
    const topBar = new TopBar(page)
    await topBar.openRightPanel()

    // Look for any visible input element
    const input = page.locator('input[type="text"], input[type="number"]').first()
    const hasInput = await input.isVisible().catch(() => false)

    if (hasInput) {
      await input.focus()
      await page.keyboard.press('ArrowUp')

      // Dimension should NOT have changed — the keypress went to the input
      const afterDim = await getDimension(page)
      expect(afterDim, 'ArrowUp in input field should not change dimension').toBe(initialDim)
    } else {
      // If no input visible, skip this specific check
      test.skip(true, 'No text input visible to test focus guard')
    }
  })

  test('multiple rapid ArrowUp presses increment correctly', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=3')
    await waitForAppLoaded(page)

    expect(await getDimension(page)).toBe(3)

    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowUp')

    await expect(async () => {
      expect(await getDimension(page)).toBe(6)
    }).toPass({ timeout: 3000 })
  })

  test('Escape closes shortcuts overlay', async ({ page }) => {
    await page.goto('/')
    await waitForAppLoaded(page)

    await page.keyboard.press('?')
    await expect(page.getByTestId('shortcuts-overlay')).toBeVisible({ timeout: 3000 })

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('shortcuts-overlay')).not.toBeVisible({ timeout: 3000 })
  })
})
