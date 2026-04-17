/**
 * BEC Raymarcher A/B Profile
 *
 * Measures per-feature GPU cost in the BEC fragment raymarcher by compiling
 * shader variants with individual PROFILING_STRIP_* flags toggled. Runs at
 * DPR=2 so the M3 Max dev machine is GPU-bound (not VSync-capped).
 *
 * Covers three density regimes:
 *   groundState         — wide smooth fill (exercises empty-skip miss rate)
 *   singleVortex        — smooth fill + core hole (mixed density)
 *   quantumTurbulence   — dense tangled vortex cloud (worst case for skip)
 *
 * Run under the benchmark config (which is already wired to match this spec
 * via testMatch) rather than the default Playwright config:
 *   BENCHMARK_DPR=2 npx playwright test --config=playwright.benchmark.config.ts \
 *     scripts/playwright/bec-raymarch-profile.spec.ts
 *
 * Output: logs/bec_raymarch_profile_<timestamp>.json + per-preset cost table.
 */

import fs from 'node:fs'
import path from 'node:path'

import { test } from './fixtures'
import {
  applyBecPreset,
  getFrameCount,
  getPerformanceMetrics,
  gotoMode,
  requireWebGPU,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
  waitForSimulationFrames,
} from './helpers/app-helpers'

const DPR = Number(process.env.BENCHMARK_DPR ?? 2)
test.use({ deviceScaleFactor: DPR })

const WARMUP_FRAMES = 30
const SIM_WARMUP_FRAMES = 40
const MEASURE_FRAMES = 90

interface ProfilingStrip {
  gradient?: boolean
  lighting?: boolean
  emptySkip?: boolean
  adaptiveStep?: boolean
  halfSamples?: boolean
  compositing?: boolean
}

interface Variant {
  name: string
  strip: ProfilingStrip
}

const VARIANTS: Variant[] = [
  { name: 'baseline', strip: {} },
  { name: 'no-gradient', strip: { gradient: true } },
  { name: 'no-lighting', strip: { lighting: true } },
  { name: 'no-empty-skip', strip: { emptySkip: true } },
  { name: 'no-adaptive', strip: { adaptiveStep: true } },
  { name: 'half-samples', strip: { halfSamples: true } },
  { name: 'no-compositing', strip: { compositing: true } },
]

const PRESETS = [
  { preset: 'groundState', label: 'BEC 3D: groundState' },
  { preset: 'singleVortex', label: 'BEC 3D: singleVortex' },
  { preset: 'quantumTurbulence', label: 'BEC 3D: quantumTurbulence' },
] as const

interface Sample {
  preset: string
  variant: string
  schroMs: number
  renderMs: number
  computeMs: number
  fps: number
  frameMs: number
  gpuTotalMs: number
  viewportW: number
  viewportH: number
}

const allResults: Sample[] = []

test.setTimeout(600_000)

/**
 * Formats a variant-vs-baseline delta as a per-row improvement string.
 * Convention: delta = baseline − sample, so a positive delta means the
 * variant is faster than baseline and renders with a leading '-' (time
 * saved); a negative delta means the variant is slower and renders with
 * a leading '+' (time added). Intentionally inverted from the typical
 * "new − old" sign so the table reads as savings, not regressions.
 */
function formatDelta(delta: number): string {
  return `${delta >= 0 ? '-' : '+'}${Math.abs(delta).toFixed(3)}`
}

function printPresetTable(preset: string, samples: Sample[]): void {
  const baseline = samples.find((s) => s.variant === 'baseline')
  if (!baseline) return

  console.log(
    `\n  ${preset} (baseline schro=${baseline.schroMs.toFixed(3)}ms render=${baseline.renderMs.toFixed(3)}ms compute=${baseline.computeMs.toFixed(3)}ms)`
  )
  console.log('  ' + '-'.repeat(92))
  console.log(
    '  ' +
      'Variant'.padEnd(16) +
      'Schro'.padStart(10) +
      'Render'.padStart(10) +
      'Compute'.padStart(10) +
      'ΔSchro'.padStart(10) +
      'ΔRender'.padStart(10) +
      '%Render'.padStart(10) +
      'FPS'.padStart(7)
  )

  for (const s of samples) {
    const dSchro = baseline.schroMs - s.schroMs
    const dRender = baseline.renderMs - s.renderMs
    const pctRender = baseline.renderMs > 0 ? ((dRender / baseline.renderMs) * 100).toFixed(1) : '-'
    console.log(
      '  ' +
        s.variant.padEnd(16) +
        `${s.schroMs.toFixed(3)}ms`.padStart(10) +
        `${s.renderMs.toFixed(3)}ms`.padStart(10) +
        `${s.computeMs.toFixed(3)}ms`.padStart(10) +
        formatDelta(dSchro).padStart(10) +
        formatDelta(dRender).padStart(10) +
        `${pctRender}%`.padStart(10) +
        String(s.fps).padStart(7)
    )
  }
}

