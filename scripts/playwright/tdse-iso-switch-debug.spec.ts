/**
 * E2E Debug: TDSE Decoherence + Render Mode Switch
 *
 * The bug: enabling decoherence then switching render mode in ANY direction
 * kills the wavefunction. This test covers both directions.
 */

import { expect, test } from './fixtures'
import {
  captureAndSamplePixels,
  getFrameCount,
  gotoModeWithParams,
  waitForFirstFrame,
  waitForFrameAdvance,
  waitForRendererSettled,
  waitForShaderCompilation,
} from './helpers/app-helpers'

async function getPipelineGen(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
    return parseInt(canvas?.getAttribute('data-pipeline-gen') ?? '0', 10)
  })
}

async function waitForPipelineGenAdvance(
  page: import('@playwright/test').Page,
  beyondGen: number,
  timeoutMs = 60_000
): Promise<number> {
  await page.waitForFunction(
    (minGen: number) => {
      const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
      return parseInt(canvas?.getAttribute('data-pipeline-gen') ?? '0', 10) > minGen
    },
    beyondGen,
    { timeout: timeoutMs }
  )
  return getPipelineGen(page)
}

async function setIsoEnabled(page: import('@playwright/test').Page, enabled: boolean) {
  await page.evaluate(async (iso: boolean) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerIsoEnabled(iso)
  }, enabled)
}

async function enableDecoherence(page: import('@playwright/test').Page, branching = true) {
  await page.evaluate(async (b: boolean) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    const ext = mod.useExtendedObjectStore.getState()
    ext.setTdseStochasticEnabled(true)
    ext.setTdseStochasticGamma(1.0)
    ext.setTdseStochasticSigma(2.0)
    ext.setTdseStochasticNumSites(4)
    ext.setTdseBranchingEnabled(b)
  }, branching)
}

async function pixels(page: import('@playwright/test').Page) {
  return (await captureAndSamplePixels(page)).nonBgPixels
}

/** Read density grid center voxel via the diagnostics density channel. */
async function readDensityCenter(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/diagnosticsStore.ts')
    const d = mod.useDiagnosticsStore.getState().density
    return {
      hasData: d.hasData,
      maxDensity: d.maxDensity,
      centerDensity: d.centerDensity,
      activeVoxelCount: d.activeVoxelCount,
    }
  })
}

test.describe('TDSE Decoherence Mode Switch', () => {
  test('iso → volumetric with decoherence kills rendering', async ({ page }) => {
    // Start in ISOSURFACE mode
    await gotoModeWithParams(page, 'tdseDynamics', 3, { pot: 'harmonicTrap', diag: '1', iso: '1' })
    const rs = await waitForRendererSettled(page)
    if (rs === 'error') {
      const errorMsg = await page.locator('[data-testid="webgpu-container"]').getAttribute('data-renderer-error')
      const isGpuUnavailable = !errorMsg || /webgpu|adapter|gpu.*not.*support/i.test(errorMsg)
      test.skip(isGpuUnavailable, 'No WebGPU')
      throw new Error(`Renderer error (not GPU-unavailable): ${errorMsg}`)
    }
    await waitForFirstFrame(page)
    await waitForShaderCompilation(page)
    await expect(page.getByTestId('shader-compilation-overlay')).not.toBeVisible({
      timeout: 10_000,
    })

    // Enable decoherence
    await enableDecoherence(page)
    const fc0 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc0 + 60, 30_000)

    const pxBefore = await pixels(page)

    console.log(`[ISO START] pixels=${pxBefore}`)
    expect(pxBefore, 'Isosurface must render before mode switch').toBeGreaterThan(5)

    // Switch to VOLUMETRIC
    const gen = await getPipelineGen(page)
    await setIsoEnabled(page, false)
    await waitForPipelineGenAdvance(page, gen)
    await expect(page.getByTestId('shader-compilation-overlay')).not.toBeVisible({
      timeout: 10_000,
    })
    const fc1 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc1 + 60, 30_000)

    const pxAfter = await pixels(page)
    const density = await readDensityCenter(page)

    console.log(`[VOL AFTER] pixels=${pxAfter} density=${JSON.stringify(density)}`)

    console.log(`=== iso→vol: ${pxBefore} → ${pxAfter} ===`)

    expect(
      pxAfter,
      'Volumetric must render after switching from iso with decoherence'
    ).toBeGreaterThan(Math.max(pxBefore * 0.1, 20))
  })

  test('vol → iso with decoherence kills rendering', async ({ page }) => {
    // Start in VOLUMETRIC mode
    await gotoModeWithParams(page, 'tdseDynamics', 3, { pot: 'harmonicTrap', diag: '1' })
    const rs = await waitForRendererSettled(page)
    if (rs === 'error') {
      const errorMsg = await page.locator('[data-testid="webgpu-container"]').getAttribute('data-renderer-error')
      const isGpuUnavailable = !errorMsg || /webgpu|adapter|gpu.*not.*support/i.test(errorMsg)
      test.skip(isGpuUnavailable, 'No WebGPU')
      throw new Error(`Renderer error (not GPU-unavailable): ${errorMsg}`)
    }
    await waitForFirstFrame(page)
    await waitForShaderCompilation(page)
    await expect(page.getByTestId('shader-compilation-overlay')).not.toBeVisible({
      timeout: 10_000,
    })

    // Enable decoherence
    await enableDecoherence(page)
    const fc0 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc0 + 60, 30_000)

    const pxBefore = await pixels(page)

    console.log(`[VOL START] pixels=${pxBefore}`)
    expect(pxBefore, 'Volumetric must render before mode switch').toBeGreaterThan(5)

    // Switch to ISOSURFACE
    const gen = await getPipelineGen(page)
    await setIsoEnabled(page, true)
    await waitForPipelineGenAdvance(page, gen)
    await expect(page.getByTestId('shader-compilation-overlay')).not.toBeVisible({
      timeout: 10_000,
    })
    const fc1 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc1 + 60, 30_000)

    const pxAfter = await pixels(page)

    console.log(`[ISO AFTER] pixels=${pxAfter}`)

    console.log(`=== vol→iso: ${pxBefore} → ${pxAfter} ===`)

    expect(
      pxAfter,
      'Isosurface must render after switching from vol with decoherence'
    ).toBeGreaterThan(Math.max(pxBefore * 0.1, 20))
  })
})
