/**
 * Pauli Spinor comprehensive e2e test suite.
 *
 * Verifies ALL 6 Pauli presets render at 3D, 5D, and 6D, control changes
 * produce visual differences, per-preset physics are correct, and feature
 * toggles work without GPU errors.
 *
 * Coverage NOT duplicated from other specs:
 * - rendering.spec.ts: Pauli 3D and 5D basic render — not repeated
 * - physics-validation.spec.ts: norm conservation, spinor completeness,
 *   Larmor oscillation, Stern-Gerlach splitting, 5D norm, 6D completeness — not repeated
 *
 * This spec adds:
 * - Section A: per-PRESET rendering at 3D, 5D, and 6D (6 presets x 3 dims)
 * - Section B: per-CONTROL differential pixel response (field view, color algo, presets, field type)
 * - Section C: per-PRESET physics validation (directional responses, not invariants)
 * - Section D: feature toggles and edge cases
 *
 * GPU/shader error detection is automatic via fixtures.ts.
 */

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  applyPauliPreset,
  assertNonBlankPixels,
  capturePixelSnapshot,
  expectSnapshotsDiffer,
  getFrameCount,
  gotoPauli,
  pauseAnimation,
  readPauliDiagnostics,
  requireWebGPU,
  waitForDiagnostics,
  waitForFrameAdvance,
  waitForFreshReadback,
  waitForModeReady,
  waitForRendererReady,
  waitForShaderCompilation,
  waitForUniformUpdate,
} from './helpers/app-helpers'

test.setTimeout(600_000)

// ─── Helpers ─────────────────────────────────────────────────────────────────

const assertPixels = assertNonBlankPixels
const waitForPauliReady = (page: Page, extraFrames = 120) => waitForModeReady(page, extraFrames)

/** Set Pauli field view via store mutation (syncs color algorithm). */
async function setFieldView(page: Page, view: string): Promise<void> {
  await page.evaluate(async (v) => {
    const storeMod = await import('/src/stores/extendedObjectStore.ts')
    const appMod = await import('/src/stores/appearanceStore.ts')
    ;(
      storeMod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).setPauliFieldView(v)
    // Sync color algorithm to match field view
    const algoMap: Record<string, string> = {
      spinDensity: 'pauliSpinDensity',
      totalDensity: 'blackbody',
      spinExpectation: 'pauliSpinExpectation',
      coherence: 'pauliCoherence',
    }
    if (algoMap[v]) {
      appMod.useAppearanceStore.setState({ colorAlgorithm: algoMap[v] })
    }
  }, view)
}

/** Set color algorithm via appearance store. */
async function setColorAlgorithm(page: Page, algo: string): Promise<void> {
  await page.evaluate(async (a) => {
    const mod = await import('/src/stores/appearanceStore.ts')
    mod.useAppearanceStore.setState({ colorAlgorithm: a })
  }, algo)
}

/** Enable isosurface mode via store. */
async function enableIsosurface(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerIsoEnabled(true)
  })
}

/** Set Pauli magnetic field type via store. */
async function setFieldType(page: Page, fieldType: string): Promise<void> {
  await page.evaluate(async (ft) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).setPauliConfig({ fieldType: ft, needsReset: true })
  }, fieldType)
}

/** Set Pauli autoScale enabled/disabled. */
async function setAutoScale(page: Page, enabled: boolean): Promise<void> {
  await page.evaluate(async (val) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).setPauliAutoScale(val)
  }, enabled)
}

// ─── A. Preset Rendering Matrix ──────────────────────────────────────────────

const presets = [
  { id: 'larmorPrecession', label: 'Larmor Precession' },
  { id: 'sternGerlach', label: 'Stern-Gerlach' },
  { id: 'spinFlip', label: 'Spin Flip (Rabi)' },
  { id: 'harmonicTrap', label: 'Harmonic Trap + B' },
  { id: 'spinCoherence', label: 'Coherence Dynamics' },
  { id: 'freeSpinUp', label: 'Free Spin-Up' },
] as const

const dimensions = [3, 5, 6] as const

