/**
 * Physics numerical validation — quantitative GPU-vs-analytical checks.
 *
 * Each test reads actual GPU-computed scalar observables back from diagnostic
 * stores and compares against known analytical values from quantum mechanics.
 *
 * Chain of trust:
 *   WGSL shader → GPU compute → readback buffer → mapAsync → Zustand store → assertion
 *
 * No TypeScript physics code in the loop — this tests the WGSL implementation directly.
 *
 * Tests are grouped by what physics they validate:
 * - TDSE integrator unitarity (split-step FFT conserves norm?)
 * - Hydrogen orbital nodal structure (Laguerre polynomials correct in WGSL?)
 * - HO dimensional scaling (N-dim Hermite product correct in WGSL?)
 * - Cross-mode density sanity (different physics → different numbers?)
 *
 * Run: npx playwright test scripts/playwright/physics-numerical-validation.spec.ts --workers=1
 *
 * @module scripts/playwright/physics-numerical-validation
 */

import { expect, test } from '@playwright/test'

import {
  collectGpuWarningsAndErrors,
  gotoMode,
  readDensityDiagnostics,
  readTdseDiagnostics,
  requireWebGPU,
  setHydrogenQuantumNumbers,
  setTermCount,
  setupAndWaitForDensity,
  waitForDiagnostics,
  waitForShaderCompilation,
  waitForSimulationFrames,
} from './helpers/app-helpers'

// Force serial execution — GPU tests must not overlap.
test.describe.configure({ mode: 'serial' })
test.setTimeout(120_000)

// ─── TDSE Integrator Unitarity ────────────────────────────────────────────────
//
// The split-step FFT integrator should conserve probability to machine precision
// (up to floating-point roundoff). By using a free potential with NO PML absorber,
// we isolate the integrator's unitarity from boundary absorption effects.
//
// The existing physics-validation.spec.ts tests with PML enabled (2% tolerance),
// which conflates integrator error with physical absorption. This test is tighter.

test.describe('TDSE integrator unitarity', () => {
  test.beforeEach(async ({ page }) => {
    await requireWebGPU(page, test.info())
  })

  test('free potential, no absorber: |normDrift| < 0.5% after 300 frames', async ({ page }) => {
    const gpuErrors = collectGpuWarningsAndErrors(page)

    await gotoMode(page, 'tdseDynamics', 3)
    await waitForShaderCompilation(page)

    // Configure: free potential, no absorber, diagnostics on.
    // This is the purest test of integrator unitarity — no probability should
    // be created or destroyed. Any drift = integrator bug.
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState() as Record<string, (...a: unknown[]) => void>
      s.setTdsePotentialType('free')
      s.setTdseAbsorberEnabled(false)
      s.setTdseDiagnosticsEnabled(true)
      s.setTdseDiagnosticsInterval(5)
      s.setTdseInitialCondition('gaussianPacket')
      s.setTdsePacketCenter([0, 0, 0])
      s.setTdsePacketWidth(0.4)
      s.setTdsePacketMomentum([3.0, 0, 0])
      s.resetTdseField()
    })

    await waitForDiagnostics(page, '/src/stores/tdseDiagnosticsStore.ts')
    await waitForSimulationFrames(page, 300)

    const diag = await readTdseDiagnostics(page)
    expect(diag.hasData, 'diagnostics received').toBe(true)

    // Norm should be conserved to < 0.5%. The split-step FFT integrator is
    // symplectic for the free Hamiltonian, so drift is purely floating-point roundoff.
    // If this fails at > 0.5%, the kinetic energy operator or FFT has a bug.
    expect(
      Math.abs(diag.normDrift),
      `normDrift=${diag.normDrift}: integrator should conserve probability`
    ).toBeLessThan(0.005)

    // Norm must be positive and finite (no NaN/Inf blowup)
    expect(diag.totalNorm, 'totalNorm should be positive').toBeGreaterThan(0)
    expect(Number.isFinite(diag.totalNorm), 'totalNorm must be finite').toBe(true)

    // Simulation time must have advanced (time evolution is happening)
    expect(diag.simTime, 'simTime should advance').toBeGreaterThan(0)

    expect(gpuErrors, 'no GPU errors').toEqual([])
  })

  test('harmonic trap, no absorber: norm stays within 1% over 200 frames', async ({ page }) => {
    // Harmonic potential is also integrable — the symplectic integrator should
    // conserve probability well. This tests the potential half-step in addition
    // to the kinetic FFT step.
    const gpuErrors = collectGpuWarningsAndErrors(page)

    await gotoMode(page, 'tdseDynamics', 3)
    await waitForShaderCompilation(page)

    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState() as Record<string, (...a: unknown[]) => void>
      s.setTdsePotentialType('harmonicTrap')
      s.setTdseHarmonicOmega(2.0)
      s.setTdseAbsorberEnabled(false)
      s.setTdseDiagnosticsEnabled(true)
      s.setTdseDiagnosticsInterval(5)
      s.setTdseInitialCondition('gaussianPacket')
      s.setTdsePacketCenter([0, 0, 0])
      s.setTdsePacketWidth(0.3)
      s.setTdsePacketMomentum([0, 0, 0])
      s.resetTdseField()
    })

    await waitForDiagnostics(page, '/src/stores/tdseDiagnosticsStore.ts')
    await waitForSimulationFrames(page, 200)

    const diag = await readTdseDiagnostics(page)
    expect(diag.hasData).toBe(true)
    expect(
      Math.abs(diag.normDrift),
      `normDrift=${diag.normDrift}: harmonic trap should conserve probability`
    ).toBeLessThan(0.01)
    expect(gpuErrors).toEqual([])
  })
})

