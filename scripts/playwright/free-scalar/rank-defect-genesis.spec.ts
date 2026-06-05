import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  assertNonBlankPixels,
  capturePixelSnapshot,
  expectSnapshotsDiffer,
  gotoMode,
  hasWebGPU,
  waitForModeReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

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

test.describe('free scalar rank-defect genesis preset', () => {
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
})
