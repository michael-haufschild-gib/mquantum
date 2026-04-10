/**
 * FSF de Sitter Cosmology — Debug Measurement Spec
 *
 * Purpose: the canonical δφ integrator switch was supposed to kill the
 * "delayed explosion" the user reported under the old Mukhanov-Sasaki
 * path. They now report a NEW pattern — "quick flash, then nothing" —
 * which is not predicted analytically by any of my mental models of the
 * integrator. This spec instruments the real running app so the actual
 * numbers drive the next fix, instead of another round of hand-waving.
 *
 * What it does:
 *
 *   1. Navigates to FSF, enables the `deSitterVacuum` preset.
 *   2. Flips the global `window.__fsfCosmoDebug.enabled` flag so the
 *      compute pass starts pushing per-frame samples into its ring buffer
 *      (see `FreeScalarFieldComputePass.captureCosmoDebugSample`).
 *   3. Drives the simulation for 15 seconds of real time, polling the
 *      ring buffer every 500ms.
 *   4. Dumps the entire trace to `scripts/playwright-output/` as JSON
 *      plus a human-readable summary at a handful of key timestamps.
 *   5. Asserts the invariants that "quick flash then nothing" would
 *      violate — no NaN/Inf, energy stays finite, field amplitudes don't
 *      collapse to zero.
 *
 * When the assertions trip, the JSON dump carries the full sub-frame
 * trajectory of `(simEta, aKinetic, aPotential, aFull, nSub, totalEnergy,
 * maxPhi, maxPi)` so the next fix lands on concrete data rather than
 * reasoning about what "should" happen.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  gotoMode,
  requireWebGPU,
  waitForRendererReady,
  waitForShaderCompilation,
  waitForSimulationFrames,
} from './helpers/app-helpers'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUTPUT_DIR = join(__dirname, '..', 'playwright-output')

test.setTimeout(120_000)

/**
 * Shape of a single debug sample pushed by the compute pass. Must match
 * `FsfCosmoDebugSample` in `FreeScalarFieldComputePass.ts`.
 */
interface FsfCosmoDebugSample {
  frame: number
  t: number
  simEta: number
  a: number
  aKinetic: number
  aPotential: number
  aFull: number
  nSub: number
  mSqAsq: number
  diagTotalEnergy: number
  diagMaxPhi: number
  diagMaxPi: number
}

interface FsfCosmoDebugBuffer {
  samples: FsfCosmoDebugSample[]
  capacity: number
  head: number
  enabled: boolean
}

/** Enable the compute-pass debug ring buffer from the page side. */
async function enableDebugBuffer(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = globalThis as unknown as { __fsfCosmoDebug?: FsfCosmoDebugBuffer }
    if (!g.__fsfCosmoDebug) {
      g.__fsfCosmoDebug = { samples: [], capacity: 2048, head: 0, enabled: false }
    }
    g.__fsfCosmoDebug.enabled = true
    g.__fsfCosmoDebug.samples = []
    g.__fsfCosmoDebug.head = 0
  })
}

/** Drain the current ring-buffer state to a plain JS array. */
async function readDebugBuffer(page: Page): Promise<FsfCosmoDebugSample[]> {
  return page.evaluate(() => {
    const g = globalThis as unknown as { __fsfCosmoDebug?: FsfCosmoDebugBuffer }
    const buf = g.__fsfCosmoDebug
    if (!buf || buf.samples.length === 0) return []
    // Ring buffer linearization: if head < capacity, samples is already
    // in order; otherwise rotate so the oldest sample comes first.
    if (buf.head <= buf.capacity) return [...buf.samples]
    const out: FsfCosmoDebugSample[] = []
    const start = buf.head % buf.capacity
    for (let i = 0; i < buf.capacity; i++) {
      out.push(buf.samples[(start + i) % buf.capacity]!)
    }
    return out
  })
}

/**
 * Apply the `deSitterVacuum` preset via the public store setter and wait
 * for the async dynamic import inside `applyFreeScalarPreset` to resolve.
 *
 * The setter kicks off `import('@/lib/physics/freeScalar/presets')` and
 * schedules the state update on the microtask queue; one rAF tick is
 * enough in practice, but we poll the live cosmology config up to 1s to
 * be robust against slower test machines.
 */
async function applyDeSitterVacuumPreset(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().applyFreeScalarPreset('deSitterVacuum')
  })

  // Wait for the preset overrides to land in the store.
  await page.waitForFunction(
    async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const fs = mod.useExtendedObjectStore.getState().schroedinger.freeScalar
      return (
        fs.initialCondition === 'vacuumNoise' &&
        fs.cosmology.enabled === true &&
        fs.cosmology.preset === 'deSitter' &&
        Math.abs(fs.mass - 1.0) < 1e-9 &&
        fs.cosmology.eta0 === -10
      )
    },
    { timeout: 5_000 }
  )
}

