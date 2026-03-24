/**
 * Page object for the video export modal.
 *
 * Bug caught: tab content not lazy-loading, preset selection not updating
 * stats, action button disabled incorrectly.
 */

import { expect, type Locator, type Page } from '@playwright/test'

export class VideoExportModal {
  readonly page: Page
  readonly dialog: Locator

  constructor(page: Page) {
    this.page = page
    this.dialog = page.getByRole('dialog', { name: 'Video Export Studio' })
  }

  async isVisible(): Promise<boolean> {
    return this.dialog.isVisible()
  }

  async waitForVisible(): Promise<void> {
    await expect(this.dialog).toBeVisible({ timeout: 10_000 })
  }

  // ─── Tabs ────────────────────────────────────────────────────────────

  async switchTab(tabName: string): Promise<void> {
    await this.dialog.getByRole('tab', { name: tabName }).click({ force: true })
  }

  async expectTabVisible(tabName: string): Promise<void> {
    await expect(this.dialog.getByRole('tab', { name: tabName })).toBeVisible()
  }

  // ─── Presets Tab ─────────────────────────────────────────────────────

  async clickPreset(presetName: RegExp | string): Promise<void> {
    await this.dialog.getByRole('button', { name: presetName }).click()
  }

  // ─── Quick Stats ─────────────────────────────────────────────────────

  async getQuickStatText(label: string): Promise<string> {
    const testId = `quick-stat-${label.toLowerCase()}`
    return (await this.page.getByTestId(testId).textContent()) ?? ''
  }

  async expectQuickStatsVisible(): Promise<void> {
    await expect(this.page.getByTestId('quick-stat-res')).toBeVisible()
    await expect(this.page.getByTestId('quick-stat-fps')).toBeVisible()
    await expect(this.page.getByTestId('quick-stat-dur')).toBeVisible()
  }

  // ─── Action Button ───────────────────────────────────────────────────

  getActionButton(): Locator {
    return this.dialog.getByRole('button', {
      name: /Start Rendering|Select File & Start/i,
    })
  }

  async expectActionButtonVisible(): Promise<void> {
    await expect(this.getActionButton()).toBeVisible()
  }

  // ─── Settings Tab assertions ─────────────────────────────────────────

  async expectSettingsContent(): Promise<void> {
    await expect(this.dialog.getByText('Output Format')).toBeVisible({ timeout: 5000 })
    await expect(this.dialog.getByText('Resolution')).toBeVisible()
  }

  // ─── Close ───────────────────────────────────────────────────────────

  async close(): Promise<void> {
    await this.page.keyboard.press('Escape')
    await expect(this.dialog).not.toBeVisible({ timeout: 5000 })
  }
}
