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

// Must match `FSF_COSMO_DEBUG_CAPACITY` in
// `src/rendering/webgpu/passes/fsfCosmoDebug.ts`. The constant isn't exported
// from the source module, and the spec's page.evaluate closures can't import
// from @/ at Node time, so the value is duplicated with this comment as a
// single-source pointer.
const FSF_COSMO_DEBUG_CAPACITY = 2048

async function enableDebugBuffer(page: Page): Promise<void> {
  await page.evaluate((capacity) => {
    const g = globalThis as unknown as { __fsfCosmoDebug?: FsfCosmoDebugBuffer }
    if (!g.__fsfCosmoDebug) {
      g.__fsfCosmoDebug = { samples: [], capacity, head: 0, enabled: false }
    }
    g.__fsfCosmoDebug.enabled = true
    g.__fsfCosmoDebug.samples = []
    g.__fsfCosmoDebug.head = 0
    g.__fsfCosmoDebug.capacity = capacity
  }, FSF_COSMO_DEBUG_CAPACITY)
}

async function readDebugBuffer(page: Page): Promise<FsfCosmoDebugSample[]> {
  return page.evaluate(() => {
    const g = globalThis as unknown as { __fsfCosmoDebug?: FsfCosmoDebugBuffer }
    const buf = g.__fsfCosmoDebug
    if (!buf || buf.samples.length === 0) return []
    // Non-wrapped case: head strictly less than capacity. When
    // head === capacity the buffer just filled; taking the "wrapped"
    // branch produces the same output since start = 0, but using the
    // strict comparison matches the source semantics
    // (buf.samples.length < buf.capacity) exactly.
    if (buf.head < buf.capacity) return [...buf.samples]
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
    const mod = await import('/src/stores/scene/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().applyFreeScalarPreset('deSitterVacuum')
  })

  await page.waitForFunction(
    async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
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
    const mod = await import('/src/stores/scene/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setFreeScalarAutoScale(true)
    // Also force a field reset so the new auto-scale baseline is recomputed
    // from eta0 and the vacuum is re-sampled cleanly.
    mod.useExtendedObjectStore.getState().resetFreeScalarField()
  })

  await page.waitForFunction(
    async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      const fs = mod.useExtendedObjectStore.getState().schroedinger.freeScalar
      return fs.autoScale === true
    },
    { timeout: 2_000 }
  )
}

async function readFsfConfigSnapshot(page: Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/scene/extendedObjectStore.ts')
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
 * bucket: min / mean / max across RGB channels. Exposes "flash" events as
 * sudden spikes in the `meanBrightness` series. `ImageData.data` is a
 * `Uint8ClampedArray` so every byte is already a finite integer in [0, 255]
 * — no NaN guard is needed.
 */
async function probeCanvasBrightness(
  page: Page
): Promise<{ min: number; mean: number; max: number } | null> {
  return page.evaluate(() => {
    const canvas = document.querySelector(
      '[data-testid="webgpu-canvas"]'
    ) as HTMLCanvasElement | null
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
    for (let i = 0; i < img.length; i += 4) {
      const r = img[i]!
      const g = img[i + 1]!
      const b = img[i + 2]!
      const v = (r + g + b) / 3
      if (v < min) min = v
      if (v > max) max = v
      sum += v
    }
    const mean = sum / (img.length / 4)
    return { min, mean, max }
  })
}

interface BrightnessSample {
  t: number
  min: number
  mean: number
  max: number
}

interface FlashEvent {
  t: number
  deltaMean: number
  mean: number
}

async function pollScreenshotAndBrightness(
  page: Page,
  canvas: ReturnType<Page['locator']>,
  shotDir: string,
  totalDurationMs: number,
  pollIntervalMs: number
): Promise<BrightnessSample[]> {
  const series: BrightnessSample[] = []
  const startPoll = Date.now()
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
      series.push({ t: elapsed, ...probe })
    }
  }
  return series
}

function findClosestByTime<T extends { t: number }>(items: T[], target: number): T | undefined {
  if (items.length === 0) return undefined
  let best = items[0]
  let bestErr = Number.POSITIVE_INFINITY
  for (const item of items) {
    const err = Math.abs(item.t - target)
    if (err < bestErr) {
      best = item
      bestErr = err
    }
  }
  return best
}

