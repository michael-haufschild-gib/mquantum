/**
 * Page object for the right panel — Object/Scene/System tabs, sections.
 *
 * Bug caught: tab content not lazy-loading, section toggles broken,
 * post-processing controls not wired to store.
 */

import { expect, type Locator, type Page } from '@playwright/test'

import { UI_SETTLE_TIMEOUT } from '../helpers/app-helpers'

export class RightPanel {
  readonly page: Page
  readonly root: Locator
  readonly tabs: Locator

  constructor(page: Page) {
    this.page = page
    this.root = page.getByTestId('right-panel')
    this.tabs = page.getByTestId('right-panel-tabs')
  }

  async isVisible(): Promise<boolean> {
    return this.root.isVisible()
  }

  async waitForVisible(): Promise<void> {
    await expect(this.root).toBeVisible({ timeout: UI_SETTLE_TIMEOUT })
  }

  // ─── Tabs ────────────────────────────────────────────────────────────

  async switchTab(tabLabel: string): Promise<void> {
    const tab = this.tabs.getByRole('tab', { name: tabLabel })
    await tab.click({ force: true })
  }

  async expectTabActive(tabLabel: string): Promise<void> {
    const tab = this.tabs.getByRole('tab', { name: tabLabel })
    await expect(tab).toHaveAttribute('aria-selected', 'true')
  }

  /** Switch to the Analysis tab and wait for the tab to become active. */
  async switchToAnalysisTab(): Promise<void> {
    await this.switchTab('Analysis')
  }

  // ─── Sections ────────────────────────────────────────────────────────

  /** Check that the Faces/Surface section is visible in Object tab. */
  async expectFacesSectionVisible(): Promise<void> {
    await expect(this.page.getByTestId('section-faces')).toBeVisible({ timeout: UI_SETTLE_TIMEOUT })
  }

  /** Check that the Environment section is visible in Scene tab. */
  async expectEnvironmentSectionVisible(): Promise<void> {
    await expect(this.page.getByTestId('section-environment')).toBeVisible({
      timeout: UI_SETTLE_TIMEOUT,
    })
  }

  /** Check that post-processing section is visible in Scene tab. */
  async expectPostProcessingSectionVisible(): Promise<void> {
    await expect(this.page.getByTestId('section-post-processing')).toBeVisible({
      timeout: UI_SETTLE_TIMEOUT,
    })
  }

  /** Check that settings section is visible in System tab. */
  async expectSettingsVisible(): Promise<void> {
    await expect(this.page.getByTestId('section-settings')).toBeVisible({
      timeout: UI_SETTLE_TIMEOUT,
    })
  }
}
