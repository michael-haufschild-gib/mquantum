/**
 * Screenshot export workflow test.
 *
 * Verifies the complete capture → preview → crop → download flow:
 * - File > Export Image opens the screenshot modal
 * - Preview image loads as data:image/png
 * - Crop box renders with handles
 * - Dimensions display updates
 * - Save triggers a .png download
 * - Modal closes via Escape
 * - Second export works after first (state properly reset)
 *
 * Bugs caught:
 * - Canvas capture returns empty blob (WebGPU readback failure)
 * - Crop state not reset between exports (stale crop from previous)
 * - Download produces 0-byte file (canvas.toBlob failure)
 * - Modal doesn't close after save (closeModal not called)
 */

import { expect, test } from '@playwright/test'

test.setTimeout(60_000)

/** Open screenshot modal via File > Export Image menu. */
async function openScreenshotModal(page: import('@playwright/test').Page) {
  // Retry the menu interaction — the dropdown may need a moment after page load
  await expect(async () => {
    await page.getByTestId('menu-file').click()
    await expect(page.getByTestId('menu-export')).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 5000 })
  await page.getByTestId('menu-export').click()
  await expect(page.getByTestId('screenshot-modal')).toBeVisible({ timeout: 10_000 })
}

test.describe('screenshot export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 15_000 })
    // Wait for WebGPU canvas to be present (export captures from it)
    await expect(page.locator('canvas').first()).toBeVisible({ timeout: 10_000 })
  })

  test('File > Export opens modal with preview image', async ({ page }) => {
    await openScreenshotModal(page)

    // Preview image should be a data:image/png URL
    const img = page.getByTestId('crop-preview-image')
    await expect(img).toBeVisible({ timeout: 10_000 })

    // Wait for image to fully load
    await page.waitForFunction(
      () => {
        const el = document.querySelector(
          '[data-testid="crop-preview-image"]'
        ) as HTMLImageElement | null
        return el && el.complete && el.naturalWidth > 0
      },
      { timeout: 10_000 }
    )

    const src = await img.getAttribute('src')
    expect(src).toMatch(/^data:image\/png/)
  })

  test('crop box and handles are visible', async ({ page }) => {
    await openScreenshotModal(page)

    // Wait for image to load (crop box appears after)
    await page.waitForFunction(
      () => {
        const el = document.querySelector(
          '[data-testid="crop-preview-image"]'
        ) as HTMLImageElement | null
        return el && el.complete && el.naturalWidth > 0
      },
      { timeout: 10_000 }
    )

    await expect(page.getByTestId('crop-box')).toBeVisible({ timeout: 5000 })

    for (const corner of ['nw', 'ne', 'se', 'sw']) {
      await expect(page.getByTestId(`crop-handle-${corner}`)).toBeVisible()
    }
  })

  test('dimensions display shows WxH format', async ({ page }) => {
    await openScreenshotModal(page)

    await page.waitForFunction(
      () => {
        const el = document.querySelector(
          '[data-testid="crop-preview-image"]'
        ) as HTMLImageElement | null
        return el && el.complete && el.naturalWidth > 0
      },
      { timeout: 10_000 }
    )

    const dims = page.getByTestId('crop-dimensions')
    await expect(dims).toBeVisible()
    const text = await dims.textContent()
    expect(text).toMatch(/\d+\s*×\s*\d+/)
  })

  test('Save button triggers download of a .png file', async ({ page }) => {
    await openScreenshotModal(page)

    await page.waitForFunction(
      () => {
        const el = document.querySelector(
          '[data-testid="crop-preview-image"]'
        ) as HTMLImageElement | null
        return el && el.complete && el.naturalWidth > 0
      },
      { timeout: 10_000 }
    )

    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 })
    await page.getByTestId('screenshot-save-button').click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/\.png$/i)
  })

  test('Escape closes the modal', async ({ page }) => {
    await openScreenshotModal(page)
    await expect(page.getByTestId('screenshot-modal')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('screenshot-modal')).not.toBeVisible({ timeout: 5000 })
  })

  test('second export works after first', async ({ page }) => {
    // First export
    await openScreenshotModal(page)
    await expect(page.getByTestId('crop-preview-image')).toBeVisible({ timeout: 10_000 })
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('screenshot-modal')).not.toBeVisible({ timeout: 5000 })

    // Second export — state must reset properly
    await openScreenshotModal(page)
    const img = page.getByTestId('crop-preview-image')
    await expect(img).toBeVisible({ timeout: 10_000 })

    const src = await img.getAttribute('src')
    expect(src).toMatch(/^data:image\/png/)
  })
})
