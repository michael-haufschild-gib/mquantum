/**
 * E2E proof for Hermite Triple-Cocycle Inflation harmonic oscillator presets.
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

async function uncapFrameRate(page: Page) {
  await page.evaluate(async () => {
    const perfStore =
      window.__PERFORMANCE_STORE__ ??
      (await import('/src/stores/runtime/performanceStore.ts')).usePerformanceStore
    perfStore.getState().setMaxFps(0)
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
      return extStore.getState().schroedinger.presetName === id
    },
    presetId,
    { timeout: 15_000 }
  )
  await waitForShaderCompilation(page)
  await waitForUniformUpdate(page)
}

async function readCocycleState(page: Page) {
  return page.evaluate(() => {
    const extStore = window.__EXTENDED_OBJECT_STORE__
    const appearanceStore = window.__APPEARANCE_STORE__
    if (!extStore) throw new Error('__EXTENDED_OBJECT_STORE__ missing')
    if (!appearanceStore) throw new Error('__APPEARANCE_STORE__ missing')
    const s = extStore.getState().schroedinger
    return {
      presetName: s.presetName,
      termCount: s.termCount,
      maxQuantumNumber: s.maxQuantumNumber,
      frequencySpread: s.frequencySpread,
      raymarchQuality: s.raymarchQuality,
      hermiteCocycleInflationEnabled: s.hermiteCocycleInflationEnabled,
      hermiteCocycleInflationStrength: s.hermiteCocycleInflationStrength,
      hermiteCocycleShellRadius: s.hermiteCocycleShellRadius,
      hermiteCocycleInflationTwist: s.hermiteCocycleInflationTwist,
      colorAlgorithm: appearanceStore.getState().colorAlgorithm,
    }
  })
}

async function expectFpsAtLeast(page: Page, label: string, minFps: number) {
  const warmupFrame = await getFrameCount(page)
  await waitForFrameAdvance(page, warmupFrame + 45, 20_000)
  const startFrame = await getFrameCount(page)
  const startTimeMs = await page.evaluate(() => performance.now())
  const endFrame = await waitForFrameAdvance(page, startFrame + 90, 30_000)
  const endTimeMs = await page.evaluate(() => performance.now())
  const fps = ((endFrame - startFrame) * 1000) / Math.max(endTimeMs - startTimeMs, 1)

  console.log(`[PERF] ${label}: ${fps.toFixed(1)} FPS`)
  expect(fps, `${label} should render at ${minFps}+ FPS`).toBeGreaterThanOrEqual(minFps)
}

async function applyCaptureAndMeasure(page: Page, presetId: string, label: string) {
  await applyScenarioPreset(page, presetId)
  const frame = await getFrameCount(page)
  await waitForFrameAdvance(page, frame + 60, 30_000)
  await assertNonBlankPixels(page, label, 3)
  await expectFpsAtLeast(page, label, 45)
  await page.locator('[data-testid="webgpu-canvas"]').screenshot({
    path: test.info().outputPath(`${presetId}.png`),
  })
  return capturePixelSnapshot(page)
}

test.describe('Hermite Triple-Cocycle Inflation presets', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
    await uncapFrameRate(page)
  })

  test('scenario selector renders 3D and 4D cocycle inflation with 45+ FPS', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    const baseline = await applyCaptureAndMeasure(
      page,
      'groundState',
      'Harmonic groundState default'
    )
    const inflation3D = await applyCaptureAndMeasure(
      page,
      'hermiteCocycleInflation3D',
      'Hermite Cocycle Inflation 3D'
    )
    const state3D = await readCocycleState(page)
    expect(state3D).toMatchObject({
      presetName: 'hermiteCocycleInflation3D',
      termCount: 5,
      maxQuantumNumber: 6,
      frequencySpread: 0,
      raymarchQuality: 'balanced',
      hermiteCocycleInflationEnabled: true,
      colorAlgorithm: 'phaseDensity',
    })
    expect(state3D.hermiteCocycleInflationStrength).toBeCloseTo(1.15)
    expect(state3D.hermiteCocycleShellRadius).toBeCloseTo(0.72)
    expect(state3D.hermiteCocycleInflationTwist).toBeCloseTo(3.7)

    await gotoMode(page, 'harmonicOscillator', 4)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    const bulk4D = await applyCaptureAndMeasure(
      page,
      'hermiteCocycleBulk4D',
      'Hermite Cocycle Bulk 4D'
    )
    const state4D = await readCocycleState(page)
    expect(state4D).toMatchObject({
      presetName: 'hermiteCocycleBulk4D',
      termCount: 5,
      maxQuantumNumber: 6,
      frequencySpread: 0,
      raymarchQuality: 'balanced',
      hermiteCocycleInflationEnabled: true,
      colorAlgorithm: 'phaseDensity',
    })
    expect(state4D.hermiteCocycleInflationStrength).toBeCloseTo(1.3)
    expect(state4D.hermiteCocycleShellRadius).toBeCloseTo(0.82)
    expect(state4D.hermiteCocycleInflationTwist).toBeCloseTo(5.1)

    expectSnapshotsDiffer(
      baseline,
      inflation3D,
      'Hermite cocycle inflation must differ from groundState'
    )
    expectSnapshotsDiffer(
      inflation3D,
      bulk4D,
      '3D and 4D Hermite cocycle presets must be visually distinct'
    )
  })
})
