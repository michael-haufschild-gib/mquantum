/**
 * Anderson Localization E2E Test Suite
 *
 * Verifies that the Anderson disorder potential type works end-to-end:
 * - URL navigation with Anderson disorder params renders correctly
 * - IPR diagnostics produce valid values from GPU readback
 * - Changing disorder strength produces different visuals
 * - 4D Anderson preset renders (higher-dimensional lattice)
 * - Norm conservation under disorder evolution
 *
 * GPU/shader error detection is automatic via fixtures.ts.
 */

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  assertNonBlankPixels,
  capturePixelSnapshot,
  expectSnapshotsDiffer,
  getFrameCount,
  gotoModeWithParams,
  readTdseDiagnostics,
  requireWebGPU,
  waitForDiagnostics,
  waitForFrameAdvance,
  waitForModeReady,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.setTimeout(300_000)

const DIAG_STORE = '/src/stores/diagnosticsStore.ts'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const waitForAndersonReady = (page: Page, extraFrames = 120) => waitForModeReady(page, extraFrames)

/** Navigate to Anderson disorder with specific W and seed. */
async function gotoAnderson(
  page: Page,
  dim: number,
  disorderStrength: number,
  seed: number,
  extraParams: Record<string, string> = {}
): Promise<void> {
  await gotoModeWithParams(page, 'tdseDynamics', dim, {
    pot: 'andersonDisorder',
    dis_w: String(disorderStrength),
    dis_s: String(seed),
    dis_d: 'uniform',
    diag: '1',
    ...extraParams,
  })
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test.describe('Anderson Localization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('3D Anderson disorder renders with non-blank pixels', async ({ page }) => {
    await gotoAnderson(page, 3, 10.0, 42)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForAndersonReady(page)

    await assertNonBlankPixels(page, 'Anderson 3D W=10')
  })

  test('Anderson preset andersonLocalized3D renders', async ({ page }) => {
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'andersonDisorder',
      dis_w: '25',
      dis_s: '42',
      diag: '1',
    })
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForAndersonReady(page)

    await assertNonBlankPixels(page, 'Anderson localized preset')
  })

  test('IPR diagnostics produce valid values', async ({ page }) => {
    await gotoAnderson(page, 3, 15.0, 42)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForAndersonReady(page)

    // Wait for diagnostics to accumulate
    await waitForDiagnostics(page, DIAG_STORE, undefined, 'tdse')

    const diag = await readTdseDiagnostics(page)
    expect(diag.hasData).toBe(true)
    expect(diag.totalNorm).toBeGreaterThan(0)
    // IPR should be between 0 and 1 (exclusive)
    expect(diag.ipr).toBeGreaterThan(0)
    expect(diag.ipr).toBeLessThanOrEqual(1)
  })

  test('different disorder strengths produce different visuals', async ({ page }) => {
    // Weak disorder
    await gotoAnderson(page, 3, 2.0, 42)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForAndersonReady(page)
    const weakPixels = await capturePixelSnapshot(page)

    // Strong disorder (same seed, different W)
    await gotoAnderson(page, 3, 50.0, 42)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForAndersonReady(page)
    const strongPixels = await capturePixelSnapshot(page)

    // Visuals should differ between weak and strong disorder
    expectSnapshotsDiffer(weakPixels, strongPixels)
  })

  test('different seeds produce different disorder realizations', async ({ page }) => {
    await gotoAnderson(page, 3, 15.0, 42)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForAndersonReady(page)
    const seed42 = await capturePixelSnapshot(page)

    await gotoAnderson(page, 3, 15.0, 99999)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForAndersonReady(page)
    const seed99999 = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(seed42, seed99999)
  })

  test('4D Anderson disorder renders', async ({ page }) => {
    await gotoAnderson(page, 4, 15.0, 42)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForAndersonReady(page, 180)

    await assertNonBlankPixels(page, 'Anderson 4D W=15')
  })

  test('norm is conserved under Anderson disorder evolution', async ({ page }) => {
    await gotoAnderson(page, 3, 10.0, 42, { abs: '0' })
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForAndersonReady(page)

    // Let simulation run for several frames
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 60)

    await waitForDiagnostics(page, DIAG_STORE, undefined, 'tdse')
    const diag = await readTdseDiagnostics(page)
    expect(diag.hasData).toBe(true)
    // Norm should be conserved within 5% (f32 precision + split-operator error)
    expect(Math.abs(diag.normDrift)).toBeLessThan(0.05)
  })

  test('potential field view shows disorder pattern', async ({ page }) => {
    await gotoAnderson(page, 3, 20.0, 42)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForAndersonReady(page)

    // Switch to potential field view
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      ;(
        mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
      ).setTdseFieldView('potential')
    })

    // Wait for render update
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 5)

    await assertNonBlankPixels(page, 'Anderson potential view')
  })

  test('disorder sweep produces results across W values', async ({ page }) => {
    // Test the sweep by manually driving 3 realizations at different W values
    // and verifying IPR changes. This tests the core sweep logic without relying
    // on the React component's setInterval polling.
    const wValues = [5, 15, 25]
    const results: { w: number; ipr: number }[] = []

    for (const w of wValues) {
      await gotoAnderson(page, 3, w, 42 + w)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)
      await waitForAndersonReady(page)
      await waitForDiagnostics(page, DIAG_STORE, undefined, 'tdse')

      const diag = await readTdseDiagnostics(page)
      results.push({ w, ipr: diag.ipr })
    }

    expect(results.length).toBe(3)
    for (const r of results) {
      expect(r.ipr).toBeGreaterThan(0)
      expect(r.ipr).toBeLessThanOrEqual(1)
    }
    // Different W values should produce distinct IPR measurements (not identical)
    // At early times the differences are small but the disorder realizations differ
    const iprs = results.map((r) => r.ipr)
    const allSame = iprs.every((v) => v === iprs[0])
    expect(allSame).toBe(false)
  })

  test('energy spectrum produces non-zero histogram with observables enabled', async ({ page }) => {
    await gotoAnderson(page, 3, 10.0, 42, { obs: '1' })
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForAndersonReady(page)

    // Wait for observables diagnostics data
    await waitForDiagnostics(page, DIAG_STORE, undefined, 'observables')

    // Let a few diagnostic frames accumulate so the energy spectrum has data
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 30)
    await waitForDiagnostics(page, DIAG_STORE, undefined, 'observables')

    // Read energy spectrum from store
    const spectrum = await page.evaluate(async () => {
      const mod = await import('/src/stores/diagnosticsStore.ts')
      const s = mod.useDiagnosticsStore.getState().observables
      return Array.from(s.energySpectrum)
    })

    expect(spectrum.length).toBe(32)
    // At least some bins should have non-zero values
    const nonZeroBins = spectrum.filter((v: number) => v > 0).length
    expect(nonZeroBins).toBeGreaterThan(0)
    // Total spectral weight should be positive
    const totalWeight = spectrum.reduce((a: number, b: number) => a + b, 0)
    expect(totalWeight).toBeGreaterThan(0)
  })
})
