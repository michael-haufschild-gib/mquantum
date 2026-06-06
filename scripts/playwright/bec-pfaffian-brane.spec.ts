import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  applyBecPreset,
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

async function readBecState(page: Page) {
  return page.evaluate(() => {
    const extStore = window.__EXTENDED_OBJECT_STORE__
    if (!extStore) throw new Error('__EXTENDED_OBJECT_STORE__ missing')
    const s = extStore.getState().schroedinger
    return {
      quantumMode: s.quantumMode,
      densityGain: s.densityGain,
      densityContrast: s.densityContrast,
      autoScaleMaxGain: s.autoScaleMaxGain,
      bec: {
        latticeDim: s.bec.latticeDim,
        initialCondition: s.bec.initialCondition,
        fieldView: s.bec.fieldView,
        vortexPlane1: s.bec.vortexPlane1,
        vortexPlane2: s.bec.vortexPlane2,
        vortexPairCount: s.bec.vortexPairCount,
      },
    }
  })
}

async function applyPfaffianPresetAndCapture(
  page: Page,
  presetId: string,
  screenshotName: string,
  minNonBlankPixels = 1
) {
  await applyBecPreset(page, presetId)
  await waitForShaderCompilation(page)
  await waitForUniformUpdate(page)
  const frame = await getFrameCount(page)
  await waitForFrameAdvance(page, frame + 220, 45_000)
  if (minNonBlankPixels > 0) {
    await assertNonBlankPixels(page, `BEC ${presetId}`, minNonBlankPixels)
  }
  await page.locator('[data-testid="webgpu-canvas"]').screenshot({
    path: `/Users/Spare/Documents/code/mquantum/screenshots/${screenshotName}`,
  })
  return capturePixelSnapshot(page)
}

test.describe('BEC Pfaffian brane intersections', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('collision and skew Pfaffian presets render distinct 4D brane caustics', async ({
    page,
  }) => {
    await gotoMode(page, 'becDynamics', 4)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    const collision = await applyPfaffianPresetAndCapture(
      page,
      'pfaffianBraneCollision',
      'bec-pfaffian-brane-collision.png'
    )
    const collisionState = await readBecState(page)
    expect(collisionState.quantumMode).toBe('becDynamics')
    expect(collisionState.bec.latticeDim).toBe(4)
    expect(collisionState.bec.initialCondition).toBe('vortexReconnection')
    expect(collisionState.bec.fieldView).toBe('branePfaffian')
    expect(collisionState.bec.vortexPlane1).toEqual([0, 1])
    expect(collisionState.bec.vortexPlane2).toEqual([2, 3])
    expect(collisionState.bec.vortexPairCount).toBe(2)
    expect(collisionState.densityGain).toBeCloseTo(1.6)
    expect(collisionState.densityContrast).toBeCloseTo(2.4)

    const skew = await applyPfaffianPresetAndCapture(
      page,
      'pfaffianBraneSkew',
      'bec-pfaffian-brane-skew.png'
    )
    const skewState = await readBecState(page)
    expect(skewState.bec.fieldView).toBe('branePfaffian')
    expect(skewState.bec.vortexPlane1).toEqual([0, 2])
    expect(skewState.bec.vortexPlane2).toEqual([1, 3])
    expect(skewState.autoScaleMaxGain).toBe(12)

    expectSnapshotsDiffer(collision, skew, 'Pfaffian collision vs skew brane caustics', 0.5)
  })

  test('same-plane null control does not resemble the true Pfaffian collision', async ({
    page,
  }) => {
    await gotoMode(page, 'becDynamics', 4)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    const collision = await applyPfaffianPresetAndCapture(
      page,
      'pfaffianBraneCollision',
      'bec-pfaffian-brane-collision-control-baseline.png'
    )
    const nullControl = await applyPfaffianPresetAndCapture(
      page,
      'pfaffianBraneNullControl',
      'bec-pfaffian-brane-null-control.png',
      0
    )
    const state = await readBecState(page)
    expect(state.bec.fieldView).toBe('branePfaffian')
    expect(state.bec.vortexPlane1).toEqual([0, 1])
    expect(state.bec.vortexPlane2).toEqual([0, 1])

    expectSnapshotsDiffer(
      collision,
      nullControl,
      'Pfaffian collision vs same-plane null control',
      0.5
    )
  })
})
