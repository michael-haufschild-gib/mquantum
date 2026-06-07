/**
 * E2E proof for Bell-pair CHSH caustic cosmograph presets.
 *
 * Uses the real scenario selector and fixture-level GPU/shader error
 * collection. The assertions prove the default apparatus, Tsirelson lens,
 * and Werner cusp all render nonblank, differ in sampled pixels, and stay
 * above the interactive FPS floor.
 */

import type { Page, TestInfo } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  assertNonBlankPixels,
  capturePixelSnapshot,
  expectSnapshotsDiffer,
  getFrameCount,
  requireWebGPU,
  waitForAppLoaded,
  waitForFirstFrame,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
  waitForUniformUpdate,
} from './helpers/app-helpers'

test.setTimeout(180_000)

type BellPresetId = 'chshSinglet' | 'chshCausticTsirelsonLens' | 'chshCausticWernerCusp'

async function uncapFrameRate(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const perfStore =
      window.__PERFORMANCE_STORE__ ??
      (await import('/src/stores/runtime/performanceStore.ts')).usePerformanceStore
    perfStore.getState().setMaxFps(0)
  })
}

async function waitForBellPresetState(page: Page, presetId: BellPresetId): Promise<void> {
  await page.waitForFunction(
    (id) => {
      const store = window.__EXTENDED_OBJECT_STORE__
      if (!store) return false
      const cfg = store.getState().bellPair
      if (id === 'chshSinglet') {
        return cfg.chshCausticEnabled === false && cfg.visibility === 1
      }
      if (id === 'chshCausticTsirelsonLens') {
        return (
          cfg.chshCausticEnabled === true &&
          cfg.visibility === 1 &&
          cfg.chshCausticStrength > 1 &&
          cfg.chshCausticFoldScale > 8
        )
      }
      return (
        cfg.chshCausticEnabled === true &&
        cfg.visibility < 0.7071067811865476 &&
        cfg.chshCausticFoldScale < 5
      )
    },
    presetId,
    { timeout: 15_000 }
  )
}

async function applyBellPreset(page: Page, presetId: BellPresetId): Promise<void> {
  const selector = page.getByTestId('scenario-selector')
  await expect(selector).toBeVisible({ timeout: 15_000 })
  await selector.selectOption(presetId)
  await expect(selector).toHaveValue(presetId)
  await waitForBellPresetState(page, presetId)
  await waitForUniformUpdate(page)
}

async function expectFpsAtLeast(page: Page, label: string, minFps: number): Promise<void> {
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

async function captureAndMeasure(
  page: Page,
  testInfo: TestInfo,
  presetId: BellPresetId,
  label: string
) {
  await applyBellPreset(page, presetId)
  const frame = await getFrameCount(page)
  await waitForFrameAdvance(page, frame + 60, 30_000)
  await assertNonBlankPixels(page, label, 3)
  await expectFpsAtLeast(page, label, 45)
  await page.locator('[data-testid="webgpu-canvas"]').screenshot({
    path: testInfo.outputPath(`${presetId}.png`),
  })
  return capturePixelSnapshot(page)
}

test.describe('Bell CHSH caustic cosmograph', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/?t=bellPair')
    await waitForAppLoaded(page)
    await requireWebGPU(page, test.info())
    await uncapFrameRate(page)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)
  })

  test('default, Tsirelson lens, and Werner cusp render distinctly at 45+ FPS', async ({
    page,
  }, testInfo) => {
    // Force a real selector transition back to default before capturing it.
    await applyBellPreset(page, 'chshCausticTsirelsonLens')

    const baseline = await captureAndMeasure(page, testInfo, 'chshSinglet', 'Bell default')
    const lens = await captureAndMeasure(
      page,
      testInfo,
      'chshCausticTsirelsonLens',
      'CHSH caustic Tsirelson lens'
    )
    const cusp = await captureAndMeasure(
      page,
      testInfo,
      'chshCausticWernerCusp',
      'CHSH caustic Werner cusp'
    )

    expectSnapshotsDiffer(baseline, lens, 'default vs Tsirelson lens', 0.25)
    expectSnapshotsDiffer(baseline, cusp, 'default vs Werner cusp', 0.25)
    expectSnapshotsDiffer(lens, cusp, 'Tsirelson lens vs Werner cusp', 0.25)
  })
})
