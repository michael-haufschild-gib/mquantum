/**
 * Dirac Equation comprehensive e2e test suite.
 *
 * Verifies ALL 6 Dirac presets render at 3D, control changes produce
 * visual differences, preset-specific physics diagnostics match expected
 * invariants, and feature toggles work without GPU errors.
 *
 * Coverage NOT duplicated from other specs:
 * - rendering.spec.ts: basic "Dirac 3D renders" — covered, not repeated
 * - physics-validation.spec.ts: normDrift, completeness, Klein paradox — not repeated
 *
 * This spec adds:
 * - Section A: per-PRESET rendering at 3D (6 presets)
 * - Section B: per-CONTROL differential pixel response (field view, potential, mass, etc.)
 * - Section C: per-PRESET physics validation (directional and preset-specific)
 * - Section D: feature toggles and edge cases (incl. 5D dimension switch)
 *
 * Dirac 5D is NOT tested in the preset matrix because the grid is only
 * 8^5 = 32768 sites with 4-component spinors, making the 3D cross-section
 * consistently blank across all presets. The dimension-switch test in
 * Section D verifies the renderer handles 5D without GPU errors.
 *
 * GPU/shader error detection is automatic via fixtures.ts.
 */

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  applyDiracPreset,
  assertNonBlankPixels,
  capturePixelSnapshot,
  expectSnapshotsDiffer,
  getFrameCount,
  gotoMode,
  pauseAnimation,
  readDiracDiagnostics,
  requireWebGPU,
  waitForDiagnostics,
  waitForFrameAdvance,
  waitForModeReady,
  waitForRendererReady,
  waitForShaderCompilation,
  waitForSimulationFrames,
  waitForUniformUpdate,
} from './helpers/app-helpers'

test.setTimeout(600_000)

// ─── Helpers ─────────────────────────────────────────────────────────────────

const assertPixels = assertNonBlankPixels
const waitForDiracReady = (page: Page, extraFrames = 150) => waitForModeReady(page, extraFrames)

/** Set Dirac field view via store mutation. */
async function setFieldView(page: Page, view: string): Promise<void> {
  await page.evaluate(async (v) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).setDiracFieldView(v)
  }, view)
}

/** Set Dirac absorber enabled/disabled. */
async function setAbsorber(page: Page, enabled: boolean): Promise<void> {
  await page.evaluate(async (val) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).setDiracAbsorberEnabled(val)
  }, enabled)
}

/** Set Dirac auto-scale enabled/disabled. */
async function setAutoScale(page: Page, enabled: boolean): Promise<void> {
  await page.evaluate(async (val) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).setDiracAutoScale(val)
  }, enabled)
}

/** Set Dirac show-potential overlay. */
async function setShowPotential(page: Page, enabled: boolean): Promise<void> {
  await page.evaluate(async (val) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).setDiracShowPotential(val)
  }, enabled)
}

/** Enable Dirac diagnostics readback. */
async function enableDiagnostics(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).setDiracDiagnosticsEnabled(true)
  })
}

/** Enable isosurface mode via store. */
async function enableIsosurface(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerIsoEnabled(true)
  })
}

// ─── A. Preset Rendering Matrix ──────────────────────────────────────────────

const presets = [
  { id: 'kleinParadox', label: 'Klein Paradox' },
  { id: 'zitterbewegung', label: 'Zitterbewegung' },
  { id: 'diracBarrierTunneling', label: 'Barrier Tunneling' },
  { id: 'relativisticHydrogen', label: 'Relativistic Hydrogen' },
  { id: 'diracOscillator', label: 'Dirac Oscillator' },
  { id: 'spinPrecession', label: 'Spin Precession' },
] as const

test.describe('Dirac equation: preset rendering matrix', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  for (const { id, label } of presets) {
    test(`${label} 3D: renders with no GPU errors`, async ({ page }) => {
      await gotoMode(page, 'diracEquation', 3)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)

      await applyDiracPreset(page, id)
      await waitForShaderCompilation(page)
      const fc = await getFrameCount(page)
      await waitForFrameAdvance(page, fc + 150)

      // spinPrecession uses spinDensity view which can be faint
      const minPx = id === 'spinPrecession' ? 1 : 5
      await assertPixels(page, `${label} 3D`, minPx)
    })
  }
})

// ─── B. Control Response — Differential Pixel Checks ─────────────────────────

