/**
 * E2E proof for the Free Scalar Cauchy Loom field view.
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

test.setTimeout(180_000)

async function applyFreeScalarPreset(page: Page, presetId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const extStore = window.__EXTENDED_OBJECT_STORE__
    if (!extStore) throw new Error('__EXTENDED_OBJECT_STORE__ missing')
    await extStore.getState().applyFreeScalarPreset(id)
  }, presetId)

  await page.waitForFunction(
    (id) => {
      const extStore = window.__EXTENDED_OBJECT_STORE__
      if (!extStore) return false
      const fs = extStore.getState().schroedinger.freeScalar
      if (id !== 'cauchyLoomWeave') return false
      return (
        fs.initialCondition === 'cauchyLoomWeave' &&
        fs.fieldView === 'cauchyLoom' &&
        fs.gridSize[0] === 64 &&
        fs.gridSize[1] === 64 &&
        fs.gridSize[2] === 64 &&
        fs.modeK[0] === 4 &&
        fs.modeK[1] === 5 &&
        fs.modeK[2] === 7
      )
    },
    presetId,
    { timeout: 5_000 }
  )
}

async function setFreeScalarFieldView(page: Page, view: 'cauchyLoom' | 'energyDensity') {
  await page.evaluate((fieldView) => {
    const extStore = window.__EXTENDED_OBJECT_STORE__
    if (!extStore) throw new Error('__EXTENDED_OBJECT_STORE__ missing')
    extStore.getState().setFreeScalarFieldView(fieldView)
  }, view)
  await waitForUniformUpdate(page)
}

async function readFreeScalarState(page: Page) {
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
      freeScalar: {
        latticeDim: s.freeScalar.latticeDim,
        initialCondition: s.freeScalar.initialCondition,
        fieldView: s.freeScalar.fieldView,
        packetWidth: s.freeScalar.packetWidth,
        packetAmplitude: s.freeScalar.packetAmplitude,
        modeK: s.freeScalar.modeK,
        mass: s.freeScalar.mass,
        selfInteractionEnabled: s.freeScalar.selfInteractionEnabled,
        absorberEnabled: s.freeScalar.absorberEnabled,
        autoScale: s.freeScalar.autoScale,
      },
    }
  })
}

test.describe('Free Scalar Cauchy Loom Weave', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('renders canonical loom filaments distinct from energy density', async ({ page }) => {
    await gotoMode(page, 'freeScalarField', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await applyFreeScalarPreset(page, 'cauchyLoomWeave')
    await waitForShaderCompilation(page)
    await waitForUniformUpdate(page)
    const frame = await getFrameCount(page)
    await waitForFrameAdvance(page, frame + 180, 45_000)
    await assertNonBlankPixels(page, 'Free Scalar Cauchy Loom', 25)
    await page.locator('[data-testid="webgpu-canvas"]').screenshot({
      path: test.info().outputPath('free-scalar-cauchy-loom.png'),
    })
    const loom = await capturePixelSnapshot(page)

    const state = await readFreeScalarState(page)
    expect(state.quantumMode).toBe('freeScalarField')
    expect(state.freeScalar.latticeDim).toBe(3)
    expect(state.freeScalar.initialCondition).toBe('cauchyLoomWeave')
    expect(state.freeScalar.fieldView).toBe('cauchyLoom')
    expect(state.freeScalar.packetWidth).toBeCloseTo(0.82)
    expect(state.freeScalar.packetAmplitude).toBeCloseTo(1.0)
    expect(state.freeScalar.modeK).toEqual([4, 5, 7])
    expect(state.freeScalar.mass).toBeCloseTo(0.45)
    expect(state.freeScalar.selfInteractionEnabled).toBe(false)
    expect(state.freeScalar.absorberEnabled).toBe(false)
    expect(state.freeScalar.autoScale).toBe(true)
    expect(state.colorAlgorithm).toBe('phaseDensity')
    expect(state.densityGain).toBeGreaterThanOrEqual(2.0)
    expect(state.densityContrast).toBeCloseTo(3.4)

    await setFreeScalarFieldView(page, 'energyDensity')
    const baselineFrame = await getFrameCount(page)
    await waitForFrameAdvance(page, baselineFrame + 60, 30_000)
    await assertNonBlankPixels(page, 'Free Scalar Cauchy Loom energy baseline', 25)
    await page.locator('[data-testid="webgpu-canvas"]').screenshot({
      path: test.info().outputPath('free-scalar-cauchy-loom-energy-baseline.png'),
    })
    const energyDensity = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(loom, energyDensity, 'Cauchy Loom vs energy density', 0.5)
  })
})
