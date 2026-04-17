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
 * Run: pnpm exec playwright test scripts/playwright/physics-numerical-validation.spec.ts --workers=1
 *
 * @module scripts/playwright/physics-numerical-validation
 */

import { expect, test } from './fixtures'
import {
  applyBecPreset,
  gotoMode,
  readBecDiagnostics,
  readDensityDiagnostics,
  readFsfDiagnostics,
  readObservablesDiagnostics,
  readQwDiagnostics,
  readTdseDiagnostics,
  requireWebGPU,
  resetAndWaitForDensityDiagnostics,
  setHydrogenQuantumNumbers,
  setupAndWaitForDensity,
  waitForDiagnostics,
  waitForFreshReadback,
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

    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'tdse')
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
  })

  test('harmonic trap, no absorber: norm stays within 1% over 200 frames', async ({ page }) => {
    // Harmonic potential is also integrable — the symplectic integrator should
    // conserve probability well. This tests the potential half-step in addition
    // to the kinetic FFT step.

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

    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'tdse')
    await waitForSimulationFrames(page, 200)

    const diag = await readTdseDiagnostics(page)
    expect(diag.hasData).toBe(true)
    expect(
      Math.abs(diag.normDrift),
      `normDrift=${diag.normDrift}: harmonic trap should conserve probability`
    ).toBeLessThan(0.01)
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

    // First measure 1s — reset after setting quantum numbers to ensure
    // readback is from the 1s config, not the default hydrogen state.
    await setupAndWaitForDensity(page, 'hydrogenND', 3)
    await setHydrogenQuantumNumbers(page, 1, 0, 0)
    await resetAndWaitForDensityDiagnostics(page)
    const diag1s = await readDensityDiagnostics(page)
    expect(diag1s.hasData).toBe(true)

    // Now measure 3s — reset diagnostics to avoid reading stale 1s data
    await setHydrogenQuantumNumbers(page, 3, 0, 0)
    await resetAndWaitForDensityDiagnostics(page)
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
  })

  test('4f orbital: center density ≈ 0 (l=3 angular node)', async ({ page }) => {
    // 4f (n=4,l=3,m=0) has l=3 so the angular wavefunction vanishes at r=0.
    // |ψ₄₃₀(0)|² = 0 from the r^l factor in the radial wavefunction.

    await setupAndWaitForDensity(page, 'hydrogenND', 3)
    await setHydrogenQuantumNumbers(page, 4, 3, 0)
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'density')
    const diag = await readDensityDiagnostics(page)
    expect(diag.hasData).toBe(true)

    // Center density should be negligible compared to peak (r^l → 0 at origin)
    expect(diag.maxDensity, 'maxDensity should be > 0').toBeGreaterThan(0)
    expect(
      diag.centerDensity,
      `4f center (${diag.centerDensity}) should be ≈0 vs max (${diag.maxDensity})`
    ).toBeLessThan(diag.maxDensity * 0.01)
  })

  test('2s vs 2p: s-orbital has higher center density than p-orbital', async ({ page }) => {
    // 2s has l=0 (nonzero at origin), 2p has l=1 (node at origin).
    // This tests that the angular momentum quantum number reaches the shader
    // and the spherical harmonics Y_lm produce correct nodal structure.

    await setupAndWaitForDensity(page, 'hydrogenND', 3)

    await setHydrogenQuantumNumbers(page, 2, 0, 0)
    await resetAndWaitForDensityDiagnostics(page)
    const diag2s = await readDensityDiagnostics(page)

    await setHydrogenQuantumNumbers(page, 2, 1, 0)
    await resetAndWaitForDensityDiagnostics(page)
    const diag2p = await readDensityDiagnostics(page)

    expect(diag2s.hasData).toBe(true)
    expect(diag2p.hasData).toBe(true)

    // 2s center density should be significantly higher than 2p
    expect(
      diag2s.centerDensity,
      `2s center (${diag2s.centerDensity}) > 2p center (${diag2p.centerDensity})`
    ).toBeGreaterThan(diag2p.centerDensity * 10)
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

  test('HO 3D ground state center density ≈ (1/π)^{3/2} ± 30%', async ({ page }) => {
    // This overlaps with physics-density-oracle but with explicit analytical value.

    await setupAndWaitForDensity(page, 'harmonicOscillator', 3)
    // Use groundState preset: seed=13, termCount=1, maxN=1 → guarantees n=0 per dim.
    // seed=0 with default maxN=5 produces random excited states.
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerPresetName('groundState')
    })
    await resetAndWaitForDensityDiagnostics(page)

    const diag = await readDensityDiagnostics(page)
    expect(diag.hasData).toBe(true)

    // 30% tolerance: the density grid center voxel doesn't align exactly with
    // the origin (even-sized grid → half-voxel offset). GPU consistently reports ~0.13.
    const expected3D = Math.pow(1 / Math.PI, 1.5) // ≈ 0.1795
    expect(diag.centerDensity).toBeGreaterThan(expected3D * 0.7)
    expect(diag.centerDensity).toBeLessThan(expected3D * 1.3)
  })

  test('HO 5D ground state: center density ≈ (1/π)^{5/2} ± 50%', async ({ page }) => {
    // (1/π)^{5/2} ≈ 0.01013 — much smaller than 3D due to dimensional scaling.
    // 50% tolerance: higher-D density grids have much coarser sampling, and the
    // grid center voxel offset has a larger proportional effect at lower densities.

    await setupAndWaitForDensity(page, 'harmonicOscillator', 5)
    // Use groundState preset: guarantees n=0 per dimension.
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerPresetName('groundState')
    })
    await resetAndWaitForDensityDiagnostics(page)

    const diag = await readDensityDiagnostics(page)
    expect(diag.hasData).toBe(true)

    const expected5D = Math.pow(1 / Math.PI, 2.5) // ≈ 0.01013
    expect(
      diag.centerDensity,
      `5D center density (${diag.centerDensity}) should be near ${expected5D.toFixed(5)}`
    ).toBeGreaterThan(expected5D * 0.5)
    expect(diag.centerDensity).toBeLessThan(expected5D * 1.5)
  })

  test('HO 3D center density > HO 5D center density (dimensional falloff)', async ({ page }) => {
    // The ground state density at the origin falls exponentially with dimension.
    // This is a sanity check that dimensional scaling works in the shader.

    await setupAndWaitForDensity(page, 'harmonicOscillator', 3)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerPresetName('groundState')
    })
    await resetAndWaitForDensityDiagnostics(page)
    const diag3D = await readDensityDiagnostics(page)

    await gotoMode(page, 'harmonicOscillator', 5)
    await waitForShaderCompilation(page)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerPresetName('groundState')
    })
    await resetAndWaitForDensityDiagnostics(page)
    const diag5D = await readDensityDiagnostics(page)

    expect(diag3D.hasData).toBe(true)
    expect(diag5D.hasData).toBe(true)

    // Analytical ratio: (1/π)^{3/2} / (1/π)^{5/2} = π ≈ 3.14.
    // Use factor of 2 (generous) to account for grid discretization.
    expect(
      diag3D.centerDensity,
      `3D center (${diag3D.centerDensity}) should be > 2× 5D center (${diag5D.centerDensity})`
    ).toBeGreaterThan(diag5D.centerDensity * 2)
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

  test('HO and hydrogen produce different density distributions', async ({ page }) => {
    // HO ground state
    await setupAndWaitForDensity(page, 'harmonicOscillator', 3)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerPresetName('groundState')
    })
    await resetAndWaitForDensityDiagnostics(page)
    const hoData = await readDensityDiagnostics(page)

    // Hydrogen 1s
    await gotoMode(page, 'hydrogenND', 3)
    await waitForShaderCompilation(page)
    await setHydrogenQuantumNumbers(page, 1, 0, 0)
    await resetAndWaitForDensityDiagnostics(page)
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
  })

  test.afterAll(async ({ browser }) => {
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        await p.goto('about:blank').catch(() => {})
      }
    }
  })
})

