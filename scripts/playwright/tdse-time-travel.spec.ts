/**
 * TDSE time-travel e2e checks.
 *
 * Focus: P-CTC scenario presets must apply through the real scenario pipeline,
 * drive the WebGPU CTC operator, and render non-blank pixels.
 */

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  applyTdsePreset,
  assertNonBlankPixels,
  capturePixelSnapshot,
  expectSnapshotsDiffer,
  getFrameCount,
  gotoMode,
  hasWebGPU,
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

const CTC_RESIDUAL_PRESETS = [
  {
    id: 'ctcResidualNovikovMap',
    label: 'CTC residual Novikov map',
    expectedPhase: 0,
  },
  {
    id: 'ctcResidualParadoxMap',
    label: 'CTC residual paradox map',
    expectedPhase: Math.PI,
  },
] as const

const CTC_LOOP_GAIN_PRESETS = [
  {
    id: 'ctcLoopGainConstructiveHorizon',
    label: 'CTC loop-gain constructive horizon',
    expectedPhase: 0,
    expectedShear: false,
  },
  {
    id: 'ctcLoopGainShearedProtection',
    label: 'CTC loop-gain sheared protection',
    expectedPhase: Math.PI / 2,
    expectedShear: true,
  },
] as const

const CTC_DEUTSCH_ENTROPY_PRESETS = [
  {
    id: 'ctcDeutschEntropyParadoxMixer',
    label: 'CTC Deutsch entropy paradox mixer',
    expectedPhase: Math.PI,
    expectedShear: false,
  },
  {
    id: 'ctcDeutschEntropyShearedMixer',
    label: 'CTC Deutsch entropy sheared mixer',
    expectedPhase: Math.PI / 2,
    expectedShear: true,
  },
] as const

async function requireWebGPUWithoutSkipping(page: Page): Promise<void> {
  const available = await hasWebGPU(page)
  expect(available, 'tdse-time-travel.spec.ts requires WebGPU and must not skip').toBe(true)
}

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

async function waitForAppliedCtcResidualPreset(
  page: Page,
  preset: (typeof CTC_RESIDUAL_PRESETS)[number]
): Promise<void> {
  await page.waitForFunction(
    ({ id, expectedPhase }) => {
      const extStore = window.__EXTENDED_OBJECT_STORE__
      if (!extStore) return false
      const tdse = extStore.getState().schroedinger.tdse
      return (
        tdse.ctcPostselectionEnabled === true &&
        tdse.ctcPostselectionStrength > 0 &&
        tdse.ctcPostselectionStrength < 0.02 &&
        Math.abs(tdse.ctcLoopPhase - expectedPhase) < 1e-4 &&
        tdse.fieldView === 'ctcResidual' &&
        tdse.initialCondition === 'superposition' &&
        tdse.wormholeMirrorAxis === 0 &&
        tdse.gridSize[0] === 64 &&
        tdse.gridSize[0] % 2 === 0 &&
        id.length > 0
      )
    },
    preset,
    { timeout: 10_000 }
  )
}

async function waitForAppliedCtcLoopGainPreset(
  page: Page,
  preset: (typeof CTC_LOOP_GAIN_PRESETS)[number]
): Promise<void> {
  await page.waitForFunction(
    ({ id, expectedPhase, expectedShear }) => {
      const extStore = window.__EXTENDED_OBJECT_STORE__
      if (!extStore) return false
      const tdse = extStore.getState().schroedinger.tdse
      const shear = Math.abs(tdse.packetMomentum[1] ?? 0)
      return (
        tdse.ctcPostselectionStrength > 0.9 &&
        Math.abs(tdse.ctcLoopPhase - expectedPhase) < 1e-4 &&
        tdse.fieldView === 'ctcLoopGain' &&
        tdse.initialCondition === 'superposition' &&
        tdse.wormholeMirrorAxis === 0 &&
        tdse.latticeDim === 3 &&
        tdse.gridSize[0] === 64 &&
        tdse.gridSize[0] % 2 === 0 &&
        (expectedShear ? shear > 1 : shear < 1e-4) &&
        id.length > 0
      )
    },
    preset,
    { timeout: 10_000 }
  )
}

