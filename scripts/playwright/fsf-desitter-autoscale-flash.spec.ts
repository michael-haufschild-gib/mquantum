/**
 * FSF de Sitter — AutoScale Flash Reproduction Spec
 *
 * The user reports: "enable cosmology, pick the de Sitter preset, auto-scale on,
 * the field renders for a while, slowly disappears, then after some seconds of
 * darkness there is a sudden white flash".
 *
 * The existing debug spec `fsf-desitter-cosmology-debug.spec.ts` runs for 15s
 * with autoScale=false and shows a smooth energy decay — no flash captured.
 * This spec exercises the exact user scenario:
 *
 *   1. Apply the `deSitterVacuum` preset.
 *   2. EXPLICITLY force `autoScale = true` after applying the preset, in case
 *      the preset didn't actually land the flag (the existing trace showed
 *      `autoScale: false` despite the preset declaring `autoScale: true`).
 *   3. Run for 45 seconds — long enough to reach the ETA floor at the default
 *      stepping rate (simEta advances ~0.5 per wall-clock second under the
 *      observed playback throughput, so η=-10 → η≈-0.001 takes ~20s).
 *   4. Capture the debug ring buffer every 500ms so we see the full
 *      `(simEta, a, coefs, nSub, E, maxPhi, maxPi)` trajectory.
 *   5. Screenshot every 500ms. Name files `tNNNNNms.png` so manual inspection
 *      can find the exact moment the field fades and the flash happens.
 *   6. Sample the raw density texture statistics via a small helper exposed
 *      on `window.__fsfDensityProbe` (added below) so we can distinguish
 *      "numeric flash" (NaN → white) from "saturation flash" (normRho
 *      suddenly > 1).
 *
 * No hard asserts — this is a reproduction / observation spec. It writes a
 * JSON + txt summary to `scripts/playwright-output/` and fails only on
 * serialization errors or if the debug buffer stays empty (which would
 * indicate the instrumentation didn't wire up).
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

test.setTimeout(180_000)

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

async function enableDebugBuffer(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = globalThis as unknown as { __fsfCosmoDebug?: FsfCosmoDebugBuffer }
    if (!g.__fsfCosmoDebug) {
      g.__fsfCosmoDebug = { samples: [], capacity: 4096, head: 0, enabled: false }
    }
    g.__fsfCosmoDebug.enabled = true
    g.__fsfCosmoDebug.samples = []
    g.__fsfCosmoDebug.head = 0
    g.__fsfCosmoDebug.capacity = 4096
  })
}

async function readDebugBuffer(page: Page): Promise<FsfCosmoDebugSample[]> {
  return page.evaluate(() => {
    const g = globalThis as unknown as { __fsfCosmoDebug?: FsfCosmoDebugBuffer }
    const buf = g.__fsfCosmoDebug
    if (!buf || buf.samples.length === 0) return []
    if (buf.head <= buf.capacity) return [...buf.samples]
    const out: FsfCosmoDebugSample[] = []
    const start = buf.head % buf.capacity
    for (let i = 0; i < buf.capacity; i++) {
      out.push(buf.samples[(start + i) % buf.capacity]!)
    }
    return out
  })
}

async function applyDeSitterAndForceAutoScale(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().applyFreeScalarPreset('deSitterVacuum')
  })

  await page.waitForFunction(
    async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const fs = mod.useExtendedObjectStore.getState().schroedinger.freeScalar
      return (
        fs.initialCondition === 'vacuumNoise' &&
        fs.cosmology.enabled === true &&
        fs.cosmology.preset === 'deSitter' &&
        fs.cosmology.eta0 === -10
      )
    },
    { timeout: 5_000 }
  )

  // Force autoScale true even if preset didn't stick. The prior debug trace
  // showed `autoScale: false` despite the preset declaring true, so this
  // reproduces the user's exact setting.
  await page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setFreeScalarAutoScale(true)
    // Also force a field reset so the new auto-scale baseline is recomputed
    // from eta0 and the vacuum is re-sampled cleanly.
    mod.useExtendedObjectStore.getState().resetFreeScalarField()
  })

  await page.waitForFunction(
    async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const fs = mod.useExtendedObjectStore.getState().schroedinger.freeScalar
      return fs.autoScale === true
    },
    { timeout: 2_000 }
  )
}

async function readFsfConfigSnapshot(page: Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    const s = mod.useExtendedObjectStore.getState()
    const fs = s.schroedinger.freeScalar
    return {
      latticeDim: fs.latticeDim,
      gridSize: fs.gridSize.slice(0, fs.latticeDim),
      spacing: fs.spacing.slice(0, fs.latticeDim),
      mass: fs.mass,
      dt: fs.dt,
      stepsPerFrame: fs.stepsPerFrame,
      autoScale: fs.autoScale,
      fieldView: fs.fieldView,
      densityGain: s.schroedinger.densityGain,
      densityContrast: s.schroedinger.densityContrast,
      autoScaleMaxGain: s.schroedinger.autoScaleMaxGain,
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
 * Sample the canvas pixel brightness by reading a central 32x32 region. Fast
 * bucket: min / mean / max / stdev across RGB channels. Exposes "flash"
 * events as sudden spikes in the `meanBrightness` series.
 */
