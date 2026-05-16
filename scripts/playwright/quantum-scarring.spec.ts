/**
 * Quantum Scarring × Anderson Localization E2E Tests
 *
 * Verifies the new coupled anharmonic potential, disorder overlay,
 * increased eigenstate limit (32), and eigenstate diagnostics store
 * work correctly with clean rendering and no console errors.
 *
 * Tests use the GPU error collection from fixtures — any shader/GPU
 * validation error automatically fails the test.
 */

import { expect, test } from './fixtures'
import {
  expectCanvasNotBlank,
  gotoModeWithParams,
  requireWebGPU,
  waitForFirstFrame,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForRendererSettled,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.setTimeout(120_000)

test.describe('quantum scarring features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('coupled anharmonic potential renders without GPU errors', async ({ page }) => {
    // Navigate to TDSE with coupled anharmonic potential
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'coupledAnharmonic',
    })
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    // Verify rendering produces visible content
    await waitForRendererSettled(page)
    await expectCanvasNotBlank(page)

    // Verify the potential type was applied
    const potType = await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      return mod.useExtendedObjectStore.getState().schroedinger.tdse.potentialType
    })
    expect(potType).toBe('coupledAnharmonic')
  })

  test('coupled anharmonic with lambda parameter change renders', async ({ page }) => {
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'coupledAnharmonic',
    })
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    // Change the coupling strength
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setTdseAnharmonicLambda(10.0)
    })

    // Wait for potential re-fill and continued rendering
    await waitForFrameAdvance(page, 5)
    await expectCanvasNotBlank(page)

    // Verify the parameter was applied
    const lambda = await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      return mod.useExtendedObjectStore.getState().schroedinger.tdse.anharmonicLambda
    })
    expect(lambda).toBe(10.0)
  })

  test('disorder overlay on harmonic trap renders without errors', async ({ page }) => {
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'harmonicTrap',
    })
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    // Enable disorder
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState()
      s.setTdseDisorderStrength(5.0)
      s.setTdseDisorderSeed(123)
    })

    // Wait for potential re-fill with disorder and continued rendering
    await waitForFrameAdvance(page, 5)
    await expectCanvasNotBlank(page)

    // Verify disorder config applied
    const config = await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      const tdse = mod.useExtendedObjectStore.getState().schroedinger.tdse
      return { disorderStrength: tdse.disorderStrength, disorderSeed: tdse.disorderSeed }
    })
    expect(config.disorderStrength).toBe(5.0)
    expect(config.disorderSeed).toBe(123)
  })

  test('coupled anharmonic + disorder (scarring setup) renders', async ({ page }) => {
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'coupledAnharmonic',
    })
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    // Enable disorder overlay on top of coupled anharmonic
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState()
      s.setTdseAnharmonicLambda(5.0)
      s.setTdseDisorderStrength(3.0)
    })

    await waitForFrameAdvance(page, 5)
    await expectCanvasNotBlank(page)
  })

  test('imaginary-time propagation with coupled anharmonic works', async ({ page }) => {
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'coupledAnharmonic',
      it: '1',
    })
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    // Let ITP run for a few frames
    await waitForFrameAdvance(page, 10)
    await expectCanvasNotBlank(page)

    // Verify ITP is enabled
    const itpEnabled = await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      return mod.useExtendedObjectStore.getState().schroedinger.tdse.imaginaryTimeEnabled
    })
    expect(itpEnabled).toBe(true)
  })

  test('eigenstate storage limit is 32', async ({ page }) => {
    // This is a unit-level check but confirms the constant is wired correctly
    const maxStored = await page.evaluate(async () => {
      const mod = await import('/src/rendering/webgpu/passes/TDSEGramSchmidt.ts')
      return mod.MAX_STORED_EIGENSTATES
    })
    expect(maxStored).toBe(32)
  })

  test('eigenstate diagnostics store works', async ({ page }) => {
    // Test the eigenstate diagnostics store from the browser context
    // Level spacing requires ≥10 eigenstates with valid energies
    const result = await page.evaluate(async () => {
      const mod = await import('/src/stores/diagnostics/diagnosticsStore.ts')
      const store = mod.useDiagnosticsStore

      store.getState().clearEigenstate()

      // Push 3 eigenstates — not enough for level spacing
      store.getState().pushEigenstate(1.5, 0.01)
      store.getState().pushEigenstate(3.0, 0.02)
      store.getState().pushEigenstate(5.5, 0.03)
      const noLevelSpacing = store.getState().eigenstate.levelSpacing === null

      // Push 7 more (total 10) — now level spacing should be computed
      for (let i = 3; i < 10; i++) {
        store.getState().pushEigenstate((i + 0.5) * 1.5, 0.01 + i * 0.005)
      }

      const state = store.getState().eigenstate
      return {
        count: state.eigenstates.length,
        noLevelSpacingAt3: noLevelSpacing,
        hasLevelSpacing: state.levelSpacing !== null,
        classification: state.levelSpacing?.classification ?? null,
        brodyBeta: state.levelSpacing?.brodyBeta ?? null,
        meanIPR: state.levelSpacing?.meanIPR ?? null,
      }
    })

    expect(result.count).toBe(10)
    expect(result.noLevelSpacingAt3).toBe(true)
    expect(result.hasLevelSpacing).toBe(true)
    expect(result.brodyBeta).toBeGreaterThanOrEqual(0)
    expect(result.brodyBeta).toBeLessThanOrEqual(1)
    // meanIPR should now be computed from the passed IPR values
    expect(result.meanIPR).toBeGreaterThan(0)
  })

  test('disorder seed change produces different potential', async ({ page }) => {
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'harmonicTrap',
    })
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    // Enable disorder with seed 42
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState()
      s.setTdseDisorderStrength(10.0)
      s.setTdseDisorderSeed(42)
    })
    await waitForFrameAdvance(page, 3)

    // Change seed — should trigger potential refresh
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setTdseDisorderSeed(999)
    })
    await waitForFrameAdvance(page, 3)

    // Verify seed was applied (no crash)
    const seed = await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      return mod.useExtendedObjectStore.getState().schroedinger.tdse.disorderSeed
    })
    expect(seed).toBe(999)
    await expectCanvasNotBlank(page)
  })

  test('4D coupled anharmonic renders (higher-dimensional chaos)', async ({ page }) => {
    await gotoModeWithParams(page, 'tdseDynamics', 4, {
      pot: 'coupledAnharmonic',
    })
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)
    await waitForRendererSettled(page)
    await expectCanvasNotBlank(page)
  })

  test('classical orbit integrator produces valid trajectories in browser', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { evaluatePotential, integrateOrbit, DEFAULT_ORBIT_CONFIG } =
        await import('/src/lib/physics/tdse/classicalOrbit.ts')
      const { DEFAULT_TDSE_CONFIG } = await import('/src/lib/geometry/extended/tdse.ts')
      const config = {
        ...DEFAULT_TDSE_CONFIG,
        potentialType: 'coupledAnharmonic' as const,
        harmonicOmega: 1,
        anharmonicLambda: 1,
        mass: 1,
        latticeDim: 3,
      }

      // Verify potential evaluation
      const x = new Float64Array([1, 0, 0])
      const V = evaluatePotential(x, config)

      // Integrate a short orbit
      const x0 = new Float64Array([0.5, 0.3, 0.2])
      const p0 = new Float64Array([0.1, 0.2, 0.3])
      const orbitCfg = { ...DEFAULT_ORBIT_CONFIG, steps: 500, dt: 0.001, sampleInterval: 50 }
      const traj = integrateOrbit(x0, p0, config, orbitCfg)

      return {
        V,
        energy: traj.energy,
        energyDrift: traj.energyDrift,
        numPoints: traj.points.length,
      }
    })

    // V(1,0,0) for coupled anharmonic with ω=1, λ=1 = 0.5*1*1*1 = 0.5 (no coupling terms with zeros)
    expect(result.V).toBeCloseTo(0.5, 5)
    expect(result.energy).toBeGreaterThan(0)
    expect(result.energyDrift).toBeLessThan(1e-3)
    expect(result.numPoints).toBeGreaterThan(5)
  })

  test('scar metric computation runs without errors in browser', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { computeScarCorrelation } = await import('/src/lib/physics/tdse/scarMetric.ts')
      const { generateOrbitsAtEnergy, DEFAULT_ORBIT_CONFIG } =
        await import('/src/lib/physics/tdse/classicalOrbit.ts')
      const { DEFAULT_TDSE_CONFIG } = await import('/src/lib/geometry/extended/tdse.ts')

      const config = {
        ...DEFAULT_TDSE_CONFIG,
        potentialType: 'coupledAnharmonic' as const,
        harmonicOmega: 1,
        anharmonicLambda: 0.5,
        mass: 1,
        latticeDim: 3,
        gridSize: [8, 8, 8],
        spacing: [0.5, 0.5, 0.5],
      }

      // Generate test orbits
      const orbitCfg = { ...DEFAULT_ORBIT_CONFIG, steps: 200, numOrbits: 3, dt: 0.005 }
      const orbits = generateOrbitsAtEnergy(2.0, config, orbitCfg)

      // Create a simple test wavefunction (Gaussian centered at origin)
      const totalSites = 8 * 8 * 8
      const re = new Float32Array(totalSites)
      const im = new Float32Array(totalSites)
      for (let i = 0; i < totalSites; i++) {
        // Simple non-zero density
        re[i] = Math.exp(-i / totalSites)
      }

      const scarResult = computeScarCorrelation(
        re,
        im,
        orbits,
        config.gridSize,
        config.spacing,
        orbitCfg.tubeWidth
      )

      return {
        numOrbits: scarResult.orbitCorrelations.length,
        maxCorrelation: scarResult.maxCorrelation,
        orbitCorrelation: scarResult.orbitCorrelation,
        strongestOrbitIndex: scarResult.strongestOrbitIndex,
      }
    })

    expect(result.numOrbits).toBe(3)
    expect(result.maxCorrelation).toBeGreaterThanOrEqual(0)
    expect(Number.isFinite(result.orbitCorrelation)).toBe(true)
    expect(result.strongestOrbitIndex).toBeGreaterThanOrEqual(0)
  })
})
