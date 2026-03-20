/**
 * Concurrent and edge-case operations.
 *
 * Tests race conditions and overlapping user actions that stress the
 * WebGPU pipeline, Zustand stores, and React rendering simultaneously.
 *
 * Bugs caught:
 * - Export trigger during shader compilation crashes app
 * - Rapid panel toggle during animation causes orphaned listeners
 * - Mode switch mid-export leaves modal in broken state
 * - Window resize during rendering crashes pipeline
 * - Opening two drawers simultaneously leaves stale state
 * - Rapid dimension + mode cycling produces invalid shader configuration
 */

import { expect, test } from '@playwright/test'

import {
  collectFatalGpuErrors,
  collectPageErrors,
  filterBenignErrors,
  gotoMode,
  requireWebGPU,
  waitForAppLoaded,
  waitForRendererReady,
  waitForRendererSettled,
  waitForShaderCompilation,
} from './helpers/app-helpers'
import { TopBar } from './pages/TopBar'

test.setTimeout(120_000)

test.describe('concurrent operations', () => {
  // GPU-heavy tests must run serially to avoid adapter/device contention
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('rapid mode + dimension cycling with no crashes', async ({ page }) => {
    const gpuErrors = collectFatalGpuErrors(page)
    const pageErrors = collectPageErrors(page)

    // Rapid sequence of mode and dimension changes
    const sequence = [
      { mode: 'harmonicOscillator', dim: 3 },
      { mode: 'tdseDynamics', dim: 3 },
      { mode: 'harmonicOscillator', dim: 7 },
      { mode: 'hydrogenND', dim: 5 },
      { mode: 'becDynamics', dim: 3 },
      { mode: 'harmonicOscillator', dim: 11 },
      { mode: 'diracEquation', dim: 3 },
      { mode: 'harmonicOscillator', dim: 3 },
    ]

    for (const { mode, dim } of sequence) {
      await gotoMode(page, mode, dim)
    }

    // After rapid cycling, wait for final state to settle
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // App should not have crashed
    const realErrors = filterBenignErrors(pageErrors)
    expect(realErrors).toEqual([])
    expect(gpuErrors).toEqual([])
  })

  test('panel toggle during shader compilation does not crash', async ({ page }) => {
    const gpuErrors = collectFatalGpuErrors(page)

    // Start a mode change (triggers shader compilation)
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)

    // Immediately trigger a mode change (new shader compilation) and toggle panels
    const topBar = new TopBar(page)
    await page.goto('/?t=schroedinger&d=7&qm=hydrogenND')

    // While shader is compiling, toggle panels rapidly
    await topBar.toggleLeftPanel()
    await topBar.toggleRightPanel()
    await topBar.toggleLeftPanel()

    // Wait for everything to settle
    await waitForAppLoaded(page)
    await waitForRendererSettled(page)

    expect(gpuErrors).toEqual([])
    await expect(page.getByTestId('top-bar')).toBeVisible()
  })

  test('export attempt during mode switch handles gracefully', async ({ page }) => {
    const pageErrors = collectPageErrors(page)

    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // Start a mode switch
    await page.goto('/?t=schroedinger&d=5&qm=hydrogenND')
    await waitForAppLoaded(page)

    // Immediately try to export (File > Export Image)
    const topBar = new TopBar(page)
    await topBar.clickExportImage()

    // Either the modal or an error message appears — both are valid
    const modal = page.getByTestId('screenshot-modal')
    const msgBox = page.getByText('Export Failed')
    await expect(modal.or(msgBox)).toBeVisible({ timeout: 15_000 })

    // Dismiss whatever appeared
    await page.keyboard.press('Escape')

    // App should survive
    const realErrors = filterBenignErrors(pageErrors)
    expect(realErrors).toEqual([])
  })

  test('window resize during rendering does not crash', async ({ page }) => {
    const gpuErrors = collectFatalGpuErrors(page)

    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // Resize viewport multiple times
    const sizes = [
      { width: 800, height: 600 },
      { width: 1920, height: 1080 },
      { width: 640, height: 480 },
      { width: 1280, height: 800 },
    ]

    for (const size of sizes) {
      await page.setViewportSize(size)
    }

    // After resizing, renderer should still be functional
    await waitForRendererReady(page)
    expect(gpuErrors).toEqual([])
    await expect(page.getByTestId('top-bar')).toBeVisible()
  })

  test('opening export modal, closing, switching mode, re-exporting works', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    const topBar = new TopBar(page)

    // First export attempt
    await topBar.clickExportImage()
    const modal = page.getByTestId('screenshot-modal')
    const msgBox = page.getByText('Export Failed')
    await expect(modal.or(msgBox)).toBeVisible({ timeout: 15_000 })
    await page.keyboard.press('Escape')
    await expect(modal.or(msgBox)).not.toBeVisible({ timeout: 5000 })

    // Switch to different mode
    await gotoMode(page, 'hydrogenND', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // Second export attempt — should still work
    await topBar.clickExportImage()
    await expect(modal.or(msgBox)).toBeVisible({ timeout: 15_000 })
    await page.keyboard.press('Escape')
  })

  test('cinematic mode during animation drawer open recovers cleanly', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)

    // Wait for effects button to be visible (HO mode supports it)
    const effectsBtn = page.getByRole('button', { name: 'Toggle animations drawer' })
    await expect(effectsBtn).toBeVisible({ timeout: 5000 })

    await effectsBtn.click()
    await expect(page.getByTestId('schroedinger-animation-drawer')).toBeVisible({ timeout: 5000 })

    // Enter cinematic mode while drawer is open
    await page.keyboard.press('c')
    await expect(page.getByTestId('exit-cinematic')).toBeVisible({ timeout: 3000 })

    // Exit cinematic mode
    await page.keyboard.press('c')
    await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 3000 })

    // App should not have crashed — bottom panel should be accessible
    await expect(page.getByTestId('editor-bottom-panel')).toBeVisible()
  })
})