// ─── Hydrogen Orbital Nodal Structure ─────────────────────────────────────────
//
// Tests that the WGSL shader correctly computes hydrogen orbital densities
// by checking nodal structure (where |ψ|² = 0) and relative peak heights.
// These properties are determined by the Laguerre polynomials (radial nodes)
// and spherical harmonics (angular nodes) computed in the shader.

test.describe('hydrogen orbital density structure', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('3s orbital: center density > 0 but less than 1s peak', async ({ page }) => {
    // 3s (n=3,l=0,m=0) has l=0 so |ψ(0)|² > 0, but two radial nodes
    // spread the probability outward, making the peak lower than 1s.
    const gpuErrors = collectGpuWarningsAndErrors(page)

    // First measure 1s
    await setupAndWaitForDensity(page, 'hydrogenND', 3)
    await setHydrogenQuantumNumbers(page, 1, 0, 0)
    await waitForDiagnostics(page, '/src/stores/densityDiagnosticsStore.ts')
    const diag1s = await readDensityDiagnostics(page)
    expect(diag1s.hasData).toBe(true)

    // Now measure 3s
    await setHydrogenQuantumNumbers(page, 3, 0, 0)
    await waitForDiagnostics(page, '/src/stores/densityDiagnosticsStore.ts')
    const diag3s = await readDensityDiagnostics(page)
    expect(diag3s.hasData).toBe(true)

    // 3s has center density > 0 (l=0, no angular node at origin)
    expect(diag3s.centerDensity, '3s: center density > 0 (l=0)').toBeGreaterThan(0)

    // 3s max density should be less than 1s max density
    // (probability spread over more space due to higher n)
    expect(
      diag3s.maxDensity,
      `3s max (${diag3s.maxDensity}) should be less than 1s max (${diag1s.maxDensity})`
    ).toBeLessThan(diag1s.maxDensity)

    expect(gpuErrors).toEqual([])
  })

  test('4f orbital: center density ≈ 0 (l=3 angular node)', async ({ page }) => {
    // 4f (n=4,l=3,m=0) has l=3 so the angular wavefunction vanishes at r=0.
    // |ψ₄₃₀(0)|² = 0 from the r^l factor in the radial wavefunction.
    const gpuErrors = collectGpuWarningsAndErrors(page)

    await setupAndWaitForDensity(page, 'hydrogenND', 3)
    await setHydrogenQuantumNumbers(page, 4, 3, 0)
    await waitForDiagnostics(page, '/src/stores/densityDiagnosticsStore.ts')
    const diag = await readDensityDiagnostics(page)
    expect(diag.hasData).toBe(true)

    // Center density should be negligible compared to peak (r^l → 0 at origin)
    expect(diag.maxDensity, 'maxDensity should be > 0').toBeGreaterThan(0)
    expect(
      diag.centerDensity,
      `4f center (${diag.centerDensity}) should be ≈0 vs max (${diag.maxDensity})`
    ).toBeLessThan(diag.maxDensity * 0.01)

    expect(gpuErrors).toEqual([])
  })

  test('2s vs 2p: s-orbital has higher center density than p-orbital', async ({ page }) => {
    // 2s has l=0 (nonzero at origin), 2p has l=1 (node at origin).
    // This tests that the angular momentum quantum number reaches the shader
    // and the spherical harmonics Y_lm produce correct nodal structure.
    const gpuErrors = collectGpuWarningsAndErrors(page)

    await setupAndWaitForDensity(page, 'hydrogenND', 3)

    await setHydrogenQuantumNumbers(page, 2, 0, 0)
    await waitForDiagnostics(page, '/src/stores/densityDiagnosticsStore.ts')
    const diag2s = await readDensityDiagnostics(page)

    await setHydrogenQuantumNumbers(page, 2, 1, 0)
    await waitForDiagnostics(page, '/src/stores/densityDiagnosticsStore.ts')
    const diag2p = await readDensityDiagnostics(page)

    expect(diag2s.hasData).toBe(true)
    expect(diag2p.hasData).toBe(true)

    // 2s center density should be significantly higher than 2p
    expect(
      diag2s.centerDensity,
      `2s center (${diag2s.centerDensity}) > 2p center (${diag2p.centerDensity})`
    ).toBeGreaterThan(diag2p.centerDensity * 10)

    expect(gpuErrors).toEqual([])
  })

  test.afterAll(async ({ browser }) => {
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        await p.goto('about:blank').catch(() => {})
      }
    }
  })
})

