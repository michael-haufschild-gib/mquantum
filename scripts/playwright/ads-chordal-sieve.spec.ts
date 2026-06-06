/**
 * E2E proof for the Anti-de Sitter Chordal Sieve renderer path.
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
  waitForModeReady,
  waitForShaderCompilation,
  waitForUniformUpdate,
} from './helpers/app-helpers'

test.setTimeout(180_000)

async function applyAdsPreset(page: Page, presetId: string): Promise<void> {
  const scenario = page.getByRole('combobox', { name: /scenario/i })
  await expect(scenario).toBeVisible({ timeout: 10_000 })
  await scenario.selectOption(presetId)

  await page.waitForFunction(
    (id) => {
      const ext = window.__EXTENDED_OBJECT_STORE__?.getState()
      const appearance = window.__APPEARANCE_STORE__?.getState()
      const ads = ext?.schroedinger.antiDeSitter
      if (!ads) return false
      if (id === 'adsChordalSieve') {
        return (
          ads.preset === id &&
          ads.chordalSieveEnabled === true &&
          ads.btzEnabled === false &&
          ads.hkllEnabled === false &&
          ads.d === 4 &&
          ads.n === 2 &&
          ads.l === 3 &&
          ads.m === 2 &&
          appearance?.colorAlgorithm === 'phaseDensity'
        )
      }
      if (id === 'adsFourGround') {
        return (
          ads.preset === id &&
          ads.chordalSieveEnabled === false &&
          ads.btzEnabled === false &&
          ads.hkllEnabled === false &&
          ads.d === 4 &&
          ads.n === 0 &&
          ads.l === 0 &&
          ads.m === 0
        )
      }
      return false
    },
    presetId,
    { timeout: 10_000 }
  )
  await waitForShaderCompilation(page)
  await waitForUniformUpdate(page)
}

async function captureSettledPreset(page: Page, label: string, screenshotName: string) {
  const startFrame = await getFrameCount(page)
  await waitForFrameAdvance(page, startFrame + 180, 30_000)
  await waitForModeReady(page, 60)
  await assertNonBlankPixels(page, label, 10)
  await page.locator('[data-testid="webgpu-canvas"]').screenshot({
    path: `screenshots/${screenshotName}`,
    type: 'png',
  })
  return capturePixelSnapshot(page)
}

test.describe('Anti-de Sitter Chordal Sieve', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('preset renders phase-clock ribs distinct from ordinary AdS ground state', async ({
    page,
  }) => {
    await gotoMode(page, 'antiDeSitter', 3)
    await waitForShaderCompilation(page)

    await applyAdsPreset(page, 'adsChordalSieve')
    const chordal = await captureSettledPreset(page, 'AdS Chordal Sieve', 'ads-chordal-sieve.png')

    const state = await page.evaluate(() => {
      const ext = window.__EXTENDED_OBJECT_STORE__?.getState()
      const appearance = window.__APPEARANCE_STORE__?.getState()
      const ads = ext?.schroedinger.antiDeSitter
      return {
        preset: ads?.preset,
        chordalSieveEnabled: ads?.chordalSieveEnabled,
        chordalSieveFrequency: ads?.chordalSieveFrequency,
        chordalSieveTwist: ads?.chordalSieveTwist,
        btzEnabled: ads?.btzEnabled,
        hkllEnabled: ads?.hkllEnabled,
        colorAlgorithm: appearance?.colorAlgorithm,
      }
    })
    expect(state).toMatchObject({
      preset: 'adsChordalSieve',
      chordalSieveEnabled: true,
      btzEnabled: false,
      hkllEnabled: false,
      colorAlgorithm: 'phaseDensity',
    })
    expect(state.chordalSieveFrequency).toBeCloseTo(5.4, 6)
    expect(state.chordalSieveTwist).toBeCloseTo(0.72, 6)

    await applyAdsPreset(page, 'adsFourGround')
    const ground = await captureSettledPreset(
      page,
      'AdS ground-state baseline',
      'ads-chordal-sieve-ground-baseline.png'
    )

    await pauseAnimation(page)
    expectSnapshotsDiffer(chordal, ground, 'Chordal Sieve ribs vs AdS ground state', 0.35)
  })
})
