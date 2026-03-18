/**
 * Page object for the screenshot export modal.
 *
 * Bug caught: capture producing empty blob, crop state not reset between
 * exports, download producing 0-byte file, modal not dismissible.
 */

import { expect, type Locator, type Page } from '@playwright/test'

export class ScreenshotModal {
  readonly page: Page
  readonly root: Locator
  readonly previewImage: Locator
  readonly cropBox: Locator
  readonly cropDimensions: Locator
  readonly saveButton: Locator
  readonly copyButton: Locator

  constructor(page: Page) {
    this.page = page
    this.root = page.getByTestId('screenshot-modal')
    this.previewImage = page.getByTestId('crop-preview-image')
    this.cropBox = page.getByTestId('crop-box')
    this.cropDimensions = page.getByTestId('crop-dimensions')
    this.saveButton = page.getByTestId('screenshot-save-button')
    this.copyButton = page.getByTestId('screenshot-copy-button')
  }

  async isVisible(): Promise<boolean> {
    return this.root.isVisible()
  }

  async waitForVisible(): Promise<void> {
    await expect(this.root).toBeVisible({ timeout: 15_000 })
  }

  /** Wait for the preview image to fully load (naturalWidth > 0). */
  async waitForPreviewLoaded(): Promise<void> {
    await expect(this.previewImage).toBeVisible({ timeout: 10_000 })
    await this.page.waitForFunction(
      () => {
        const el = document.querySelector(
          '[data-testid="crop-preview-image"]'
        ) as HTMLImageElement | null
        return el && el.complete && el.naturalWidth > 0
      },
      { timeout: 10_000 }
    )
  }

  /** Assert preview image src is a valid PNG data URL. */
  async expectPreviewIsPng(): Promise<void> {
    const src = await this.previewImage.getAttribute('src')
    expect(src).toMatch(/^data:image\/png/)
  }

  /** Assert all 4 crop handles are visible. */
  async expectCropHandlesVisible(): Promise<void> {
    for (const corner of ['nw', 'ne', 'se', 'sw']) {
      await expect(this.page.getByTestId(`crop-handle-${corner}`)).toBeVisible()
    }
  }

  /** Get the dimensions text (e.g. "1920 × 1080"). */
  async getDimensionsText(): Promise<string> {
    return (await this.cropDimensions.textContent()) ?? ''
  }

  /** Click Save and wait for the download event. Returns the download. */
  async save() {
    const downloadPromise = this.page.waitForEvent('download', { timeout: 10_000 })
    await this.saveButton.click()
    return downloadPromise
  }

  async close(): Promise<void> {
    await this.page.keyboard.press('Escape')
    await expect(this.root).not.toBeVisible({ timeout: 5000 })
  }
}
