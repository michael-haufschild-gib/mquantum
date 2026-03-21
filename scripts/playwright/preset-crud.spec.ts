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

import { expect, test } from './fixtures'
import { getAppState, waitForAppLoaded } from './helpers/app-helpers'
import { TopBar } from './pages/TopBar'

test.setTimeout(60_000)

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Save a scene via menu → input modal → confirm. Returns the saved scene id. */
async function saveSceneViaUI(
  page: import('@playwright/test').Page,
  topBar: TopBar,
  name: string
): Promise<string> {
  await topBar.openScenesMenu()
  await page.getByTestId('menu-save-scene').click()
  await expect(page.getByTestId('save-scene-modal-input')).toBeVisible({ timeout: 5000 })
  await page.getByTestId('save-scene-modal-input').fill(name)
  // Wait for React to process the fill (controlled input state update) before Enter
  await expect(page.getByTestId('save-scene-modal-confirm')).toBeEnabled({ timeout: 3000 })
  await page.getByTestId('save-scene-modal-input').press('Enter')
  await expect(page.getByTestId('save-scene-modal-input')).not.toBeVisible({ timeout: 3000 })

  // Read back the id of the scene we just saved
  return page.evaluate(async (n: string) => {
    const mod = await import('/src/stores/presetManagerStore.ts')
    const scene = mod.usePresetManagerStore.getState().savedScenes.find((s) => s.name === n)
    return scene?.id ?? ''
  }, name)
}

/** Save a style via menu → input modal → confirm. Returns the saved style id. */
async function saveStyleViaUI(
  page: import('@playwright/test').Page,
  topBar: TopBar,
  name: string
): Promise<string> {
  await topBar.openStylesMenu()
  await page.getByTestId('menu-save-style').click()
  await expect(page.getByTestId('save-style-modal-input')).toBeVisible({ timeout: 5000 })
  await page.getByTestId('save-style-modal-input').fill(name)
  // Wait for React to process the fill before pressing Enter
  await expect(page.getByTestId('save-style-modal-confirm')).toBeEnabled({ timeout: 3000 })
  await page.getByTestId('save-style-modal-input').press('Enter')
  await expect(page.getByTestId('save-style-modal-input')).not.toBeVisible({ timeout: 3000 })

  return page.evaluate(async (n: string) => {
    const mod = await import('/src/stores/presetManagerStore.ts')
    const style = mod.usePresetManagerStore.getState().savedStyles.find((s) => s.name === n)
    return style?.id ?? ''
  }, name)
}

test.describe('scene preset CRUD', () => {
  const SCENE_NAME = `Test Scene ${Date.now()}`

  test.beforeEach(async ({ page }) => {
    await page.goto('/?t=schroedinger&d=5&qm=harmonicOscillator')
    await waitForAppLoaded(page)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/presetManagerStore.ts')
      const store = mod.usePresetManagerStore.getState()
      for (const scene of store.savedScenes) {
        store.deleteScene(scene.id)
      }
    })
  })

  test('save scene: dialog accepts name and scene appears in menu', async ({ page }) => {
    const topBar = new TopBar(page)
    const id = await saveSceneViaUI(page, topBar, SCENE_NAME)
    expect(id).not.toBe('')

    // Reopen Scenes menu — saved scene should appear
    await topBar.openScenesMenu()
    await expect(page.getByTestId(`menu-saved-scene-${id}`)).toBeVisible({ timeout: 3000 })
  })

  test('load saved scene restores state from different mode', async ({ page }) => {
    const topBar = new TopBar(page)
    const id = await saveSceneViaUI(page, topBar, SCENE_NAME)

    // Navigate to a different mode
    await page.goto('/?t=schroedinger&d=3&qm=hydrogenND')
    await waitForAppLoaded(page)

    const stateAfterNav = await getAppState(page)
    expect(stateAfterNav.quantumMode).toBe('hydrogenND')
    expect(stateAfterNav.dimension).toBe(3)

    // Load the saved scene via Scenes menu
    await topBar.openScenesMenu()
    await page.getByTestId(`menu-saved-scene-${id}`).click()

    // State should revert to saved: 5D HO
    await expect(async () => {
      const restored = await getAppState(page)
      expect(restored.dimension).toBe(5)
      expect(restored.quantumMode).toBe('harmonicOscillator')
    }).toPass({ timeout: 5000 })
  })

  test('delete scene via Manage Scenes dialog removes it from menu', async ({ page }) => {
    const topBar = new TopBar(page)
    const id = await saveSceneViaUI(page, topBar, SCENE_NAME)

    // Verify it exists in the menu
    await topBar.openScenesMenu()
    await expect(page.getByTestId(`menu-saved-scene-${id}`)).toBeVisible({ timeout: 3000 })
    await page.keyboard.press('Escape')

    // Open Manage Scenes dialog via the menu
    await topBar.openScenesMenu()
    await page.getByTestId('menu-manage-scenes').click()

    // The Manage Scenes modal should appear with our saved scene
    const manageDialog = page.getByRole('dialog')
    await expect(manageDialog).toBeVisible({ timeout: 5000 })
    await expect(manageDialog.getByText(SCENE_NAME)).toBeVisible({ timeout: 3000 })

    // Click the delete button for our scene (hidden until hover, use force: true)
    const deleteBtn = manageDialog.getByTestId(`delete-scene-${id}`)
    await deleteBtn.click({ force: true })

    // Confirmation dialog should appear
    await expect(page.getByTestId('delete-scene-confirm-modal-confirm')).toBeVisible({
      timeout: 3000,
    })
    await page.getByTestId('delete-scene-confirm-modal-confirm').click()

    // Scene should be removed from the manage dialog
    await expect(manageDialog.getByText(SCENE_NAME)).not.toBeVisible({ timeout: 3000 })

    // Close manage dialog
    await page.keyboard.press('Escape')

    // Reopen Scenes menu — scene should be gone
    await topBar.openScenesMenu()
    await expect(page.getByTestId(`menu-saved-scene-${id}`)).not.toBeVisible({ timeout: 3000 })
  })

  test('saving scene with Enter key works', async ({ page }) => {
    const topBar = new TopBar(page)

    await topBar.openScenesMenu()
    await page.getByTestId('menu-save-scene').click()
    await expect(page.getByTestId('save-scene-modal-input')).toBeVisible({ timeout: 5000 })
    await page.getByTestId('save-scene-modal-input').fill(SCENE_NAME)
    await page.getByTestId('save-scene-modal-input').press('Enter')

    await expect(page.getByTestId('save-scene-modal-input')).not.toBeVisible({ timeout: 3000 })

    // Verify saved — at least one saved scene item should exist
    await topBar.openScenesMenu()
    await expect(page.locator('[data-testid^="menu-saved-scene-"]').first()).toBeVisible({
      timeout: 3000,
    })
  })

  test('empty name cannot be saved', async ({ page }) => {
    const topBar = new TopBar(page)

    await topBar.openScenesMenu()
    await page.getByTestId('menu-save-scene').click()
    await expect(page.getByTestId('save-scene-modal-input')).toBeVisible({ timeout: 5000 })

    // Leave input empty — Save button should be disabled
    await expect(page.getByTestId('save-scene-modal-confirm')).toBeDisabled()

    // Type whitespace only — still disabled
    await page.getByTestId('save-scene-modal-input').fill('   ')
    await expect(page.getByTestId('save-scene-modal-confirm')).toBeDisabled()
  })

  test('saved scene persists across full page reload (IndexedDB)', async ({ page }) => {
    const topBar = new TopBar(page)
    const id = await saveSceneViaUI(page, topBar, SCENE_NAME)

    // Verify it exists before reload
    await topBar.openScenesMenu()
    await expect(page.getByTestId(`menu-saved-scene-${id}`)).toBeVisible({ timeout: 3000 })
    await page.keyboard.press('Escape')

    // Full page reload — forces IndexedDB rehydration
    await page.reload()
    await waitForAppLoaded(page)

    // Saved scene must survive the reload
    await topBar.openScenesMenu()
    await expect(
      page.getByTestId(`menu-saved-scene-${id}`),
      'Saved scene must persist in IndexedDB across page reload'
    ).toBeVisible({ timeout: 5000 })
  })
})