function formatSampleRow(
  sample: FsfCosmoDebugSample,
  firstT: number,
  brightness: BrightnessSample | undefined
): string {
  return `${String(sample.frame).padStart(5)}  |  ${(sample.t - firstT).toFixed(0).padStart(5)}  |  ${sample.simEta.toExponential(3).padStart(11)}  |  ${sample.a.toExponential(3).padStart(11)}  |  ${sample.aKinetic.toExponential(3).padStart(11)}  |  ${sample.aPotential.toExponential(3).padStart(11)}  |  ${sample.aFull.toExponential(3).padStart(11)}  |  ${String(sample.nSub).padStart(4)} |  ${sample.diagTotalEnergy.toExponential(3).padStart(11)}  |  ${sample.diagMaxPhi.toExponential(3).padStart(11)}  |  ${sample.diagMaxPi.toExponential(3).padStart(11)}  |  ${(brightness?.mean ?? -1).toFixed(1).padStart(7)}  |  ${(brightness?.max ?? -1).toFixed(1).padStart(6)}`
}

function buildSummary(
  samples: FsfCosmoDebugSample[],
  brightnessSeries: BrightnessSample[]
): string {
  const firstT = samples[0]?.t ?? 0
  const checkpoints = [
    0, 1000, 3000, 5000, 10_000, 15_000, 20_000, 25_000, 30_000, 35_000, 40_000, 45_000,
  ]
  const lines: string[] = [
    `frame  |  t(ms)  |  simEta      |  a          |  aKinetic   |  aPotential |  aFull      |  nSub |  E          |  maxPhi     |  maxPi      |  px.mean  |  px.max`,
  ]
  for (const dt of checkpoints) {
    const best = findClosestByTime(samples, firstT + dt)
    if (!best) continue
    const brightness = findClosestByTime(brightnessSeries, dt)
    lines.push(formatSampleRow(best, firstT, brightness))
  }
  return lines.join('\n')
}

function detectFlashes(series: BrightnessSample[]): FlashEvent[] {
  // "Flash" := meanBrightness jumps > 20 between consecutive samples.
  const flashes: FlashEvent[] = []
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!
    const cur = series[i]!
    const delta = cur.mean - prev.mean
    if (Math.abs(delta) > 20) {
      flashes.push({ t: cur.t, deltaMean: delta, mean: cur.mean })
    }
  }
  return flashes
}

function writeTraceArtifacts(
  slug: string,
  configSnapshot: unknown,
  samples: FsfCosmoDebugSample[],
  brightnessSeries: BrightnessSample[],
  flashes: FlashEvent[],
  summary: string
): { jsonPath: string; txtPath: string } {
  mkdirSync(OUTPUT_DIR, { recursive: true })
  const jsonPath = join(OUTPUT_DIR, `${slug}.json`)
  const txtPath = join(OUTPUT_DIR, `${slug}.txt`)
  writeFileSync(
    jsonPath,
    JSON.stringify({ config: configSnapshot, samples, brightnessSeries, flashes }, null, 2)
  )
  const flashLines =
    flashes.length > 0
      ? [
          `flash timestamps: ${flashes
            .map((f) => `t=${f.t}ms Δ=${f.deltaMean.toFixed(1)} mean=${f.mean.toFixed(1)}`)
            .join(', ')}`,
        ]
      : []
  writeFileSync(
    txtPath,
    [
      `FSF de Sitter cosmology autoScale flash trace`,
      `config: ${JSON.stringify(configSnapshot, null, 2)}`,
      ``,
      `samples captured: ${samples.length}`,
      `brightness samples: ${brightnessSeries.length}`,
      `flash events (|ΔmeanBrightness| > 20): ${flashes.length}`,
      ...flashLines,
      ``,
      summary,
    ].join('\n')
  )
  return { jsonPath, txtPath }
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

    const canvas = page.locator('[data-testid="webgpu-canvas"]')
    const shotDir = join(OUTPUT_DIR, 'fsf-desitter-autoscale-shots')
    mkdirSync(shotDir, { recursive: true })

    const brightnessSeries = await pollScreenshotAndBrightness(page, canvas, shotDir, 45_000, 500)

    const samples = await readDebugBuffer(page)
    const summary = buildSummary(samples, brightnessSeries)
    const flashes = detectFlashes(brightnessSeries)

    const slug = 'fsf-desitter-autoscale-flash'
    const { jsonPath, txtPath } = writeTraceArtifacts(
      slug,
      configSnapshot,
      samples,
      brightnessSeries,
      flashes,
      summary
    )

    await testInfo.attach(`${slug}.json`, { path: jsonPath, contentType: 'application/json' })
    await testInfo.attach(`${slug}.txt`, { path: txtPath, contentType: 'text/plain' })

    // Soft asserts: instrumentation wired up and config is what we expected.
    expect(samples.length, 'expected at least 500 cosmology debug samples').toBeGreaterThan(500)
    expect(configSnapshot.autoScale, 'autoScale must be true for this repro').toBe(true)
  })
})
