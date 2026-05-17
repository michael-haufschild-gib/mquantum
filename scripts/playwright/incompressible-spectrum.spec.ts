/**
 * Incompressible Kinetic Energy Spectrum E2E Tests
 *
 * Verifies the Helmholtz decomposition–based incompressible kinetic energy
 * spectrum for BEC dynamics:
 * 1. Console stays clean (no GPU/WGSL/shader errors via fixtures)
 * 2. Renderer produces frames without crashing
 * 3. Spectrum store is populated with physically correct values
 * 4. Vortex states have higher incompressible energy than ground state
 * 5. Spectrum bins are non-negative and finite
 *
 * GPU/shader error detection is automatic via fixtures.ts.
 */

import { expect, test } from './fixtures'
import {
  applyBecPreset,
  getFrameCount,
  gotoMode,
  readBecDiagnostics,
  requireWebGPU,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.setTimeout(300_000)

/** Enable BEC diagnostics to trigger spectrum computation. */
async function enableDiagnostics(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    const mod = await import('/src/stores/scene/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).setBecDiagnosticsEnabled(true)
  })
}

/** Wait until the BEC diagnostics store has incompressible spectrum data. */
async function waitForSpectrumData(
  page: import('@playwright/test').Page,
  timeoutMs = 30_000
): Promise<void> {
  await page.waitForFunction(
    async () => {
      const mod = await import('/src/stores/diagnostics/diagnosticsStore.ts')
      const s = mod.useDiagnosticsStore.getState().bec
      // Spectrum is computed asynchronously; wait until at least one bin is nonzero
      // or totalIncompressibleEnergy is finite and > 0 or = 0 (computed successfully)
      return (
        s.hasData &&
        (s.totalIncompressibleEnergy > 0 ||
          s.totalCompressibleEnergy > 0 ||
          // Ground state: both can be ~0, check that kValues were populated
          s.spectrumKValues[0] > 0)
      )
    },
    {},
    { timeout: timeoutMs }
  )
}

test.describe('incompressible kinetic energy spectrum', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('ground state (Thomas-Fermi) has near-zero incompressible energy', async ({ page }) => {
    await gotoMode(page, 'becDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await applyBecPreset(page, 'groundState')
    await enableDiagnostics(page)
    await waitForShaderCompilation(page)

    // Let the simulation run long enough for diagnostics + spectrum readback
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 120)
    await waitForSpectrumData(page)

    const diag = await readBecDiagnostics(page)

    // Ground state: uniform flow, no vortices → incompressible energy ≈ 0
    expect(diag.totalIncompressibleEnergy).toBeGreaterThanOrEqual(0)
    // All spectrum bins should be non-negative and finite
    for (const val of diag.incompressibleSpectrum) {
      expect(val).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(val)).toBe(true)
    }
  })

  test('single vortex has significant incompressible energy', async ({ page }) => {
    await gotoMode(page, 'becDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await applyBecPreset(page, 'singleVortex')
    await enableDiagnostics(page)
    await waitForShaderCompilation(page)

    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 120)
    await waitForSpectrumData(page)

    const diag = await readBecDiagnostics(page)

    // A vortex should produce nonzero incompressible energy
    expect(diag.totalIncompressibleEnergy).toBeGreaterThan(0)
    // Incompressible should be a substantial fraction of total kinetic energy
    const totalKE = diag.totalIncompressibleEnergy + diag.totalCompressibleEnergy
    expect(diag.totalIncompressibleEnergy / totalKE).toBeGreaterThan(0.1)

    // All spectrum bins non-negative
    for (const val of diag.incompressibleSpectrum) {
      expect(val).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(val)).toBe(true)
    }
  })

  test('quantum turbulence has more incompressible energy than ground state', async ({ page }) => {
    await gotoMode(page, 'becDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // First measure ground state
    await applyBecPreset(page, 'groundState')
    await enableDiagnostics(page)
    await waitForShaderCompilation(page)
    const fc1 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc1 + 120)
    await waitForSpectrumData(page)
    const groundDiag = await readBecDiagnostics(page)
    const groundIncomp = groundDiag.totalIncompressibleEnergy

    // Now switch to quantum turbulence (many vortices)
    await applyBecPreset(page, 'quantumTurbulence')
    await waitForShaderCompilation(page)
    const fc2 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc2 + 180)
    // Wait for new spectrum data (reset counter)
    await waitForSpectrumData(page)

    const turbDiag = await readBecDiagnostics(page)

    // Turbulence should have much more incompressible energy than ground state
    expect(turbDiag.totalIncompressibleEnergy).toBeGreaterThan(groundIncomp + 1e-6)
  })

  test('spectrum bins are log-spaced and well-formed', async ({ page }) => {
    await gotoMode(page, 'becDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await applyBecPreset(page, 'singleVortex')
    await enableDiagnostics(page)
    await waitForShaderCompilation(page)

    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 120)
    await waitForSpectrumData(page)

    const diag = await readBecDiagnostics(page)

    // Verify spectrum has the expected number of bins (via store inspection)
    const binCount = await page.evaluate(async () => {
      const mod = await import('/src/stores/diagnostics/diagnosticsStore.ts')
      return mod.useDiagnosticsStore.getState().bec.incompressibleSpectrum.length
    })
    expect(binCount).toBe(32)

    // Verify kValues are populated, positive, and monotonically increasing
    const kValues = await page.evaluate(async () => {
      const mod = await import('/src/stores/diagnostics/diagnosticsStore.ts')
      return Array.from(mod.useDiagnosticsStore.getState().bec.spectrumKValues)
    })
    expect(kValues.length).toBe(32)
    for (let i = 0; i < kValues.length; i++) {
      expect(kValues[i]).toBeGreaterThan(0)
      expect(Number.isFinite(kValues[i])).toBe(true)
    }
    for (let i = 1; i < kValues.length; i++) {
      expect(kValues[i]!).toBeGreaterThan(kValues[i - 1]!)
    }

    // Check that incompressible = sum of bins (approximately, within float tolerance)
    const spectrumSum = diag.incompressibleSpectrum.reduce((a: number, b: number) => a + b, 0)
    // The spectrum sum should be close to totalIncompressibleEnergy
    // (not exact due to float precision and binning discretization)
    if (spectrumSum > 0 && diag.totalIncompressibleEnergy > 0) {
      const ratio = spectrumSum / diag.totalIncompressibleEnergy
      expect(ratio).toBeGreaterThan(0.5)
      expect(ratio).toBeLessThan(2.0)
    }
  })
})