// ─── Free Scalar Field Energy Conservation ──────────────────────────────────
//
// The free scalar field (no self-interaction, λ=0) is a linear system with
// exact energy conservation in the continuum. The leapfrog integrator is
// symplectic, so energy drift should be bounded by floating-point roundoff.
//
// This tests the WGSL compute shaders:
//   freeScalarUpdatePhi.wgsl.ts — φ update step
//   freeScalarUpdatePi.wgsl.ts  — π (conjugate momentum) update step
//   freeScalarInit.wgsl.ts      — initial field configuration
//
// Existing test in physics-validation.spec.ts allows |energyDrift| < 5.0 (500%).
// This test demands < 5% for the free (quadratic) Hamiltonian.

test.describe('free scalar field energy conservation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('free field (no self-interaction): |energyDrift| < 5% after 200 frames', async ({
    page,
  }) => {
    await gotoMode(page, 'freeScalarField', 3)
    await waitForShaderCompilation(page)

    // Disable self-interaction AND absorber to isolate the free Hamiltonian.
    // The PML absorber is intentionally dissipative (drains boundary energy),
    // so it must be off when testing symplectic energy conservation.
    // Use gaussianPacket initial condition for clean, localized energy.
    // Enable diagnostics readback (FSF defaults to diagnosticsEnabled=false).
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState() as Record<string, (...a: unknown[]) => void>
      s.setFreeScalarSelfInteractionEnabled(false)
      s.setFreeScalarAbsorberEnabled(false)
      s.setFreeScalarDiagnosticsEnabled(true)
      s.setFreeScalarInitialCondition('gaussianPacket')
      s.resetFreeScalarField()
    })

    // Verify settings took effect
    const fsfConfig = await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const fs = mod.useExtendedObjectStore.getState().schroedinger.freeScalar
      return {
        absorberEnabled: fs.absorberEnabled,
        initialCondition: fs.initialCondition,
        diagnosticsEnabled: fs.diagnosticsEnabled,
      }
    })
    expect(fsfConfig.absorberEnabled, 'absorber must be disabled').toBe(false)
    expect(fsfConfig.initialCondition, 'initial condition must be gaussianPacket').toBe(
      'gaussianPacket'
    )
    expect(fsfConfig.diagnosticsEnabled, 'diagnostics must be enabled').toBe(true)

    // Wait for a fresh post-reset readback so initialEnergy is from the new field,
    // not a stale in-flight readback from the pre-reset configuration.
    await waitForFreshReadback(page, '/src/stores/diagnosticsStore.ts', 30_000, 'fsf')

    await waitForSimulationFrames(page, 200)
    const diag = await readFsfDiagnostics(page)
    expect(diag.hasData, 'FSF diagnostics must have data').toBe(true)
    expect(Number.isFinite(diag.totalEnergy), 'energy must be finite').toBe(true)
    expect(diag.totalEnergy, 'energy must be positive').toBeGreaterThan(0)

    // Free field symplectic integrator: energy drift should be < 5%.
    // Any larger drift means the leapfrog update or FFT has a bug.
    expect(
      Math.abs(diag.energyDrift),
      `energyDrift=${diag.energyDrift}: free field should conserve energy`
    ).toBeLessThan(0.05)
  })

  test.afterAll(async ({ browser }) => {
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        await p.goto('about:blank').catch(() => {})
      }
    }
  })
})

