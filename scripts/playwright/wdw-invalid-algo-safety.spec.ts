/**
 * WdW color-algorithm safety regression.
 *
 * Confirms that forcing an educational analysis algorithm (shader indices
 * 12-15) while in a non-FSF mode does NOT crash the renderer and does
 * NOT produce WebGPU errors. Two defenses:
 *
 *   1. `ColorAlgorithmSelector.tsx` filters educational algos out of its
 *      dropdown for non-FSF modes and auto-corrects any stale value via
 *      a `useEffect` that watches `availableOptions`.
 *   2. `composeBlockBuilders.ts` emits a stub
 *      `fn sampleAnalysisFromGrid(...) -> vec4f { return vec4f(0.0); }`
 *      when `freeScalarAnalysis=false`, so the generated shader compiles
 *      regardless of whether an educational algo is selected.
 *
 * This spec sets `colorAlgorithm='hamiltonianDecomposition'` in WdW mode
 * via the store and verifies the renderer stays in `ready` state with
 * frames advancing and no fatal page errors.
 */

import { expect, test } from './fixtures'
import {
  collectPageErrors,
  filterBenignErrors,
  getFrameCount,
  gotoModeWithParams,
  requireWebGPU,
  waitForFirstFrame,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.setTimeout(180_000)

const EDUCATIONAL_ALGOS = [
  'hamiltonianDecomposition',
  'modeCharacter',
  'energyFlux',
  'kSpaceOccupation',
] as const

test.describe('WdW + educational analysis algorithm safety', () => {
  test('forcing an analysis-texture algo in WdW does not crash the renderer', async ({
    page,
  }, testInfo) => {
    const pageErrors = collectPageErrors(page)

    await page.goto('/')
    await requireWebGPU(page, testInfo)
    await gotoModeWithParams(page, 'wheelerDeWitt', 3, {})
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    for (const algo of EDUCATIONAL_ALGOS) {
      // Bypass the dropdown by calling the store setter directly. The UI
      // auto-switch effect will revert to `blackbody`, but during the brief
      // window between dispatch and effect, the renderer must survive.
      await page.evaluate((a) => {
        const app = window.__APPEARANCE_STORE__!
        ;(app.getState().setColorAlgorithm as (v: string) => void)(a)
      }, algo)

      await waitForShaderCompilation(page)
      const fc = await getFrameCount(page)
      await waitForFrameAdvance(page, fc + 30, 15_000)

      const state = await page
        .locator('[data-testid="webgpu-container"]')
        .getAttribute('data-renderer-state')
      expect(state, `Renderer must stay ready after forcing ${algo}`).toBe('ready')

      const errorAttr = await page
        .locator('[data-testid="webgpu-container"]')
        .getAttribute('data-renderer-error')
      expect(errorAttr, `No renderer error attribute after ${algo}`).toBeNull()
    }

    const errors = filterBenignErrors(pageErrors)
    expect(
      errors,
      `Page errors while forcing analysis-texture algos in WdW:\n${errors.map((e) => `  • ${e}`).join('\n')}`
    ).toEqual([])
  })
})
