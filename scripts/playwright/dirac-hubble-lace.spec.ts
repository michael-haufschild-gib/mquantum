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
        stepsPerFrame: s.dirac.stepsPerFrame,
        packetMomentum: s.dirac.packetMomentum,
        slicePositions: s.dirac.slicePositions,
      },
    }
  })
}

async function uncapFrameRate(page: Page) {
  await page.evaluate(async () => {
    const perfStore =
      window.__PERFORMANCE_STORE__ ??
      (await import('/src/stores/runtime/performanceStore.ts')).usePerformanceStore
    perfStore.getState().setMaxFps(0)
  })
}

async function expectScenarioOptions(page: Page, visible: string[], hidden: string[]) {
  const selector = page.getByTestId('scenario-selector')
  await expect(selector).toBeVisible()
  const values = await selector
    .locator('option')
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))
  for (const id of visible) {
    expect(values, `scenario selector should expose ${id}`).toContain(id)
  }
  for (const id of hidden) {
    expect(values, `scenario selector should hide ${id}`).not.toContain(id)
  }
}

async function applyScenarioPreset(page: Page, presetId: string) {
  const selector = page.getByTestId('scenario-selector')
  await expect(selector).toBeVisible()
  await selector.selectOption(presetId)
  await page.waitForFunction(
    (id) => {
      const extStore = window.__EXTENDED_OBJECT_STORE__
      const appearanceStore = window.__APPEARANCE_STORE__
      if (!extStore || !appearanceStore) return false
      const schroedinger = extStore.getState().schroedinger
      const dirac = schroedinger.dirac
      const close = (actual: number | undefined, expected: number) =>
        typeof actual === 'number' && Math.abs(actual - expected) < 1e-6
      const commonHubble =
        dirac.initialCondition === 'zitterbewegung' &&
        dirac.fieldView === 'hubbleLace' &&
        dirac.potentialType === 'none' &&
        dirac.showPotential === false &&
        close(dirac.positiveEnergyFraction, 0.5) &&
        dirac.autoScale === true &&
        dirac.stepsPerFrame === 2 &&
        appearanceStore.getState().colorAlgorithm === 'phaseDensity'
      if (id === 'hubbleLaceCollider3D') {
        return (
          commonHubble &&
          dirac.latticeDim === 3 &&
          close(dirac.packetMomentum[0], 3.6) &&
          close(dirac.packetMomentum[1], -2.4) &&
          close(dirac.packetMomentum[2], 1.7) &&
          close(schroedinger.densityGain, 4.4) &&
          close(schroedinger.densityContrast, 3.4) &&
          close(schroedinger.autoScaleMaxGain, 46)
        )
      }
      if (id === 'hubbleLaceBulk4D') {
        return (
          commonHubble &&
          dirac.latticeDim === 4 &&
          close(dirac.packetMomentum[0], 2.9) &&
          close(dirac.packetMomentum[1], 1.9) &&
          close(dirac.packetMomentum[2], -2.2) &&
          close(dirac.packetMomentum[3], 1.6) &&
          close(dirac.slicePositions[0], 0.23) &&
          close(schroedinger.densityGain, 5) &&
          close(schroedinger.densityContrast, 3.8) &&
          close(schroedinger.autoScaleMaxGain, 54)
        )
      }
      if (id === 'cliffordBloomResonator') {
        return (
          dirac.initialCondition === 'zitterbewegung' &&
          dirac.fieldView === 'cliffordBloom' &&
          dirac.latticeDim === 3 &&
          dirac.stepsPerFrame === 8 &&
          appearanceStore.getState().colorAlgorithm === 'phaseDensity'
        )
      }
      return false
    },
    presetId,
    { timeout: 15_000 }
  )
}

async function expectFpsAtLeast(page: Page, label: string, minFps: number) {
  const warmupFrame = await getFrameCount(page)
  await waitForFrameAdvance(page, warmupFrame + 45, 20_000)
  const startFrame = await getFrameCount(page)
  const startTime = Date.now()
  const endFrame = await waitForFrameAdvance(page, startFrame + 90, 20_000)
  const elapsedSeconds = (Date.now() - startTime) / 1000
  const fps = (endFrame - startFrame) / elapsedSeconds

  console.log(`[PERF] ${label}: ${fps.toFixed(1)} FPS over ${elapsedSeconds.toFixed(2)}s`)
  expect(fps, `${label} should render at ${minFps}+ FPS`).toBeGreaterThanOrEqual(minFps)
}

async function applyPresetAndCapture(page: Page, presetId: string, label: string, minFps?: number) {
  await applyScenarioPreset(page, presetId)
  await waitForShaderCompilation(page)
  await waitForUniformUpdate(page)
  const frame = await getFrameCount(page)
  await waitForFrameAdvance(page, frame + 180, 45_000)
  await assertNonBlankPixels(page, label, 3)
  if (minFps !== undefined) {
    await expectFpsAtLeast(page, label, minFps)
  }
  await page.locator('[data-testid="webgpu-canvas"]').screenshot({
    path: test.info().outputPath(`${presetId}.png`),
  })
  return capturePixelSnapshot(page)
}

test.describe('Dirac Hubble Lace Aperture', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
    await uncapFrameRate(page)
  })

  test('scenario selector renders 3D and 4D Hubble Lace presets as distinct apertures', async ({
    page,
  }) => {
    await gotoMode(page, 'diracEquation', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await expectScenarioOptions(page, ['hubbleLaceCollider3D'], ['hubbleLaceBulk4D'])

    const collider = await applyPresetAndCapture(
      page,
      'hubbleLaceCollider3D',
      'Dirac Hubble Lace Collider 3D',
      45
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
    expect(colliderState.dirac.stepsPerFrame).toBe(2)
    expect(colliderState.colorAlgorithm).toBe('phaseDensity')
    expect(colliderState.densityGain).toBeCloseTo(4.4)
    expect(colliderState.densityContrast).toBeCloseTo(3.4)
    expect(colliderState.autoScaleMaxGain).toBe(46)

    await gotoMode(page, 'diracEquation', 4)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await expectScenarioOptions(page, ['hubbleLaceBulk4D'], ['hubbleLaceCollider3D'])
    const bulk = await applyPresetAndCapture(
      page,
      'hubbleLaceBulk4D',
      'Dirac Hubble Lace Bulk 4D',
      45
    )
    const bulkState = await readDiracState(page)
    expect(bulkState.dirac.latticeDim).toBe(4)
    expect(bulkState.dirac.fieldView).toBe('hubbleLace')
    expect(bulkState.dirac.stepsPerFrame).toBe(2)
    expect(bulkState.dirac.packetMomentum).toEqual([2.9, 1.9, -2.2, 1.6])
    expect(bulkState.dirac.slicePositions).toEqual([0.23])
    expect(bulkState.colorAlgorithm).toBe('phaseDensity')
    expect(bulkState.densityGain).toBeCloseTo(5)
    expect(bulkState.densityContrast).toBeCloseTo(3.8)
    expect(bulkState.autoScaleMaxGain).toBe(54)

    await gotoMode(page, 'diracEquation', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await expectScenarioOptions(page, ['hubbleLaceCollider3D'], ['hubbleLaceBulk4D'])
    const bloom = await applyPresetAndCapture(
      page,
      'cliffordBloomResonator',
      'Dirac Clifford Bloom baseline'
    )

    expectSnapshotsDiffer(collider, bloom, 'Hubble Lace Collider 3D vs Clifford Bloom', 0.4)
    expectSnapshotsDiffer(collider, bulk, 'Hubble Lace Collider 3D vs Bulk 4D', 0.4)
  })
})