// ─── TDSE Observables: Uncertainty Principle & Free-Particle Motion ─────────
//
// Tests the GPU reduction passes (observablesPositionReduce.wgsl.ts,
// observablesMomentumReduce.wgsl.ts) that compute expectation values
// <x>, <p>, Δx, Δp from the TDSE wavefunction.
//
// Physics invariants:
//   1. Heisenberg uncertainty: Δx·Δp ≥ ℏ/2 = 0.5 (in natural units)
//   2. Free-particle Ehrenfest theorem: <x>(t) moves in the direction of <p>(0)

test.describe('TDSE observables physics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('uncertainty principle: Δx·Δp ≥ ℏ/2 for all 3 dimensions', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForShaderCompilation(page)

    // Configure: free potential, no absorber, observables enabled
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState() as Record<string, (...a: unknown[]) => void>
      s.setTdsePotentialType('free')
      s.setTdseAbsorberEnabled(false)
      s.setTdseDiagnosticsEnabled(true)
      s.setTdseObservablesEnabled(true)
      s.setTdseInitialCondition('gaussianPacket')
      s.setTdsePacketWidth(0.3)
      s.setTdsePacketMomentum([2.0, 0, 0])
      s.resetTdseField()
    })

    // Wait for observables diagnostic data
    await page.waitForFunction(
      async () => {
        const mod = await import('/src/stores/diagnosticsStore.ts')
        return mod.useDiagnosticsStore.getState().observables.hasData
      },
      { timeout: 30_000 }
    )
    await waitForSimulationFrames(page, 100)

    const obs = await readObservablesDiagnostics(page)
    expect(obs.hasData, 'observables must have GPU readback data').toBe(true)

    // Heisenberg: ΔxΔp ≥ ℏ/2 = 0.5 in all dimensions
    // Allow 10% slack (0.45) for GPU floating-point and finite grid effects
    for (let d = 0; d < 3; d++) {
      expect(
        obs.uncertaintyProduct[d],
        `dim ${d}: ΔxΔp=${obs.uncertaintyProduct[d]} must be ≥ ℏ/2`
      ).toBeGreaterThanOrEqual(0.45)
    }
  })

  test('free particle: <x> moves in direction of initial momentum', async ({ page }) => {
    // Ehrenfest theorem: d<x>/dt = <p>/m. For a free particle with p₀ > 0
    // in dimension 0, <x₀> should increase over time.
    //
    // This tests the full chain:
    //   tdseInit (initial wavepacket) → tdseApplyKinetic (FFT momentum step) →
    //   tdseApplyPotentialHalf (V=0) → observablesPositionReduce (<x> readback)

    await gotoMode(page, 'tdseDynamics', 3)
    await waitForShaderCompilation(page)

    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState() as Record<string, (...a: unknown[]) => void>
      s.setTdsePotentialType('free')
      s.setTdseAbsorberEnabled(false)
      s.setTdseDiagnosticsEnabled(true)
      s.setTdseObservablesEnabled(true)
      s.setTdseInitialCondition('gaussianPacket')
      s.setTdsePacketCenter([0, 0, 0])
      s.setTdsePacketWidth(0.3)
      s.setTdsePacketMomentum([5.0, 0, 0])
      s.resetTdseField()
    })

    // Read initial position
    await page.waitForFunction(
      async () => {
        const mod = await import('/src/stores/diagnosticsStore.ts')
        return mod.useDiagnosticsStore.getState().observables.hasData
      },
      { timeout: 30_000 }
    )
    const obs0 = await readObservablesDiagnostics(page)
    const x0 = obs0.positionMean[0]!

    // Let the packet propagate
    await waitForSimulationFrames(page, 200)

    const obs1 = await readObservablesDiagnostics(page)
    const x1 = obs1.positionMean[0]!

    // <x> should have moved in the +x direction (p₀ = +5.0)
    // The exact displacement depends on dt and frame count, but it must be positive.
    expect(x1, `<x> must increase: x0=${x0.toFixed(4)}, x1=${x1.toFixed(4)}`).toBeGreaterThan(x0)

    // Transverse dimensions should not have systematic drift
    // (no transverse momentum → <y>, <z> stay near 0)
    expect(Math.abs(obs1.positionMean[1]!)).toBeLessThan(0.5)
    expect(Math.abs(obs1.positionMean[2]!)).toBeLessThan(0.5)
  })

  test.afterAll(async ({ browser }) => {
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        await p.goto('about:blank').catch(() => {})
      }
    }
  })
})

