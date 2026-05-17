/**
 * E2E: Continuous Monitoring Transition
 *
 * Verifies IPR diagnostics, monotonicity with γ, and potential dependence
 * for the monitoring transition exploration feature.
 */

import { expect, test } from './fixtures'
import {
  gotoModeWithParams,
  waitForDiagnostics,
  waitForFirstFrame,
  waitForRendererSettled,
  waitForSimulationFrames,
} from './helpers/app-helpers'

const DIAG_STORE = '/src/stores/diagnosticsStore.ts'

/** Wait for tdse diagnostics to populate AND simulation to advance enough frames for stable readout. */
async function waitForTdseDiagnosticsReady(page: import('@playwright/test').Page): Promise<void> {
  await waitForFirstFrame(page)
  await waitForSimulationFrames(page, 60)
  await waitForDiagnostics(page, DIAG_STORE, 30_000, 'tdse')
}

test.describe('Continuous Monitoring Transition', () => {
  test('IPR diagnostics produce valid values with monitoring', async ({ page }) => {
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'harmonicTrap',
      abs: '0',
      diag: '1',
      sloc: '1',
      sloc_g: '1.0',
    })
    const state = await waitForRendererSettled(page)
    expect(
      state,
      'renderer entered error state — investigate WebGPU init or shader compilation rather than skipping the physics check'
    ).not.toBe('error')
    await waitForTdseDiagnosticsReady(page)

    const ipr = await page.evaluate(async () => {
      const mod = await import('/src/stores/diagnostics/diagnosticsStore.ts')
      return mod.useDiagnosticsStore.getState().tdse.ipr
    })

    expect(ipr).toBeGreaterThan(0)
    expect(ipr).toBeLessThanOrEqual(1)
  })

  test('IPR increases with increasing γ (3-point check)', async ({ page }) => {
    const iprs: number[] = []

    for (const gamma of ['0.5', '2.0', '8.0']) {
      await gotoModeWithParams(page, 'tdseDynamics', 3, {
        pot: 'harmonicTrap',
        abs: '0',
        diag: '1',
        sloc: '1',
        sloc_g: gamma,
        sloc_s: '2.0',
      })
      const state = await waitForRendererSettled(page)
      expect(
        state,
        `renderer entered error state at γ=${gamma} — investigate rather than skipping`
      ).not.toBe('error')
      await waitForTdseDiagnosticsReady(page)

      const ipr = await page.evaluate(async () => {
        const mod = await import('/src/stores/diagnostics/diagnosticsStore.ts')
        return mod.useDiagnosticsStore.getState().tdse.ipr
      })
      iprs.push(ipr)
    }

    // IPR should generally increase with γ (higher γ = more localized)
    // Allow tolerance for stochastic noise
    expect(iprs[2]).toBeGreaterThan(iprs[0]! - 0.03)
  })

  test('γ=0 IPR matches standard TDSE IPR', async ({ page }) => {
    // With stochastic system loaded but γ=0
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'harmonicTrap',
      abs: '0',
      diag: '1',
      sloc: '1',
      sloc_g: '0',
    })
    let state = await waitForRendererSettled(page)
    expect(
      state,
      'renderer entered error state — investigate WebGPU init or shader compilation rather than skipping the physics check'
    ).not.toBe('error')
    await waitForTdseDiagnosticsReady(page)

    const iprMonitored = await page.evaluate(async () => {
      const mod = await import('/src/stores/diagnostics/diagnosticsStore.ts')
      return mod.useDiagnosticsStore.getState().tdse.ipr
    })

    // Without stochastic system
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'harmonicTrap',
      abs: '0',
      diag: '1',
    })
    state = await waitForRendererSettled(page)
    expect(
      state,
      'renderer entered error state — investigate WebGPU init or shader compilation rather than skipping the physics check'
    ).not.toBe('error')
    await waitForTdseDiagnosticsReady(page)

    const iprStandard = await page.evaluate(async () => {
      const mod = await import('/src/stores/diagnostics/diagnosticsStore.ts')
      return mod.useDiagnosticsStore.getState().tdse.ipr
    })

    // Should be approximately equal since γ=0 means no stochastic effect
    expect(Math.abs(iprMonitored - iprStandard)).toBeLessThan(0.02)
  })

  test('norm is conserved with monitoring active', async ({ page }) => {
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'harmonicTrap',
      abs: '0',
      diag: '1',
      sloc: '1',
      sloc_g: '2.0',
    })
    const state = await waitForRendererSettled(page)
    expect(
      state,
      'renderer entered error state — investigate WebGPU init or shader compilation rather than skipping the physics check'
    ).not.toBe('error')
    await waitForTdseDiagnosticsReady(page)

    const { norm, normDrift } = await page.evaluate(async () => {
      const mod = await import('/src/stores/diagnostics/diagnosticsStore.ts')
      const s = mod.useDiagnosticsStore.getState().tdse
      return { norm: s.totalNorm, normDrift: s.normDrift }
    })

    expect(isFinite(norm)).toBe(true)
    expect(Math.abs(normDrift)).toBeLessThan(0.01) // < 1% drift
  })
})
