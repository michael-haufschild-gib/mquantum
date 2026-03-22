/**
 * View menu tests.
 *
 * Tests that View menu items correctly control UI state:
 * - Show/Hide Explorer (left panel)
 * - Show/Hide Inspector (right panel)
 * - Cinematic Mode
 * - Keyboard Shortcuts overlay
 *
 * Bugs caught:
 * - Menu item label not reflecting current panel state
 * - Toggle action not dispatching to layout store
 * - Cinematic mode entered via menu doesn't hide top bar
 * - Shortcuts overlay not opening via menu (only via ? key)
 * - Menu not closing after item click
 */

import { expect, test } from './fixtures'
import { TopBar } from './pages/TopBar'

test.setTimeout(30_000)

test.describe('View menu', () => {
  test('Show/Hide Explorer toggles left panel via menu', async ({ appPage: page }) => {
    const topBar = new TopBar(page)

    // Left panel is open by default
    await expect(topBar.leftPanelToggle).toHaveAttribute('aria-expanded', 'true')

    // Click View > Hide Explorer
    await topBar.clickViewExplorer()
    await expect(topBar.leftPanelToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('left-panel')).not.toBeVisible({ timeout: 5000 })

    // Click View > Show Explorer (label should have flipped)
    await topBar.clickViewExplorer()
    await expect(topBar.leftPanelToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('left-panel')).toBeVisible({ timeout: 5000 })
  })

  test('Show/Hide Inspector toggles right panel via menu', async ({ appPage: page }) => {
    const topBar = new TopBar(page)

    // Close right panel first (it may or may not be open by default)
    await topBar.closeRightPanel()

    // Click View > Show Inspector
    await topBar.clickViewInspector()
    await expect(topBar.rightPanelToggle).toHaveAttribute('aria-expanded', 'true')
    await expect(page.getByTestId('right-panel')).toBeVisible({ timeout: 5000 })

    // Click View > Hide Inspector
    await topBar.clickViewInspector()
    await expect(topBar.rightPanelToggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('right-panel')).not.toBeVisible({ timeout: 5000 })
  })

  test('Cinematic Mode via menu hides all chrome', async ({ appPage: page }) => {
    const topBar = new TopBar(page)

    await topBar.clickViewCinematic()

    // Top bar and panels should be hidden
    await expect(page.getByTestId('exit-cinematic')).toBeVisible({ timeout: 3000 })
    await expect(topBar.root).not.toBeVisible()

    // Exit via keyboard (Escape or 'c')
    await page.keyboard.press('c')
    await expect(topBar.root).toBeVisible({ timeout: 3000 })
  })

  test('Keyboard Shortcuts via menu opens overlay', async ({ appPage: page }) => {
    const topBar = new TopBar(page)

    await topBar.clickViewShortcuts()

    await expect(page.getByTestId('shortcuts-overlay')).toBeVisible({ timeout: 3000 })

    // Close it
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('shortcuts-overlay')).not.toBeVisible({ timeout: 3000 })
  })

  test('menu closes after clicking an item', async ({ appPage: page }) => {
    const topBar = new TopBar(page)

    // Open View menu
    await topBar.openViewMenu()

    // Menu items should be visible
    const explorerItem = page.getByTestId('menu-view-explorer')
    await expect(explorerItem).toBeVisible({ timeout: 3000 })

    // Click item — menu should close
    await explorerItem.click()

    // Menu items should no longer be visible
    await expect(explorerItem).not.toBeVisible({ timeout: 3000 })
  })
})