/** Read a few top-level config fields for the trace header. */
async function readFsfConfigSnapshot(page: Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    const fs = mod.useExtendedObjectStore.getState().schroedinger.freeScalar
    return {
      latticeDim: fs.latticeDim,
      gridSize: fs.gridSize.slice(0, fs.latticeDim),
      spacing: fs.spacing.slice(0, fs.latticeDim),
      mass: fs.mass,
      dt: fs.dt,
      stepsPerFrame: fs.stepsPerFrame,
      autoScale: fs.autoScale,
      fieldView: fs.fieldView,
      cosmology: {
        preset: fs.cosmology.preset,
        hubble: fs.cosmology.hubble,
        eta0: fs.cosmology.eta0,
        steepness: fs.cosmology.steepness,
        enabled: fs.cosmology.enabled,
      },
    }
  })
}

/**
 * Compute a compact numerical summary at several wall-clock checkpoints
 * through the trace — makes the assertion failure message actually
 * readable without opening the JSON file.
 */
function summarizeTrace(samples: FsfCosmoDebugSample[]): string {
  if (samples.length === 0) return '(no samples captured)'
  const firstT = samples[0]!.t
  const checkpoints = [0, 500, 1000, 2000, 3000, 5000, 8000, 12000, 15000]
  const lines: string[] = []
  lines.push(
    `frame  |  t(ms)  |  simEta    |  a         |  aKinetic  |  aPotential  |  aFull      |  nSub  |  E         |  maxPhi    |  maxPi`
  )
  for (const dt of checkpoints) {
    // Find the sample closest to firstT + dt
    let best = samples[0]!
    let bestErr = Math.abs(best.t - (firstT + dt))
    for (const s of samples) {
      const err = Math.abs(s.t - (firstT + dt))
      if (err < bestErr) {
        best = s
        bestErr = err
      }
    }
    lines.push(
      `${String(best.frame).padStart(5)}  |  ${(best.t - firstT).toFixed(0).padStart(5)}  |  ${best.simEta.toExponential(3).padStart(10)}  |  ${best.a.toExponential(3).padStart(10)}  |  ${best.aKinetic.toExponential(3).padStart(10)}  |  ${best.aPotential.toExponential(3).padStart(12)}  |  ${best.aFull.toExponential(3).padStart(11)}  |  ${String(best.nSub).padStart(4)}  |  ${best.diagTotalEnergy.toExponential(3).padStart(10)}  |  ${best.diagMaxPhi.toExponential(3).padStart(10)}  |  ${best.diagMaxPi.toExponential(3).padStart(10)}`
    )
  }
  return lines.join('\n')
}