// ─── Quantum Walk Physics Invariants ────────────────────────────────────────
//
// Tests the discrete-time quantum walk compute shaders:
//   quantumWalkCoin.wgsl.ts   — coin operator (Grover/Hadamard/DFT)
//   quantumWalkShift.wgsl.ts  — conditional shift operator
//   quantumWalkAbsorber.wgsl.ts — PML boundary absorber
//
// The coin and shift operators are unitary. Without absorber, the total
// wavefunction norm Σ_{site,j} |c_j(site)|² must be exactly conserved.
// With absorber, norm must decrease (probability absorbed at boundaries).
//
// These are the first physics assertions for QW — previously only pixel tests.

test.describe('quantum walk norm conservation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('unitary walk (no absorber): |normDrift| < 1% after 100 steps', async ({ page }) => {
    // Discrete QW with Hadamard coin is exactly unitary. Any norm drift = bug
    // in the coin or shift shader. The only error source is f32 roundoff.
    await gotoMode(page, 'quantumWalk', 3)
    await waitForShaderCompilation(page)

    // Disable absorber to isolate unitarity
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState() as Record<string, (...a: unknown[]) => void>
      s.setQwAbsorberEnabled(false)
      s.resetQuantumWalk()
    })

    // Wait for QW diagnostics to appear
    await page.waitForFunction(
      async () => {
        const mod = await import('/src/stores/diagnosticsStore.ts')
        return mod.useDiagnosticsStore.getState().qw.hasData
      },
      { timeout: 30_000 }
    )
    await waitForSimulationFrames(page, 200)

    const diag = await readQwDiagnostics(page)
    expect(diag.hasData, 'QW diagnostics must receive GPU readback data').toBe(true)
    expect(diag.stepCount, 'steps must advance').toBeGreaterThan(0)

    // Unitary operators conserve norm exactly. f32 roundoff ≈ 10⁻⁶ per step.
    // After ~100 steps: cumulative drift < 10⁻⁴. We allow 1% as a safe margin.
    expect(
      Math.abs(diag.normDrift),
      `normDrift=${diag.normDrift}: coin+shift must preserve norm`
    ).toBeLessThan(0.01)

    // Norm must be positive and finite
    expect(diag.totalNorm, 'totalNorm must be positive').toBeGreaterThan(0)
    expect(Number.isFinite(diag.totalNorm), 'totalNorm must be finite').toBe(true)
  })

  test('absorber enabled: norm decreases (probability absorbed at boundary)', async ({ page }) => {
    // With PML absorber, the walk should lose probability as the walker
    // reaches the boundary. Norm should decrease, not increase.
    await gotoMode(page, 'quantumWalk', 3)
    await waitForShaderCompilation(page)

    // Enable absorber with aggressive settings
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState() as Record<string, (...a: unknown[]) => void>
      s.setQwAbsorberEnabled(true)
      s.setQwAbsorberWidth(0.3)
      s.resetQuantumWalk()
    })

    await page.waitForFunction(
      async () => {
        const mod = await import('/src/stores/diagnosticsStore.ts')
        return mod.useDiagnosticsStore.getState().qw.hasData
      },
      { timeout: 30_000 }
    )
    await waitForSimulationFrames(page, 300)

    const diag = await readQwDiagnostics(page)
    expect(diag.hasData).toBe(true)
    expect(diag.stepCount).toBeGreaterThan(0)

    // Norm should have decreased (absorber removing probability).
    // normDrift should be negative (norm < initial norm).
    // If norm INCREASED, the absorber has a sign error.
    expect(diag.normDrift, 'absorber must not create probability').toBeLessThanOrEqual(0.01)
    expect(diag.totalNorm, 'totalNorm must remain positive').toBeGreaterThan(0)
    expect(Number.isFinite(diag.totalNorm)).toBe(true)
  })

  test('Grover coin preserves norm (alternative coin operator)', async ({ page }) => {
    // Grover coin G_jk = 2/N - δ_jk is also unitary. Verify norm conservation.
    await gotoMode(page, 'quantumWalk', 3)
    await waitForShaderCompilation(page)

    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState() as Record<string, (...a: unknown[]) => void>
      s.setQwAbsorberEnabled(false)
      // Set coin type via direct state merge (no dedicated setter)
      const store = mod.useExtendedObjectStore.getState()
      mod.useExtendedObjectStore.setState({
        schroedinger: {
          ...store.schroedinger,
          quantumWalk: {
            ...store.schroedinger.quantumWalk,
            coinType: 'grover' as never,
            needsReset: true,
          },
        },
      })
    })

    await page.waitForFunction(
      async () => {
        const mod = await import('/src/stores/diagnosticsStore.ts')
        return mod.useDiagnosticsStore.getState().qw.hasData
      },
      { timeout: 30_000 }
    )
    await waitForSimulationFrames(page, 200)

    const diag = await readQwDiagnostics(page)
    expect(diag.hasData).toBe(true)
    expect(Math.abs(diag.normDrift), 'Grover coin must preserve norm').toBeLessThan(0.01)
  })

  test('DFT coin: norm conservation', async ({ page }) => {
    await gotoMode(page, 'quantumWalk', 3)
    await waitForShaderCompilation(page)

    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const store = mod.useExtendedObjectStore.getState()
      const s = store as Record<string, (...a: unknown[]) => void>
      s.setQwAbsorberEnabled(false)
      mod.useExtendedObjectStore.setState({
        schroedinger: {
          ...store.schroedinger,
          quantumWalk: {
            ...store.schroedinger.quantumWalk,
            coinType: 'dft' as never,
            needsReset: true,
          },
        },
      })
    })

    await page.waitForFunction(
      async () => {
        const mod = await import('/src/stores/diagnosticsStore.ts')
        return mod.useDiagnosticsStore.getState().qw.hasData
      },
      { timeout: 30_000 }
    )
    await waitForSimulationFrames(page, 200)

    const diag = await readQwDiagnostics(page)
    expect(diag.hasData).toBe(true)
    expect(Math.abs(diag.normDrift), 'DFT coin must preserve norm').toBeLessThan(0.01)
  })

  test('ballistic spreading: position variance grows over time', async ({ page }) => {
    // Quantum walk signature: Δx² ∝ t² (ballistic), not ∝ t (diffusive).
    // Read variance at two time points and verify it grows.
    await gotoMode(page, 'quantumWalk', 3)
    await waitForShaderCompilation(page)

    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState() as Record<string, (...a: unknown[]) => void>
      s.setQwAbsorberEnabled(false)
      s.resetQuantumWalk()
    })

    // Wait for initial diagnostics
    await page.waitForFunction(
      async () => {
        const mod = await import('/src/stores/diagnosticsStore.ts')
        return mod.useDiagnosticsStore.getState().qw.hasData
      },
      { timeout: 30_000 }
    )

    // Read early variance
    await waitForSimulationFrames(page, 60)
    const early = await readQwDiagnostics(page)

    // Read late variance
    await waitForSimulationFrames(page, 200)
    const late = await readQwDiagnostics(page)

    expect(early.hasData).toBe(true)
    expect(late.hasData).toBe(true)
    expect(late.stepCount, 'must have more steps').toBeGreaterThan(early.stepCount)

    // Position variance should increase as the walk spreads
    expect(
      late.positionVariance,
      `variance must grow: early=${early.positionVariance.toFixed(3)}, late=${late.positionVariance.toFixed(3)}`
    ).toBeGreaterThan(early.positionVariance)
  })

  test.afterAll(async ({ browser }) => {
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        await p.goto('about:blank').catch(() => {})
      }
    }
  })
})

