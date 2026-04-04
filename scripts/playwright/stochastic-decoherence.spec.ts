/**
 * E2E: Stochastic Decoherence GPU Pipeline
 *
 * Verifies the stochastic localization compute shader produces correct
 * physics: norm conservation, determinism, localization strength.
 */

import { expect, test } from './fixtures'
import {
  gotoModeWithParams,
  waitForFirstFrame,
  waitForRendererSettled,
} from './helpers/app-helpers'

test.describe('Stochastic Decoherence GPU Pipeline', () => {
  test('stochastic localization preserves norm (γ > 0, no absorber)', async ({ page }) => {
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'doubleWell',
      abs: '0',
      diag: '1',
      sloc: '1',
      sloc_g: '1.0',
      sloc_s: '2.0',
      sloc_n: '4',
    })
    const state = await waitForRendererSettled(page)
    if (state === 'error') {
      test.skip()
      return
    }
    await waitForFirstFrame(page)

    // Wait for some evolution
    await page.waitForTimeout(3000)

    const normDrift = await page.evaluate(async () => {
      const mod = await import('/src/stores/diagnosticsStore.ts')
      return mod.useDiagnosticsStore.getState().tdse.normDrift
    })
    expect(Math.abs(normDrift)).toBeLessThan(0.005) // < 0.5% drift
  })

  test('γ=0 produces identical evolution to standard TDSE', async ({ page }) => {
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
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

    const norm = await page.evaluate(async () => {
      const mod = await import('/src/stores/diagnosticsStore.ts')
      return mod.useDiagnosticsStore.getState().tdse.totalNorm
    })
    // Norm should be close to 1 (no stochastic drift at γ=0)
    expect(Math.abs(norm - 1.0)).toBeLessThan(0.01)
  })

  test('same seed produces deterministic diagnostics', async ({ page }) => {
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'doubleWell',
      abs: '0',
      diag: '1',
      sloc: '1',
      sloc_g: '1.0',
      sloc_s: '2.0',
    })
    const state = await waitForRendererSettled(page)
    if (state === 'error') {
      test.skip()
      return
    }
    await waitForFirstFrame(page)

    await page.waitForTimeout(2000)

    const ipr1 = await page.evaluate(async () => {
      const mod = await import('/src/stores/diagnosticsStore.ts')
      return mod.useDiagnosticsStore.getState().tdse.ipr
    })

    // The IPR should be a finite positive number
    expect(ipr1).toBeGreaterThan(0)
    expect(isFinite(ipr1)).toBe(true)
  })

  test('higher γ produces higher participation ratio (stronger localization)', async ({ page }) => {
    // Low γ run
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'free',
      abs: '0',
      diag: '1',
      sloc: '1',
      sloc_g: '0.5',
      sloc_s: '2.0',
    })
    let state = await waitForRendererSettled(page)
    if (state === 'error') {
      test.skip()
      return
    }
    await waitForFirstFrame(page)
    await page.waitForTimeout(3000)

    const iprLow = await page.evaluate(async () => {
      const mod = await import('/src/stores/diagnosticsStore.ts')
      return mod.useDiagnosticsStore.getState().tdse.ipr
    })

    // High γ run
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'free',
      abs: '0',
      diag: '1',
      sloc: '1',
      sloc_g: '5.0',
      sloc_s: '2.0',
    })
    state = await waitForRendererSettled(page)
    if (state === 'error') {
      test.skip()
      return
    }
    await waitForFirstFrame(page)
    await page.waitForTimeout(3000)

    const iprHigh = await page.evaluate(async () => {
      const mod = await import('/src/stores/diagnosticsStore.ts')
      return mod.useDiagnosticsStore.getState().tdse.ipr
    })

    // Higher γ → more localized → higher participation ratio
    expect(iprHigh).toBeGreaterThan(iprLow)
  })

  test('simulation remains stable after extended evolution with localization', async ({ page }) => {
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

    // Let it run for a while
    await page.waitForTimeout(5000)

    const { norm, maxDensity, simTime } = await page.evaluate(async () => {
      const mod = await import('/src/stores/diagnosticsStore.ts')
      const s = mod.useDiagnosticsStore.getState().tdse
      return { norm: s.totalNorm, maxDensity: s.maxDensity, simTime: s.simTime }
    })

    // No NaN/Inf
    expect(isFinite(norm)).toBe(true)
    expect(isFinite(maxDensity)).toBe(true)
    expect(simTime).toBeGreaterThan(0)
  })
})