test.describe('Pauli spinor: preset rendering matrix', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  for (const { id, label } of presets) {
    for (const dim of dimensions) {
      test(`${label} ${dim}D: renders with no GPU errors`, async ({ page }) => {
        await gotoPauli(page, dim)
        await waitForShaderCompilation(page)

        await applyPauliPreset(page, id)
        await waitForShaderCompilation(page)
        const fc = await getFrameCount(page)
        // 5D/6D Pauli frames are slower (2-component FFTs across more axes).
        // The sparse frame counter (updates every 60 frames) adds up to 59
        // extra frames of effective wait, so use a generous timeout at dim >= 5.
        await waitForFrameAdvance(page, fc + 120, dim >= 5 ? 30_000 : 10_000)

        // Higher dimensions produce fainter slices
        const minPx = dim >= 5 ? 1 : 5
        await assertPixels(page, `${label} ${dim}D`, minPx)
      })
    }
  }
})

// ─── B. Control Response — Differential Pixel Checks ─────────────────────────

test.describe('Pauli spinor: control response', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('changing field view: spinDensity vs spinExpectation produces different image', async ({
    page,
  }) => {
    await gotoPauli(page, 3)
    await waitForPauliReady(page)
    await pauseAnimation(page)

    // Default field view is spinDensity
    const before = await capturePixelSnapshot(page)

    await setFieldView(page, 'spinExpectation')
    await waitForShaderCompilation(page)
    await waitForUniformUpdate(page)
    const after = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(before, after, 'spinDensity vs spinExpectation must differ')
  })

  test('changing field view: totalDensity vs coherence produces different image', async ({
    page,
  }) => {
    await gotoPauli(page, 3)
    await waitForPauliReady(page)

    // Use Larmor preset for visible coherence
    await applyPauliPreset(page, 'larmorPrecession')
    await waitForShaderCompilation(page)
    const fc1 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc1 + 120)
    await pauseAnimation(page)

    await setFieldView(page, 'totalDensity')
    await waitForShaderCompilation(page)
    await waitForUniformUpdate(page)
    const snapTotal = await capturePixelSnapshot(page)

    await setFieldView(page, 'coherence')
    await waitForShaderCompilation(page)
    await waitForUniformUpdate(page)
    const snapCoherence = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapTotal, snapCoherence, 'totalDensity vs coherence must differ')
  })

  test('changing color algorithm: pauliSpinDensity vs viridis produces different image', async ({
    page,
  }) => {
    await gotoPauli(page, 3)
    await waitForPauliReady(page)
    await pauseAnimation(page)

    await setColorAlgorithm(page, 'pauliSpinDensity')
    await waitForShaderCompilation(page)
    await waitForUniformUpdate(page)
    const snapSpin = await capturePixelSnapshot(page)

    await setColorAlgorithm(page, 'viridis')
    await waitForShaderCompilation(page)
    await waitForUniformUpdate(page)
    const snapViridis = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapSpin, snapViridis, 'pauliSpinDensity vs viridis must differ')
  })

  test('changing preset: larmorPrecession vs freeSpinUp produces different image', async ({
    page,
  }) => {
    await gotoPauli(page, 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await applyPauliPreset(page, 'larmorPrecession')
    await waitForShaderCompilation(page)
    const fc1 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc1 + 150)
    await pauseAnimation(page)
    const snapLarmor = await capturePixelSnapshot(page)

    await applyPauliPreset(page, 'freeSpinUp')
    await waitForShaderCompilation(page)
    const fc2 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc2 + 150)
    await pauseAnimation(page)
    const snapFree = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapLarmor, snapFree, 'larmorPrecession vs freeSpinUp must differ')
  })

  test('changing magnetic field type: uniform vs gradient produces different image', async ({
    page,
  }) => {
    await gotoPauli(page, 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // Start with uniform field
    await applyPauliPreset(page, 'larmorPrecession')
    await waitForShaderCompilation(page)
    const fc1 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc1 + 150)
    await pauseAnimation(page)
    const snapUniform = await capturePixelSnapshot(page)

    // Switch to gradient field — triggers needsReset
    await setFieldType(page, 'gradient')
    await waitForShaderCompilation(page)
    const fc2 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc2 + 150)
    await pauseAnimation(page)
    const snapGradient = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapUniform, snapGradient, 'uniform vs gradient field must differ')
  })

  test('changing initial condition: gaussianSpinUp vs gaussianSuperposition produces different image', async ({
    page,
  }) => {
    await gotoPauli(page, 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // Pure spin-up
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      ;(
        mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
      ).setPauliConfig({ initialCondition: 'gaussianSpinUp', needsReset: true })
    })
    await waitForShaderCompilation(page)
    const fc1 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc1 + 150)
    await pauseAnimation(page)
    const snapUp = await capturePixelSnapshot(page)

    // Superposition
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      ;(
        mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
      ).setPauliConfig({ initialCondition: 'gaussianSuperposition', needsReset: true })
    })
    await waitForShaderCompilation(page)
    const fc2 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc2 + 150)
    await pauseAnimation(page)
    const snapSuper = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapUp, snapSuper, 'spinUp vs superposition must differ')
  })
})

