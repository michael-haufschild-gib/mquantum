import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  capturePixelSnapshot,
  expectCanvasNotBlank,
  expectSnapshotsDiffer,
  gotoMode,
  requireWebGPU,
  waitForRendererReady,
  waitForShaderCompilation,
  waitForUniformUpdate,
} from './helpers/app-helpers'
import { TopBar } from './pages/TopBar'

test.setTimeout(180_000)

type HydrogenCausalState = {
  dimension: number
  hydrogenNDPreset: string
  causalDiamondEnabled: boolean
  causalDiamondShellGain: number
  causalDiamondHolonomyStrength: number
  extraDimQuantumNumber0: number
}

async function readHydrogenCausalState(page: Page): Promise<HydrogenCausalState> {
  return page.evaluate(() => {
    const win = window as typeof window & {
      __GEOMETRY_STORE__?: { getState: () => { dimension: number } }
      __EXTENDED_OBJECT_STORE__?: {
        getState: () => {
          schroedinger: {
            hydrogenNDPreset: string
            causalDiamondEnabled: boolean
            causalDiamondShellGain: number
            causalDiamondHolonomyStrength: number
            extraDimQuantumNumbers: number[]
          }
        }
      }
    }
    const geo = win.__GEOMETRY_STORE__?.getState()
    const schroedinger = win.__EXTENDED_OBJECT_STORE__?.getState().schroedinger
    if (!geo || !schroedinger) {
      throw new Error('store bridge missing')
    }
    return {
      dimension: geo.dimension,
      hydrogenNDPreset: schroedinger.hydrogenNDPreset,
      causalDiamondEnabled: schroedinger.causalDiamondEnabled,
      causalDiamondShellGain: schroedinger.causalDiamondShellGain,
      causalDiamondHolonomyStrength: schroedinger.causalDiamondHolonomyStrength,
      extraDimQuantumNumber0: schroedinger.extraDimQuantumNumbers[0] ?? 0,
    }
  })
}

async function openScenarioSelector(page: Page) {
  const topBar = new TopBar(page)
  await topBar.openLeftPanel()
  const selector = page.getByTestId('scenario-selector')
  await expect(selector).toBeVisible({ timeout: 5_000 })
  return selector
}

test.describe('HydrogenND causal-diamond modular orbitals', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)
  })

  test('scenario selector exposes both causal-diamond presets at 4D', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 4)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    const selector = await openScenarioSelector(page)

    await expect(selector.locator('option[value="causalDiamondHydrogenShell"]')).toHaveCount(1)
    await expect(selector.locator('option[value="causalDiamondHydrogenHolonomy4D"]')).toHaveCount(1)
  })

  test('3D shell and 4D holonomy presets render non-blank distinct frames', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    let selector = await openScenarioSelector(page)
    await selector.selectOption('causalDiamondHydrogenShell')
    await waitForUniformUpdate(page)
    await expectCanvasNotBlank(page)
    const shellState = await readHydrogenCausalState(page)
    expect(shellState).toMatchObject({
      dimension: 3,
      hydrogenNDPreset: 'causalDiamondHydrogenShell',
      causalDiamondEnabled: true,
      causalDiamondHolonomyStrength: 0,
      extraDimQuantumNumber0: 0,
    })
    expect(shellState.causalDiamondShellGain).toBeGreaterThan(4)
    const shellShot = await capturePixelSnapshot(page)

    await gotoMode(page, 'hydrogenND', 4)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    selector = await openScenarioSelector(page)
    await selector.selectOption('causalDiamondHydrogenHolonomy4D')
    await waitForUniformUpdate(page)
    await expectCanvasNotBlank(page)
    const holonomyState = await readHydrogenCausalState(page)
    expect(holonomyState).toMatchObject({
      dimension: 4,
      hydrogenNDPreset: 'causalDiamondHydrogenHolonomy4D',
      causalDiamondEnabled: true,
      extraDimQuantumNumber0: 0,
    })
    expect(holonomyState.causalDiamondHolonomyStrength).toBeGreaterThan(4)
    const holonomyShot = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(shellShot, holonomyShot, 'causal shell vs 4D holonomy', 0.3)
  })
})
