/**
 * E2E verification that the fourteen ζ-related analytic modes collapse into a
 * single "Zeta / Prime" Types-tab card, and that the Geometry-tab sub-mode
 * toggle row switches between the underlying quantum modes.
 *
 * @module scripts/playwright/zeta-prime-grouping.spec
 */

import { expect, test } from './fixtures'
import { getQuantumMode, waitForAppLoaded } from './helpers/app-helpers'
import { LeftPanel } from './pages/LeftPanel'
import { TopBar } from './pages/TopBar'

test.describe('Zeta / Prime UI grouping', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?t=schroedinger&d=3&qm=harmonicOscillator')
    await waitForAppLoaded(page)
  })

  test('Types tab shows one Zeta / Prime card, not fourteen', async ({ page }) => {
    const topBar = new TopBar(page)
    await topBar.openLeftPanel()

    await expect(page.getByTestId('object-type-group-zetaPrime')).toBeVisible({ timeout: 5000 })
    // The individual member modes no longer have their own top-level cards.
    for (const key of [
      'riemannZeta',
      'hilbertPolya',
      'modularKnot',
      'constraintSeam',
      'weilPositivity',
    ]) {
      await expect(page.getByTestId(`object-type-${key}`)).toHaveCount(0)
    }
  })

  test('group card lands on the default member, then the toggle row switches sub-mode', async ({
    page,
  }) => {
    const topBar = new TopBar(page)
    await topBar.openLeftPanel()
    const leftPanel = new LeftPanel(page)

    await page.getByTestId('object-type-group-zetaPrime').click()
    await expect(async () => {
      expect(await getQuantumMode(page)).toBe('riemannZeta')
    }).toPass({ timeout: 5000 })
    await expect(page.getByTestId('object-type-group-zetaPrime')).toHaveAttribute(
      'data-selected',
      'true'
    )

    // Geometry tab → the sub-mode toggle row picks a different ζ variant.
    await leftPanel.switchTab('Geometry')
    await expect(page.getByTestId('zeta-mode-selector')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('zeta-mode-riemannZeta')).toHaveAttribute('aria-pressed', 'true')

    await page.getByTestId('zeta-mode-constraintSeam').click({ force: true })
    await expect(async () => {
      expect(await getQuantumMode(page)).toBe('constraintSeam')
    }).toPass({ timeout: 5000 })
    await expect(page.getByTestId('zeta-mode-constraintSeam')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
})

test.describe('Zeta / Prime unified Scenario dropdown', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?t=schroedinger&d=3&qm=riemannZeta')
    await waitForAppLoaded(page)
  })

  test('lists every member mode and selecting a scenario triggers its sub-type', async ({
    page,
  }) => {
    const topBar = new TopBar(page)
    await topBar.openLeftPanel()

    const sel = page.getByTestId('scenario-selector')
    await expect(sel).toBeVisible({ timeout: 5000 })

    // The dropdown is a stable whole-type menu: presets of multiple member modes.
    const values = await sel
      .locator('option')
      .evaluateAll((opts) => (opts as HTMLOptionElement[]).map((o) => o.value))
    expect(values.some((v) => v.startsWith('constraintSeam::'))).toBe(true)
    expect(values.some((v) => v.startsWith('weilPositivity::'))).toBe(true)
    expect(values.some((v) => v.startsWith('riemannZeta::'))).toBe(true)

    // Selecting a constraintSeam scenario switches the active sub-type to it.
    const csValue = values.find((v) => v.startsWith('constraintSeam::'))!
    await sel.selectOption(csValue)
    await expect(async () => {
      expect(await getQuantumMode(page)).toBe('constraintSeam')
    }).toPass({ timeout: 5000 })
  })
})