test.describe('style preset CRUD', () => {
  const STYLE_NAME = `Test Style ${Date.now()}`

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppLoaded(page)
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
    const id = await saveStyleViaUI(page, topBar, STYLE_NAME)
    expect(id).not.toBe('')

    // Verify in menu
    await topBar.openStylesMenu()
    await expect(page.getByTestId(`menu-saved-style-${id}`)).toBeVisible({ timeout: 3000 })
  })

  test('load saved style changes visual state', async ({ page }) => {
    // Change colorAlgorithm to something distinctive
    await page.evaluate(async () => {
      const mod = await import('/src/stores/appearanceStore.ts')
      mod.useAppearanceStore.setState({ colorAlgorithm: 'blackbody' })
    })

    // Save this style
    const topBar = new TopBar(page)
    const id = await saveStyleViaUI(page, topBar, STYLE_NAME)

    // Change to a different value
    await page.evaluate(async () => {
      const mod = await import('/src/stores/appearanceStore.ts')
      mod.useAppearanceStore.setState({ colorAlgorithm: 'phase' })
    })

    // Verify it changed
    const middleAlgo = await page.evaluate(async () => {
      const mod = await import('/src/stores/appearanceStore.ts')
      return mod.useAppearanceStore.getState().colorAlgorithm
    })
    expect(middleAlgo).toBe('phase')

    // Load saved style via testid
    await topBar.openStylesMenu()
    await page.getByTestId(`menu-saved-style-${id}`).click()

    // colorAlgorithm should be restored to 'blackbody'
    await expect(async () => {
      const restored = await page.evaluate(async () => {
        const mod = await import('/src/stores/appearanceStore.ts')
        return mod.useAppearanceStore.getState().colorAlgorithm
      })
      expect(restored).toBe('blackbody')
    }).toPass({ timeout: 3000 })
  })

  test('saved style persists across full page reload (IndexedDB)', async ({ page }) => {
    const topBar = new TopBar(page)
    const id = await saveStyleViaUI(page, topBar, STYLE_NAME)

    // Verify it exists before reload
    await topBar.openStylesMenu()
    await expect(page.getByTestId(`menu-saved-style-${id}`)).toBeVisible({ timeout: 3000 })
    await page.keyboard.press('Escape')

    // Full page reload
    await page.reload()
    await waitForAppLoaded(page)

    // Saved style must survive the reload (IndexedDB persistence)
    await topBar.openStylesMenu()
    await expect(
      page.getByTestId(`menu-saved-style-${id}`),
      'Saved style must persist in IndexedDB across page reload'
    ).toBeVisible({ timeout: 5000 })
  })

  test('delete saved style removes it from menu', async ({ page }) => {
    const topBar = new TopBar(page)
    const id = await saveStyleViaUI(page, topBar, STYLE_NAME)

    // Verify exists
    await topBar.openStylesMenu()
    await expect(page.getByTestId(`menu-saved-style-${id}`)).toBeVisible({ timeout: 3000 })
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
    await expect(page.getByTestId(`menu-saved-style-${id}`)).not.toBeVisible({ timeout: 3000 })
  })
})