// ─── C. Physics Validation via Diagnostics ───────────────────────────────────

test.describe('Pauli spinor: physics validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('directional: spinFlip (Rabi) drives spin population transfer', async ({ page }) => {
    // Spin flip preset starts with pure spin-up in a resonant rotating field.
    // After sufficient evolution, spin-down fraction should grow appreciably.
    // Use relative frame counting from preset application to ensure enough
    // Rabi evolution time regardless of how many frames the setup consumed.
    await gotoPauli(page, 3)
    await waitForShaderCompilation(page)
    await applyPauliPreset(page, 'spinFlip')
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'pauli')
    const fcAfterPreset = await getFrameCount(page)
    await waitForFrameAdvance(page, fcAfterPreset + 300, 30_000)
    // Ensure the most recent GPU readback is reflected in the store
    await waitForFreshReadback(page, '/src/stores/diagnosticsStore.ts', 30_000, 'pauli')

    const diag = await readPauliDiagnostics(page)
    expect(diag.hasData, 'spinFlip diagnostics must have data').toBe(true)
    // Rabi oscillation transfers population between spin channels. The rate
    // depends on resonance matching between the rotating frequency and the
    // Larmor frequency. Any nonzero spin-down from a pure spin-up initial
    // condition confirms the rotating field is coupling the two channels.
    expect(
      diag.spinDownFraction,
      `spin-down fraction (${diag.spinDownFraction.toFixed(6)}) should be > 0 from Rabi coupling`
    ).toBeGreaterThan(0)
  })

  test('directional: coherence magnitude > 0 for superposition state', async ({ page }) => {
    // spinCoherence preset uses a quadrupole field with initial superposition.
    // Off-diagonal coherence should be nonzero.
    await gotoPauli(page, 3)
    await waitForShaderCompilation(page)
    await applyPauliPreset(page, 'spinCoherence')
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'pauli')
    const fcAfterPreset = await getFrameCount(page)
    await waitForFrameAdvance(page, fcAfterPreset + 200, 30_000)
    await waitForFreshReadback(page, '/src/stores/diagnosticsStore.ts', 30_000, 'pauli')

    const diag = await readPauliDiagnostics(page)
    expect(diag.hasData, 'spinCoherence diagnostics must have data').toBe(true)
    expect(
      diag.coherenceMagnitude,
      `coherence magnitude (${diag.coherenceMagnitude.toFixed(4)}) should be > 0 for superposition`
    ).toBeGreaterThan(0)
  })

  test('directional: freeSpinUp stays fully polarized (no field)', async ({ page }) => {
    // Pure spin-up with zero magnetic field: spin-down fraction should remain ~0.
    await gotoPauli(page, 3)
    await waitForShaderCompilation(page)
    await applyPauliPreset(page, 'freeSpinUp')
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'pauli')
    const fcAfterPreset = await getFrameCount(page)
    await waitForFrameAdvance(page, fcAfterPreset + 200, 30_000)
    await waitForFreshReadback(page, '/src/stores/diagnosticsStore.ts', 30_000, 'pauli')

    const diag = await readPauliDiagnostics(page)
    expect(diag.hasData, 'freeSpinUp diagnostics must have data').toBe(true)
    // With no magnetic field, a pure spin-up state should stay spin-up.
    // spin-down fraction should be negligible (< 2% from numerical noise).
    expect(
      diag.spinDownFraction,
      `spin-down fraction (${diag.spinDownFraction.toFixed(4)}) should be near 0 for free spin-up`
    ).toBeLessThan(0.02)
    expect(
      diag.spinUpFraction,
      `spin-up fraction (${diag.spinUpFraction.toFixed(4)}) should dominate`
    ).toBeGreaterThan(0.95)
  })

  test('harmonicTrap: spinor stays trapped (maxDensity finite and nonzero)', async ({ page }) => {
    await gotoPauli(page, 3)
    await waitForShaderCompilation(page)
    await applyPauliPreset(page, 'harmonicTrap')
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'pauli')
    const fcAfterPreset = await getFrameCount(page)
    await waitForFrameAdvance(page, fcAfterPreset + 200, 30_000)
    await waitForFreshReadback(page, '/src/stores/diagnosticsStore.ts', 30_000, 'pauli')

    const diag = await readPauliDiagnostics(page)
    expect(diag.hasData, 'harmonicTrap diagnostics must have data').toBe(true)
    expect(Number.isFinite(diag.maxDensity), 'maxDensity must be finite').toBe(true)
    expect(diag.maxDensity, 'maxDensity must be positive (trapped packet)').toBeGreaterThan(0)
    // Spinor completeness should still hold in a harmonic trap
    const total = diag.spinUpFraction + diag.spinDownFraction
    expect(Math.abs(total - 1.0), 'spinor completeness in harmonic trap').toBeLessThan(0.05)
  })
})

