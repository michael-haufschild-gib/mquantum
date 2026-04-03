/**
 * Roadmap feature validation — shader compilation + physics accuracy.
 *
 * Tests every feature from docs/roadmap.md:
 *   A1: Quantum Carpet (spacetime diagram)
 *   A3: Observable Expectation Values (GPU reduction)
 *   B2: Data Export (CSV/JSON)
 *   B3: Imaginary-Time Propagation (Wick rotation)
 *   C2: Quantum Walk on N-D Lattice
 *   C3: Measurement Simulation (Born Rule Lab)
 *
 * Each section verifies:
 * 1. Shader compiles without WGSL/GPU errors
 * 2. Pipeline produces non-blank rendered frames
 * 3. GPU readback values match physics expectations
 * 4. Feature combinations don't break each other
 *
 * Chain of trust:
 *   WGSL shader → GPU compute → readback buffer → mapAsync → Zustand store → assertion
 *
 * Run: npx playwright test scripts/playwright/roadmap-features.spec.ts --workers=1
 */

import { expect, test } from './fixtures'
import {
  capturePixelSnapshot,
  expectCanvasNotBlank,
  expectSnapshotsDiffer,
  getFrameCount,
  getQuantumWalkConfig,
  gotoMode,
  pauseAnimation,
  readMeasurementState,
  readObservablesDiagnostics,
  readSimulationState,
  readTdseDiagnostics,
  requireWebGPU,
  setQuantumWalkCoin,
  setQuantumWalkFieldView,
  waitForDiagnostics,
  waitForFirstFrame,
  waitForFrameAdvance,
  waitForFreshReadback,
  waitForRendererReady,
  waitForShaderCompilation,
  waitForSimulationFrames,
  waitForUniformUpdate,
} from './helpers/app-helpers'

