/**
 * Smoke test: the app loads without crashing.
 *
 * Bug caught: any initialization error that prevents the React tree
 * from mounting — broken imports, store init crashes, WebGPU detection
 * failures that throw instead of showing fallback UI.
 */

import { expect, test } from './fixtures'
import {
  collectPageErrors,
  filterBenignErrors,
  waitForAppLoaded,
  waitForRendererSettled,
} from './helpers/app-helpers'
import { TopBar } from './pages/TopBar'

test.setTimeout(30_000)

test('app loads and shows top bar', async ({ page }) => {
  const pageErrors = collectPageErrors(page)

  await page.goto('/')
  const topBar = new TopBar(page)
  await topBar.waitForVisible()

  const real = filterBenignErrors(pageErrors)
  expect(real, 'No uncaught page errors on load').toEqual([])
})

test('canvas element is visible after load', async ({ page }) => {
  await page.goto('/')

  // Either the WebGPU canvas or the "WebGPU Required" fallback must appear
  const canvas = page.locator('canvas').first()
  const fallback = page.getByText('WebGPU Required')

  await expect(canvas.or(fallback)).toBeVisible({ timeout: 15_000 })
})

test('no fatal GPU errors — renderer reaches ready or error state', async ({ page }) => {
  const pageErrors = collectPageErrors(page)

  await page.goto('/')
  await waitForAppLoaded(page)

  // Wait for renderer to settle — deterministic, no arbitrary timeout
  const state = await waitForRendererSettled(page)

  // If renderer is ready, verify no page-level errors
  if (state === 'ready') {
    const real = filterBenignErrors(pageErrors)
    expect(real, 'No uncaught page errors with ready renderer').toEqual([])
  }

  // Regardless of state, renderer must not be stuck at "initializing"
  expect(['ready', 'error']).toContain(state)
})
