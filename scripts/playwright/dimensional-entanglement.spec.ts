/**
 * Coordinate Entanglement E2E Test Suite
 *
 * Verifies inter-dimensional entanglement diagnostics through the full GPU pipeline:
 * - Separable potential (λ=0) produces S̄ ≈ 0
 * - Coupled potential (λ>0) produces S̄ > 0 after evolution
 * - Higher coupling strength produces higher entanglement
 * - Per-dimension entropies are consistent with average
 * - Time series produces finite, bounded values
 * - 4D coupled anharmonic produces valid entanglement results
 *
 * GPU/shader error detection is automatic via fixtures.ts.
 */

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  gotoModeWithParams,
  requireWebGPU,
  waitForModeReady,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.setTimeout(300_000)

const ENT_STORE = '/src/stores/diagnostics/coordinateEntanglementStore.ts'

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Navigate to TDSE with coupled anharmonic potential and entanglement enabled. */
async function gotoEntanglement(
  page: Page,
  dim: number,
  lambda: number,
  extraParams: Record<string, string> = {}
): Promise<void> {
  await gotoModeWithParams(page, 'tdseDynamics', dim, {
    pot: 'coupledAnharmonic',
    anh_l: String(lambda),
    diag: '1',
    ent: '1',
    ...extraParams,
  })
}

/** Read the entanglement store state. */
async function readEntanglementStore(page: Page): Promise<{
  currentAverageEntropy: number
  currentNormalizedEntropy: number
  currentEntropies: number[]
  historyCount: number
  enabled: boolean
}> {
  return page.evaluate(async (storePath) => {
    const mod = await import(/* @vite-ignore */ storePath)
    const state = mod.useCoordinateEntanglementStore.getState()
    return {
      currentAverageEntropy: state.currentAverageEntropy,
      currentNormalizedEntropy: state.currentNormalizedEntropy,
      currentEntropies: [...state.currentEntropies],
      historyCount: state.historyCount,
      enabled: state.enabled,
    }
  }, ENT_STORE)
}

/** Wait for entanglement history to have at least `minCount` entries. */
async function waitForEntanglementData(page: Page, minCount: number): Promise<void> {
  await page.waitForFunction(
    async ({ storePath, min }) => {
      const mod = await import(/* @vite-ignore */ storePath)
      return mod.useCoordinateEntanglementStore.getState().historyCount >= min
    },
    { storePath: ENT_STORE, min: minCount },
    { timeout: 60_000 }
  )
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('Coordinate Entanglement GPU Pipeline', () => {
  test.beforeEach(async ({ page }) => {
    await requireWebGPU(page)
  })

  test('separable potential (λ=0) produces S̄ ≈ 0', async ({ page }) => {
    await gotoEntanglement(page, 3, 0)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForModeReady(page, 200)

    // Wait for some entanglement data
    await waitForEntanglementData(page, 5)

    const state = await readEntanglementStore(page)
    expect(state.currentAverageEntropy).toBeLessThan(0.05)
  })

  test('coupled potential (λ=5) produces S̄ > 0 after evolution', async ({ page }) => {
    await gotoEntanglement(page, 3, 5)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForModeReady(page, 300)
    await waitForEntanglementData(page, 10)

    const state = await readEntanglementStore(page)
    expect(state.currentAverageEntropy).toBeGreaterThan(0.01)
  })

  test('entanglement increases with coupling strength', async ({ page }) => {
    // First: weak coupling
    await gotoEntanglement(page, 3, 0.5)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForModeReady(page, 300)
    await waitForEntanglementData(page, 10)
    const stateWeak = await readEntanglementStore(page)

    // Second: strong coupling
    await gotoEntanglement(page, 3, 10)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForModeReady(page, 300)
    await waitForEntanglementData(page, 10)
    const stateStrong = await readEntanglementStore(page)

    expect(stateStrong.currentAverageEntropy).toBeGreaterThan(stateWeak.currentAverageEntropy)
  })

  test('per-dimension entropies are all non-negative', async ({ page }) => {
    await gotoEntanglement(page, 3, 5)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForModeReady(page, 200)
    await waitForEntanglementData(page, 5)

    const state = await readEntanglementStore(page)
    expect(state.currentEntropies.length).toBe(3)
    for (const S of state.currentEntropies) {
      expect(S).toBeGreaterThanOrEqual(-1e-6)
    }
  })

  test('per-dimension entropies sum consistently with average', async ({ page }) => {
    await gotoEntanglement(page, 3, 5)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForModeReady(page, 200)
    await waitForEntanglementData(page, 5)

    const state = await readEntanglementStore(page)
    const mean = state.currentEntropies.reduce((a, b) => a + b, 0) / state.currentEntropies.length
    expect(Math.abs(mean - state.currentAverageEntropy)).toBeLessThan(1e-6)
  })

  test('entanglement time series has correct count', async ({ page }) => {
    await gotoEntanglement(page, 3, 5)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForModeReady(page, 100)
    await waitForEntanglementData(page, 3)

    const state = await readEntanglementStore(page)
    expect(state.historyCount).toBeGreaterThanOrEqual(3)
  })

  test('4D coupled anharmonic produces higher-dimensional entanglement', async ({ page }) => {
    await gotoEntanglement(page, 4, 5)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForModeReady(page, 300)
    await waitForEntanglementData(page, 5)

    const state = await readEntanglementStore(page)
    expect(state.currentEntropies.length).toBe(4)
    expect(state.currentAverageEntropy).toBeGreaterThan(0)
  })

  test('entanglement data is finite and bounded', async ({ page }) => {
    await gotoEntanglement(page, 3, 5)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForModeReady(page, 500)
    await waitForEntanglementData(page, 15)

    const state = await readEntanglementStore(page)
    // All entropies should be finite
    for (const S of state.currentEntropies) {
      expect(Number.isFinite(S)).toBe(true)
    }
    expect(Number.isFinite(state.currentAverageEntropy)).toBe(true)
    // Normalized entropy should be in [0, 1]
    expect(state.currentNormalizedEntropy).toBeGreaterThanOrEqual(-0.01)
    expect(state.currentNormalizedEntropy).toBeLessThanOrEqual(1.01)
  })
})

test.describe('Coordinate Entanglement Sweep', () => {
  test.beforeEach(async ({ page }) => {
    await requireWebGPU(page)
  })

  test('λ=0 sweep point produces S̄_∞ ≈ 0', async ({ page }) => {
    await gotoEntanglement(page, 3, 0)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForModeReady(page, 300)
    await waitForEntanglementData(page, 10)

    const state = await readEntanglementStore(page)
    expect(state.currentNormalizedEntropy).toBeLessThan(0.05)
  })
})
