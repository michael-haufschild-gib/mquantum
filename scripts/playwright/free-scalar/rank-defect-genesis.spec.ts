import type { Page } from '@playwright/test'

import { expect, test } from '../fixtures'
import {
  assertNonBlankPixels,
  capturePixelSnapshot,
  expectSnapshotsDiffer,
  gotoMode,
  hasWebGPU,
  waitForModeReady,
  waitForShaderCompilation,
} from '../helpers/app-helpers'

test.setTimeout(180_000)

async function applyPresetThroughSelector(page: Page, presetId: string): Promise<void> {
  const selector = page.getByTestId('scenario-selector')
  await expect(selector).toBeVisible()
  await selector.selectOption(presetId)
  await page.waitForFunction(
    (id) => {
      const extStore = window.__EXTENDED_OBJECT_STORE__
      if (!extStore) return false
      const fs = extStore.getState().schroedinger.freeScalar
      if (id === 'rankDefectGenesis') {
        return (
          fs.initialCondition === 'rankDefectGenesis' &&
          fs.fieldView === 'energyDensity' &&
          fs.preheating.enabled === false &&
          fs.gridSize[0] === 64 &&
          fs.gridSize[1] === 64 &&
          fs.gridSize[2] === 64
        )
      }
      if (id === 'chronogenicShear') {
        return (
          fs.initialCondition === 'chronogenicShear' &&
          fs.fieldView === 'energyDensity' &&
          fs.modeK[0] === 2 &&
          fs.preheating.enabled === false &&
          fs.gridSize[0] === 64 &&
          fs.gridSize[1] === 64 &&
          fs.gridSize[2] === 64
        )
      }
      if (id === 'rankDiffusionReheating') {
        return (
          fs.initialCondition === 'chronogenicShear' &&
          fs.fieldView === 'energyDensity' &&
          fs.modeK[0] === 5 &&
          fs.preheating.enabled === true &&
          fs.preheating.amplitude === 0.45 &&
          fs.preheating.frequency === 5.8 &&
          fs.gridSize[0] === 64 &&
          fs.gridSize[1] === 64 &&
          fs.gridSize[2] === 64
        )
      }
      if (id === 'vacuumFluctuations') {
        return fs.initialCondition === 'vacuumNoise' && fs.fieldView === 'energyDensity'
      }
      return false
    },
    presetId,
    { timeout: 5_000 }
  )
  await waitForShaderCompilation(page)
}

async function requireWebGPUWithoutSkipping(page: Page): Promise<void> {
  const available = await hasWebGPU(page)
  expect(available, 'rank-defect genesis e2e requires WebGPU and must not skip').toBe(true)
}

test.describe('free scalar rank-completion genesis presets', () => {
  test('applies through the real scenario selector, renders, and differs from vacuum', async ({
    page,
  }) => {
    await requireWebGPUWithoutSkipping(page)
    await gotoMode(page, 'freeScalarField', 3)
    await waitForModeReady(page, 90)

    await applyPresetThroughSelector(page, 'rankDefectGenesis')
    await assertNonBlankPixels(page, 'rank-defect genesis preset', 25)
    const rankDefect = await capturePixelSnapshot(page)

    await applyPresetThroughSelector(page, 'vacuumFluctuations')
    await assertNonBlankPixels(page, 'vacuum fluctuations preset', 25)
    const vacuum = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(rankDefect, vacuum, 'rank-defect genesis vs vacuum fluctuations', 0.5)
  })

  test('applies chronogenic shear and renders a different clock orientation', async ({ page }) => {
    await requireWebGPUWithoutSkipping(page)
    await gotoMode(page, 'freeScalarField', 3)
    await waitForModeReady(page, 90)

    await applyPresetThroughSelector(page, 'chronogenicShear')
    await assertNonBlankPixels(page, 'chronogenic shear preset', 25)
    const sheared = await capturePixelSnapshot(page)

    await applyPresetThroughSelector(page, 'rankDefectGenesis')
    await assertNonBlankPixels(page, 'rank-defect genesis preset', 25)
    const unsheared = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(sheared, unsheared, 'chronogenic shear vs rank-defect genesis', 0.5)
  })

  test('applies rank-diffusion reheating and renders a hot-mode diffusion view', async ({
    page,
  }) => {
    await requireWebGPUWithoutSkipping(page)
    await gotoMode(page, 'freeScalarField', 3)
    await waitForModeReady(page, 90)

    await applyPresetThroughSelector(page, 'rankDiffusionReheating')
    await page.waitForTimeout(500)
    await assertNonBlankPixels(page, 'rank-diffusion reheating preset', 25)
    const reheating = await capturePixelSnapshot(page)

    await applyPresetThroughSelector(page, 'chronogenicShear')
    await assertNonBlankPixels(page, 'chronogenic shear preset', 25)
    const sheared = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(reheating, sheared, 'rank-diffusion reheating vs chronogenic shear', 0.5)
  })
})
