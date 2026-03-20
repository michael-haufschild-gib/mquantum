/**
 * Shader A/B Profiling — measures actual GPU cost of each raymarch code path.
 *
 * Compiles shader variants with specific hot-path components stripped out,
 * benchmarks each against the baseline, and reports the delta. This is the
 * poor man's GPU profiler: if disabling gradient saves 0.5ms, gradient costs 0.5ms.
 *
 * Variants:
 *   baseline        — full shader, no changes
 *   no-gradient     — replace 6-fetch gradient with constant normal
 *   no-lighting     — replace lit emission with flat baseColor
 *   no-empty-skip   — disable empty-region skip (force all samples)
 *   no-adaptive     — disable adaptive stepping (uniform step size)
 *   half-samples    — cap iterations at 64 instead of 128
 *   no-compositing  — skip gradient+emission+compositing entirely
 *
 * Run:
 *   BENCHMARK_DPR=2 npx playwright test scripts/playwright/shader-ab-profiling.spec.ts --workers=1
 */

import { test } from '@playwright/test'

import {
  getFrameCount,
  getPerformanceMetrics,
  gotoMode,
  requireWebGPU,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.setTimeout(600_000)

const DPR = Number(process.env.BENCHMARK_DPR ?? 2)
test.use({ deviceScaleFactor: DPR })

const WARMUP_FRAMES = 30
const MEASURE_FRAMES = 60

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

// Modes to profile — heaviest from each category
const MODES = [
  { mode: 'hydrogenND', dim: 7, label: 'Hydrogen 7D' },
  { mode: 'becDynamics', dim: 3, label: 'BEC 3D' },
  { mode: 'harmonicOscillator', dim: 9, label: 'HO 9D' },
  { mode: 'diracEquation', dim: 3, label: 'Dirac 3D' },
] as const

interface ABResult {
  mode: string
  variant: string
  schrodingerMs: number
  renderMs: number
  computeMs: number
  fps: number
}

const allResults: ABResult[] = []

/** Measure GPU time for the schroedinger pass after warmup. */
async function measureSchroedinger(page: import('@playwright/test').Page) {
  // Uncap FPS
  await page.evaluate(async () => {
    const perfStore =
      window.__PERFORMANCE_STORE__ ??
      (await import('/src/stores/performanceStore.ts')).usePerformanceStore
    perfStore.getState().setMaxFps(0)
    const uiStore = window.__UI_STORE__ ?? (await import('/src/stores/uiStore.ts')).useUIStore
    uiStore.setState({ showPerfMonitor: true, perfMonitorExpanded: true })
  })

  // Warmup
  const warmupStart = await getFrameCount(page)
  await waitForFrameAdvance(page, warmupStart + WARMUP_FRAMES)

  // Measure
  const measureStart = await getFrameCount(page)
  await waitForFrameAdvance(page, measureStart + MEASURE_FRAMES)
  await page.waitForTimeout(300)

  const metrics = await getPerformanceMetrics(page)
  const schrod = metrics.passTimings.find((p) => p.passId === 'schroedinger')

  return {
    schrodingerMs: schrod?.gpuTimeMs ?? 0,
    renderMs: schrod?.renderGpuTimeMs ?? 0,
    computeMs: schrod?.computeGpuTimeMs ?? 0,
    fps: metrics.fps,
  }
}

for (const { mode, dim, label } of MODES) {
  test.describe(`${label} shader A/B`, () => {
    for (const variant of VARIANTS) {
      test(`${label} — ${variant.name}`, async ({ page }) => {
        // Set profiling flags BEFORE navigation so the shader compiles with them
        if (Object.keys(variant.strip).length > 0) {
          const stripJson = JSON.stringify(variant.strip)
          await page.addInitScript(`globalThis.__PROFILING_STRIP__ = ${stripJson}`)
        }

        await page.goto('/')
        await requireWebGPU(page, test.info())

        // Navigate to mode — shader compiles with profiling flags already set
        await gotoMode(page, mode, dim)
        await waitForRendererReady(page)
        await waitForShaderCompilation(page)

        // Measure
        const result = await measureSchroedinger(page)

        allResults.push({
          mode: label,
          variant: variant.name,
          ...result,
        })

        test.info().annotations.push({
          type: 'profiling',
          description: `${label} ${variant.name}: schroedinger=${result.schrodingerMs.toFixed(2)}ms (compute=${result.computeMs.toFixed(2)} render=${result.renderMs.toFixed(2)})`,
        })
      })
    }
  })
}

test.describe('A/B results', () => {
  test('print cost analysis', async ({ page }) => {
    test.skip(allResults.length === 0, 'No results collected')
    await page.goto('/')

    // Group by mode
    const modes = [...new Set(allResults.map((r) => r.mode))]

    console.log('\n' + '='.repeat(90))
    console.log('  SHADER A/B PROFILING - Actual GPU Cost Per Code Path')
    console.log('  Resolution: ' + 1280 * DPR + 'x' + 800 * DPR + ' (DPR=' + DPR + ')')
    console.log('='.repeat(90))

    for (const mode of modes) {
      const modeResults = allResults.filter((r) => r.mode === mode)
      const baseline = modeResults.find((r) => r.variant === 'baseline')
      if (!baseline) continue

      const bl = baseline
      console.log(
        '\n  ' +
          mode +
          ' (baseline: ' +
          bl.schrodingerMs.toFixed(2) +
          'ms total, compute=' +
          bl.computeMs.toFixed(2) +
          'ms render=' +
          bl.renderMs.toFixed(2) +
          'ms)'
      )
      console.log('  ' + '-'.repeat(86))
      console.log(
        '  ' +
          'Variant'.padEnd(20) +
          ' ' +
          'Total'.padStart(8) +
          ' ' +
          'Render'.padStart(8) +
          ' ' +
          'Compute'.padStart(8) +
          ' ' +
          'Delta'.padStart(8) +
          ' ' +
          'Cost'.padStart(10) +
          ' ' +
          'FPS'.padStart(5)
      )

      for (const r of modeResults) {
        const delta = bl.schrodingerMs - r.schrodingerMs
        const cost =
          delta > 0.01
            ? delta.toFixed(2) + 'ms'
            : delta < -0.01
              ? '+' + (-delta).toFixed(2) + 'ms'
              : '--'
        const sign = delta >= 0 ? '-' : '+'
        console.log(
          '  ' +
            r.variant.padEnd(20) +
            ' ' +
            (r.schrodingerMs.toFixed(2) + 'ms').padStart(8) +
            ' ' +
            (r.renderMs.toFixed(2) + 'ms').padStart(8) +
            ' ' +
            (r.computeMs.toFixed(2) + 'ms').padStart(8) +
            ' ' +
            (sign + Math.abs(delta).toFixed(2) + 'ms').padStart(8) +
            ' ' +
            cost.padStart(10) +
            ' ' +
            String(r.fps).padStart(5)
        )
      }
      console.log()
    }

    // Machine-readable output
    console.log('SHADER_AB_JSON_START')
    console.log(JSON.stringify(allResults, null, 2))
    console.log('SHADER_AB_JSON_END')
  })
})
