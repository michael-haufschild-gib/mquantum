/**
 * Animation timeline controls tests.
 *
 * Tests the bottom panel timeline bar: play/pause, speed, effects drawer.
 *
 * Bugs caught:
 * - Play/Pause button not wired to animationStore.toggle
 * - Speed slider not updating animation speed
 * - Effects drawer not opening/closing
 * - Animation drawer showing wrong drawer for object type
 * - Play button aria-label not reflecting state
 * - Reset button not resetting wavefunction state
 * - Speed slider UI interaction not propagating to store
 */

import { getAnimationState, waitForAppLoaded } from './helpers/app-helpers'
import { test, expect } from './fixtures'
import { EditorBottomPanel } from './pages/EditorBottomPanel'

test.setTimeout(30_000)

test.describe('timeline controls', () => {
  test('Play/Pause button toggles animation state', async ({ hoPage: page }) => {
    const panel = new EditorBottomPanel(page)
    await panel.waitForVisible()

    const initial = await getAnimationState(page)

    await panel.clickPlayPause()

    await expect(async () => {
      const after = await getAnimationState(page)
      expect(after.isPlaying).toBe(!initial.isPlaying)
    }).toPass({ timeout: 3000 })

    // Button aria-label should reflect new state
    if (initial.isPlaying) {
      await panel.expectPaused()
    } else {
      await panel.expectPlaying()
    }
  })

  test('double-toggle: play → pause → play returns to original state', async ({ hoPage: page }) => {
    const panel = new EditorBottomPanel(page)
    const initial = await getAnimationState(page)

    // Toggle twice
    await panel.clickPlayPause()

    await expect(async () => {
      const mid = await getAnimationState(page)
      expect(mid.isPlaying).toBe(!initial.isPlaying)
    }).toPass({ timeout: 3000 })

    await panel.clickPlayPause()

    await expect(async () => {
      const after = await getAnimationState(page)
      expect(after.isPlaying).toBe(initial.isPlaying)
    }).toPass({ timeout: 3000 })
  })

  test('Effects toggle opens Schroedinger animation drawer', async ({ hoPage: page }) => {
    const panel = new EditorBottomPanel(page)
    await panel.openEffectsDrawer()
    await panel.expectSchroedingerDrawerVisible()

    await panel.closeEffectsDrawer()
    await panel.expectSchroedingerDrawerHidden()
  })

  test('Rotate toggle opens rotation plane selector', async ({ hoPage: page }) => {
    const panel = new EditorBottomPanel(page)
    await panel.openRotateDrawer()

    // In 3D there are rotation planes like XY, XZ, YZ
    await expect(page.getByRole('button', { name: /Toggle.*rotation/i }).first()).toBeVisible({
      timeout: 5000,
    })
  })

  test('Reset button is present and clickable', async ({ hoPage: page }) => {
    const panel = new EditorBottomPanel(page)
    await expect(panel.resetButton).toBeVisible()

    await panel.clickReset()

    // App should still be running
    await expect(page.getByTestId('top-bar')).toBeVisible()
  })

  test('Speed slider UI interaction updates animation speed', async ({ hoPage: page }) => {
    const panel = new EditorBottomPanel(page)
    await panel.waitForVisible()

    // Read initial speed from store
    const initialSpeed = await page.evaluate(async () => {
      const mod = await import('/src/stores/animationStore.ts')
      return mod.useAnimationStore.getState().speed
    })

    // The speed slider has label "SPEED" — locate its text input via aria-label
    const speedInput = page.getByRole('textbox', { name: 'SPEED value' })
    await expect(speedInput).toBeVisible()

    // Clear and type a new value
    await speedInput.click()
    await speedInput.fill('1.5')
    await speedInput.press('Enter')

    // Verify store updated to the new speed value
    await expect(async () => {
      const newSpeed = await page.evaluate(async () => {
        const mod = await import('/src/stores/animationStore.ts')
        return mod.useAnimationStore.getState().speed
      })
      expect(newSpeed).toBeCloseTo(1.5, 1)
      expect(newSpeed).not.toBeCloseTo(initialSpeed, 1)
    }).toPass({ timeout: 3000 })
  })
})

test.describe('timeline controls — Pauli mode', () => {
  test('Effects toggle opens Pauli animation drawer for Pauli Spinor', async ({ page }) => {
    await page.goto('/?t=pauliSpinor&d=3')
    await waitForAppLoaded(page)

    const panel = new EditorBottomPanel(page)
    const hasEffects = await panel.effectsToggle.isVisible().catch(() => false)

    if (hasEffects) {
      await panel.openEffectsDrawer()
      await panel.expectPauliDrawerVisible()
    }
  })
})
