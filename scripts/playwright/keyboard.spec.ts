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

import { expect, test } from './fixtures'
import { getDimension, waitForAppLoaded } from './helpers/app-helpers'
import { LeftPanel } from './pages/LeftPanel'
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

  test('Ctrl or Cmd+K opens command palette', async ({ page }) => {
    await page.goto('/')
    await waitForAppLoaded(page)

    await page.keyboard.press('ControlOrMeta+K')
    await expect(page.getByPlaceholder('Type a command or search...')).toBeVisible({
      timeout: 5000,
    })
  })

  test('shortcuts do not fire when a text input is focused', async ({ page }) => {
    // Enable isosurface mode to guarantee the threshold input exists
    await page.goto('/?t=schroedinger&d=5&qm=harmonicOscillator&iso=1')
    await waitForAppLoaded(page)

    const initialDim = await getDimension(page)

    // Open the left panel Geometry tab where the iso threshold input lives
    const topBar = new TopBar(page)
    await topBar.openLeftPanel()
    const leftPanel = new LeftPanel(page)
    await leftPanel.switchTab('Geometry')

    // The iso threshold input should be visible since iso=1 was set via URL
    const input = page.getByTestId('schroedinger-iso-threshold-input')
    await expect(input).toBeVisible({ timeout: 5000 })

    await input.focus()
    await page.keyboard.press('ArrowUp')

    // Dimension should NOT have changed — the keypress went to the input
    const afterDim = await getDimension(page)
    expect(afterDim, 'ArrowUp in input field should not change dimension').toBe(initialDim)
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
