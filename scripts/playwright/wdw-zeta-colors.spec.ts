/**
 * Visual QA + non-blank assertion for the WDW ⊗ ζ color algorithms: the 4 shared
 * lit-surface algorithms (on varied forms) and the 10 mode-specific algorithms
 * (each on its own mode). Each must render visible, non-black structure. Images
 * are written to /tmp for inspection.
 *
 * @module scripts/playwright/wdw-zeta-colors.spec
 */

import { test } from './fixtures'
import {
  expectCanvasNotBlank,
  getFrameCount,
  gotoMode,
  requireWebGPU,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.setTimeout(180_000)

const SHOTS: { mode: string; algo: string; name: string }[] = [
  // 4 shared measure-based algorithms — showcased on varied forms.
  { mode: 'weilPositivity', algo: 'zetaZeroCount', name: 'shared-zetaZeroCount-weil' },
  { mode: 'dewittCone', algo: 'chebyshevPsi', name: 'shared-chebyshevPsi-dewitt' },
  { mode: 'selbergSpectrum', algo: 'mertens', name: 'shared-mertens-selberg' },
  { mode: 'turningSurface', algo: 'explicitFormula', name: 'shared-explicitFormula-turning' },
  // 10 mode-specific — each on its own mode.
  { mode: 'constraintSeam', algo: 'xiPhaseCarpet', name: 'ms-xiPhaseCarpet' },
  { mode: 'moebiusNoBoundary', algo: 'moebiusTriad', name: 'ms-moebiusTriad' },
  { mode: 'forcedCell', algo: 'dilationFlow', name: 'ms-dilationFlow' },
  { mode: 'turningSurface', algo: 'wkbAction', name: 'ms-wkbAction' },
  { mode: 'primonMultiverse', algo: 'boseOccupation', name: 'ms-boseOccupation' },
  { mode: 'frobeniusWheel', algo: 'purityShells', name: 'ms-purityShells' },
  { mode: 'dewittCone', algo: 'causalRedshift', name: 'ms-causalRedshift' },
  { mode: 'selbergSpectrum', algo: 'lengthSpectrum', name: 'ms-lengthSpectrum' },
  { mode: 'adelicWavefunction', algo: 'padicValuation', name: 'ms-padicValuation' },
  { mode: 'weilPositivity', algo: 'liPositivity', name: 'ms-liPositivity' },
  { mode: 'fieldOneElement', algo: 'cyclotomicTotient', name: 'ms-cyclotomicTotient' },
  { mode: 'fieldOneElement', algo: 'zetaZeroCount', name: 'f1-zetaZeroCount' },
  { mode: 'fieldOneElement', algo: 'mixed', name: 'f1-native' },
  // pre-existing modularKnot — verify it is no longer over-blown white.
  { mode: 'modularKnot', algo: 'mixed', name: 'modularKnot-native' },
]

test.describe('WDW ⊗ ζ color algorithms render', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  for (const shot of SHOTS) {
    test(`${shot.name} renders non-blank`, async ({ page }) => {
      await gotoMode(page, shot.mode, 3)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)
      await page.evaluate(async (algo) => {
        const mod = await import('/src/stores/scene/appearanceStore.ts')
        mod.useAppearanceStore.getState().setColorAlgorithm(algo)
      }, shot.algo)
      const fc = await getFrameCount(page)
      await waitForFrameAdvance(page, fc + 60)
      await expectCanvasNotBlank(page)
      await page.getByTestId('webgpu-canvas').screenshot({ path: `/tmp/wzcol-${shot.name}.png` })
    })
  }
})