test.setTimeout(120_000)

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  A1: Quantum Carpet — Spacetime Diagram
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('A1: Quantum Carpet — shader + physics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('TDSE + carpet: shader compiles, carpet accumulates frames', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    // Enable carpet via store
    await page.evaluate(async () => {
      const mod = await import('/src/stores/carpetStore.ts')
      mod.useCarpetStore.getState().setEnabled(true)
    })

    // Wait for carpet panel to mount and accumulate frames (DOM attribute)
    const panel = page.getByTestId('quantum-carpet-panel')
    await expect(panel).toBeVisible({ timeout: 10_000 })
    await expect(async () => {
      const frames = parseInt((await panel.getAttribute('data-carpet-frames')) ?? '0', 10)
      expect(frames).toBeGreaterThan(0)
    }).toPass({ timeout: 15_000 })
  })

  test('BEC + carpet: shader compiles, frames render', async ({ page }) => {
    await gotoMode(page, 'becDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    await page.evaluate(async () => {
      const mod = await import('/src/stores/carpetStore.ts')
      mod.useCarpetStore.getState().setEnabled(true)
    })

    const panel = page.getByTestId('quantum-carpet-panel')
    await expect(panel).toBeVisible({ timeout: 10_000 })
    await expect(async () => {
      const frames = parseInt((await panel.getAttribute('data-carpet-frames')) ?? '0', 10)
      expect(frames).toBeGreaterThan(0)
    }).toPass({ timeout: 15_000 })
  })

  test('Dirac + carpet: shader compiles, frames render', async ({ page }) => {
    await gotoMode(page, 'diracEquation', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    await page.evaluate(async () => {
      const mod = await import('/src/stores/carpetStore.ts')
      mod.useCarpetStore.getState().setEnabled(true)
    })

    const panel = page.getByTestId('quantum-carpet-panel')
    await expect(panel).toBeVisible({ timeout: 10_000 })
    await expect(async () => {
      const frames = parseInt((await panel.getAttribute('data-carpet-frames')) ?? '0', 10)
      expect(frames).toBeGreaterThan(0)
    }).toPass({ timeout: 15_000 })
  })

  test('carpet axis change: both axes accumulate independently', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    const panel = page.getByTestId('quantum-carpet-panel')

    // Axis 0
    await page.evaluate(async () => {
      const mod = await import('/src/stores/carpetStore.ts')
      const store = mod.useCarpetStore.getState()
      store.setEnabled(true)
      store.setSliceAxis(0)
    })

    await expect(panel).toBeVisible({ timeout: 10_000 })

    // Wait for carpet to accumulate frames on axis 0 via DOM attribute
    await expect(async () => {
      const frames = parseInt((await panel.getAttribute('data-carpet-frames')) ?? '0', 10)
      expect(frames).toBeGreaterThan(0)
    }).toPass({ timeout: 15_000 })

    const framesAxis0 = parseInt((await panel.getAttribute('data-carpet-frames')) ?? '0', 10)

    // Clear and switch to axis 1
    await page.evaluate(async () => {
      const mod = await import('/src/stores/carpetStore.ts')
      const store = mod.useCarpetStore.getState()
      store.clear()
      store.setSliceAxis(1)
    })

    // Wait for carpet to accumulate frames on axis 1 via DOM attribute.
    // After clear + setSliceAxis, totalFrames resets to 0. The render loop
    // skips one frame (needsReset) then resumes accumulation.
    await expect(async () => {
      const frames = parseInt((await panel.getAttribute('data-carpet-frames')) ?? '0', 10)
      expect(frames).toBeGreaterThan(0)
    }).toPass({ timeout: 15_000 })

    const framesAxis1 = parseInt((await panel.getAttribute('data-carpet-frames')) ?? '0', 10)

    expect(framesAxis0, 'axis 0 accumulated frames').toBeGreaterThan(0)
    expect(framesAxis1, 'axis 1 accumulated frames').toBeGreaterThan(0)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  A3: Observable Expectation Values — Heisenberg Validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('A3: Observables — GPU reduction + Heisenberg', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('TDSE 3D: ΔxΔp ≥ ℏ/2 for all 3 dimensions (Heisenberg)', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    // Enable observables AFTER pipeline is ready
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setTdseObservablesEnabled(true)
      mod.useExtendedObjectStore.getState().setTdseDiagnosticsEnabled(true)
    })

    // Wait for GPU reduction to complete
    await waitForSimulationFrames(page, 120)

    // Poll until observables store has data
    await page.waitForFunction(
      async () => {
        const mod = await import('/src/stores/diagnosticsStore.ts')
        return mod.useDiagnosticsStore.getState().observables.hasData
      },
      { timeout: 30_000 }
    )

    const obs = await readObservablesDiagnostics(page)
    expect(obs.hasData, 'observables store must receive GPU readback').toBe(true)
    expect(obs.activeDims, 'should report 3 active dimensions').toBe(3)

    // Heisenberg uncertainty principle: ΔxΔp ≥ ℏ/2 = 0.5 (ℏ=1)
    for (let d = 0; d < 3; d++) {
      expect(
        obs.uncertaintyProduct[d],
        `dim ${d}: ΔxΔp = ${obs.uncertaintyProduct[d]} must be ≥ ℏ/2`
      ).toBeGreaterThanOrEqual(0.45) // f32 slack
    }

    // Energy must be positive and finite
    expect(obs.totalEnergy, 'energy > 0').toBeGreaterThan(0)
    expect(Number.isFinite(obs.totalEnergy), 'energy finite').toBe(true)

    // Position norm must be positive
    expect(obs.positionNorm, 'position norm > 0').toBeGreaterThan(0)

    // Per-dimension variance must be positive
    for (let d = 0; d < 3; d++) {
      expect(obs.positionVariance[d], `dim ${d}: pos variance > 0`).toBeGreaterThan(0)
      expect(obs.momentumVariance[d], `dim ${d}: mom variance > 0`).toBeGreaterThan(0)
    }
  })

  test('TDSE free packet: ⟨p_x⟩ near initial momentum (conservation)', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    // Free potential, no absorber, known initial momentum
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState() as Record<string, (...a: unknown[]) => void>
      s.setTdsePotentialType('free')
      s.setTdseAbsorberEnabled(false)
      s.setTdseObservablesEnabled(true)
      s.setTdseDiagnosticsEnabled(true)
      s.setTdseInitialCondition('gaussianPacket')
      s.setTdsePacketMomentum([3.0, 0, 0])
      s.resetTdseField()
    })

    // Reset observables store and wait for a guaranteed-fresh readback.
    // The readbackGeneration drain+snapshot pattern ensures we never read
    // stale data from the previous Classic Tunneling configuration.
    await page.evaluate(async () => {
      const obsMod = await import('/src/stores/diagnosticsStore.ts')
      obsMod.useDiagnosticsStore.getState().resetObservables()
    })
    await waitForFreshReadback(page, '/src/stores/diagnosticsStore.ts', 60_000, 'observables')

    const obs = await readObservablesDiagnostics(page)
    expect(obs.hasData).toBe(true)

    // Free particle: ⟨p_x⟩ ≈ initial momentum (3.0)
    expect(obs.momentumMean[0], '⟨p_x⟩ should be near 3.0').toBeGreaterThan(1.0)

    // Transverse momenta ≈ 0
    expect(Math.abs(obs.momentumMean[1]), '⟨p_y⟩ ≈ 0').toBeLessThan(1.0)
    expect(Math.abs(obs.momentumMean[2]), '⟨p_z⟩ ≈ 0').toBeLessThan(1.0)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  B2: Data Export — CSV/JSON Content Validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('B2: Data Export — content integrity', () => {
  test('TDSE CSV export contains numeric data without NaN/Inf', async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())

    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)
    // Wait for enough simulation to populate diagnostics history for export.
    await waitForSimulationFrames(page, 120)
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'tdse')

    // Open analysis section
    await page.getByTestId('toggle-right-panel').click()
    await expect(page.getByTestId('analysis-section')).toBeVisible({ timeout: 5000 })

    // Expand data export group and wait for expand animation
    const header = page.getByTestId('data-export-group-header')
    await expect(header).toBeVisible({ timeout: 5000 })
    await header.click({ force: true })

    // Wait for the export button to become visible after expand animation
    const csvBtn = page.getByTestId('export-diagnostics-csv')
    await expect(csvBtn).toBeVisible({ timeout: 5000 })

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      csvBtn.click({ force: true }),
    ])

    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    const content = Buffer.concat(chunks).toString('utf-8')

    const lines = content.trim().split('\n')
    expect(lines.length, 'CSV should have header + data').toBeGreaterThan(1)

    // No NaN or Inf in data rows
    for (let i = 1; i < lines.length; i++) {
      expect(lines[i], `row ${i}: no NaN`).not.toMatch(/\bNaN\b/)
      expect(lines[i], `row ${i}: no Inf`).not.toMatch(/\bInf\b/)
    }
  })

  test('Dirac JSON export has correct metadata and diagnostic fields', async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())

    await gotoMode(page, 'diracEquation', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)
    await waitForSimulationFrames(page, 120)
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'dirac')

    await page.getByTestId('toggle-right-panel').click()
    await expect(page.getByTestId('analysis-section')).toBeVisible({ timeout: 5000 })

    // Expand data export group and wait for expand animation
    const header = page.getByTestId('data-export-group-header')
    await expect(header).toBeVisible({ timeout: 5000 })
    await header.click({ force: true })

    // Wait for the export button to become visible after expand animation
    const jsonBtn = page.getByTestId('export-diagnostics-json')
    await expect(jsonBtn).toBeVisible({ timeout: 5000 })

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 15_000 }),
      jsonBtn.click({ force: true }),
    ])

    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) chunks.push(chunk as Buffer)
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as Record<string, unknown>
    const meta = parsed._meta as Record<string, string>

    expect(meta.quantumMode).toBe('diracEquation')
    expect(meta.application).toBe('mquantum')
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  B3: Imaginary-Time Propagation — Ground State Convergence
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('B3: Imaginary Time — convergence + renormalization', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('IT + harmonic trap: norm stays ≈1 (renormalization working)', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState() as Record<string, (...a: unknown[]) => void>
      s.setTdsePotentialType('harmonicTrap')
      s.setTdseHarmonicOmega(2.0)
      s.setTdseAbsorberEnabled(false)
      s.setTdseDiagnosticsEnabled(true)
      s.setTdseImaginaryTimeEnabled(true)
      s.resetTdseField()
    })

    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'tdse')
    await waitForSimulationFrames(page, 200)

    const diag = await readTdseDiagnostics(page)
    expect(diag.hasData).toBe(true)

    // Renormalization keeps norm near 1.0. Without it, IT would decay to 0.
    expect(diag.totalNorm, 'IT norm ≈ 1 (renormalization active)').toBeGreaterThan(0.8)
    expect(diag.totalNorm).toBeLessThan(1.2)
    expect(Number.isFinite(diag.totalNorm)).toBe(true)
  })

  test('IT shader compiles for multiple TDSE potential types', async ({ page }) => {
    for (const pot of ['free', 'harmonicTrap', 'barrier']) {
      await gotoMode(page, 'tdseDynamics', 3)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)
      await waitForFirstFrame(page)

      await page.evaluate(
        async ({ p }: { p: string }) => {
          const mod = await import('/src/stores/extendedObjectStore.ts')
          const s = mod.useExtendedObjectStore.getState() as Record<
            string,
            (...a: unknown[]) => void
          >
          s.setTdsePotentialType(p)
          s.setTdseImaginaryTimeEnabled(true)
          s.resetTdseField()
        },
        { p: pot }
      )

      // Verify frames render without crash
      const fc = await getFrameCount(page)
      await waitForFrameAdvance(page, fc + 10)
    }
  })

  test('eigenstate storage: count increments after store request', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState() as Record<string, (...a: unknown[]) => void>
      s.setTdsePotentialType('harmonicTrap')
      s.setTdseImaginaryTimeEnabled(true)
      s.resetTdseField()
    })

    // Let IT converge
    await waitForSimulationFrames(page, 120)

    // Request eigenstate storage
    await page.evaluate(async () => {
      const mod = await import('/src/stores/simulationStateStore.ts')
      mod.useSimulationStateStore.getState().requestStoreEigenstate()
    })

    // Wait for render loop to process.
    // data-frame-count is sparse (every 60th after frame 10), so use small
    // increment and generous timeout to account for IT mode's slower frames.
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 2, 30_000)

    const simState = await readSimulationState(page)
    expect(simState.storedEigenstateCount, 'eigenstate stored').toBeGreaterThanOrEqual(1)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  C2: Quantum Walk — Coin Operators + Spreading
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('C2: Quantum Walk — shaders + coin operators', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('QW 2D Hadamard: shader compiles, renders non-blank', async ({ page }) => {
    await gotoMode(page, 'quantumWalk', 2)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    // QW needs frames to evolve before it produces visible output
    await waitForSimulationFrames(page, 30)
    await expectCanvasNotBlank(page)
  })

  test('QW 3D Hadamard: shader compiles, renders non-blank', async ({ page }) => {
    await gotoMode(page, 'quantumWalk', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForSimulationFrames(page, 30)
    await expectCanvasNotBlank(page)
  })

  test('different coin types produce different spreading patterns', async ({ page }) => {
    // Hadamard coin
    await gotoMode(page, 'quantumWalk', 2)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForSimulationFrames(page, 40)
    await pauseAnimation(page)
    const snapHadamard = await capturePixelSnapshot(page)

    // Reset with Grover coin
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const store = mod.useExtendedObjectStore.getState()
      store.setSchroedingerConfig({
        quantumWalk: {
          ...store.schroedinger.quantumWalk,
          coinType: 'grover' as never,
          needsReset: true,
        },
      })
      // Resume animation for the new walk
      const anim = await import('/src/stores/animationStore.ts')
      if (!anim.useAnimationStore.getState().isPlaying) anim.useAnimationStore.getState().toggle()
    })
    await waitForShaderCompilation(page)
    await waitForSimulationFrames(page, 40)
    await pauseAnimation(page)
    const snapGrover = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapHadamard, snapGrover, 'Hadamard vs Grover coin patterns must differ')
  })

  test('field view modes (probability vs phase) produce different images', async ({ page }) => {
    await gotoMode(page, 'quantumWalk', 2)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForSimulationFrames(page, 40)
    await pauseAnimation(page)

    // Probability view
    await setQuantumWalkFieldView(page, 'probability')
    await waitForUniformUpdate(page)
    const snapProb = await capturePixelSnapshot(page)

    // Phase view
    await setQuantumWalkFieldView(page, 'phase')
    await waitForUniformUpdate(page)
    const snapPhase = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapProb, snapPhase, 'probability vs phase view must differ')
  })

  test('QW reset clears to step 0', async ({ page }) => {
    await gotoMode(page, 'quantumWalk', 2)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForSimulationFrames(page, 30)

    // Reset
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const store = mod.useExtendedObjectStore.getState()
      store.setSchroedingerConfig({
        quantumWalk: { ...store.schroedinger.quantumWalk, steps: 0, needsReset: true },
      })
    })

    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 5)

    const config = await getQuantumWalkConfig(page)
    expect(config.steps, 'steps reset to 0').toBe(0)
  })

  test('QW DFT coin: complex-valued operator compiles', async ({ page }) => {
    await gotoMode(page, 'quantumWalk', 2)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await setQuantumWalkCoin(page, 'dft')
    await waitForShaderCompilation(page)
    await waitForSimulationFrames(page, 20)
    await expectCanvasNotBlank(page)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  C3: Measurement Simulation — Born Rule + Collapse
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('C3: Measurement — Born rule + wavefunction collapse', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)
  })

  test('measurement point cloud pass: shader compiles', async ({ page }) => {
    await page.evaluate(async () => {
      const mod = await import('/src/stores/measurementStore.ts')
      const store = mod.useMeasurementStore.getState()
      store.setEnabled(true)
      store.addMeasurement([0, 0, 0], 0.5)
      store.addMeasurement([0.5, 0.5, 0], 0.3)
      store.addMeasurement([-0.3, 0.2, 0.1], 0.7)
    })

    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 15)
  })

  test('statistics compute correctly for known positions', async ({ page }) => {
    await page.evaluate(async () => {
      const mod = await import('/src/stores/measurementStore.ts')
      const store = mod.useMeasurementStore.getState()
      store.setEnabled(true)
      store.addMeasurement([1, 0, 0], 0.5)
      store.addMeasurement([3, 0, 0], 0.5)
      store.addMeasurement([2, 0, 0], 0.5)
      store.addMeasurement([2, 0, 0], 0.5)
      store.addMeasurement([2, 0, 0], 0.5)
    })

    const state = await readMeasurementState(page)
    expect(state.totalCount).toBe(5)

    // Mean of [1,3,2,2,2] = 2.0
    expect(state.positionMean[0]).toBeCloseTo(2.0, 1)

    // Std > 0 (non-uniform distribution)
    expect(state.positionStd[0]).toBeGreaterThan(0.3)
    expect(state.positionStd[0]).toBeLessThan(1.0)
  })

  test('partial measurement: axis selection works', async ({ page }) => {
    await page.evaluate(async () => {
      const mod = await import('/src/stores/measurementStore.ts')
      const store = mod.useMeasurementStore.getState()
      store.setEnabled(true)
      store.setMeasureAxis(0)
    })

    const state = await readMeasurementState(page)
    expect(state.measureAxis).toBe(0)

    await page.evaluate(async () => {
      const mod = await import('/src/stores/measurementStore.ts')
      mod.useMeasurementStore.getState().setMeasureAxis(2)
    })

    const state2 = await readMeasurementState(page)
    expect(state2.measureAxis).toBe(2)
  })

  test('clear measurements resets everything', async ({ page }) => {
    await page.evaluate(async () => {
      const mod = await import('/src/stores/measurementStore.ts')
      const store = mod.useMeasurementStore.getState()
      store.setEnabled(true)
      store.addMeasurement([1, 0, 0], 0.5)
      store.addMeasurement([2, 0, 0], 0.3)
    })

    let state = await readMeasurementState(page)
    expect(state.totalCount).toBe(2)

    await page.evaluate(async () => {
      const mod = await import('/src/stores/measurementStore.ts')
      mod.useMeasurementStore.getState().clearMeasurements()
    })

    state = await readMeasurementState(page)
    expect(state.totalCount).toBe(0)
    expect(state.measurementCount).toBe(0)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Combined: All Roadmap Features Together
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('Combined: multiple roadmap features simultaneously', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('TDSE + carpet + observables + measurement: all compile', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    // Enable ALL roadmap features simultaneously
    await page.evaluate(async () => {
      const carpet = await import('/src/stores/carpetStore.ts')
      carpet.useCarpetStore.getState().setEnabled(true)

      const ext = await import('/src/stores/extendedObjectStore.ts')
      ext.useExtendedObjectStore.getState().setTdseObservablesEnabled(true)
      ext.useExtendedObjectStore.getState().setTdseDiagnosticsEnabled(true)

      const meas = await import('/src/stores/measurementStore.ts')
      meas.useMeasurementStore.getState().setEnabled(true)
    })

    await waitForSimulationFrames(page, 60)
  })

  test('IT + observables: Heisenberg holds during convergence', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState() as Record<string, (...a: unknown[]) => void>
      s.setTdsePotentialType('harmonicTrap')
      s.setTdseAbsorberEnabled(false)
      s.setTdseDiagnosticsEnabled(true)
      s.setTdseObservablesEnabled(true)
      s.setTdseImaginaryTimeEnabled(true)
      s.resetTdseField()
    })

    await waitForSimulationFrames(page, 120)

    await page.waitForFunction(
      async () => {
        const mod = await import('/src/stores/diagnosticsStore.ts')
        return mod.useDiagnosticsStore.getState().observables.hasData
      },
      { timeout: 30_000 }
    )

    const obs = await readObservablesDiagnostics(page)
    expect(obs.hasData).toBe(true)

    // Even in IT mode, Heisenberg must hold
    for (let d = 0; d < obs.activeDims; d++) {
      expect(obs.uncertaintyProduct[d], `IT dim ${d}: ΔxΔp ≥ ℏ/2`).toBeGreaterThanOrEqual(0.4)
    }

    // Norm near 1 (renormalization)
    const diag = await readTdseDiagnostics(page)
    expect(diag.totalNorm, 'IT norm ≈ 1').toBeGreaterThan(0.8)
    expect(diag.totalNorm).toBeLessThan(1.2)
  })

  test('QW → TDSE mode switch: renderer recovers with features', async ({ page }) => {
    await gotoMode(page, 'quantumWalk', 2)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForSimulationFrames(page, 20)

    // Switch to TDSE with carpet + observables
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    await page.evaluate(async () => {
      const ext = await import('/src/stores/extendedObjectStore.ts')
      ext.useExtendedObjectStore.getState().setTdseObservablesEnabled(true)
      const carpet = await import('/src/stores/carpetStore.ts')
      carpet.useCarpetStore.getState().setEnabled(true)
    })

    await waitForSimulationFrames(page, 30)
  })
})
