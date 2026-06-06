/**
 * E2E proof for the Dirac Clifford Bloom Resonator field view.
 *
 * GPU/shader error detection is automatic via fixtures.ts.
 */

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  applyDiracPreset,
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
  waitForUniformUpdate,
} from './helpers/app-helpers'

test.setTimeout(180_000)

async function readDiracState(page: Page) {
  return page.evaluate(() => {
    const extStore = window.__EXTENDED_OBJECT_STORE__
    const appearanceStore = window.__APPEARANCE_STORE__
    if (!extStore) throw new Error('__EXTENDED_OBJECT_STORE__ missing')
    if (!appearanceStore) throw new Error('__APPEARANCE_STORE__ missing')
    const s = extStore.getState().schroedinger
    return {
      quantumMode: s.quantumMode,
      colorAlgorithm: appearanceStore.getState().colorAlgorithm,
      densityGain: s.densityGain,
      densityContrast: s.densityContrast,
      autoScaleMaxGain: s.autoScaleMaxGain,
      dirac: {
        latticeDim: s.dirac.latticeDim,
        initialCondition: s.dirac.initialCondition,
        fieldView: s.dirac.fieldView,
        potentialType: s.dirac.potentialType,
        showPotential: s.dirac.showPotential,
        positiveEnergyFraction: s.dirac.positiveEnergyFraction,
        autoScale: s.dirac.autoScale,
      },
    }
  })
}

async function applyPresetAndCapture(page: Page, presetId: string, screenshotName: string) {
  await applyDiracPreset(page, presetId)
  await waitForShaderCompilation(page)
  await waitForUniformUpdate(page)
  const frame = await getFrameCount(page)
  await waitForFrameAdvance(page, frame + 180, 45_000)
  await assertNonBlankPixels(page, `Dirac ${presetId}`, 5)
  await page.locator('[data-testid="webgpu-canvas"]').screenshot({
    path: `/Users/Spare/Documents/code/mquantum/screenshots/${screenshotName}`,
  })
  return capturePixelSnapshot(page)
}

test.describe('Dirac Clifford Bloom Resonator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('renders phase-colored sector petals distinct from zitterbewegung split view', async ({
    page,
  }) => {
    await gotoMode(page, 'diracEquation', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    const bloom = await applyPresetAndCapture(
      page,
      'cliffordBloomResonator',
      'dirac-clifford-bloom.png'
    )
    const bloomState = await readDiracState(page)
    expect(bloomState.quantumMode).toBe('diracEquation')
    expect(bloomState.dirac.latticeDim).toBe(3)
    expect(bloomState.dirac.initialCondition).toBe('zitterbewegung')
    expect(bloomState.dirac.fieldView).toBe('cliffordBloom')
    expect(bloomState.dirac.potentialType).toBe('none')
    expect(bloomState.dirac.showPotential).toBe(false)
    expect(bloomState.dirac.positiveEnergyFraction).toBe(0.5)
    expect(bloomState.dirac.autoScale).toBe(true)
    expect(bloomState.colorAlgorithm).toBe('phaseDensity')
    expect(bloomState.densityGain).toBeCloseTo(2.8)
    expect(bloomState.densityContrast).toBeCloseTo(2.7)
    expect(bloomState.autoScaleMaxGain).toBe(30)

    const split = await applyPresetAndCapture(
      page,
      'zitterbewegung',
      'dirac-zitterbewegung-split-baseline.png'
    )
    const splitState = await readDiracState(page)
    expect(splitState.dirac.fieldView).toBe('particleAntiparticleSplit')
    expect(splitState.colorAlgorithm).toBe('particleAntiparticle')

    await pauseAnimation(page)
    expectSnapshotsDiffer(bloom, split, 'Clifford Bloom petals vs zitterbewegung split', 0.5)
  })
})
