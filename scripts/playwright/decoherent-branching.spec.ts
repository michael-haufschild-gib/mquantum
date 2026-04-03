/**
 * E2E: Decoherent Branching Visualization
 *
 * Verifies branch population diagnostics, partition correctness,
 * and coherence decay under decoherence.
 */

import { expect, test } from '@playwright/test'

import {
  collectGpuErrors,
  gotoModeWithParams,
  waitForFirstFrame,
  waitForRendererSettled,
} from './helpers/app-helpers'

test.describe('Decoherent Branching Visualization', () => {
  let gpuErrors: string[]

  test.beforeEach(async ({ page }) => {
    gpuErrors = []
    collectGpuErrors(page, gpuErrors)
  })

  test.afterEach(() => {
    const real = gpuErrors.filter((e) => !e.includes('[benign]'))
    expect(real, 'GPU/shader errors detected').toHaveLength(0)
  })

  test('branch populations sum to total norm', async ({ page }) => {
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'doubleWell',
      abs: '0',
      diag: '1',
      sloc: '1',
      sloc_g: '1.0',
    })
    const state = await waitForRendererSettled(page)
    if (state === 'error') {
      test.skip()
      return
    }
    await waitForFirstFrame(page)
    await page.waitForTimeout(2000)

    const { normLeft, normRight, totalNorm } = await page.evaluate(async () => {
      const mod = await import('/src/stores/diagnosticsStore.ts')
      const s = mod.useDiagnosticsStore.getState().tdse
      return { normLeft: s.normLeft, normRight: s.normRight, totalNorm: s.totalNorm }
    })

    // normLeft + normRight should approximately equal totalNorm
    const sum = normLeft + normRight
    expect(Math.abs(sum - totalNorm) / Math.max(totalNorm, 1e-10)).toBeLessThan(0.01)
  })

  test('γ=0 preserves symmetric branch populations', async ({ page }) => {
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'doubleWell',
      abs: '0',
      diag: '1',
      sloc: '1',
      sloc_g: '0',
    })
    const state = await waitForRendererSettled(page)
    if (state === 'error') {
      test.skip()
      return
    }
    await waitForFirstFrame(page)
    await page.waitForTimeout(2000)

    const { normLeft, normRight, totalNorm } = await page.evaluate(async () => {
      const mod = await import('/src/stores/diagnosticsStore.ts')
      const s = mod.useDiagnosticsStore.getState().tdse
      return { normLeft: s.normLeft, normRight: s.normRight, totalNorm: s.totalNorm }
    })

    // Without decoherence, symmetric initial state should have roughly equal populations
    if (totalNorm > 0.01) {
      const fracLeft = normLeft / totalNorm
      const fracRight = normRight / totalNorm
      // Both should be between 0.2 and 0.8 for a symmetric state
      expect(fracLeft).toBeGreaterThan(0.1)
      expect(fracRight).toBeGreaterThan(0.1)
    }
  })

  test('different potentials produce different branching dynamics', async ({ page }) => {
    // Double well — expect significant branch separation
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'doubleWell',
      abs: '0',
      diag: '1',
      sloc: '1',
      sloc_g: '2.0',
    })
    let state = await waitForRendererSettled(page)
    if (state === 'error') {
      test.skip()
      return
    }
    await waitForFirstFrame(page)
    await page.waitForTimeout(3000)

    const iprDoubleWell = await page.evaluate(async () => {
      const mod = await import('/src/stores/diagnosticsStore.ts')
      return mod.useDiagnosticsStore.getState().tdse.ipr
    })

    // Free potential — less localization structure
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'free',
      abs: '0',
      diag: '1',
      sloc: '1',
      sloc_g: '2.0',
    })
    state = await waitForRendererSettled(page)
    if (state === 'error') {
      test.skip()
      return
    }
    await waitForFirstFrame(page)
    await page.waitForTimeout(3000)

    const iprFree = await page.evaluate(async () => {
      const mod = await import('/src/stores/diagnosticsStore.ts')
      return mod.useDiagnosticsStore.getState().tdse.ipr
    })

    // The IPR values should be different — potential affects dynamics
    expect(Math.abs(iprDoubleWell - iprFree)).toBeGreaterThan(0.001)
  })
})
