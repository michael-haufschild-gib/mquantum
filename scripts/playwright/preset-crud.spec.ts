/**
 * IndexedDB scene and style preset CRUD tests.
 *
 * Tests the full preset lifecycle:
 * - Save → name → confirm → verify in menu
 * - Load saved preset → verify state changed
 * - Manage → delete → verify removed from menu
 * - Save scene in mode A → switch to mode B → load saved scene → verify mode A restored
 *
 * Bugs caught:
 * - Save dialog onConfirm not calling presetManagerStore.saveScene
 * - Saved scene not persisted to IndexedDB (transient state only)
 * - loadScene not restoring geometry/quantum mode stores
 * - deleteScene not removing from IndexedDB
 * - Saved scenes section shows "(None)" after save (stale menu cache)
 * - Scene name not appearing in menu after save (missing re-render)
 * - Style save not capturing current appearance/PBR/lighting state
 * - loadStyle not restoring visual stores
 */

import { test, expect } from './fixtures'
import { getAppState, waitForAppLoaded } from './helpers/app-helpers'
import { TopBar } from './pages/TopBar'

test.setTimeout(60_000)

test.describe('scene preset CRUD', () => {
  const SCENE_NAME = `Test Scene ${Date.now()}`

  test.beforeEach(async ({ page }) => {
    // Clear any previously saved presets to start fresh
    await page.goto('/?t=schroedinger&d=5&qm=harmonicOscillator')
    await waitForAppLoaded(page)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/presetManagerStore.ts')
      const store = mod.usePresetManagerStore.getState()
      // Delete all saved scenes to start clean
      for (const scene of store.savedScenes) {
        store.deleteScene(scene.id)
      }
    })
  })

  test('save scene: dialog accepts name and scene appears in menu', async ({ page }) => {
    const topBar = new TopBar(page)

    // Open Scenes menu → Save Current Scene
    await topBar.openScenesMenu()
    await page.getByText('+ Save Current Scene...').click()

    // InputModal should appear with title "Save Scene"
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Type a scene name
    const input = dialog.locator('input[type="text"]')
    await input.fill(SCENE_NAME)

    // Click Save
    await dialog.getByRole('button', { name: 'Save' }).click()

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 3000 })

    // Reopen Scenes menu — saved scene should appear under "Saved Scenes"
    await topBar.openScenesMenu()
    await expect(page.getByText(SCENE_NAME)).toBeVisible({ timeout: 3000 })
  })

  test('load saved scene restores state from different mode', async ({ page }) => {
    const topBar = new TopBar(page)

    // Save current state (5D HO from beforeEach)
    await topBar.openScenesMenu()
    await page.getByText('+ Save Current Scene...').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await dialog.locator('input[type="text"]').fill(SCENE_NAME)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).not.toBeVisible({ timeout: 3000 })

    // Navigate to a different mode
    await page.goto('/?t=schroedinger&d=3&qm=hydrogenND')
    await waitForAppLoaded(page)

    const stateAfterNav = await getAppState(page)
    expect(stateAfterNav.quantumMode).toBe('hydrogenND')
    expect(stateAfterNav.dimension).toBe(3)

    // Load the saved scene via Scenes menu
    await topBar.openScenesMenu()
    await page.getByText(SCENE_NAME).click()

    // State should revert to saved: 5D HO
    await expect(async () => {
      const restored = await getAppState(page)
      expect(restored.dimension).toBe(5)
      expect(restored.quantumMode).toBe('harmonicOscillator')
    }).toPass({ timeout: 5000 })
  })

  test('delete scene via Manage Scenes dialog removes it from menu', async ({ page }) => {
    const topBar = new TopBar(page)

    // Save a scene first
    await topBar.openScenesMenu()
    await page.getByText('+ Save Current Scene...').click()
    const saveDialog = page.getByRole('dialog')
    await expect(saveDialog).toBeVisible({ timeout: 5000 })
    await saveDialog.locator('input[type="text"]').fill(SCENE_NAME)
    await saveDialog.getByRole('button', { name: 'Save' }).click()
    await expect(saveDialog).not.toBeVisible({ timeout: 3000 })

    // Verify it exists in the menu
    await topBar.openScenesMenu()
    await expect(page.getByText(SCENE_NAME)).toBeVisible({ timeout: 3000 })
    await page.keyboard.press('Escape')

    // Open Manage Scenes dialog via the menu
    await topBar.openScenesMenu()
    await page.getByText('Manage Scenes...').click()

    // The Manage Scenes modal should appear with our saved scene
    const manageDialog = page.getByRole('dialog')
    await expect(manageDialog).toBeVisible({ timeout: 5000 })
    await expect(manageDialog.getByText(SCENE_NAME)).toBeVisible({ timeout: 3000 })

    // Click the delete button for our scene (hidden until hover, use force: true)
    const deleteBtn = manageDialog.getByRole('button', {
      name: new RegExp(`Delete scene.*${SCENE_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`),
    })
    await deleteBtn.click({ force: true })

    // Confirmation dialog should appear
    const confirmBtn = page.getByRole('button', { name: 'Delete' }).last()
    await expect(confirmBtn).toBeVisible({ timeout: 3000 })
    await confirmBtn.click()

    // Scene should be removed from the manage dialog
    await expect(manageDialog.getByText(SCENE_NAME)).not.toBeVisible({ timeout: 3000 })

    // Close manage dialog
    await page.keyboard.press('Escape')

    // Reopen Scenes menu — scene should be gone
    await topBar.openScenesMenu()
    await expect(page.getByText(SCENE_NAME)).not.toBeVisible({ timeout: 3000 })
  })

  test('saving scene with Enter key works', async ({ page }) => {
    const topBar = new TopBar(page)

    await topBar.openScenesMenu()
    await page.getByText('+ Save Current Scene...').click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    const input = dialog.locator('input[type="text"]')
    await input.fill(SCENE_NAME)
    await input.press('Enter')

    await expect(dialog).not.toBeVisible({ timeout: 3000 })

    // Verify saved
    await topBar.openScenesMenu()
    await expect(page.getByText(SCENE_NAME)).toBeVisible({ timeout: 3000 })
  })

  test('empty name cannot be saved', async ({ page }) => {
    const topBar = new TopBar(page)

    await topBar.openScenesMenu()
    await page.getByText('+ Save Current Scene...').click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Leave input empty — Save button should be disabled
    const saveBtn = dialog.getByRole('button', { name: 'Save' })
    await expect(saveBtn).toBeDisabled()

    // Type whitespace only — still disabled
    await dialog.locator('input[type="text"]').fill('   ')
    await expect(saveBtn).toBeDisabled()
  })

  test('saved scene persists across full page reload (IndexedDB)', async ({ page }) => {
    const topBar = new TopBar(page)

    // Save a scene
    await topBar.openScenesMenu()
    await page.getByText('+ Save Current Scene...').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await dialog.locator('input[type="text"]').fill(SCENE_NAME)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).not.toBeVisible({ timeout: 3000 })

    // Verify it exists before reload
    await topBar.openScenesMenu()
    await expect(page.getByText(SCENE_NAME)).toBeVisible({ timeout: 3000 })
    await page.keyboard.press('Escape')

    // Full page reload — forces IndexedDB rehydration
    await page.reload()
    await waitForAppLoaded(page)

    // Saved scene must survive the reload
    await topBar.openScenesMenu()
    await expect(
      page.getByText(SCENE_NAME),
      'Saved scene must persist in IndexedDB across page reload'
    ).toBeVisible({ timeout: 5000 })
  })
})

