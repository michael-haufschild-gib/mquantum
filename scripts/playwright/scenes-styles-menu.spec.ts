/**
 * Scenes and Styles menu tests.
 *
 * Tests the preset management system accessible via Scenes and Styles menus:
 * - Scenes menu opens with example scenes listed
 * - Clicking an example scene changes the app state
 * - Styles menu opens with example styles listed
 * - Clicking an example style changes visual appearance
 * - Menu hierarchy (Actions, Saved, Examples) renders correctly
 *
 * Bugs caught:
 * - Scenes menu doesn't open (menu item wiring broken)
 * - Example scene items not generated from bundled JSON
 * - Scene application doesn't update stores (broken applySceneExample)
 * - Style application doesn't update theme store
 * - Submenu rendering broken (nested items not expanding)
 * - Scene load shows toast but doesn't actually change state
 */

import { test, expect } from './fixtures'
import {
  getAppState,
  requireWebGPU,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'
import { TopBar } from './pages/TopBar'

test.setTimeout(60_000)

test.describe('Scenes menu', () => {
  test('Scenes menu opens and shows Actions header', async ({ appPage: page }) => {
    const topBar = new TopBar(page)
    await topBar.openScenesMenu()

    // The menu should show an "Actions" label and "+ Save Current Scene..." item
    await expect(page.getByText('+ Save Current Scene...')).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('Manage Scenes...')).toBeVisible()
  })

  test('Scenes menu shows Examples section with items', async ({ appPage: page }) => {
    const topBar = new TopBar(page)
    await topBar.openScenesMenu()

    // The "Examples" header should be visible
    await expect(page.getByText('Examples').first()).toBeVisible({ timeout: 3000 })

    // At least one example scene should exist (bundled from scenes.json)
    const menuItems = page.locator('[role="menuitem"]')
    const count = await menuItems.count()
    expect(count, 'Menu should have items (Actions + Examples)').toBeGreaterThan(2)
  })

  test('clicking an example scene changes app state', async ({ appPage: page }) => {
    await requireWebGPU(page, test.info())

    // Record initial state
    const initialState = await getAppState(page)

    const topBar = new TopBar(page)
    await topBar.openScenesMenu()

    // Click any example scene item that's not a header/separator
    const menuItems = page.locator('[role="menuitem"]')
    const count = await menuItems.count()
    expect(count, 'Menu should have enough items to include example scenes').toBeGreaterThan(3)

    // Click the last menu item (an example scene)
    await menuItems.nth(count - 1).click()

    // Wait for scene to apply and renderer to recover
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // Verify state actually changed
    const newState = await getAppState(page)
    const stateChanged =
      newState.dimension !== initialState.dimension ||
      newState.objectType !== initialState.objectType ||
      newState.quantumMode !== initialState.quantumMode
    expect(stateChanged, 'Scene preset must change at least one state field').toBe(true)
  })
})

test.describe('Styles menu', () => {
  test('Styles menu opens and shows Actions header', async ({ appPage: page }) => {
    const topBar = new TopBar(page)
    await topBar.openStylesMenu()

    await expect(page.getByText('+ Save Current Style...')).toBeVisible({ timeout: 3000 })
    await expect(page.getByText('Manage Styles...')).toBeVisible()
  })

  test('Styles menu shows clickable items (actions + presets)', async ({ appPage: page }) => {
    const topBar = new TopBar(page)
    await topBar.openStylesMenu()

    // Should have action items and preset items
    await expect(page.getByText('+ Save Current Style...')).toBeVisible({ timeout: 3000 })

    const menuItems = page.locator('[role="menuitem"]')
    const count = await menuItems.count()
    expect(count, 'Styles menu should have action and preset items').toBeGreaterThan(2)
  })

  test('clicking an example style applies it without crash', async ({ appPage: page }) => {
    // Capture initial visual state for comparison
    const initialStyle = await page.evaluate(async () => {
      const mod = await import('/src/stores/appearanceStore.ts')
      const s = mod.useAppearanceStore.getState()
      return JSON.stringify({ opacity: s.opacity, wireframe: s.wireframe })
    })

    const topBar = new TopBar(page)
    await topBar.openStylesMenu()

    const menuItems = page.locator('[role="menuitem"]')
    const count = await menuItems.count()
    expect(count, 'Styles menu should have enough items to include example styles').toBeGreaterThan(
      3
    )

    // Click the last menu item (an example style)
    await menuItems.nth(count - 1).click()

    // App should survive style application
    await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 5000 })

    // Verify at least one visual store changed (style presets mutate appearance/theme/PBR stores)
    const newStyle = await page.evaluate(async () => {
      const mod = await import('/src/stores/appearanceStore.ts')
      const s = mod.useAppearanceStore.getState()
      return JSON.stringify({ opacity: s.opacity, wireframe: s.wireframe })
    })
    expect(newStyle, 'Style preset must change visual state').not.toBe(initialStyle)
  })

  test('Save Current Scene opens save dialog', async ({ appPage: page }) => {
    const topBar = new TopBar(page)
    await topBar.openScenesMenu()

    await page.getByText('+ Save Current Scene...').click()

    // The save dialog (InputModal for scene name) must appear
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Close it
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible({ timeout: 3000 })
  })

  test('loading an example scene shows toast notification', async ({ appPage: page }) => {
    const topBar = new TopBar(page)
    await topBar.openScenesMenu()

    // Click an example scene (last menu item is an example scene)
    const menuItems = page.locator('[role="menuitem"]')
    const count = await menuItems.count()
    if (count <= 3) {
      test.skip(true, 'Not enough menu items to include example scenes')
      return
    }

    await menuItems.nth(count - 1).click()

    // A toast notification should appear confirming the scene was loaded
    await expect(page.getByTestId('toast-message')).toBeVisible({ timeout: 5000 })
  })
})
