/**
 * E2E proof for the harmonic oscillator Fock Lantern Cathedral preset.
 *
 * GPU/shader error detection is automatic via fixtures.ts.
 */

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  assertNonBlankPixels,
  capturePixelSnapshot,
  expectSnapshotsDiffer,
  getFrameCount,
  gotoMode,
  pauseAnimation,
  requireWebGPU,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.setTimeout(180_000)

async function setSchroedingerPresetName(page: Page, presetName: string) {
  await page.evaluate((name) => {
    const extStore = window.__EXTENDED_OBJECT_STORE__
    if (!extStore) throw new Error('__EXTENDED_OBJECT_STORE__ missing')
    extStore.getState().setSchroedingerPresetName(name)
  }, presetName)
}

test.describe('Harmonic oscillator Fock Lantern Cathedral preset', () => {
  test('renders nonblank cathedral structure distinct from groundState', async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await setSchroedingerPresetName(page, 'groundState')
    await waitForShaderCompilation(page)
    let frame = await getFrameCount(page)
    await waitForFrameAdvance(page, frame + 30)
    await assertNonBlankPixels(page, 'harmonic oscillator groundState baseline')
    await pauseAnimation(page)
    const baseline = await capturePixelSnapshot(page)

    await setSchroedingerPresetName(page, 'fockLanternCathedral')
    await waitForShaderCompilation(page)
    frame = await getFrameCount(page)
    await waitForFrameAdvance(page, frame + 30)
    await assertNonBlankPixels(page, 'Fock Lantern Cathedral')
    const lantern = await capturePixelSnapshot(page)

    await expect(page.getByText('This may take a moment')).toBeHidden({ timeout: 20_000 })
    await page.locator('[data-testid="webgpu-canvas"]').screenshot({
      path: test.info().outputPath('harmonic-fock-lantern.png'),
    })

    expectSnapshotsDiffer(
      baseline,
      lantern,
      'Fock Lantern Cathedral preset must differ from groundState'
    )

    const state = await page.evaluate(() => {
      const extStore = window.__EXTENDED_OBJECT_STORE__
      const appearanceStore = window.__APPEARANCE_STORE__
      if (!extStore) throw new Error('__EXTENDED_OBJECT_STORE__ missing')
      if (!appearanceStore) throw new Error('__APPEARANCE_STORE__ missing')
      const schroedinger = extStore.getState().schroedinger
      return {
        presetName: schroedinger.presetName,
        fockLanternEnabled: schroedinger.fockLanternEnabled,
        termCount: schroedinger.termCount,
        maxQuantumNumber: schroedinger.maxQuantumNumber,
        frequencySpread: schroedinger.frequencySpread,
        colorAlgorithm: appearanceStore.getState().colorAlgorithm,
      }
    })

    expect(state).toEqual({
      presetName: 'fockLanternCathedral',
      fockLanternEnabled: true,
      termCount: 6,
      maxQuantumNumber: 6,
      frequencySpread: 0,
      colorAlgorithm: 'phaseDensity',
    })
  })
})
