/**
 * E2E proof for Dirac Hubble Lace Aperture presets.
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
  requireWebGPU,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
  waitForUniformUpdate,
} from './helpers/app-helpers'

test.setTimeout(240_000)

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
        packetMomentum: s.dirac.packetMomentum,
        slicePositions: s.dirac.slicePositions,
      },
    }
  })
}

async function applyScenarioPreset(page: Page, presetId: string) {
  const selector = page.getByTestId('scenario-selector')
  await expect(selector).toBeVisible()
  await selector.selectOption(presetId)
  await page.waitForFunction(
    (id) => {
      const extStore = window.__EXTENDED_OBJECT_STORE__
      if (!extStore) return false
      const dirac = extStore.getState().schroedinger.dirac
      if (id === 'hubbleLaceCollider3D') {
        return (
          dirac.fieldView === 'hubbleLace' &&
          dirac.latticeDim === 3 &&
          dirac.packetMomentum[0] === 3.6
        )
      }
      if (id === 'hubbleLaceBulk4D') {
        return (
          dirac.fieldView === 'hubbleLace' &&
          dirac.latticeDim === 4 &&
          dirac.packetMomentum[3] === 1.6 &&
          dirac.slicePositions[0] === 0.23
        )
      }
      return (
        (dirac.fieldView === 'hubbleLace' && id !== 'cliffordBloomResonator') ||
        (id === 'cliffordBloomResonator' &&
          dirac.fieldView === 'cliffordBloom' &&
          dirac.latticeDim === 3)
      )
    },
    presetId,
    { timeout: 15_000 }
  )
}

async function applyPresetAndCapture(page: Page, presetId: string, label: string) {
  await applyScenarioPreset(page, presetId)
  await waitForShaderCompilation(page)
  await waitForUniformUpdate(page)
  const frame = await getFrameCount(page)
  await waitForFrameAdvance(page, frame + 180, 45_000)
  await assertNonBlankPixels(page, label, 3)
  await page.locator('[data-testid="webgpu-canvas"]').screenshot({
    path: test.info().outputPath(`${presetId}.png`),
  })
  return capturePixelSnapshot(page)
}

test.describe('Dirac Hubble Lace Aperture', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('scenario selector renders 3D and 4D Hubble Lace presets as distinct apertures', async ({
    page,
  }) => {
    await gotoMode(page, 'diracEquation', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    const collider = await applyPresetAndCapture(
      page,
      'hubbleLaceCollider3D',
      'Dirac Hubble Lace Collider 3D'
    )
    const colliderState = await readDiracState(page)
    expect(colliderState.quantumMode).toBe('diracEquation')
    expect(colliderState.dirac.latticeDim).toBe(3)
    expect(colliderState.dirac.initialCondition).toBe('zitterbewegung')
    expect(colliderState.dirac.fieldView).toBe('hubbleLace')
    expect(colliderState.dirac.potentialType).toBe('none')
    expect(colliderState.dirac.showPotential).toBe(false)
    expect(colliderState.dirac.positiveEnergyFraction).toBe(0.5)
    expect(colliderState.dirac.autoScale).toBe(true)
    expect(colliderState.colorAlgorithm).toBe('phaseDensity')
    expect(colliderState.densityGain).toBeCloseTo(4.4)
    expect(colliderState.densityContrast).toBeCloseTo(3.4)
    expect(colliderState.autoScaleMaxGain).toBe(46)

    await gotoMode(page, 'diracEquation', 4)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    const bulk = await applyPresetAndCapture(page, 'hubbleLaceBulk4D', 'Dirac Hubble Lace Bulk 4D')
    const bulkState = await readDiracState(page)
    expect(bulkState.dirac.latticeDim).toBe(4)
    expect(bulkState.dirac.fieldView).toBe('hubbleLace')
    expect(bulkState.dirac.packetMomentum).toEqual([2.9, 1.9, -2.2, 1.6])
    expect(bulkState.dirac.slicePositions).toEqual([0.23])
    expect(bulkState.colorAlgorithm).toBe('phaseDensity')
    expect(bulkState.densityGain).toBeCloseTo(5)
    expect(bulkState.densityContrast).toBeCloseTo(3.8)
    expect(bulkState.autoScaleMaxGain).toBe(54)

    await gotoMode(page, 'diracEquation', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    const bloom = await applyPresetAndCapture(
      page,
      'cliffordBloomResonator',
      'Dirac Clifford Bloom baseline'
    )

    expectSnapshotsDiffer(collider, bloom, 'Hubble Lace Collider 3D vs Clifford Bloom', 0.4)
    expectSnapshotsDiffer(collider, bulk, 'Hubble Lace Collider 3D vs Bulk 4D', 0.4)
  })
})
