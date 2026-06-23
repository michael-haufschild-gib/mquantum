/**
 * Screenshot capture for the WDW ⊗ ζ suite — visual QA, not an assertion test.
 * Captures each built mode (and notable presets) to /tmp for inspection.
 *
 * @module scripts/playwright/wdw-zeta-screenshot.spec
 */

import { expect, test } from './fixtures'
import {
  getFrameCount,
  gotoModeWithParams,
  requireWebGPU,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.setTimeout(180_000)

const SHOTS: { mode: string; params: Record<string, string>; name: string }[] = [
  // Default presets (baseline look).
  { mode: 'constraintSeam', params: {}, name: 'constraintSeam' },
  { mode: 'moebiusNoBoundary', params: {}, name: 'moebiusNoBoundary' },
  { mode: 'forcedCell', params: {}, name: 'forcedCell' },
  { mode: 'turningSurface', params: {}, name: 'turningSurface' },
  { mode: 'primonMultiverse', params: {}, name: 'primonMultiverse' },
  { mode: 'frobeniusWheel', params: {}, name: 'frobeniusWheel' },
  { mode: 'dewittCone', params: {}, name: 'dewittCone' },
  { mode: 'selbergSpectrum', params: {}, name: 'selbergSpectrum' },
  { mode: 'adelicWavefunction', params: {}, name: 'adelicWavefunction' },
  { mode: 'weilPositivity', params: {}, name: 'weilPositivity' },
  // Notable cross-domain presets (must look distinct from the defaults above).
  {
    mode: 'constraintSeam',
    params: { cs_p: 'quantumCarpet' },
    name: 'constraintSeam-quantumCarpet',
  },
  {
    mode: 'constraintSeam',
    params: { cs_p: 'phasePortrait' },
    name: 'constraintSeam-phasePortrait',
  },
  { mode: 'moebiusNoBoundary', params: { mb_p: 'tunnelingSpike' }, name: 'moebius-tunnelingSpike' },
  { mode: 'forcedCell', params: { fc_p: 'cellWalls' }, name: 'forcedCell-cellWalls' },
  { mode: 'forcedCell', params: { fc_p: 'squeezedVacuum' }, name: 'forcedCell-squeezedVacuum' },
  { mode: 'turningSurface', params: { ts_p: 'vacuumFoam' }, name: 'turning-vacuumFoam' },
  {
    mode: 'turningSurface',
    params: { ts_p: 'anisotropicRidge' },
    name: 'turning-anisotropicRidge',
  },
  { mode: 'primonMultiverse', params: { pm_p: 'adsMultiverse' }, name: 'primon-adsMultiverse' },
  { mode: 'primonMultiverse', params: { pm_p: 'momentumShells' }, name: 'primon-momentumShells' },
  { mode: 'frobeniusWheel', params: { fw_p: 'weightSpindle' }, name: 'frobenius-weightSpindle' },
  { mode: 'dewittCone', params: { dc_p: 'btzThroat' }, name: 'dewitt-btzThroat' },
  { mode: 'dewittCone', params: { dc_p: 'helicalBranches' }, name: 'dewitt-helicalBranches' },
  { mode: 'selbergSpectrum', params: { ss_p: 'adsDisk' }, name: 'selberg-adsDisk' },
  { mode: 'selbergSpectrum', params: { ss_p: 'pairOfPants' }, name: 'selberg-pairOfPants' },
  {
    mode: 'adelicWavefunction',
    params: { aw_p: 'archimedeanBloom' },
    name: 'adelic-archimedeanBloom',
  },
  { mode: 'weilPositivity', params: { wp_p: 'vacuumCore' }, name: 'weil-vacuumCore' },
]

test.describe('WDW ⊗ ζ suite screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  for (const shot of SHOTS) {
    test(`capture ${shot.name}`, async ({ page }) => {
      await gotoModeWithParams(page, shot.mode, 3, shot.params)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)
      const fc = await getFrameCount(page)
      await waitForFrameAdvance(page, fc + 90)
      const canvas = page.getByTestId('webgpu-canvas')
      await canvas.screenshot({ path: `/tmp/wdwzeta-${shot.name}.png` })
      expect(true).toBe(true)
    })
  }
})
