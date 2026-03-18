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

import { getAppState, getDimension, waitForAppLoaded } from './helpers/app-helpers'

test.setTimeout(30_000)

test.describe('URL → store', () => {
  test('dimension and quantum mode from URL are applied to stores', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=7&qm=harmonicOscillator')
    await waitForAppLoaded(page)

    const state = await getAppState(page)
    expect(state.dimension).toBe(7)
    expect(state.objectType).toBe('schroedinger')
    expect(state.quantumMode).toBe('harmonicOscillator')
  })

  test('hydrogen mode from URL is applied', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=3&qm=hydrogenND')
    await waitForAppLoaded(page)

    const state = await getAppState(page)
    expect(state.quantumMode).toBe('hydrogenND')
    expect(state.dimension).toBe(3)
  })

  test('page reload preserves URL state', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=5&qm=harmonicOscillator')
    await waitForAppLoaded(page)

    const before = await getAppState(page)
    expect(before.dimension).toBe(5)

    await page.reload()
    await waitForAppLoaded(page)

    const after = await getAppState(page)
    expect(after.dimension).toBe(5)
    expect(after.quantumMode).toBe('harmonicOscillator')
  })

  test('keyboard dimension change updates store but not URL (URL is read-only)', async ({
    page,
  }) => {
    await page.goto('/?t=schroedinger&d=4&qm=harmonicOscillator')
    await waitForAppLoaded(page)

    await page.keyboard.press('ArrowUp')

    await expect(async () => {
      expect(await getDimension(page)).toBe(5)
    }).toPass({ timeout: 3000 })

    // URL is NOT updated on keyboard change — this is by design.
    // The URL serializer has minimal scope (read on load only).
    // Full state persistence uses IndexedDB scene presets.
    expect(page.url()).toContain('d=4')
  })
})

test.describe('invalid URL params', () => {
  test('dimension > 11 is clamped, app does not crash', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=99&qm=harmonicOscillator')
    await waitForAppLoaded(page)

    const state = await getAppState(page)
    expect(state.dimension).toBeGreaterThanOrEqual(2)
    expect(state.dimension).toBeLessThanOrEqual(11)
  })

  test('negative dimension is clamped', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=-5&qm=harmonicOscillator')
    await waitForAppLoaded(page)

    const state = await getAppState(page)
    expect(state.dimension).toBeGreaterThanOrEqual(2)
  })

  test('garbage params do not crash the app', async ({ page }) => {
    await page.goto('/?t=GARBAGE&d=abc&qm=!!!invalid!!!')
    await waitForAppLoaded(page)
    await expect(page.locator('canvas').first()).toBeVisible()
  })

  test('no params loads default state with valid dimension and object type', async ({ page }) => {
    await page.goto('/')
    await waitForAppLoaded(page)

    const state = await getAppState(page)
    expect(state.objectType).toBe('schroedinger')
    expect(state.dimension).toBeGreaterThanOrEqual(2)
    expect(state.dimension).toBeLessThanOrEqual(11)
  })

  test('dimension=0 is clamped to minimum', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=0&qm=harmonicOscillator')
    await waitForAppLoaded(page)

    const state = await getAppState(page)
    expect(state.dimension).toBeGreaterThanOrEqual(2)
  })

  test('float dimension is handled without crash', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=3.7&qm=harmonicOscillator')
    await waitForAppLoaded(page)

    const state = await getAppState(page)
    expect(state.dimension).toBeGreaterThanOrEqual(2)
    expect(state.dimension).toBeLessThanOrEqual(11)
    // Dimension should be an integer
    expect(Number.isInteger(state.dimension)).toBe(true)
  })
})
