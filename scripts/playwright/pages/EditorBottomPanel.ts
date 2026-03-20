/**
 * Page object for the bottom panel — timeline playback, speed, effects, rotation.
 *
 * Bug caught: play/pause not wired to animationStore, speed slider not updating,
 * effects drawer not opening, rotation drawer not showing planes, reset not
 * dispatching correct action for current mode.
 */

import { expect, type Locator, type Page } from '@playwright/test'

import { UI_SETTLE_TIMEOUT } from '../helpers/app-helpers'

export class EditorBottomPanel {
  readonly page: Page
  readonly root: Locator
  readonly playPauseButton: Locator
  readonly resetButton: Locator
  readonly reverseToggle: Locator
  readonly effectsToggle: Locator
  readonly rotateToggle: Locator
  readonly openQToggle: Locator
  readonly schroedingerDrawer: Locator
  readonly pauliDrawer: Locator
  readonly openQuantumDrawer: Locator

  constructor(page: Page) {
    this.page = page
    this.root = page.getByTestId('editor-bottom-panel')
    this.resetButton = page.getByRole('button', { name: 'Reset wavefunction' })
    this.reverseToggle = page.getByRole('button', { name: /Enable reverse|Disable reverse/ })
    this.effectsToggle = page.getByRole('button', { name: 'Toggle animations drawer' })
    this.rotateToggle = page.getByRole('button', { name: 'Toggle rotation drawer' })
    this.openQToggle = page.getByRole('button', { name: 'Toggle open quantum drawer' })
    this.schroedingerDrawer = page.getByTestId('schroedinger-animation-drawer')
    this.pauliDrawer = page.getByTestId('pauli-animation-drawer')
    this.openQuantumDrawer = page.getByTestId('schroedinger-open-quantum-drawer')
    // Play/Pause button changes aria-label based on state
    this.playPauseButton = page.getByRole('button', { name: /^Play$|^Pause$/ })
  }

  async isVisible(): Promise<boolean> {
    return this.root.isVisible()
  }

  async waitForVisible(): Promise<void> {
    await expect(this.root).toBeVisible({ timeout: UI_SETTLE_TIMEOUT })
  }

  // ─── Playback ──────────────────────────────────────────────────────

  async clickPlayPause(): Promise<void> {
    await this.playPauseButton.click()
  }

  async expectPlaying(): Promise<void> {
    await expect(this.page.getByRole('button', { name: 'Pause' })).toBeVisible({
      timeout: UI_SETTLE_TIMEOUT,
    })
  }

  async expectPaused(): Promise<void> {
    await expect(this.page.getByRole('button', { name: 'Play' })).toBeVisible({
      timeout: UI_SETTLE_TIMEOUT,
    })
  }

  async clickReset(): Promise<void> {
    await this.resetButton.click()
  }

  async clickReverse(): Promise<void> {
    await this.reverseToggle.click()
  }

  // ─── Drawers ───────────────────────────────────────────────────────

  async openEffectsDrawer(): Promise<void> {
    await expect(this.effectsToggle).toBeVisible({ timeout: UI_SETTLE_TIMEOUT })
    await this.effectsToggle.click()
  }

  async closeEffectsDrawer(): Promise<void> {
    await this.effectsToggle.click()
  }

  async openRotateDrawer(): Promise<void> {
    await this.rotateToggle.click()
  }

  async closeRotateDrawer(): Promise<void> {
    await this.rotateToggle.click()
  }

  async expectSchroedingerDrawerVisible(): Promise<void> {
    await expect(this.schroedingerDrawer).toBeVisible({ timeout: UI_SETTLE_TIMEOUT })
  }

  async expectSchroedingerDrawerHidden(): Promise<void> {
    await expect(this.schroedingerDrawer).not.toBeVisible({ timeout: UI_SETTLE_TIMEOUT })
  }

  async expectPauliDrawerVisible(): Promise<void> {
    await expect(this.pauliDrawer).toBeVisible({ timeout: UI_SETTLE_TIMEOUT })
  }

  async expectOpenQuantumDrawerVisible(): Promise<void> {
    await expect(this.openQuantumDrawer).toBeVisible({ timeout: UI_SETTLE_TIMEOUT })
  }
}
