/**
 * TDSE time-travel e2e checks.
 *
 * Focus: P-CTC scenario presets must apply through the real scenario pipeline,
 * drive the WebGPU CTC operator, and render non-blank pixels.
 */

import type { Page } from '@playwright/test'

import { test } from './fixtures'
import {
  applyTdsePreset,
  assertNonBlankPixels,
  capturePixelSnapshot,
  expectSnapshotsDiffer,
  getFrameCount,
  gotoMode,
  requireWebGPU,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.setTimeout(240_000)

const TIME_TRAVEL_PRESETS = [
  {
    id: 'postselectedCtcNovikovLoop',
    label: 'P-CTC Novikov loop',
    expectedPhase: 0,
    expectedFieldView: 'density',
  },
  {
    id: 'postselectedCtcParadoxGate',
    label: 'P-CTC paradox gate',
    expectedPhase: Math.PI,
    expectedFieldView: 'phase',
  },
] as const

async function waitForAppliedTimeTravelPreset(
  page: Page,
  preset: (typeof TIME_TRAVEL_PRESETS)[number]
): Promise<void> {
  await page.waitForFunction(
    ({ id, expectedPhase, expectedFieldView }) => {
      const extStore = window.__EXTENDED_OBJECT_STORE__
      if (!extStore) return false
      const tdse = extStore.getState().schroedinger.tdse
      return (
        tdse.ctcPostselectionEnabled === true &&
        tdse.ctcPostselectionStrength > 0.8 &&
        Math.abs(tdse.ctcLoopPhase - expectedPhase) < 1e-4 &&
        tdse.fieldView === expectedFieldView &&
        tdse.wormholeMirrorAxis === 0 &&
        tdse.gridSize[0] % 2 === 0 &&
        id.length > 0
      )
    },
    preset,
    { timeout: 10_000 }
  )
}

test.describe('TDSE P-CTC time-travel scenario presets', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  for (const preset of TIME_TRAVEL_PRESETS) {
    test(`${preset.label}: applies preset and renders non-blank pixels`, async ({ page }) => {
      await gotoMode(page, 'tdseDynamics', 3)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)

      await applyTdsePreset(page, preset.id)
      await waitForAppliedTimeTravelPreset(page, preset)
      await waitForShaderCompilation(page)
      const frame = await getFrameCount(page)
      await waitForFrameAdvance(page, frame + 90)

      await assertNonBlankPixels(page, preset.label, 5)
    })
  }

  test('Novikov and paradox-gate presets render distinct CTC geometries', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await applyTdsePreset(page, 'postselectedCtcNovikovLoop')
    await waitForAppliedTimeTravelPreset(page, TIME_TRAVEL_PRESETS[0])
    await waitForShaderCompilation(page)
    await waitForFrameAdvance(page, (await getFrameCount(page)) + 90)
    const novikov = await capturePixelSnapshot(page)

    await applyTdsePreset(page, 'postselectedCtcParadoxGate')
    await waitForAppliedTimeTravelPreset(page, TIME_TRAVEL_PRESETS[1])
    await waitForShaderCompilation(page)
    await waitForFrameAdvance(page, (await getFrameCount(page)) + 90)
    const paradox = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(novikov, paradox, 'P-CTC Novikov vs paradox-gate presets', 0.5)
  })
})