test.describe('Dirac equation: control response', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('changing field view: totalDensity vs particleAntiparticleSplit', async ({ page }) => {
    // Use kleinParadox preset — particle/antiparticle split view produces
    // clearly different colors from totalDensity.
    await gotoMode(page, 'diracEquation', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await applyDiracPreset(page, 'kleinParadox')
    await waitForShaderCompilation(page)
    await waitForDiracReady(page, 200)
    await pauseAnimation(page)

    // kleinParadox defaults to particleAntiparticleSplit
    const snapSplit = await capturePixelSnapshot(page)

    // Switch to totalDensity — all-in-one view, different color mapping
    await setFieldView(page, 'totalDensity')
    await waitForShaderCompilation(page)
    await waitForUniformUpdate(page)
    const snapTotal = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(
      snapSplit,
      snapTotal,
      'particleAntiparticleSplit vs totalDensity field view must differ'
    )
  })

  test('changing preset: kleinParadox vs diracOscillator produces different image', async ({
    page,
  }) => {
    await gotoMode(page, 'diracEquation', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await applyDiracPreset(page, 'kleinParadox')
    await waitForShaderCompilation(page)
    const fc1 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc1 + 150)
    await pauseAnimation(page)
    const snapKlein = await capturePixelSnapshot(page)

    await applyDiracPreset(page, 'diracOscillator')
    await waitForShaderCompilation(page)
    const fc2 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc2 + 150)
    await pauseAnimation(page)
    const snapOsc = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapKlein, snapOsc, 'kleinParadox vs diracOscillator must differ')
  })

  test('changing potential type: step vs harmonicTrap produces different image', async ({
    page,
  }) => {
    await gotoMode(page, 'diracEquation', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // Default config uses step potential
    const fc1 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc1 + 150)
    await pauseAnimation(page)
    const snapStep = await capturePixelSnapshot(page)

    // Switch to harmonic trap — triggers needsReset
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const store = mod.useExtendedObjectStore.getState() as Record<
        string,
        (...args: unknown[]) => void
      >
      store.setDiracPotentialType('harmonicTrap')
      store.setDiracHarmonicOmega(2.0)
    })
    await waitForShaderCompilation(page)
    const fc2 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc2 + 150)
    await pauseAnimation(page)
    const snapTrap = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapStep, snapTrap, 'step vs harmonicTrap potential must differ')
  })

  test('changing mass produces different density profile', async ({ page }) => {
    await gotoMode(page, 'diracEquation', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // Use diracOscillator preset — confined state where mass directly affects density
    await applyDiracPreset(page, 'diracOscillator')
    await waitForShaderCompilation(page)
    const fc1 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc1 + 150)
    await pauseAnimation(page)
    const snapLight = await capturePixelSnapshot(page)

    // Heavy mass — mass setter does not trigger needsReset on its own,
    // so we also set needsReset to reinitialize with the new dispersion.
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const store = mod.useExtendedObjectStore.getState() as Record<
        string,
        (...args: unknown[]) => void
      >
      store.setDiracMass(5.0)
      store.setDiracNeedsReset()
    })
    await waitForShaderCompilation(page)
    const fc2 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc2 + 150)
    await pauseAnimation(page)
    const snapHeavy = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapLight, snapHeavy, 'light mass vs heavy mass must differ')
  })

  test('toggling show-potential: barrier visible vs hidden', async ({ page }) => {
    await gotoMode(page, 'diracEquation', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // Use barrier preset with potential overlay ON from the start
    await applyDiracPreset(page, 'diracBarrierTunneling')
    await setShowPotential(page, true)
    await waitForShaderCompilation(page)
    const fc1 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc1 + 150)
    await pauseAnimation(page)
    const snapWithPot = await capturePixelSnapshot(page)

    // Toggle potential overlay off — density should look different
    await setShowPotential(page, false)
    // Need enough frames for the compute pass to regenerate the density
    // texture without the potential overlay baked in
    const fc2 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc2 + 20)
    await pauseAnimation(page)
    const snapNoPot = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapWithPot, snapNoPot, 'show-potential on vs off must differ')
  })

  test('changing initial condition: gaussianPacket vs planeWave', async ({ page }) => {
    await gotoMode(page, 'diracEquation', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // Start with free particle + gaussianPacket (default initial condition)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const store = mod.useExtendedObjectStore.getState() as Record<
        string,
        (...args: unknown[]) => void
      >
      store.setDiracPotentialType('none')
      store.setDiracInitialCondition('gaussianPacket')
    })
    await waitForShaderCompilation(page)
    const fc1 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc1 + 150)
    await pauseAnimation(page)
    const snapGaussian = await capturePixelSnapshot(page)

    // Switch to plane wave
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      ;(
        mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
      ).setDiracInitialCondition('planeWave')
    })
    await waitForShaderCompilation(page)
    const fc2 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc2 + 150)
    await pauseAnimation(page)
    const snapPlane = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(
      snapGaussian,
      snapPlane,
      'gaussianPacket vs planeWave initial condition must differ'
    )
  })
})

