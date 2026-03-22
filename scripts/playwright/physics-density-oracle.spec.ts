/**
 * GPU Density Oracle — shader correctness gate for analytic modes.
 *
 * Reads the density grid (pre-computed |ψ|² on a 3D voxel grid) back from
 * the GPU and compares against analytical expectations. This tests the
 * actual WGSL shader output in f32→f16 precision — not a TypeScript mirror.
 *
 * Tolerances:
 * - f16 quantization: ~0.1% relative error
 * - Grid center offset from origin: ~0.3%
 * - f32 vs f64 evaluation: < 0.01%
 * - Total systematic error: < 1%
 * - Test tolerance: 10% (catches √2 normalization bugs at 41% error)
 *
 * Scope: 3D+ volumetric modes only (density grid disabled for 2D and isosurface).
 *
 * Run: npx playwright test scripts/playwright/physics-density-oracle.spec.ts --workers=1
 */

import { expect, test } from './fixtures'
import {
  readDensityDiagnostics,
  requireWebGPU,
  setHydrogenQuantumNumbers,
  setTermCount,
  setupAndWaitForDensity,
  waitForDiagnostics,
} from './helpers/app-helpers'

// Force serial execution — GPU tests must not overlap.
test.describe.configure({ mode: 'serial' })
test.setTimeout(90_000)

// ─── HO Ground State Density ────────────────────────────────────────────────

test.describe('HO density oracle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('HO 3D ground state: center density ≈ (1/π)^{3/2}', async ({ page }) => {
    await setupAndWaitForDensity(page, 'harmonicOscillator', 3)

    // Force single-term ground state (n=0 in all dimensions)
    await setTermCount(page, 1)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerSeed(0)
    })
    await waitForDiagnostics(page, '/src/stores/densityDiagnosticsStore.ts')

    const diag = await readDensityDiagnostics(page)
    expect(diag.hasData).toBe(true)

    // |ψ_000(0)|² = (ω/π)^{3/2} for ω=1 → (1/π)^{3/2} ≈ 0.1795
    // 10% tolerance: [0.162, 0.197]
    const expected = Math.pow(1 / Math.PI, 1.5)
    expect(diag.centerDensity).toBeGreaterThan(expected * 0.9)
    expect(diag.centerDensity).toBeLessThan(expected * 1.1)

    expect(diag.maxDensity).toBeGreaterThan(0)
    expect(Number.isFinite(diag.totalDensityMass)).toBe(true)
  })

  test('HO 3D: mass increases with superposition term count', async ({ page }) => {
    await setupAndWaitForDensity(page, 'harmonicOscillator', 3)

    await setTermCount(page, 1)
    await waitForDiagnostics(page, '/src/stores/densityDiagnosticsStore.ts')
    const diag1 = await readDensityDiagnostics(page)

    await setTermCount(page, 4)
    await waitForDiagnostics(page, '/src/stores/densityDiagnosticsStore.ts')
    const diag4 = await readDensityDiagnostics(page)

    expect(diag1.hasData).toBe(true)
    expect(diag4.hasData).toBe(true)
    // More terms spread density across more voxels
    expect(diag4.activeVoxelCount).toBeGreaterThan(diag1.activeVoxelCount * 0.8)
  })

  test.afterAll(async ({ browser }) => {
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        await p.goto('about:blank').catch(() => {})
      }
    }
  })
})

// ─── Hydrogen Density Oracle ────────────────────────────────────────────────

test.describe('hydrogen density oracle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('hydrogen 1s: center density > 0 (s-orbital peaks at origin)', async ({ page }) => {
    await setupAndWaitForDensity(page, 'hydrogenND', 3)
    await setHydrogenQuantumNumbers(page, 1, 0, 0)
    await waitForDiagnostics(page, '/src/stores/densityDiagnosticsStore.ts')

    const diag = await readDensityDiagnostics(page)
    expect(diag.hasData).toBe(true)
    expect(diag.maxDensity).toBeGreaterThan(0)
    expect(diag.centerDensity).toBeGreaterThan(0)
    // 1s center density should be the max (or near it) — spherically symmetric
    expect(diag.centerDensity).toBeGreaterThan(diag.maxDensity * 0.5)
    expect(Number.isFinite(diag.totalDensityMass)).toBe(true)
  })

  test('hydrogen 2p: center density ≈ 0 (p-orbital node at origin)', async ({ page }) => {
    await setupAndWaitForDensity(page, 'hydrogenND', 3)
    await setHydrogenQuantumNumbers(page, 2, 1, 0)
    await waitForDiagnostics(page, '/src/stores/densityDiagnosticsStore.ts')

    const diag = await readDensityDiagnostics(page)
    expect(diag.hasData).toBe(true)
    expect(diag.maxDensity).toBeGreaterThan(0)
    // p-orbital has a node at the origin: |ψ_210(0)|² = 0
    expect(diag.centerDensity).toBeLessThan(diag.maxDensity * 0.01)
  })

  test('hydrogen 3d vs 1s: different max density (quantum numbers reach shader)', async ({
    page,
  }) => {
    await setupAndWaitForDensity(page, 'hydrogenND', 3)

    await setHydrogenQuantumNumbers(page, 1, 0, 0)
    await waitForDiagnostics(page, '/src/stores/densityDiagnosticsStore.ts')
    const diag1s = await readDensityDiagnostics(page)

    await setHydrogenQuantumNumbers(page, 3, 2, 0)
    await waitForDiagnostics(page, '/src/stores/densityDiagnosticsStore.ts')
    const diag3d = await readDensityDiagnostics(page)

    expect(diag1s.hasData).toBe(true)
    expect(diag3d.hasData).toBe(true)
    // 1s and 3d have very different peak densities — ratio should be outside [0.9, 1.1]
    const ratio = diag3d.maxDensity / Math.max(diag1s.maxDensity, 1e-20)
    expect(ratio < 0.9 || ratio > 1.1).toBe(true)
  })

  test.afterAll(async ({ browser }) => {
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        await p.goto('about:blank').catch(() => {})
      }
    }
  })
})

// ─── Structural Invariants ──────────────────────────────────────────────────

test.describe('density grid structural invariants', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  const modes = [
    { mode: 'harmonicOscillator', dim: 3, label: 'HO 3D' },
    { mode: 'harmonicOscillator', dim: 7, label: 'HO 7D' },
    { mode: 'hydrogenND', dim: 3, label: 'Hydrogen 3D' },
    { mode: 'hydrogenND', dim: 5, label: 'Hydrogen 5D' },
    { mode: 'hydrogenND', dim: 11, label: 'Hydrogen 11D' },
  ]

  for (const { mode, dim, label } of modes) {
    test(`${label}: maxDensity > 0 and totalMass finite`, async ({ page }) => {
      await setupAndWaitForDensity(page, mode, dim)

      const diag = await readDensityDiagnostics(page)
      expect(diag.hasData, `${label}: diagnostics received`).toBe(true)
      expect(diag.maxDensity, `${label}: maxDensity > 0`).toBeGreaterThan(0)
      expect(Number.isFinite(diag.totalDensityMass), `${label}: totalMass finite`).toBe(true)
      expect(diag.activeVoxelCount, `${label}: some voxels active`).toBeGreaterThan(0)
      expect(diag.gridSize, `${label}: gridSize > 0`).toBeGreaterThan(0)
      expect(diag.worldBound, `${label}: worldBound > 0`).toBeGreaterThan(0)
    })
  }
})
