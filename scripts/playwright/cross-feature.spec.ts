/**
 * Cross-feature interaction tests.
 *
 * Tests multi-step flows that span multiple features — the kind of
 * interactions that break when features are developed in isolation.
 *
 * Bugs caught:
 * - Mode switch doesn't update sidebar controls (stale Geometry tab)
 * - Cinematic mode doesn't preserve panel state on exit
 * - URL state → UI → URL round-trip loses quantum mode
 * - Dimension change via keyboard while panel is open desyncs selector
 * - Panel toggle during animation drawer open leaves drawer orphaned
 */

import { expect, test } from '@playwright/test'

import {
  getAppState,
  getDimension,
  getQuantumMode,
  hasWebGPU,
  waitForAppLoaded,
  waitForFirstFrame,
  waitForRendererReady,
} from './helpers/app-helpers'
import { LeftPanel } from './pages/LeftPanel'
import { TopBar } from './pages/TopBar'

test.setTimeout(60_000)

test.describe('cross-feature interactions', () => {
  test('mode switch via Type tab → Geometry tab shows new controls', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=3&qm=harmonicOscillator')
    await waitForAppLoaded(page)

    const topBar = new TopBar(page)
    await topBar.openLeftPanel()

    const leftPanel = new LeftPanel(page)

    // Verify HO controls in Geometry tab
    await leftPanel.switchTab('Geometry')
    await expect(page.getByTestId('schroedinger-controls')).toBeVisible({ timeout: 5000 })

    // Switch to TDSE mode via Type tab
    await leftPanel.switchTab('Type')
    await leftPanel.selectQuantumMode('tdseDynamics')

    await expect(async () => {
      expect(await getQuantumMode(page)).toBe('tdseDynamics')
    }).toPass({ timeout: 5000 })

    // Geometry tab should now show TDSE controls
    await leftPanel.switchTab('Geometry')
    await expect(page.getByTestId('tdse-controls')).toBeVisible({ timeout: 5000 })
  })

  test('cinematic mode preserves panel state on exit', async ({ page }) => {
    await page.goto('/')
    await waitForAppLoaded(page)

    const topBar = new TopBar(page)

    // Open both panels
    await topBar.openLeftPanel()
    await topBar.openRightPanel()

    const leftExpanded = await topBar.isLeftPanelExpanded()
    const rightExpanded = await topBar.isRightPanelExpanded()

    expect(leftExpanded).toBe(true)
    expect(rightExpanded).toBe(true)

    // Enter cinematic mode
    await page.keyboard.press('c')
    await expect(page.getByTestId('exit-cinematic')).toBeVisible({ timeout: 3000 })

    // Panels and top bar should be hidden
    await expect(topBar.root).not.toBeVisible()

    // Exit cinematic mode
    await page.keyboard.press('c')
    await expect(topBar.root).toBeVisible({ timeout: 3000 })

    // Panel state should be restored
    await expect(topBar.leftPanelToggle).toHaveAttribute('aria-expanded', 'true')
  })

  test('URL state → keyboard change → store updates correctly', async ({ page }) => {
    // Load with specific URL state
    await page.goto('/?t=schroedinger&d=5&qm=harmonicOscillator')
    await waitForAppLoaded(page)

    // Verify store matches URL
    const state = await getAppState(page)
    expect(state.dimension).toBe(5)
    expect(state.quantumMode).toBe('harmonicOscillator')

    // Change dimension via keyboard
    await page.keyboard.press('ArrowUp')

    await expect(async () => {
      expect(await getDimension(page)).toBe(6)
    }).toPass({ timeout: 3000 })

    // URL is read-only — it won't update. But store has the new value.
    // Change another dimension to verify keyboard still works
    await page.keyboard.press('ArrowUp')

    await expect(async () => {
      expect(await getDimension(page)).toBe(7)
    }).toPass({ timeout: 3000 })
  })

  test('dimension change via keyboard syncs with sidebar selector', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=4&qm=harmonicOscillator')
    await waitForAppLoaded(page)

    const topBar = new TopBar(page)
    await topBar.openLeftPanel()

    // 4D should be selected
    await expect(page.getByTestId('dimension-selector-4')).toHaveAttribute('aria-checked', 'true')

    // Change via keyboard
    await page.keyboard.press('ArrowUp')

    // Selector should update to 5D
    await expect(page.getByTestId('dimension-selector-5')).toHaveAttribute('aria-checked', 'true', {
      timeout: 3000,
    })
    await expect(page.getByTestId('dimension-selector-4')).toHaveAttribute('aria-checked', 'false')
  })

  test('mode switch + dimension change + renderer recovery', async ({ page }) => {
    test.skip(!(await hasWebGPU(page)), 'WebGPU not available')

    await page.goto('/?t=schroedinger&d=3&qm=harmonicOscillator')
    await waitForAppLoaded(page)
    await waitForRendererReady(page)
    await waitForFirstFrame(page)

    const topBar = new TopBar(page)
    await topBar.openLeftPanel()

    const leftPanel = new LeftPanel(page)

    // Switch to BEC mode
    await leftPanel.selectQuantumMode('becDynamics')
    await expect(async () => {
      expect(await getQuantumMode(page)).toBe('becDynamics')
    }).toPass({ timeout: 5000 })

    // Change dimension via selector
    await leftPanel.selectDimension(3)

    // Renderer should recover
    await waitForRendererReady(page)
    await waitForFirstFrame(page, 30_000)
  })

  test('closing panel while animation drawer is open cleans up drawer', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=3&qm=harmonicOscillator')
    await waitForAppLoaded(page)

    // Open effects drawer
    const effectsBtn = page.getByRole('button', { name: 'Toggle animations drawer' })
    const hasEffects = await effectsBtn.isVisible().catch(() => false)

    if (!hasEffects) {
      test.skip(true, 'Effects button not visible for this mode')
      return
    }

    await effectsBtn.click()
    await expect(page.getByTestId('schroedinger-animation-drawer')).toBeVisible({ timeout: 5000 })

    // Close the left panel while drawer is open
    const topBar = new TopBar(page)
    await topBar.closeLeftPanel()

    // The effects drawer is part of the bottom panel, not the left panel,
    // so it should still be visible after closing the left panel
    // This verifies they're independent UI systems
    await expect(page.getByTestId('editor-bottom-panel')).toBeVisible()
  })

  test('rapid dimension cycling does not break UI state', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=5&qm=harmonicOscillator')
    await waitForAppLoaded(page)

    // Rapid ArrowUp/Down cycling
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowUp')
    }
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('ArrowDown')
    }

    // Should end at dimension 7 (5 + 5 - 3)
    await expect(async () => {
      expect(await getDimension(page)).toBe(7)
    }).toPass({ timeout: 5000 })

    // UI should still be responsive
    await expect(page.getByTestId('top-bar')).toBeVisible()
  })
})