// ─── HO Dimensional Scaling ───────────────────────────────────────────────────
//
// The HO ground state density at the origin is |ψ_0(0)|² = (ω/π)^{D/2}.
// This scales exponentially with dimension D. By comparing 3D and 5D,
// we verify the N-dimensional Hermite product shader computes the correct
// dimensional factor.

test.describe('HO dimensional density scaling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('HO 3D ground state center density ≈ (1/π)^{3/2} ± 10%', async ({ page }) => {
    // This overlaps with physics-density-oracle but with explicit analytical value.
    const gpuErrors = collectGpuWarningsAndErrors(page)

    await setupAndWaitForDensity(page, 'harmonicOscillator', 3)
    await setTermCount(page, 1)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerSeed(0)
    })
    await waitForDiagnostics(page, '/src/stores/densityDiagnosticsStore.ts')

    const diag = await readDensityDiagnostics(page)
    expect(diag.hasData).toBe(true)

    const expected3D = Math.pow(1 / Math.PI, 1.5) // ≈ 0.1795
    expect(diag.centerDensity).toBeGreaterThan(expected3D * 0.9)
    expect(diag.centerDensity).toBeLessThan(expected3D * 1.1)
    expect(gpuErrors).toEqual([])
  })

  test('HO 5D ground state: center density ≈ (1/π)^{5/2} ± 15%', async ({ page }) => {
    // (1/π)^{5/2} ≈ 0.01013 — much smaller than 3D due to dimensional scaling.
    // 15% tolerance because higher-D density grids have coarser sampling.
    const gpuErrors = collectGpuWarningsAndErrors(page)

    await setupAndWaitForDensity(page, 'harmonicOscillator', 5)
    await setTermCount(page, 1)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerSeed(0)
    })
    await waitForDiagnostics(page, '/src/stores/densityDiagnosticsStore.ts')

    const diag = await readDensityDiagnostics(page)
    expect(diag.hasData).toBe(true)

    const expected5D = Math.pow(1 / Math.PI, 2.5) // ≈ 0.01013
    expect(
      diag.centerDensity,
      `5D center density (${diag.centerDensity}) should be near ${expected5D.toFixed(5)}`
    ).toBeGreaterThan(expected5D * 0.85)
    expect(diag.centerDensity).toBeLessThan(expected5D * 1.15)
    expect(gpuErrors).toEqual([])
  })

  test('HO 3D center density > HO 5D center density (dimensional falloff)', async ({ page }) => {
    // The ground state density at the origin falls exponentially with dimension.
    // This is a sanity check that dimensional scaling works in the shader.
    const gpuErrors = collectGpuWarningsAndErrors(page)

    await setupAndWaitForDensity(page, 'harmonicOscillator', 3)
    await setTermCount(page, 1)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerSeed(0)
    })
    await waitForDiagnostics(page, '/src/stores/densityDiagnosticsStore.ts')
    const diag3D = await readDensityDiagnostics(page)

    await gotoMode(page, 'harmonicOscillator', 5)
    await waitForShaderCompilation(page)
    await setTermCount(page, 1)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerSeed(0)
    })
    await waitForDiagnostics(page, '/src/stores/densityDiagnosticsStore.ts')
    const diag5D = await readDensityDiagnostics(page)

    expect(diag3D.hasData).toBe(true)
    expect(diag5D.hasData).toBe(true)

    // 3D center density should be ~17x larger than 5D (ratio = π)
    expect(
      diag3D.centerDensity,
      `3D center (${diag3D.centerDensity}) should be >> 5D center (${diag5D.centerDensity})`
    ).toBeGreaterThan(diag5D.centerDensity * 5)

    expect(gpuErrors).toEqual([])
  })

  test.afterAll(async ({ browser }) => {
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        await p.goto('about:blank').catch(() => {})
      }
    }
  })
})

