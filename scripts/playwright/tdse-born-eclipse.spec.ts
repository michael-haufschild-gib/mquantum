/**
 * E2E proof for TDSE Born Eclipse field view.
 *
 * GPU/shader error detection is automatic via fixtures.ts.
 */

import { expect, test } from './fixtures'
import {
  applyTdsePreset,
  assertNonBlankPixels,
  capturePixelSnapshot,
  expectSnapshotsDiffer,
  getFrameCount,
  gotoMode,
  pauseAnimation,
  requireWebGPU,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
  waitForUniformUpdate,
} from './helpers/app-helpers'

test.setTimeout(180_000)

async function setTdseFieldView(page: import('@playwright/test').Page, view: string) {
  await page.evaluate((fieldView) => {
    const extStore = window.__EXTENDED_OBJECT_STORE__
    if (!extStore) throw new Error('__EXTENDED_OBJECT_STORE__ missing')
    extStore.getState().setTdseFieldView(fieldView)
  }, view)
}

test.describe('TDSE Born Eclipse field view', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('bornEclipseCollider renders structured eclipse field distinct from density', async ({
    page,
  }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await applyTdsePreset(page, 'bornEclipseCollider')
    await waitForShaderCompilation(page)
    const frame = await getFrameCount(page)
    await waitForFrameAdvance(page, frame + 160)
    await assertNonBlankPixels(page, 'Born Eclipse collider', 5)
    await pauseAnimation(page)

    const eclipse = await capturePixelSnapshot(page)

    await setTdseFieldView(page, 'density')
    await waitForUniformUpdate(page)
    await assertNonBlankPixels(page, 'Born Eclipse density baseline', 5)
    const density = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(eclipse, density, 'Born Eclipse view must differ from density view')

    const state = await page.evaluate(
      () => window.__EXTENDED_OBJECT_STORE__?.getState().schroedinger.tdse.fieldView
    )
    expect(state).toBe('density')
  })
})
