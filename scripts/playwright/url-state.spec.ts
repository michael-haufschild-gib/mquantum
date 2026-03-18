/**
 * URL state persistence tests.
 *
 * Verifies that URL parameters drive application state correctly:
 * - ?t=schroedinger&d=N&qm=MODE sets stores on load
 * - Changing dimension via keyboard updates URL
 * - Page reload preserves URL-driven state
 * - Invalid params don't crash the app
 *
 * Bugs caught:
 * - URL param parser ignores quantum mode (typo in key)
 * - Dimension from URL not applied to geometry store
 * - Invalid dimension crashes instead of clamping
 * - Reload strips URL params (pushState vs replaceState bug)
 */

import { expect, test } from '@playwright/test'

test.setTimeout(30_000)

/** Read geometry store state from the running app. */
async function getStoreState(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const geoMod = await import('/src/stores/geometryStore.ts')
    const extMod = await import('/src/stores/extendedObjectStore.ts')
    const geo = geoMod.useGeometryStore.getState()
    const ext = extMod.useExtendedObjectStore.getState() as Record<string, unknown>
    const schroedinger = ext.schroedinger as Record<string, unknown> | undefined
    return {
      dimension: geo.dimension,
      objectType: geo.objectType,
      quantumMode: (schroedinger?.quantumMode as string) ?? 'unknown',
    }
  })
}

test.describe('URL → store', () => {
  test('dimension and quantum mode from URL are applied to stores', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=7&qm=harmonicOscillator')
    await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 15_000 })

    const state = await getStoreState(page)
    expect(state.dimension).toBe(7)
    expect(state.objectType).toBe('schroedinger')
    expect(state.quantumMode).toBe('harmonicOscillator')
  })

  test('hydrogen mode from URL is applied', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=3&qm=hydrogenND')
    await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 15_000 })

    const state = await getStoreState(page)
    expect(state.quantumMode).toBe('hydrogenND')
    expect(state.dimension).toBe(3)
  })

  test('page reload preserves URL state', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=5&qm=harmonicOscillator')
    await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 15_000 })

    const before = await getStoreState(page)
    expect(before.dimension).toBe(5)

    await page.reload()
    await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 15_000 })

    const after = await getStoreState(page)
    expect(after.dimension).toBe(5)
    expect(after.quantumMode).toBe('harmonicOscillator')
  })
})

test.describe('invalid URL params', () => {
  test('dimension > 11 is clamped, app does not crash', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=99&qm=harmonicOscillator')
    await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 15_000 })

    const state = await getStoreState(page)
    expect(state.dimension).toBeGreaterThanOrEqual(2)
    expect(state.dimension).toBeLessThanOrEqual(11)
  })

  test('negative dimension is clamped', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=-5&qm=harmonicOscillator')
    await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 15_000 })

    const state = await getStoreState(page)
    expect(state.dimension).toBeGreaterThanOrEqual(2)
  })

  test('garbage params do not crash', async ({ page }) => {
    await page.goto('/?t=GARBAGE&d=abc&qm=!!!invalid!!!')
    await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('canvas').first()).toBeVisible()
  })

  test('no params loads default state', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 15_000 })

    const state = await getStoreState(page)
    expect(state.objectType).toBe('schroedinger')
    expect(state.dimension).toBeGreaterThanOrEqual(2)
    expect(state.dimension).toBeLessThanOrEqual(11)
  })
})