// ─── Cross-Mode Density Sanity ────────────────────────────────────────────────
//
// Different quantum modes implement different physics (different Hamiltonians,
// different wavefunctions). Their density distributions must be measurably different.

test.describe('cross-mode density sanity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('HO 3D and hydrogen 3D have different density profiles', async ({ page }) => {
    const gpuErrors = collectGpuWarningsAndErrors(page)

    // HO ground state
    await setupAndWaitForDensity(page, 'harmonicOscillator', 3)
    await setTermCount(page, 1)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerSeed(0)
    })
    await waitForDiagnostics(page, '/src/stores/densityDiagnosticsStore.ts')
    const hoData = await readDensityDiagnostics(page)

    // Hydrogen 1s
    await gotoMode(page, 'hydrogenND', 3)
    await waitForShaderCompilation(page)
    await setHydrogenQuantumNumbers(page, 1, 0, 0)
    await waitForDiagnostics(page, '/src/stores/densityDiagnosticsStore.ts')
    const hydrogenData = await readDensityDiagnostics(page)

    expect(hoData.hasData).toBe(true)
    expect(hydrogenData.hasData).toBe(true)

    // Both should have non-zero density
    expect(hoData.maxDensity).toBeGreaterThan(0)
    expect(hydrogenData.maxDensity).toBeGreaterThan(0)

    // But they should be measurably different. HO ground state density at origin
    // is (1/π)^{3/2} ≈ 0.18. Hydrogen 1s density at origin is (1/πa₀³) ≈ 0.32/a₀³.
    // The key test: the ratio of maxDensity values should not be ~1.
    const ratio = hoData.maxDensity / hydrogenData.maxDensity
    expect(
      ratio < 0.8 || ratio > 1.2,
      `HO/hydrogen maxDensity ratio ${ratio.toFixed(3)} should differ by >20%`
    ).toBe(true)

    expect(gpuErrors).toEqual([])
  })

  test.afterAll(async ({ browser }) => {
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        await p.goto('about:blank').catch(() => {})
      }
    }
  })
})
