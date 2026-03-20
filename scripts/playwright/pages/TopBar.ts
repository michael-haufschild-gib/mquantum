/**
 * Page object for the top bar — menus, panel toggles, global controls.
 *
 * Bug caught: any menu item wiring breakage, panel toggle state drift,
 * or aria-expanded attribute desyncing from store state.
 */

import { expect, type Locator, type Page } from '@playwright/test'

export class TopBar {
  readonly page: Page
  readonly root: Locator
  readonly leftPanelToggle: Locator
  readonly rightPanelToggle: Locator
  readonly fileMenu: Locator
  readonly viewMenu: Locator
  readonly scenesMenu: Locator
  readonly stylesMenu: Locator

  constructor(page: Page) {
    this.page = page
    this.root = page.getByTestId('top-bar')
    this.leftPanelToggle = page.getByTestId('toggle-left-panel')
    this.rightPanelToggle = page.getByTestId('toggle-right-panel')
    this.fileMenu = page.getByTestId('menu-file')
    this.viewMenu = page.getByTestId('menu-view')
    this.scenesMenu = page.getByTestId('menu-scenes')
    this.stylesMenu = page.getByTestId('menu-styles')
  }

  async isVisible(): Promise<boolean> {
    return this.root.isVisible()
  }

  async waitForVisible(): Promise<void> {
    await expect(this.root).toBeVisible({ timeout: 15_000 })
  }

  // ─── Panel toggles ──────────────────────────────────────────────────

  async isLeftPanelExpanded(): Promise<boolean> {
    return (await this.leftPanelToggle.getAttribute('aria-expanded')) === 'true'
  }

  async isRightPanelExpanded(): Promise<boolean> {
    return (await this.rightPanelToggle.getAttribute('aria-expanded')) === 'true'
  }

  async toggleLeftPanel(): Promise<void> {
    await this.leftPanelToggle.click()
  }

  async toggleRightPanel(): Promise<void> {
    await this.rightPanelToggle.click()
  }

  async openLeftPanel(): Promise<void> {
    if (!(await this.isLeftPanelExpanded())) {
      await this.toggleLeftPanel()
      await expect(this.leftPanelToggle).toHaveAttribute('aria-expanded', 'true')
    }
  }

  async closeLeftPanel(): Promise<void> {
    if (await this.isLeftPanelExpanded()) {
      await this.toggleLeftPanel()
      await expect(this.leftPanelToggle).toHaveAttribute('aria-expanded', 'false')
    }
  }

  async openRightPanel(): Promise<void> {
    if (!(await this.isRightPanelExpanded())) {
      await this.toggleRightPanel()
      await expect(this.rightPanelToggle).toHaveAttribute('aria-expanded', 'true')
    }
  }

  async closeRightPanel(): Promise<void> {
    if (await this.isRightPanelExpanded()) {
      await this.toggleRightPanel()
      await expect(this.rightPanelToggle).toHaveAttribute('aria-expanded', 'false')
    }
  }

  // ─── View menu ──────────────────────────────────────────────────────

  async openViewMenu(): Promise<void> {
    await this.viewMenu.click()
  }

  async clickViewExplorer(): Promise<void> {
    await this.openViewMenu()
    const item = this.page.getByTestId('menu-view-explorer')
    await expect(item).toBeVisible({ timeout: 3000 })
    await item.click()
  }

  async clickViewInspector(): Promise<void> {
    await this.openViewMenu()
    const item = this.page.getByTestId('menu-view-inspector')
    await expect(item).toBeVisible({ timeout: 3000 })
    await item.click()
  }

  async clickViewCinematic(): Promise<void> {
    await this.openViewMenu()
    const item = this.page.getByTestId('menu-view-cinematic')
    await expect(item).toBeVisible({ timeout: 3000 })
    await item.click()
  }

  async clickViewShortcuts(): Promise<void> {
    await this.openViewMenu()
    const item = this.page.getByTestId('menu-view-shortcuts')
    await expect(item).toBeVisible({ timeout: 3000 })
    await item.click()
  }

  // ─── Scenes menu ──────────────────────────────────────────────────

  async openScenesMenu(): Promise<void> {
    await this.scenesMenu.click()
  }

  // ─── Styles menu ──────────────────────────────────────────────────

  async openStylesMenu(): Promise<void> {
    await this.stylesMenu.click()
  }

  // ─── File menu ───────────────────────────────────────────────────────

  async openFileMenu(): Promise<void> {
    await this.fileMenu.click()
  }

  async clickExportImage(): Promise<void> {
    await this.openFileMenu()
    const exportItem = this.page.getByTestId('menu-export')
    await expect(exportItem).toBeVisible({ timeout: 3000 })
    await exportItem.click()
  }

  async clickExportVideo(): Promise<void> {
    await this.openFileMenu()
    const exportItem = this.page.getByTestId('menu-export-video')
    await expect(exportItem).toBeVisible({ timeout: 3000 })
    await exportItem.click()
  }
}