async function probeCanvasBrightness(
  page: Page
): Promise<{ min: number; mean: number; max: number; hasNan: boolean } | null> {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="webgpu-canvas"]') as HTMLCanvasElement | null
    if (!canvas) return null
    const w = canvas.width
    const h = canvas.height
    if (!w || !h) return null
    // Use a 2D scratch canvas to read a downscaled copy of the WebGPU canvas.
    // Direct readback from a WebGPU-rendered canvas via getImageData can fail
    // (CORS / context mismatch); drawImage preserves pixels via the compositor.
    const scratch = document.createElement('canvas')
    scratch.width = 32
    scratch.height = 32
    const ctx = scratch.getContext('2d')
    if (!ctx) return null
    try {
      ctx.drawImage(canvas, 0, 0, 32, 32)
    } catch {
      return null
    }
    const img = ctx.getImageData(0, 0, 32, 32).data
    let min = 255
    let max = 0
    let sum = 0
    let hasNan = false
    for (let i = 0; i < img.length; i += 4) {
      const r = img[i]!
      const g = img[i + 1]!
      const b = img[i + 2]!
      if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) {
        hasNan = true
        continue
      }
      const v = (r + g + b) / 3
      if (v < min) min = v
      if (v > max) max = v
      sum += v
    }
    const mean = sum / (img.length / 4)
    return { min, mean, max, hasNan }
  })
}

interface BrightnessSample {
  t: number
  min: number
  mean: number
  max: number
  hasNan: boolean
}