test.describe('FSF de Sitter cosmology debug trace', () => {
  test('records per-frame cosmology state during a 15s run and dumps to disk', async ({
    page,
  }, testInfo) => {
    await requireWebGPU(page, testInfo)

    // Land in FSF 3D. The preset overrides the initial condition + dt +
    // cosmology config once applied.
    await gotoMode(page, 'freeScalarField', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await enableDebugBuffer(page)
    await applyDeSitterVacuumPreset(page)

    const configSnapshot = await readFsfConfigSnapshot(page)

    // Let the preset reset propagate + sample the first few frames.
    await waitForSimulationFrames(page, 5)

    // Drive the simulation for ~15 real seconds. Take a canvas screenshot
    // every ~500ms so the visual trajectory sits alongside the numeric
    // trace — the user's report is "flash then nothing" which is a
    // visual observation only.
    const totalDurationMs = 15_000
    const pollIntervalMs = 500
    const startPoll = Date.now()
    const shotPaths: string[] = []
    const canvas = page.locator('[data-testid="webgpu-canvas"]')
    const shotDir = join(OUTPUT_DIR, 'fsf-desitter-shots')
    mkdirSync(shotDir, { recursive: true })
    let shotIdx = 0
    while (Date.now() - startPoll < totalDurationMs) {
      await page.waitForTimeout(pollIntervalMs)
      const elapsed = Math.round(Date.now() - startPoll)
      const path = join(shotDir, `t${String(elapsed).padStart(5, '0')}ms.png`)
      try {
        await canvas.screenshot({ path })
        shotPaths.push(path)
      } catch {
        // Canvas may not be visible for a frame during a reset race — skip.
      }
      shotIdx += 1
    }
    void shotIdx // suppress unused lint

    const samples = await readDebugBuffer(page)
    const summary = summarizeTrace(samples)

    // Dump the full trace + summary to disk for later inspection.
    mkdirSync(OUTPUT_DIR, { recursive: true })
    const slug = 'fsf-desitter-cosmology-debug'
    writeFileSync(
      join(OUTPUT_DIR, `${slug}.json`),
      JSON.stringify({ config: configSnapshot, samples }, null, 2)
    )
    writeFileSync(
      join(OUTPUT_DIR, `${slug}.txt`),
      [
        `FSF de Sitter cosmology trace`,
        `config: ${JSON.stringify(configSnapshot, null, 2)}`,
        ``,
        `samples captured: ${samples.length}`,
        ``,
        summary,
      ].join('\n')
    )

    // Attach both artefacts to the playwright report so a CI run would
    // also surface them without manual inspection.
    await testInfo.attach(`${slug}.json`, {
      path: join(OUTPUT_DIR, `${slug}.json`),
      contentType: 'application/json',
    })
    await testInfo.attach(`${slug}.txt`, {
      path: join(OUTPUT_DIR, `${slug}.txt`),
      contentType: 'text/plain',
    })

    // ─── Assertions ─────────────────────────────────────────────────────
    // These encode the invariants that "flash then nothing" would break.

    // 1. We actually captured a reasonable number of samples. 15 seconds
    //    × 60fps ≈ 900 samples; expect at least 100 (slow machines + the
    //    kickstart warm-up frames).
    expect(samples.length, 'expected at least 100 cosmology debug samples').toBeGreaterThan(100)

    // 2. No NaN/Inf anywhere in the trace. This is the core integrator
    //    invariant — the canonical δφ formulation should never produce
    //    invalid numbers unless my implementation is buggy.
    const nanIdx = samples.findIndex(
      (s) =>
        !Number.isFinite(s.simEta) ||
        !Number.isFinite(s.a) ||
        !Number.isFinite(s.aKinetic) ||
        !Number.isFinite(s.aPotential) ||
        !Number.isFinite(s.aFull) ||
        !Number.isFinite(s.diagTotalEnergy) ||
        !Number.isFinite(s.diagMaxPhi) ||
        !Number.isFinite(s.diagMaxPi)
    )
    if (nanIdx !== -1) {
      // Print the 5 samples before and 5 after the first NaN so the fix
      // can see exactly when numerics went invalid.
      const window = samples.slice(Math.max(0, nanIdx - 5), Math.min(samples.length, nanIdx + 6))
      throw new Error(
        `found NaN/Inf at sample index ${nanIdx} (frame ${samples[nanIdx]?.frame}):\n` +
          JSON.stringify(window, null, 2)
      )
    }

    // 3. simEta is monotonically advancing toward 0 (strictly, since the
    //    cosmology clock never stalls while playing).
    const etaFirst = samples[0]!.simEta
    const etaLast = samples[samples.length - 1]!.simEta
    expect(Math.abs(etaLast), 'simEta should advance toward 0').toBeLessThan(Math.abs(etaFirst))

    // 4. The diagnostics ring should have populated by the time we stop
    //    (diagnosticsInterval = 10 frames, so the first snapshot lands
    //    within ~200ms at 60fps). If everything is NaN by the end, the
    //    diagnostics readback likely went invalid.
    const lastWithDiag = [...samples].reverse().find((s) => s.diagMaxPhi > 0)
    expect(lastWithDiag, 'expected at least one frame with non-zero diag maxPhi').toBeTruthy()

    // 5. Field amplitudes should not collapse to exactly zero — "quick
    //    flash then nothing" would manifest as maxPhi → 0 after the
    //    initial frames. Allow a large tolerance (1e-30) because the
    //    user's problem is presumably not a subtle one.
    const midSample = samples[Math.floor(samples.length / 2)]!
    const lateSample = samples[samples.length - 1]!
    expect(
      Math.max(midSample.diagMaxPhi, midSample.diagMaxPi),
      `field collapsed to zero mid-run\n${summary}`
    ).toBeGreaterThan(1e-30)
    expect(
      Math.max(lateSample.diagMaxPhi, lateSample.diagMaxPi),
      `field collapsed to zero by end of run\n${summary}`
    ).toBeGreaterThan(1e-30)

    // 6. CFL sub-stepping should NOT be saturating (nSub at the cap of 32)
    //    for the default preset — that would indicate the integrator is
    //    struggling and would precede numerical blow-up.
    const maxNSub = Math.max(...samples.map((s) => s.nSub))
    expect(maxNSub, 'CFL sub-step cap was reached during the run').toBeLessThan(32)
  })
})