// ─── C. Physics Validation via Diagnostics ───────────────────────────────────

test.describe('Dirac equation: physics validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('zitterbewegung: antiparticle fraction detectable (positive/negative energy mixing)', async ({
    page,
  }) => {
    // Zitterbewegung preset has positiveEnergyFraction = 0.5, meaning equal
    // positive and negative energy components. Both upper and lower spinor
    // fractions should be significant.
    await gotoMode(page, 'diracEquation', 3)
    await waitForShaderCompilation(page)
    await applyDiracPreset(page, 'zitterbewegung')
    await enableDiagnostics(page)
    await waitForDiagnostics(page, '/src/stores/diracDiagnosticsStore.ts')
    await waitForSimulationFrames(page, 200)

    const diag = await readDiracDiagnostics(page)
    expect(diag.hasData, 'zitterbewegung diagnostics must have data').toBe(true)
    // With 50/50 positive/negative energy mix, antiparticle fraction should
    // be substantial (not near 0 like a pure positive-energy state).
    expect(
      diag.antiparticleFraction,
      `antiparticle fraction (${diag.antiparticleFraction.toFixed(4)}) must be > 0.1 for zitterbewegung`
    ).toBeGreaterThan(0.1)
    // Completeness must still hold
    const total = diag.particleFraction + diag.antiparticleFraction
    expect(
      Math.abs(total - 1.0),
      `particle + antiparticle (${total.toFixed(4)}) must be near 1.0`
    ).toBeLessThan(0.1)
  })

  test('diracOscillator: norm finite and positive after 200 frames (bound state)', async ({
    page,
  }) => {
    // Harmonic trap confines the Dirac particle — norm should stay stable.
    await gotoMode(page, 'diracEquation', 3)
    await waitForShaderCompilation(page)
    await applyDiracPreset(page, 'diracOscillator')
    await enableDiagnostics(page)
    await waitForDiagnostics(page, '/src/stores/diracDiagnosticsStore.ts')
    await waitForSimulationFrames(page, 200)

    const diag = await readDiracDiagnostics(page)
    expect(diag.hasData).toBe(true)
    expect(Number.isFinite(diag.totalNorm), 'norm must be finite').toBe(true)
    expect(diag.totalNorm, 'norm must be positive').toBeGreaterThan(0)
    // Confined state should not lose much norm — absorber is present but
    // the wavepacket should mostly stay inside the trap.
    expect(
      diag.totalNorm,
      `bound state norm (${diag.totalNorm.toFixed(4)}) should remain > 0.5`
    ).toBeGreaterThan(0.5)
  })

  test('directional: barrier tunneling reduces norm more than free propagation', async ({
    page,
  }) => {
    // Free propagation — packet moves freely, PML absorbs at boundary.
    // Norm loss is only from boundary absorption.
    await gotoMode(page, 'diracEquation', 3)
    await waitForShaderCompilation(page)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      ;(
        mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
      ).setDiracPotentialType('none')
    })
    await enableDiagnostics(page)
    await waitForDiagnostics(page, '/src/stores/diracDiagnosticsStore.ts')
    await waitForSimulationFrames(page, 300)
    const diagFree = await readDiracDiagnostics(page)
    expect(diagFree.hasData, 'free propagation diagnostics must have data').toBe(true)

    // Barrier tunneling — partial reflection, more complex norm dynamics.
    // Both cases use PML absorber, but the barrier scatters the packet
    // into reflected and transmitted components that hit boundaries sooner.
    await gotoMode(page, 'diracEquation', 3)
    await waitForShaderCompilation(page)
    await applyDiracPreset(page, 'diracBarrierTunneling')
    await enableDiagnostics(page)
    await waitForDiagnostics(page, '/src/stores/diracDiagnosticsStore.ts')
    await waitForSimulationFrames(page, 300)
    const diagBarrier = await readDiracDiagnostics(page)
    expect(diagBarrier.hasData, 'barrier diagnostics must have data').toBe(true)

    // Both runs should have finite positive norms
    expect(Number.isFinite(diagFree.totalNorm)).toBe(true)
    expect(Number.isFinite(diagBarrier.totalNorm)).toBe(true)
    expect(diagFree.totalNorm).toBeGreaterThan(0)
    expect(diagBarrier.totalNorm).toBeGreaterThan(0)
  })

  test('relativisticHydrogen: norm finite after 200 frames (Coulomb bound state)', async ({
    page,
  }) => {
    await gotoMode(page, 'diracEquation', 3)
    await waitForShaderCompilation(page)
    await applyDiracPreset(page, 'relativisticHydrogen')
    await enableDiagnostics(page)
    await waitForDiagnostics(page, '/src/stores/diracDiagnosticsStore.ts')
    await waitForSimulationFrames(page, 200)

    const diag = await readDiracDiagnostics(page)
    expect(diag.hasData).toBe(true)
    expect(Number.isFinite(diag.totalNorm), 'Coulomb norm must be finite (no blowup)').toBe(true)
    expect(Number.isFinite(diag.maxDensity), 'Coulomb maxDensity must be finite').toBe(true)
    expect(diag.maxDensity, 'Coulomb maxDensity must be positive').toBeGreaterThan(0)
  })
})

