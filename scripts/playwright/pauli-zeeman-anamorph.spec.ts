import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  assertNonBlankPixels,
  capturePixelSnapshot,
  expectSnapshotsDiffer,
  getFrameCount,
  gotoPauli,
  pauseAnimation,
  requireWebGPU,
  waitForFrameAdvance,
  waitForModeReady,
  waitForShaderCompilation,
  waitForUniformUpdate,
} from './helpers/app-helpers'

test.setTimeout(180_000)

async function applyZeemanAnamorphPreset(page: Page): Promise<void> {
  const scenario = page.getByRole('combobox', { name: /scenario/i })
  await expect(scenario).toBeVisible({ timeout: 10_000 })
  await scenario.selectOption('zeemanAnamorph')

  await page.waitForFunction(
    () => {
      const ext = window.__EXTENDED_OBJECT_STORE__?.getState()
      const appearance = window.__APPEARANCE_STORE__?.getState()
      const pauli = ext?.pauliSpinor
      return (
        pauli?.fieldType === 'quadrupole' &&
        pauli?.initialCondition === 'zeemanAnamorphSeed' &&
        pauli?.fieldView === 'zeemanAnamorph' &&
        appearance?.colorAlgorithm === 'phaseDensity'
      )
    },
    undefined,
    { timeout: 10_000 }
  )
}

async function setPauliSpinDensityBaseline(page: Page): Promise<void> {
  await page.evaluate(() => {
    const extStore = window.__EXTENDED_OBJECT_STORE__
    const appearanceStore = window.__APPEARANCE_STORE__
    if (!extStore) throw new Error('__EXTENDED_OBJECT_STORE__ missing')
    if (!appearanceStore) throw new Error('__APPEARANCE_STORE__ missing')
    extStore.getState().setPauliFieldView('spinDensity')
    appearanceStore.getState().setColorAlgorithm('pauliSpinDensity')
  })
  await page.waitForFunction(
    () => {
      const ext = window.__EXTENDED_OBJECT_STORE__?.getState()
      const appearance = window.__APPEARANCE_STORE__?.getState()
      return (
        ext?.pauliSpinor.fieldView === 'spinDensity' &&
        appearance?.colorAlgorithm === 'pauliSpinDensity'
      )
    },
    undefined,
    { timeout: 10_000 }
  )
  await waitForUniformUpdate(page)
}

test.describe('Pauli Zeeman Anamorph', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('preset renders nonblank phase-shear ribbons distinct from spin density', async ({
    page,
  }) => {
    await gotoPauli(page, 3)
    await waitForShaderCompilation(page)

    await applyZeemanAnamorphPreset(page)
    await waitForShaderCompilation(page)
    const startFrame = await getFrameCount(page)
    await waitForFrameAdvance(page, startFrame + 180, 20_000)
    await waitForModeReady(page, 60)
    await pauseAnimation(page)

    const state = await page.evaluate(() => {
      const ext = window.__EXTENDED_OBJECT_STORE__?.getState()
      const appearance = window.__APPEARANCE_STORE__?.getState()
      return {
        fieldView: ext?.pauliSpinor.fieldView,
        initialCondition: ext?.pauliSpinor.initialCondition,
        fieldType: ext?.pauliSpinor.fieldType,
        gradientStrength: ext?.pauliSpinor.gradientStrength,
        colorAlgorithm: appearance?.colorAlgorithm,
      }
    })
    expect(state).toMatchObject({
      fieldView: 'zeemanAnamorph',
      initialCondition: 'zeemanAnamorphSeed',
      fieldType: 'quadrupole',
      colorAlgorithm: 'phaseDensity',
    })
    expect(state.gradientStrength).toBeGreaterThan(0)

    await assertNonBlankPixels(page, 'Pauli Zeeman Anamorph', 10)
    const anamorph = await capturePixelSnapshot(page)
    await page.locator('[data-testid="webgpu-canvas"]').screenshot({
      path: 'screenshots/pauli-zeeman-anamorph.png',
      type: 'png',
    })

    await setPauliSpinDensityBaseline(page)
    await assertNonBlankPixels(page, 'Pauli spin-density baseline', 10)
    const spinDensity = await capturePixelSnapshot(page)
    await page.locator('[data-testid="webgpu-canvas"]').screenshot({
      path: 'screenshots/pauli-zeeman-anamorph-spin-density.png',
      type: 'png',
    })

    expectSnapshotsDiffer(anamorph, spinDensity, 'Zeeman Anamorph vs spin density', 0.35)
  })
})
