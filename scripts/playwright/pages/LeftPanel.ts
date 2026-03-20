/**
 * Page object for the left panel — dimension selector, tabs, quantum controls.
 *
 * Bug caught: tab switching not loading content, dimension selector not
 * updating store, quantum controls not appearing for mode.
 */

import { expect, type Locator, type Page } from '@playwright/test'

import { UI_SETTLE_TIMEOUT } from '../helpers/app-helpers'

export class LeftPanel {
  readonly page: Page
  readonly root: Locator
  readonly tabs: Locator
  readonly dimensionSelector: Locator
  readonly surfaceModeSelector: Locator

  constructor(page: Page) {
    this.page = page
    this.root = page.getByTestId('left-panel')
    this.tabs = page.getByTestId('left-panel-tabs')
    this.dimensionSelector = page.getByTestId('dimension-selector')
    this.surfaceModeSelector = page.getByTestId('surface-mode-selector')
  }

  async isVisible(): Promise<boolean> {
    return this.root.isVisible()
  }

  async waitForVisible(): Promise<void> {
    await expect(this.root).toBeVisible({ timeout: UI_SETTLE_TIMEOUT })
  }

  // ─── Tabs ────────────────────────────────────────────────────────────

  /** Click a tab by its label text (e.g. "Type", "Geometry"). */
  async switchTab(tabLabel: string): Promise<void> {
    const tab = this.tabs.getByRole('tab', { name: tabLabel })
    await tab.click({ force: true }) // force: true for animated panels
  }

  /** Assert a specific tab is active by checking aria-selected. */
  async expectTabActive(tabLabel: string): Promise<void> {
    const tab = this.tabs.getByRole('tab', { name: tabLabel })
    await expect(tab).toHaveAttribute('aria-selected', 'true')
  }

  // ─── Dimension Selector ──────────────────────────────────────────────

  /** Click a dimension value in the toggle group (e.g. "3", "5", "11"). */
  async selectDimension(dim: number): Promise<void> {
    const option = this.page.getByTestId(`dimension-selector-${dim}`)
    await option.click()
  }

  /** Get the currently selected dimension from the toggle group. */
  async getSelectedDimension(): Promise<number> {
    // The active toggle button has data-state="on" or aria-pressed="true"
    const buttons = this.dimensionSelector.locator('button')
    const count = await buttons.count()
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i)
      const pressed = await btn.getAttribute('aria-pressed')
      if (pressed === 'true') {
        const text = await btn.textContent()
        return parseInt(text?.replace('D', '') ?? '0', 10)
      }
    }
    return -1 // none selected
  }

  // ─── Object Type / Quantum Mode ─────────────────────────────────────

  /** Click a quantum mode card in the Type tab. */
  async selectQuantumMode(mode: string): Promise<void> {
    const card = this.page.getByTestId(`object-type-${mode}`)
    await card.click()
  }

  /** Assert a quantum mode card is selected. */
  async expectQuantumModeSelected(mode: string): Promise<void> {
    const card = this.page.getByTestId(`object-type-${mode}`)
    await expect(card).toHaveAttribute('data-selected', 'true', { timeout: UI_SETTLE_TIMEOUT })
  }
}
