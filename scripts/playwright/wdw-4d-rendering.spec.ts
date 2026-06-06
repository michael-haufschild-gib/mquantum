/**
 * E2E proof for 4D Wheeler-DeWitt fixed-phi3 slices.
 *
 * GPU/shader error detection is automatic via fixtures.ts.
 */

import { expect, test } from './fixtures'
import {
  collectPageErrors,
  expectCanvasNotBlank,
  filterBenignErrors,
  gotoModeWithParams,
  requireWebGPU,
  waitForFirstFrame,
  waitForRendererReady,
} from './helpers/app-helpers'

test.setTimeout(180_000)

test.describe('Wheeler-DeWitt 4D fixed φ3 slice', () => {
  test('renders a finite 4D solve with clean console and non-blank canvas', async ({
    page,
  }, testInfo) => {
    const pageErrors = collectPageErrors(page)

    await page.goto('/')
    await requireWebGPU(page, testInfo)

    await gotoModeWithParams(page, 'wheelerDeWitt', 4, {
      wdw_gn_a: '48',
      wdw_gn_p: '12',
      wdw_phi3: '0.65',
      wdw_sl: '1',
      wdw_wl: '1',
      srmt: '1',
    })
    await waitForRendererReady(page)
    await waitForFirstFrame(page)

    const state = await page.evaluate(() => {
      const extStore = window.__EXTENDED_OBJECT_STORE__
      if (!extStore) throw new Error('__EXTENDED_OBJECT_STORE__ missing')
      const wdw = extStore.getState().schroedinger.wheelerDeWitt
      return {
        minisuperspaceDimension: wdw.minisuperspaceDimension,
        gridNa: wdw.gridNa,
        gridNphi: wdw.gridNphi,
        phi3: wdw.phi3SliceNormalized,
        streamlinesEnabled: wdw.streamlinesEnabled,
        srmtEnabled: wdw.srmtEnabled,
        worldlineEnabled: wdw.worldlineEnabled,
      }
    })
    expect(state).toEqual({
      minisuperspaceDimension: 4,
      gridNa: 48,
      gridNphi: 12,
      phi3: 0.65,
      streamlinesEnabled: false,
      srmtEnabled: false,
      worldlineEnabled: false,
    })

    const math = await page.evaluate(async () => {
      const { solveWheelerDeWitt } = await import('/src/lib/physics/wheelerDeWitt/solver/index.ts')
      const { packWdwDensityGrid } = await import(
        '/src/lib/physics/wheelerDeWitt/densityGrid/index.ts'
      )
      const output = solveWheelerDeWitt({
        minisuperspaceDimension: 4,
        boundaryCondition: 'deWitt',
        inflatonMass: 0.15,
        cosmologicalConstant: 0,
        aMin: 0.1,
        aMax: 0.35,
        gridNa: 8,
        gridNphi: 4,
        phiExtent: 1.25,
      })
      const center = packWdwDensityGrid(output, null, undefined, 4, 100, undefined, {
        phi3SliceNormalized: 0.5,
      })
      const edge = packWdwDensityGrid(output, null, undefined, 4, 100, undefined, {
        phi3SliceNormalized: 1,
      })
      let finiteChi = true
      for (let i = 0; i < output.chi.length; i++) {
        if (!Number.isFinite(output.chi[i])) {
          finiteChi = false
          break
        }
      }
      let sliceDiff = false
      for (let i = 0; i < center.density.length; i++) {
        if (center.density[i] !== edge.density[i]) {
          sliceDiff = true
          break
        }
      }
      return {
        gridSize: output.gridSize,
        finiteChi,
        maxDensity: output.maxDensity,
        packedLength: center.density.length,
        sliceDiff,
      }
    })
    expect(math.gridSize).toEqual([8, 4, 4, 4])
    expect(math.finiteChi).toBe(true)
    expect(math.maxDensity).toBeGreaterThan(0)
    expect(math.packedLength).toBe(4 * 4 * 4 * 4)
    expect(math.sliceDiff).toBe(true)

    await expectCanvasNotBlank(page)

    const realErrors = filterBenignErrors(pageErrors)
    expect(
      realErrors,
      `Page should produce no non-benign errors. Collected:\n${realErrors.map((e) => `  - ${e}`).join('\n')}`
    ).toEqual([])
  })
})