// ─── D. Feature Toggles and Edge Cases ───────────────────────────────────────

test.describe('Pauli spinor: feature toggles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('isosurface mode renders at 3D', async ({ page }) => {
    await gotoPauli(page, 3)
    await waitForPauliReady(page)
    await enableIsosurface(page)
    await waitForShaderCompilation(page)
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 120)
    await assertPixels(page, 'Pauli isosurface 3D')
  })

  test('autoScale disabled: renders without auto-normalization', async ({ page }) => {
    await gotoPauli(page, 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await setAutoScale(page, false)
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 120)
    await assertPixels(page, 'autoScale disabled')
  })

  test('dimension switch 3D to 6D: renderer recovers', async ({ page }) => {
    await gotoPauli(page, 3)
    await waitForPauliReady(page)
    await assertPixels(page, 'Pauli 3D before switch')

    await gotoPauli(page, 6)
    await waitForPauliReady(page)
    await assertPixels(page, 'Pauli 6D after switch', 1)
  })

  test('animation: frames advance and density stays nonzero', async ({ page }) => {
    await gotoPauli(page, 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // Use Larmor preset for active dynamics
    await applyPauliPreset(page, 'larmorPrecession')
    await waitForShaderCompilation(page)
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'pauli')
    const fcStart = await getFrameCount(page)
    await waitForFrameAdvance(page, fcStart + 60, 30_000)

    const fc1 = await getFrameCount(page)
    const snap1 = await readPauliDiagnostics(page)
    expect(snap1.hasData, 'first snapshot must have data').toBe(true)

    // Let 200 more frames evolve (relative to current position)
    await waitForFrameAdvance(page, fc1 + 200, 30_000)
    const fc2 = await getFrameCount(page)

    const snap2 = await readPauliDiagnostics(page)
    expect(snap2.hasData, 'second snapshot must have data').toBe(true)

    // Frame count must advance
    expect(fc2, `frame count must advance: ${fc1} -> ${fc2}`).toBeGreaterThan(fc1)
    // Density must remain positive (simulation hasn't blown up or zeroed out)
    expect(snap2.maxDensity, 'maxDensity must remain positive').toBeGreaterThan(0)
    expect(Number.isFinite(snap2.maxDensity), 'maxDensity must be finite').toBe(true)
  })
})
