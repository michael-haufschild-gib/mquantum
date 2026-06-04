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

interface RetroPresetExpectation {
  fieldView: 'phi' | 'energyDensity'
  modeK: readonly number[]
  packetWidth: number
}

const PRESETS: Record<string, RetroPresetExpectation> = {
  retrocausalCausticFlower: {
    fieldView: 'phi',
    modeK: [4, 6, 4],
    packetWidth: 1.15,
  },
  retrocausalCausticWeb: {
    fieldView: 'energyDensity',
    modeK: [7, -11, 5],
    packetWidth: 0.42,
  },
}

async function applyPresetThroughSelector(
  page: Page,
  presetId: keyof typeof PRESETS
): Promise<void> {
  const selector = page.getByTestId('scenario-selector')
  await expect(selector).toBeVisible()
  await selector.selectOption(presetId)

  const expected = PRESETS[presetId]
  await page.waitForFunction(
    async ({ fieldView, modeK, packetWidth }) => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      const fs = mod.useExtendedObjectStore.getState().schroedinger.freeScalar
      return (
        fs.initialCondition === 'retrocausalCaustic' &&
        fs.fieldView === fieldView &&
        Math.abs(fs.packetWidth - packetWidth) < 1e-6 &&
        modeK.every((k, index) => fs.modeK[index] === k)
      )
    },
    expected,
    { timeout: 5_000 }
  )

  await waitForShaderCompilation(page)
}

async function requireWebGPUWithoutSkipping(page: Page): Promise<void> {
  const available = await hasWebGPU(page)
  expect(available, 'retrocausal caustic e2e requires WebGPU and must not skip').toBe(true)
}

test.describe('free scalar retrocausal caustic presets', () => {
  test('Flower and Web apply through the real app, render, and differ visually', async ({
    page,
  }) => {
    await requireWebGPUWithoutSkipping(page)
    await gotoMode(page, 'freeScalarField', 3)
    await waitForModeReady(page, 90)

    await applyPresetThroughSelector(page, 'retrocausalCausticFlower')
    await assertNonBlankPixels(page, 'retrocausal caustic flower preset', 25)
    const flower = await capturePixelSnapshot(page)

    await applyPresetThroughSelector(page, 'retrocausalCausticWeb')
    await assertNonBlankPixels(page, 'retrocausal caustic web preset', 25)
    const web = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(flower, web, 'Flower vs Web retrocausal caustic presets', 0.5)
  })
})