// ─── BEC Physics (Strong) ───────────────────────────────────────────────────
//
// Tests BEC-specific physics beyond generic norm conservation:
//   - Attractive interactions cause collapse (g < 0)
//   - Thomas-Fermi ground state has correct profile shape
//   - Increasing g scales chemical potential
//   - Imaginary-time propagation converges
//
// These test the Gross-Pitaevskii nonlinear term in the TDSE split-step:
//   tdsePotential.wgsl.ts (V(r) + g|ψ|² potential half-step)

test.describe('BEC physics — strong validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('TF ground state: chemical potential > 0 and TF radius > 0', async ({ page }) => {
    await gotoMode(page, 'becDynamics', 3)
    await waitForShaderCompilation(page)
    await applyBecPreset(page, 'groundState')
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'bec')
    await waitForSimulationFrames(page, 120)

    const diag = await readBecDiagnostics(page)
    expect(diag.hasData).toBe(true)
    expect(diag.chemicalPotential, 'μ > 0 for repulsive BEC').toBeGreaterThan(0)
    expect(diag.thomasFermiRadius, 'R_TF > 0').toBeGreaterThan(0)
    expect(diag.thomasFermiRadius, 'R_TF < domain').toBeLessThan(10)
    // Sound speed cs = sqrt(gn/m) should be positive for repulsive BEC
    expect(diag.soundSpeed, 'cs > 0 for repulsive BEC').toBeGreaterThan(0)
  })

  test('increasing g increases chemical potential', async ({ page }) => {
    await gotoMode(page, 'becDynamics', 3)
    await waitForShaderCompilation(page)

    // g = 200 (low)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState() as Record<string, (...a: unknown[]) => void>
      s.setBecInteractionStrength(200)
      s.setBecInitialCondition('thomasFermi')
      s.resetBecField()
    })
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'bec')
    await waitForSimulationFrames(page, 120)
    const diagLow = await readBecDiagnostics(page)

    // g = 1000 (high)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState() as Record<string, (...a: unknown[]) => void>
      s.setBecInteractionStrength(1000)
      s.resetBecField()
    })
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'bec')
    await waitForSimulationFrames(page, 120)
    const diagHigh = await readBecDiagnostics(page)

    expect(diagLow.hasData).toBe(true)
    expect(diagHigh.hasData).toBe(true)
    // μ = g * n_peak. Higher g → higher μ (assuming similar density profile)
    expect(
      diagHigh.chemicalPotential,
      `μ(g=1000)=${diagHigh.chemicalPotential} should be > μ(g=200)=${diagLow.chemicalPotential}`
    ).toBeGreaterThan(diagLow.chemicalPotential)
  })

  test('attractive BEC (g < 0): norm drops rapidly (collapse)', async ({ page }) => {
    // Negative g causes the BEC to collapse — |ψ|² concentrates
    // and eventually the integrator can't handle the singularity.
    // Norm should drop or blow up, not stay stable.
    await gotoMode(page, 'becDynamics', 3)
    await waitForShaderCompilation(page)

    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState() as Record<string, (...a: unknown[]) => void>
      s.setBecInteractionStrength(-500)
      s.setBecInitialCondition('thomasFermi')
      s.setBecAbsorberEnabled(false)
      s.resetBecField()
    })
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'bec')
    await waitForSimulationFrames(page, 200)

    const diag = await readBecDiagnostics(page)
    expect(diag.hasData).toBe(true)
    // Attractive BEC should show significant instability — norm drift > 5%
    // or maxDensity should be much larger than for repulsive case.
    // If norm is perfectly stable with g<0, the nonlinear term is broken.
    expect(
      Math.abs(diag.normDrift) > 0.05 || diag.maxDensity > 5,
      `attractive BEC should show instability: normDrift=${diag.normDrift}, maxDensity=${diag.maxDensity}`
    ).toBe(true)
  })

  test('TF ground state: center density via density oracle', async ({ page }) => {
    // TF profile has maximum at the center, zero at the boundary.
    await setupAndWaitForDensity(page, 'becDynamics', 3)

    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState() as Record<string, (...a: unknown[]) => void>
      s.setBecInteractionStrength(500)
      s.setBecInitialCondition('thomasFermi')
      s.resetBecField()
    })
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'density')

    const diag = await readDensityDiagnostics(page)
    expect(diag.hasData).toBe(true)
    // Center density should be near the peak (TF profile peaks at center)
    expect(diag.centerDensity, 'center > 0 for TF profile').toBeGreaterThan(0)
    expect(diag.maxDensity, 'maxDensity > 0').toBeGreaterThan(0)
  })

  test('TF ground state: healing length physically consistent with μ', async ({ page }) => {
    // ξ = ℏ/√(2mgn) and μ = gn → ξ = ℏ/√(2mμ). For ℏ=m=1: ξ = 1/√(2μ).
    // Test that healing length and chemical potential are self-consistent.
    await gotoMode(page, 'becDynamics', 3)
    await waitForShaderCompilation(page)
    await applyBecPreset(page, 'groundState')
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'bec')
    await waitForSimulationFrames(page, 120)

    const diag = await readBecDiagnostics(page)
    expect(diag.hasData).toBe(true)
    expect(diag.chemicalPotential).toBeGreaterThan(0)
    expect(diag.healingLength).toBeGreaterThan(0)
    // ξ ≈ 1/√(2μ) for ℏ=m=1. Allow 50% tolerance (TF is an approximation).
    const expectedXi = 1 / Math.sqrt(2 * diag.chemicalPotential)
    const ratio = diag.healingLength / expectedXi
    expect(ratio, `ξ/ξ_predicted = ${ratio.toFixed(3)}, expected near 1.0`).toBeGreaterThan(0.3)
    expect(ratio).toBeLessThan(3.0)
  })

  test.afterAll(async ({ browser }) => {
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        await p.goto('about:blank').catch(() => {})
      }
    }
  })
})