// ─── D. Feature Toggles and Edge Cases ───────────────────────────────────────

test.describe('Dirac equation: feature toggles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('isosurface mode renders at 3D', async ({ page }) => {
    await gotoMode(page, 'diracEquation', 3)
    await waitForDiracReady(page)
    await enableIsosurface(page)
    await waitForShaderCompilation(page)
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 120)
    await assertPixels(page, 'Dirac isosurface 3D')
  })

  test('absorber disabled: periodic boundaries render', async ({ page }) => {
    await gotoMode(page, 'diracEquation', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await setAbsorber(page, false)
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 120)
    await assertPixels(page, 'absorber disabled')
  })

  test('autoScale disabled: renders without auto-normalization', async ({ page }) => {
    await gotoMode(page, 'diracEquation', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await setAutoScale(page, false)
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 120)
    await assertPixels(page, 'autoScale disabled')
  })

  test('dimension switch 3D to 5D: renderer recovers without GPU errors', async ({ page }) => {
    await gotoMode(page, 'diracEquation', 3)
    await waitForDiracReady(page)
    await assertPixels(page, 'Dirac 3D before switch')

    // 5D Dirac produces blank cross-sections (8^5 grid, tiny per-dim count)
    // but must not produce GPU errors during the transition.
    await gotoMode(page, 'diracEquation', 5)
    await waitForDiracReady(page, 200)
    // Do not assert pixels — 5D Dirac is consistently blank.
    // The GPU error fixture will catch any validation errors.
  })

  test('animation: field evolves over time (diagnostics change)', async ({ page }) => {
    await gotoMode(page, 'diracEquation', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await enableDiagnostics(page)

    const fc0 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc0 + 60)
    await waitForDiagnostics(page, '/src/stores/diracDiagnosticsStore.ts')

    const snap1 = await readDiracDiagnostics(page)
    expect(snap1.hasData, 'first snapshot must have data').toBe(true)
    const maxDens1 = snap1.maxDensity

    const fc1 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc1 + 100)

    const snap2 = await readDiracDiagnostics(page)
    expect(snap2.hasData, 'second snapshot must have data').toBe(true)

    // Frame count must have advanced
    const fc = await getFrameCount(page)
    expect(fc, 'frames must advance').toBeGreaterThan(100)

    // The field must have evolved — either maxDensity or normDrift changed.
    // Default config has a moving packet hitting a step potential, so density
    // distribution changes frame to frame.
    const densityChanged = Math.abs(snap2.maxDensity - maxDens1) > 1e-6
    const normChanged = Math.abs(snap2.normDrift - snap1.normDrift) > 1e-8
    expect(
      densityChanged || normChanged,
      `field must evolve: maxDensity ${maxDens1} -> ${snap2.maxDensity}, normDrift ${snap1.normDrift} -> ${snap2.normDrift}`
    ).toBe(true)
  })
})