test.describe('style preset CRUD', () => {
  const STYLE_NAME = `Test Style ${Date.now()}`

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppLoaded(page)
    // Clear saved styles
    await page.evaluate(async () => {
      const mod = await import('/src/stores/presetManagerStore.ts')
      const store = mod.usePresetManagerStore.getState()
      for (const style of store.savedStyles) {
        store.deleteStyle(style.id)
      }
    })
  })

  test('save style and verify it appears in Styles menu', async ({ page }) => {
    const topBar = new TopBar(page)

    await topBar.openStylesMenu()
    await page.getByText('+ Save Current Style...').click()

    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    await dialog.locator('input[type="text"]').fill(STYLE_NAME)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).not.toBeVisible({ timeout: 3000 })

    // Verify in menu
    await topBar.openStylesMenu()
    await expect(page.getByText(STYLE_NAME)).toBeVisible({ timeout: 3000 })
  })

  test('load saved style changes visual state', async ({ page }) => {
    // Capture initial visual state
    const initialOpacity = await page.evaluate(async () => {
      const mod = await import('/src/stores/appearanceStore.ts')
      return mod.useAppearanceStore.getState().opacity
    })

    // Change opacity to something distinctive
    await page.evaluate(async () => {
      const mod = await import('/src/stores/appearanceStore.ts')
      mod.useAppearanceStore.getState().setOpacity(0.42)
    })

    // Save this style
    const topBar = new TopBar(page)
    await topBar.openStylesMenu()
    await page.getByText('+ Save Current Style...').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await dialog.locator('input[type="text"]').fill(STYLE_NAME)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).not.toBeVisible({ timeout: 3000 })

    // Restore original opacity
    await page.evaluate(async (original: number) => {
      const mod = await import('/src/stores/appearanceStore.ts')
      mod.useAppearanceStore.getState().setOpacity(original)
    }, initialOpacity)

    // Verify opacity changed back
    const middleOpacity = await page.evaluate(async () => {
      const mod = await import('/src/stores/appearanceStore.ts')
      return mod.useAppearanceStore.getState().opacity
    })
    expect(middleOpacity).toBeCloseTo(initialOpacity, 1)

    // Load saved style
    await topBar.openStylesMenu()
    await page.getByText(STYLE_NAME).click()

    // Opacity should be restored to 0.42
    await expect(async () => {
      const restored = await page.evaluate(async () => {
        const mod = await import('/src/stores/appearanceStore.ts')
        return mod.useAppearanceStore.getState().opacity
      })
      expect(restored).toBeCloseTo(0.42, 1)
    }).toPass({ timeout: 3000 })
  })

  test('saved style persists across full page reload (IndexedDB)', async ({ page }) => {
    const topBar = new TopBar(page)

    // Save a style with a distinctive name
    await topBar.openStylesMenu()
    await page.getByText('+ Save Current Style...').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await dialog.locator('input[type="text"]').fill(STYLE_NAME)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).not.toBeVisible({ timeout: 3000 })

    // Verify it exists before reload
    await topBar.openStylesMenu()
    await expect(page.getByText(STYLE_NAME)).toBeVisible({ timeout: 3000 })
    await page.keyboard.press('Escape')

    // Full page reload
    await page.reload()
    await waitForAppLoaded(page)

    // Saved style must survive the reload (IndexedDB persistence)
    await topBar.openStylesMenu()
    await expect(
      page.getByText(STYLE_NAME),
      'Saved style must persist in IndexedDB across page reload'
    ).toBeVisible({ timeout: 5000 })
  })

  test('delete saved style removes it from menu', async ({ page }) => {
    const topBar = new TopBar(page)

    // Save a style
    await topBar.openStylesMenu()
    await page.getByText('+ Save Current Style...').click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await dialog.locator('input[type="text"]').fill(STYLE_NAME)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).not.toBeVisible({ timeout: 3000 })

    // Verify exists
    await topBar.openStylesMenu()
    await expect(page.getByText(STYLE_NAME)).toBeVisible({ timeout: 3000 })
    await page.keyboard.press('Escape')

    // Delete via store
    await page.evaluate(async (name: string) => {
      const mod = await import('/src/stores/presetManagerStore.ts')
      const store = mod.usePresetManagerStore.getState()
      const style = store.savedStyles.find((s) => s.name === name)
      if (style) store.deleteStyle(style.id)
    }, STYLE_NAME)

    // Verify removed
    await topBar.openStylesMenu()
    await expect(page.getByText(STYLE_NAME)).not.toBeVisible({ timeout: 3000 })
  })
})
