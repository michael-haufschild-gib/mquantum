/**
 * Physics-validation e2e tests for curved-space TDSE v2 — Wave 7 (plan 5.5).
 *
 * Quantitative assertions against the GPU diagnostics readback: norm drift
 * bounds for each curved metric, qualitative stability on compact geometries,
 * and an overlay-does-not-perturb-dynamics check.
 *
 * GPU/shader error detection is automatic via fixtures.ts.
 *
 * See: docs/plans/curved-space-tdse-v2.md section 5.5.
 */

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  applyTdsePreset,
  getFrameCount,
  readTdseDiagnostics,
  requireWebGPU,
  setTdseShowCurvatureOverlay,
  waitForDiagnostics,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
  waitForSimulationFrames,
} from './helpers/app-helpers'

test.setTimeout(600_000)

// ─── Local helpers ───────────────────────────────────────────────────────────

/**
 * Boot the app into TDSE mode, apply the v2 preset, wait for the post-reset
 * shader swap, and let a few frames render so diagnostics are populated.
 */
async function bootPreset(page: Page, presetId: string): Promise<void> {
  await page.goto('/?t=schroedinger&d=3&qm=tdseDynamics')
  await waitForRendererReady(page)
  await waitForShaderCompilation(page)
  await applyTdsePreset(page, presetId)
  await waitForShaderCompilation(page)
  const fc = await getFrameCount(page)
  await waitForFrameAdvance(page, fc + 4)
}

/**
 * Apply a preset, advance `frames` frames, then read the TDSE diagnostics
 * channel. Returns the `normDrift` value or `null` if diagnostics did not
 * populate inside the 30s timeout.
 */
async function measureNormDrift(
  page: Page,
  presetId: string,
  frames: number
): Promise<number | null> {
  await bootPreset(page, presetId)
  await waitForSimulationFrames(page, frames)
  await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', 30_000, 'tdse')
  const diag = await readTdseDiagnostics(page)
  if (!diag.hasData || diag.normDrift === undefined || diag.normDrift === null) return null
  return diag.normDrift
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Curved-space TDSE v2 — physics validation', () => {
  for (const presetId of ['schwarzschildOrbit', 'sphereCompactification', 'adsBoundaryBounce']) {
    test(`27.${presetId}: static metric — |normDrift| < 2% over 300 frames`, async ({
      page,
    }, testInfo) => {
      await page.goto('/')
      await requireWebGPU(page, testInfo)

      const drift = await measureNormDrift(page, presetId, 300)
      if (drift === null) {
        test.skip(true, `TDSE normDrift unavailable for ${presetId}`)
        return
      }
      expect(
        Math.abs(drift),
        `${presetId}: |normDrift|=${drift} must be under 2% (static metric target per plan 5.5)`
      ).toBeLessThan(0.02)
    })
  }

  test('28: de Sitter (time-dependent) — |normDrift| < 3% over 300 frames', async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    const drift = await measureNormDrift(page, 'cosmologicalRedshift', 300)
    if (drift === null) {
      test.skip(true, 'TDSE normDrift unavailable for cosmologicalRedshift')
      return
    }
    expect(
      Math.abs(drift),
      `deSitter: |normDrift|=${drift} must be under 3% (time-dependent metric target per plan 5.5)`
    ).toBeLessThan(0.03)
  })

  test('29: torus preset wraps cleanly — |normDrift| < 1% over 400 frames', async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    const drift = await measureNormDrift(page, 'torusEigenstates', 400)
    if (drift === null) {
      test.skip(true, 'TDSE normDrift unavailable for torusEigenstates')
      return
    }
    // Torus takes the FFT path (flat metric + periodic) — should match the
    // strictness of the baseline flat-space kinetic operator.
    expect(
      Math.abs(drift),
      `torus: |normDrift|=${drift} must be under 1% (FFT path matches flat space)`
    ).toBeLessThan(0.01)
  })

  test('30: sphere preset — maxDensity stays bounded (no polar blowup)', async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    // Baseline: initial peak density right after the preset settles.
    await bootPreset(page, 'sphereCompactification')
    await waitForSimulationFrames(page, 20)
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', 30_000, 'tdse')
    const initial = await readTdseDiagnostics(page)
    if (!initial.hasData) {
      test.skip(true, 'sphere2D diagnostics unavailable at t0')
      return
    }
    const initialPeak = initial.maxDensity

    // Late sample: 100 frames of evolution.
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 100)
    const late = await readTdseDiagnostics(page)
    if (!late.hasData) {
      test.skip(true, 'sphere2D diagnostics unavailable at t_late')
      return
    }

    expect(
      Number.isFinite(late.maxDensity),
      `sphere2D maxDensity must stay finite (got ${late.maxDensity})`
    ).toBe(true)
    // Packets on a compact 2-sphere with a polar clamp must not reach
    // explosive densities — the bound is generous (10× initial) to allow
    // normal wrap-around pile-up without flagging pathology.
    expect(
      late.maxDensity,
      `sphere2D maxDensity must stay within 10× initial (initial=${initialPeak}, late=${late.maxDensity})`
    ).toBeLessThan(initialPeak * 10 + 1e-3)
  })

  test('31: curvature overlay does not perturb dynamics on Schwarzschild', async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    // Run A: overlay OFF baseline.
    await bootPreset(page, 'schwarzschildOrbit')
    await setTdseShowCurvatureOverlay(page, false)
    await waitForSimulationFrames(page, 200)
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', 30_000, 'tdse')
    const diagOff = await readTdseDiagnostics(page)
    if (!diagOff.hasData || diagOff.normDrift === undefined || diagOff.normDrift === null) {
      test.skip(true, 'schwarzschildOrbit diagnostics unavailable with overlay off')
      return
    }
    const driftOff = diagOff.normDrift

    // Run B: fresh navigation + same preset, overlay ON. Fresh navigation
    // avoids any residual integrator state from the previous run.
    await page.goto('/?t=schroedinger&d=3&qm=tdseDynamics')
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await applyTdsePreset(page, 'schwarzschildOrbit')
    await waitForShaderCompilation(page)
    await setTdseShowCurvatureOverlay(page, true)
    await waitForSimulationFrames(page, 200)
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', 30_000, 'tdse')
    const diagOn = await readTdseDiagnostics(page)
    if (!diagOn.hasData || diagOn.normDrift === undefined || diagOn.normDrift === null) {
      test.skip(true, 'schwarzschildOrbit diagnostics unavailable with overlay on')
      return
    }
    const driftOn = diagOn.normDrift

    // Overlay is a render-only flag — the compute path is unchanged, so
    // normDrift must match within a tight tolerance (0.5%) that still
    // accommodates stochastic frame-count jitter in the readback.
    expect(
      Math.abs(driftOn - driftOff),
      `Overlay on/off must produce same normDrift within 0.5% (off=${driftOff}, on=${driftOn})`
    ).toBeLessThan(0.005)
  })
})