async function waitForAppliedCtcDeutschEntropyPreset(
  page: Page,
  preset: (typeof CTC_DEUTSCH_ENTROPY_PRESETS)[number]
): Promise<void> {
  await page.waitForFunction(
    ({ id, expectedPhase, expectedShear }) => {
      const extStore = window.__EXTENDED_OBJECT_STORE__
      if (!extStore) return false
      const tdse = extStore.getState().schroedinger.tdse
      const shear = Math.abs(tdse.packetMomentum[1] ?? 0)
      return (
        tdse.ctcPostselectionEnabled === false &&
        tdse.ctcPostselectionStrength > 0.9 &&
        Math.abs(tdse.ctcLoopPhase - expectedPhase) < 1e-4 &&
        tdse.fieldView === 'ctcDeutschEntropy' &&
        tdse.initialCondition === 'superposition' &&
        tdse.wormholeMirrorAxis === 0 &&
        tdse.latticeDim === 3 &&
        tdse.gridSize[0] === 64 &&
        tdse.gridSize[0] % 2 === 0 &&
        (expectedShear ? shear > 1 : shear < 1e-4) &&
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
    await requireWebGPUWithoutSkipping(page)
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

test.describe('TDSE CTC Deutsch entropy field view presets', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPUWithoutSkipping(page)
  })

  for (const preset of CTC_DEUTSCH_ENTROPY_PRESETS) {
    test(`${preset.label}: applies preset and renders non-blank entropy pixels`, async ({
      page,
    }) => {
      await gotoMode(page, 'tdseDynamics', 3)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)

      await applyTdsePreset(page, preset.id)
      await waitForAppliedCtcDeutschEntropyPreset(page, preset)
      await waitForShaderCompilation(page)
      const frame = await getFrameCount(page)
      await waitForFrameAdvance(page, frame + 45)

      await assertNonBlankPixels(page, preset.label, 2)
    })
  }

  test('paradox and sheared mixers render visually distinct entropy maps', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await applyTdsePreset(page, 'ctcDeutschEntropyParadoxMixer')
    await waitForAppliedCtcDeutschEntropyPreset(page, CTC_DEUTSCH_ENTROPY_PRESETS[0])
    await waitForShaderCompilation(page)
    await waitForFrameAdvance(page, (await getFrameCount(page)) + 45)
    const paradox = await capturePixelSnapshot(page)

    await applyTdsePreset(page, 'ctcDeutschEntropyShearedMixer')
    await waitForAppliedCtcDeutschEntropyPreset(page, CTC_DEUTSCH_ENTROPY_PRESETS[1])
    await waitForShaderCompilation(page)
    await waitForFrameAdvance(page, (await getFrameCount(page)) + 45)
    const sheared = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(paradox, sheared, 'CTC Deutsch entropy paradox vs sheared maps', 0.35)
  })
})

test.describe('TDSE CTC loop-gain field view presets', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPUWithoutSkipping(page)
  })

  for (const preset of CTC_LOOP_GAIN_PRESETS) {
    test(`${preset.label}: applies preset and renders non-blank gain pixels`, async ({ page }) => {
      await gotoMode(page, 'tdseDynamics', 3)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)

      await applyTdsePreset(page, preset.id)
      await waitForAppliedCtcLoopGainPreset(page, preset)
      await waitForShaderCompilation(page)
      const frame = await getFrameCount(page)
      await waitForFrameAdvance(page, frame + 45)

      await assertNonBlankPixels(page, preset.label, 2)
    })
  }

  test('constructive horizon and sheared protection render visually distinct gain maps', async ({
    page,
  }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await applyTdsePreset(page, 'ctcLoopGainConstructiveHorizon')
    await waitForAppliedCtcLoopGainPreset(page, CTC_LOOP_GAIN_PRESETS[0])
    await waitForShaderCompilation(page)
    await waitForFrameAdvance(page, (await getFrameCount(page)) + 45)
    const constructive = await capturePixelSnapshot(page)

    await applyTdsePreset(page, 'ctcLoopGainShearedProtection')
    await waitForAppliedCtcLoopGainPreset(page, CTC_LOOP_GAIN_PRESETS[1])
    await waitForShaderCompilation(page)
    await waitForFrameAdvance(page, (await getFrameCount(page)) + 45)
    const sheared = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(constructive, sheared, 'CTC loop-gain constructive vs sheared maps', 0.4)
  })
})

test.describe('TDSE CTC loop-residue field view presets', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPUWithoutSkipping(page)
  })

  for (const preset of CTC_RESIDUAL_PRESETS) {
    test(`${preset.label}: applies preset and renders non-blank residual pixels`, async ({ page }) => {
      await gotoMode(page, 'tdseDynamics', 3)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)

      await applyTdsePreset(page, preset.id)
      await waitForAppliedCtcResidualPreset(page, preset)
      await waitForShaderCompilation(page)
      const frame = await getFrameCount(page)
      await waitForFrameAdvance(page, frame + 45)

      await assertNonBlankPixels(page, preset.label, 3)
    })
  }

  test('Novikov and paradox residual maps render visually distinct residues', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await applyTdsePreset(page, 'ctcResidualNovikovMap')
    await waitForAppliedCtcResidualPreset(page, CTC_RESIDUAL_PRESETS[0])
    await waitForShaderCompilation(page)
    await waitForFrameAdvance(page, (await getFrameCount(page)) + 45)
    const novikov = await capturePixelSnapshot(page)

    await applyTdsePreset(page, 'ctcResidualParadoxMap')
    await waitForAppliedCtcResidualPreset(page, CTC_RESIDUAL_PRESETS[1])
    await waitForShaderCompilation(page)
    await waitForFrameAdvance(page, (await getFrameCount(page)) + 45)
    const paradox = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(novikov, paradox, 'CTC residual Novikov vs paradox maps', 0.4)
  })
})