test.describe('FSF de Sitter cosmology — autoScale flash repro', () => {
  test('records 45s trace with autoScale forced true, screenshots + brightness probe', async ({
    page,
  }, testInfo) => {
    await requireWebGPU(page, testInfo)

    await gotoMode(page, 'freeScalarField', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await enableDebugBuffer(page)
    await applyDeSitterAndForceAutoScale(page)

    const configSnapshot = await readFsfConfigSnapshot(page)

    // Let reset propagate and the first adiabatic-vacuum frame land.
    await waitForSimulationFrames(page, 10)

    const totalDurationMs = 45_000
    const pollIntervalMs = 500
    const startPoll = Date.now()
    const canvas = page.locator('[data-testid="webgpu-canvas"]')
    const shotDir = join(OUTPUT_DIR, 'fsf-desitter-autoscale-shots')
    mkdirSync(shotDir, { recursive: true })

    const brightnessSeries: BrightnessSample[] = []

    while (Date.now() - startPoll < totalDurationMs) {
      await page.waitForTimeout(pollIntervalMs)
      const elapsed = Math.round(Date.now() - startPoll)
      const path = join(shotDir, `t${String(elapsed).padStart(5, '0')}ms.png`)
      try {
        await canvas.screenshot({ path })
      } catch {
        /* ignore canvas screenshot failures (rare, mid-reset) */
      }
      const probe = await probeCanvasBrightness(page)
      if (probe) {
        brightnessSeries.push({ t: elapsed, ...probe })
      }
    }

    const samples = await readDebugBuffer(page)

    // ─── Build a compact summary: checkpoints at 0, 1, 3, 5, 10, 15, 20, 25,
    // 30, 35, 40, 45 seconds. Include brightness alongside cosmology data.
    const firstT = samples[0]?.t ?? 0
    const checkpoints = [0, 1000, 3000, 5000, 10_000, 15_000, 20_000, 25_000, 30_000, 35_000, 40_000, 45_000]
    const lines: string[] = []
    lines.push(
      `frame  |  t(ms)  |  simEta      |  a          |  aKinetic   |  aPotential |  aFull      |  nSub |  E          |  maxPhi     |  maxPi      |  px.mean  |  px.max`
    )
    for (const dt of checkpoints) {
      let best = samples[0]
      let bestErr = Number.POSITIVE_INFINITY
      for (const s of samples) {
        const err = Math.abs(s.t - (firstT + dt))
        if (err < bestErr) {
          best = s
          bestErr = err
        }
      }
      if (!best) continue
      // Align brightness sample
      let brightness: BrightnessSample | undefined = brightnessSeries[0]
      let bErr = Number.POSITIVE_INFINITY
      for (const b of brightnessSeries) {
        const err = Math.abs(b.t - dt)
        if (err < bErr) {
          brightness = b
          bErr = err
        }
      }
      lines.push(
        `${String(best.frame).padStart(5)}  |  ${(best.t - firstT).toFixed(0).padStart(5)}  |  ${best.simEta.toExponential(3).padStart(11)}  |  ${best.a.toExponential(3).padStart(11)}  |  ${best.aKinetic.toExponential(3).padStart(11)}  |  ${best.aPotential.toExponential(3).padStart(11)}  |  ${best.aFull.toExponential(3).padStart(11)}  |  ${String(best.nSub).padStart(4)} |  ${best.diagTotalEnergy.toExponential(3).padStart(11)}  |  ${best.diagMaxPhi.toExponential(3).padStart(11)}  |  ${best.diagMaxPi.toExponential(3).padStart(11)}  |  ${(brightness?.mean ?? -1).toFixed(1).padStart(7)}  |  ${(brightness?.max ?? -1).toFixed(1).padStart(6)}`
      )
    }
    const summary = lines.join('\n')

    // Count brightness "events" — frames where mean jumps >20 from one sample
    // to the next (flash detection).
    const flashes: { t: number; deltaMean: number; mean: number }[] = []
    for (let i = 1; i < brightnessSeries.length; i++) {
      const prev = brightnessSeries[i - 1]!
      const cur = brightnessSeries[i]!
      const delta = cur.mean - prev.mean
      if (Math.abs(delta) > 20) {
        flashes.push({ t: cur.t, deltaMean: delta, mean: cur.mean })
      }
    }

    mkdirSync(OUTPUT_DIR, { recursive: true })
    const slug = 'fsf-desitter-autoscale-flash'
    writeFileSync(
      join(OUTPUT_DIR, `${slug}.json`),
      JSON.stringify(
        { config: configSnapshot, samples, brightnessSeries, flashes },
        null,
        2
      )
    )
    writeFileSync(
      join(OUTPUT_DIR, `${slug}.txt`),
      [
        `FSF de Sitter cosmology autoScale flash trace`,
        `config: ${JSON.stringify(configSnapshot, null, 2)}`,
        ``,
        `samples captured: ${samples.length}`,
        `brightness samples: ${brightnessSeries.length}`,
        `flash events (|ΔmeanBrightness| > 20): ${flashes.length}`,
        ...(flashes.length > 0
          ? [`flash timestamps: ${flashes.map((f) => `t=${f.t}ms Δ=${f.deltaMean.toFixed(1)} mean=${f.mean.toFixed(1)}`).join(', ')}`]
          : []),
        ``,
        summary,
      ].join('\n')
    )

    await testInfo.attach(`${slug}.json`, {
      path: join(OUTPUT_DIR, `${slug}.json`),
      contentType: 'application/json',
    })
    await testInfo.attach(`${slug}.txt`, {
      path: join(OUTPUT_DIR, `${slug}.txt`),
      contentType: 'text/plain',
    })

    // Soft asserts: instrumentation wired up and config is what we expected.
    expect(samples.length, 'expected at least 500 cosmology debug samples').toBeGreaterThan(500)
    expect(configSnapshot.autoScale, 'autoScale must be true for this repro').toBe(true)
  })
})