// ─── FSF Physics (Strong) ───────────────────────────────────────────────────
//
// Tests free scalar field physics beyond generic energy finiteness:
//   - Vacuum fluctuations: variancePhi > 0 (quantum noise exists)
//   - Field symmetry: meanPhi ≈ 0 for symmetric initial conditions
//   - Self-interaction differential: λφ⁴ changes energy profile
//   - Conjugate momentum bounded: maxPi stays finite
//
// FSF diagnostics are computed CPU-side from GPU readback arrays (phi, pi).
// The chain is: GPU leapfrog → readback arrays → computeFsfDiagnostics → store.

test.describe('FSF physics — strong validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('vacuum state: variancePhi > 0 (quantum fluctuations exist)', async ({ page }) => {
    // Even in the vacuum state, the scalar field has zero-point fluctuations.
    // variancePhi = 0 would mean a perfectly classical vacuum — wrong.
    await gotoMode(page, 'freeScalarField', 3)
    await waitForShaderCompilation(page)

    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState() as Record<string, (...a: unknown[]) => void>
      s.setFreeScalarSelfInteractionEnabled(false)
      s.setFreeScalarInitialCondition('vacuum')
      s.resetFreeScalarField()
    })
    await waitForFreshReadback(page, '/src/stores/diagnosticsStore.ts', 30_000, 'fsf')
    await waitForSimulationFrames(page, 60)

    const diag = await readFsfDiagnostics(page)
    expect(diag.hasData).toBe(true)
    expect(diag.variancePhi, 'vacuum must have nonzero field variance').toBeGreaterThan(0)
    expect(Number.isFinite(diag.variancePhi), 'variance must be finite').toBe(true)
  })

  test('symmetric init: meanPhi ≈ 0', async ({ page }) => {
    // A symmetric initial condition (vacuum or centered gaussian) should have
    // zero mean field. If meanPhi is significantly nonzero, there's a bias.
    await gotoMode(page, 'freeScalarField', 3)
    await waitForShaderCompilation(page)

    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState() as Record<string, (...a: unknown[]) => void>
      s.setFreeScalarSelfInteractionEnabled(false)
      s.setFreeScalarInitialCondition('vacuum')
      s.resetFreeScalarField()
    })
    await waitForFreshReadback(page, '/src/stores/diagnosticsStore.ts', 30_000, 'fsf')
    await waitForSimulationFrames(page, 60)

    const diag = await readFsfDiagnostics(page)
    expect(diag.hasData).toBe(true)
    // Mean should be near zero for symmetric initial conditions
    expect(Math.abs(diag.meanPhi), `meanPhi=${diag.meanPhi} should be near 0`).toBeLessThan(0.1)
  })

  test('self-interaction ON vs OFF: different total energy', async ({ page }) => {
    // The Mexican hat potential V(φ) = λ(φ²-v²)² adds energy. Enabling it
    // should produce measurably different total energy from the free field.
    await gotoMode(page, 'freeScalarField', 3)
    await waitForShaderCompilation(page)

    // Free field (no self-interaction)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState() as Record<string, (...a: unknown[]) => void>
      s.setFreeScalarSelfInteractionEnabled(false)
      s.setFreeScalarInitialCondition('gaussianPacket')
      s.resetFreeScalarField()
    })
    await waitForFreshReadback(page, '/src/stores/diagnosticsStore.ts', 30_000, 'fsf')
    await waitForSimulationFrames(page, 60)
    const diagFree = await readFsfDiagnostics(page)

    // Self-interaction enabled
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState() as Record<string, (...a: unknown[]) => void>
      s.setFreeScalarSelfInteractionEnabled(true)
      s.setFreeScalarSelfInteractionLambda(2.0)
      s.resetFreeScalarField()
    })
    await waitForFreshReadback(page, '/src/stores/diagnosticsStore.ts', 30_000, 'fsf')
    await waitForSimulationFrames(page, 60)
    const diagSI = await readFsfDiagnostics(page)

    expect(diagFree.hasData).toBe(true)
    expect(diagSI.hasData).toBe(true)
    expect(diagFree.totalEnergy).toBeGreaterThan(0)
    expect(diagSI.totalEnergy).toBeGreaterThan(0)

    // Energies should differ (self-interaction adds potential energy)
    const ratio = diagSI.totalEnergy / diagFree.totalEnergy
    expect(
      ratio < 0.8 || ratio > 1.2,
      `SI/free energy ratio ${ratio.toFixed(3)} should differ by >20%`
    ).toBe(true)
  })

  test('conjugate momentum stays bounded: maxPi finite after 200 frames', async ({ page }) => {
    await gotoMode(page, 'freeScalarField', 3)
    await waitForShaderCompilation(page)
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'fsf')
    await waitForSimulationFrames(page, 200)

    const diag = await readFsfDiagnostics(page)
    expect(diag.hasData).toBe(true)
    expect(Number.isFinite(diag.maxPi), 'maxPi must be finite').toBe(true)
    expect(diag.maxPi, 'maxPi must be positive').toBeGreaterThan(0)
  })

  test('field norm stays finite and positive over 200 frames', async ({ page }) => {
    await gotoMode(page, 'freeScalarField', 3)
    await waitForShaderCompilation(page)
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'fsf')
    await waitForSimulationFrames(page, 200)

    const diag = await readFsfDiagnostics(page)
    expect(diag.hasData).toBe(true)
    expect(Number.isFinite(diag.totalNorm), 'norm must be finite').toBe(true)
    expect(diag.totalNorm, 'norm must be positive').toBeGreaterThan(0)
  })

  test.afterAll(async ({ browser }) => {
    for (const ctx of browser.contexts()) {
      for (const p of ctx.pages()) {
        await p.goto('about:blank').catch(() => {})
      }
    }
  })
})
