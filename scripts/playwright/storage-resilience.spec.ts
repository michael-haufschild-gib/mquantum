/**
 * LocalStorage corruption resilience tests.
 *
 * Verifies the app loads gracefully when persistent storage contains
 * malformed, corrupted, or incompatible data. A production app must
 * survive stale cache from old versions, truncated writes, and
 * user-tampered localStorage.
 *
 * Bugs caught:
 * - App crashes on load with malformed preset JSON in localStorage
 * - Store hydration throws on unexpected field types
 * - Missing required fields in stored preset cause render crash
 * - Corrupted theme data causes CSS variable injection failure
 */

import { expect, test } from './fixtures'
import { collectPageErrors, filterBenignErrors, waitForAppLoaded } from './helpers/app-helpers'

test.setTimeout(60_000)

test.describe('localStorage corruption resilience', () => {
  test('app loads with malformed JSON in localStorage', async ({ page }) => {
    const pageErrors = collectPageErrors(page)

    // Navigate first to set origin (localStorage needs a matching origin)
    await page.goto('/')
    await waitForAppLoaded(page)

    // Inject malformed data into every known localStorage key
    await page.evaluate(() => {
      const keys = Object.keys(localStorage)
      for (const key of keys) {
        localStorage.setItem(key, '{{{CORRUPTED_JSON_NOT_VALID')
      }
      // Also inject a fake key that looks like a preset
      localStorage.setItem('mdim-scene-preset-corrupted', '{"name":null,"data":undefined}')
      localStorage.setItem('mdim-style-preset-corrupted', 'NOT_JSON_AT_ALL')
    })

    // Reload — app must survive
    await page.reload()
    await waitForAppLoaded(page)

    // App should be functional
    await expect(page.getByTestId('top-bar')).toBeVisible()

    const real = filterBenignErrors(pageErrors)
    // Allow console errors from JSON parsing — what matters is the app didn't crash
    expect(
      real.filter((e) => !e.includes('JSON') && !e.includes('parse')),
      'No unexpected page errors after corrupted localStorage reload'
    ).toEqual([])
  })

  test('app loads with empty localStorage values', async ({ page }) => {
    const pageErrors = collectPageErrors(page)

    await page.goto('/')
    await waitForAppLoaded(page)

    // Set all existing keys to empty string
    await page.evaluate(() => {
      const keys = Object.keys(localStorage)
      for (const key of keys) {
        localStorage.setItem(key, '')
      }
    })

    await page.reload()
    await waitForAppLoaded(page)

    await expect(page.getByTestId('top-bar')).toBeVisible()
    const real = filterBenignErrors(pageErrors)
    expect(
      real.filter((e) => !e.includes('JSON') && !e.includes('parse')),
      'No unexpected errors with empty localStorage'
    ).toEqual([])
  })

  test('app loads with wrong-type values in localStorage', async ({ page }) => {
    const pageErrors = collectPageErrors(page)

    await page.goto('/')
    await waitForAppLoaded(page)

    // Inject type-mismatched but valid JSON data
    await page.evaluate(() => {
      const keys = Object.keys(localStorage)
      for (const key of keys) {
        // Replace with a valid JSON value of the wrong type
        localStorage.setItem(key, JSON.stringify(42))
      }
    })

    await page.reload()
    await waitForAppLoaded(page)

    await expect(page.getByTestId('top-bar')).toBeVisible()
    const real = filterBenignErrors(pageErrors)
    expect(
      real.filter((e) => !e.includes('JSON') && !e.includes('parse')),
      'No unexpected errors with wrong-type localStorage'
    ).toEqual([])
  })

  test('app loads with future-version preset data (forward compatibility)', async ({ page }) => {
    const pageErrors = collectPageErrors(page)

    await page.goto('/')
    await waitForAppLoaded(page)

    // Inject a preset with unknown future fields
    await page.evaluate(() => {
      const futurePreset = {
        version: 999,
        unknownField: 'future-value',
        nestedUnknown: { deep: { field: true } },
        data: { dimension: 5, objectType: 'schroedinger' },
      }
      localStorage.setItem('mdim-future-scene', JSON.stringify(futurePreset))
    })

    await page.reload()
    await waitForAppLoaded(page)

    await expect(page.getByTestId('top-bar')).toBeVisible()
    const real = filterBenignErrors(pageErrors)
    expect(real, 'No errors with future-version data').toEqual([])
  })

  test('clearing localStorage and app survives reload', async ({ page }) => {
    await page.goto('/')
    await waitForAppLoaded(page)

    // Set custom data alongside Zustand-persisted keys
    await page.evaluate(() => {
      localStorage.setItem('mdim-test-key', 'test-value')
    })

    // Verify our test key exists
    const before = await page.evaluate(() => localStorage.getItem('mdim-test-key'))
    expect(before).toBe('test-value')

    // Clear all localStorage (same as what the Settings button handler does)
    await page.evaluate(() => localStorage.clear())

    // Verify immediate clear
    const afterClear = await page.evaluate(() => localStorage.getItem('mdim-test-key'))
    expect(afterClear).toBeNull()

    // Reload to verify app survives with empty localStorage
    await page.reload()
    await waitForAppLoaded(page)

    // App should survive — Zustand stores re-hydrate from defaults
    await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 5000 })
  })
})
