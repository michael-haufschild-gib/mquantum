/**
 * Smoke test: the app loads without crashing.
 *
 * Bug caught: any initialization error that prevents the React tree
 * from mounting — broken imports, store init crashes, WebGPU detection
 * failures that throw instead of showing fallback UI.
 */

import { expect, test } from '@playwright/test'

test.setTimeout(30_000)

test('app loads and shows top bar', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/')
  await page.waitForLoadState('domcontentloaded')

  await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 15_000 })

  const real = pageErrors.filter((e) => !e.includes('ResizeObserver'))
  expect(real, 'No uncaught page errors on load').toEqual([])
})

test('canvas element is visible after load', async ({ page }) => {
  await page.goto('/')

  // Either the WebGPU canvas or the "WebGPU Required" fallback must appear
  const canvas = page.locator('canvas').first()
  const fallback = page.getByText('WebGPU Required')

  // Wait for one of the two outcomes
  await expect(canvas.or(fallback)).toBeVisible({ timeout: 15_000 })
})

test('no fatal GPU errors that prevent rendering', async ({ page }) => {
  const fatalErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    // Fatal = errors that crash the renderer, not recoverable pipeline failures
    // The renderer logs "Pipeline creation failed, clearing all caches" for
    // workgroup limit issues — it recovers by rebuilding. That's not fatal.
    if (/rendergraph.*cycle|unhandled.*webgpu|device.*lost/i.test(text)) {
      fatalErrors.push(text)
    }
  })

  await page.goto('/')
  await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 15_000 })

  // Wait for renderer init
  await page.waitForTimeout(3000)

  expect(fatalErrors, 'No fatal GPU errors').toEqual([])
})