async function measure(
  page: import('@playwright/test').Page
): Promise<Omit<Sample, 'preset' | 'variant'>> {
  await page.evaluate(async () => {
    const perfStore =
      window.__PERFORMANCE_STORE__ ??
      (await import('/src/stores/performanceStore.ts')).usePerformanceStore
    perfStore.getState().setMaxFps(0)
    const uiStore = window.__UI_STORE__ ?? (await import('/src/stores/uiStore.ts')).useUIStore
    uiStore.setState({ showPerfMonitor: true, perfMonitorExpanded: true })
    const anim = await import('/src/stores/animationStore.ts')
    anim.useAnimationStore.getState().play()
  })

  const warmupStart = await getFrameCount(page)
  await waitForFrameAdvance(page, warmupStart + WARMUP_FRAMES)
  await waitForSimulationFrames(page, SIM_WARMUP_FRAMES)

  await page.waitForFunction(
    async () => {
      const mod = await import('/src/stores/performanceMetricsStore.ts')
      return mod.usePerformanceMetricsStore.getState().fps > 0
    },
    { timeout: 10_000 }
  )

  const measureStart = await getFrameCount(page)
  await waitForFrameAdvance(page, measureStart + MEASURE_FRAMES)

  const metrics = await getPerformanceMetrics(page)
  const viewport = await page.evaluate(async () => {
    const mod = await import('/src/stores/performanceMetricsStore.ts')
    const s = mod.usePerformanceMetricsStore.getState()
    return { width: s.viewport.width, height: s.viewport.height }
  })
  const schrod = metrics.passTimings.find((p) => p.passId === 'schroedinger')
  return {
    schroMs: schrod?.gpuTimeMs ?? 0,
    renderMs: schrod?.renderGpuTimeMs ?? 0,
    computeMs: schrod?.computeGpuTimeMs ?? 0,
    fps: metrics.fps,
    frameMs: metrics.frameTime,
    gpuTotalMs: metrics.totalGpuTimeMs,
    viewportW: viewport.width,
    viewportH: viewport.height,
  }
}

test.describe('BEC raymarch A/B profile', () => {
  test.describe.configure({ mode: 'serial' })

  for (const { preset, label } of PRESETS) {
    for (const variant of VARIANTS) {
      test(`${label} — ${variant.name}`, async ({ page }) => {
        if (Object.keys(variant.strip).length > 0) {
          const stripJson = JSON.stringify(variant.strip)
          await page.addInitScript(`globalThis.__PROFILING_STRIP__ = ${stripJson}`)
        }

        await page.goto('/')
        await requireWebGPU(page, test.info())

        await gotoMode(page, 'becDynamics', 3)
        await waitForRendererReady(page)
        await waitForShaderCompilation(page)
        await applyBecPreset(page, preset)
        await waitForShaderCompilation(page)

        const m = await measure(page)

        const sample: Sample = { preset, variant: variant.name, ...m }
        allResults.push(sample)

        console.log(
          `  [${variant.name.padEnd(15)}] ${label.padEnd(30)} schro=${m.schroMs.toFixed(3)}ms render=${m.renderMs.toFixed(3)}ms compute=${m.computeMs.toFixed(3)}ms fps=${m.fps}`
        )
      })
    }
  }

  test.afterAll(() => {
    if (allResults.length === 0) return

    console.log('\n' + '='.repeat(96))
    console.log(`  BEC RAYMARCH A/B — DPR=${DPR} — per-feature GPU cost on fragment raymarcher`)
    console.log('='.repeat(96))

    const byPreset = new Map<string, Sample[]>()
    for (const r of allResults) {
      const arr = byPreset.get(r.preset) ?? []
      arr.push(r)
      byPreset.set(r.preset, arr)
    }

    for (const [preset, samples] of byPreset) {
      printPresetTable(preset, samples)
    }
    console.log()

    const outDir = path.resolve(process.cwd(), 'logs')
    fs.mkdirSync(outDir, { recursive: true })
    const stamp = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 14)
    const outFile = path.join(outDir, `bec_raymarch_profile_${stamp}.json`)
    const stableFile = path.join(outDir, 'bec_raymarch_profile.json')
    // Derive viewport from actual measured samples — the metrics store
    // reports the true physical viewport including Playwright defaults and
    // any device-pixel-ratio scaling, which is more reliable than
    // hardcoding 1280×800·DPR.
    const firstWithViewport = allResults.find((r) => r.viewportW > 0 && r.viewportH > 0)
    const viewport = firstWithViewport
      ? { width: firstWithViewport.viewportW, height: firstWithViewport.viewportH }
      : { width: 1280 * DPR, height: 800 * DPR }
    const payload = {
      generated: new Date().toISOString(),
      dpr: DPR,
      viewport,
      results: allResults,
    }
    fs.writeFileSync(outFile, JSON.stringify(payload, null, 2))
    fs.writeFileSync(stableFile, JSON.stringify(payload, null, 2))
    console.log(`  Written → ${outFile}\n`)
  })
})
