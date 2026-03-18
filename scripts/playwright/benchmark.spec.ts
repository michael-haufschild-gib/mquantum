/**
 * Performance benchmark: scaling analysis across quantum modes and dimensions.
 *
 * Exercises every quantum mode at representative dimensions, collects frame
 * timing from the existing performanceMetricsStore (which aggregates CPU
 * frame time, smoothed FPS, and per-frame draw stats), and prints a markdown
 * scaling table suitable for thesis appendices or CI logs.
 *
 * Assertions are structural, not absolute:
 * - Scaling sanity: dim=11 frame time < dim=3 frame time * 20x
 * - Monotonic trend: higher dims are not faster than lower dims (within noise)
 * - No crashes: every configuration produces rendered frames
 *
 * These catch O(n!) regressions and broken shader specialization without
 * flaking on different GPU hardware.
 */

import { expect, test } from '@playwright/test'

import {
  collectFatalGpuErrors,
  getFrameCount,
  type PerfMetricsSnapshot,
  getPerformanceMetrics,
  gotoMode,
  hasWebGPU,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

// ─── Configuration ───────────────────────────────────────────────────────────

/** Frames to discard after shader compilation (GPU/driver warm-up). */
const WARMUP_FRAMES = 30

/** Frames to measure after warm-up. */
const MEASURE_FRAMES = 60

/**
 * Maximum allowed ratio between dim=11 and dim=3 frame times.
 * Expected ~3-4x from physics (O(dim) wavefunction eval per grid point).
 * 20x catches catastrophic regressions while tolerating GPU variance.
 */
const MAX_SCALING_RATIO = 20

/**
 * Minimum ratio for monotonic trend check.
 * frameTime(dim+2) >= frameTime(dim) * MIN_MONOTONIC_RATIO.
 * 0.5 allows for measurement noise without missing inversions.
 */
const MIN_MONOTONIC_RATIO = 0.5

/** All benchmark configurations. */
const BENCHMARK_MATRIX = [
  // Dimension sweeps for scalable analytic modes
  { mode: 'harmonicOscillator', dim: 3, label: 'HO 3D' },
  { mode: 'harmonicOscillator', dim: 5, label: 'HO 5D' },
  { mode: 'harmonicOscillator', dim: 7, label: 'HO 7D' },
  { mode: 'harmonicOscillator', dim: 9, label: 'HO 9D' },
  { mode: 'harmonicOscillator', dim: 11, label: 'HO 11D' },
  { mode: 'hydrogenND', dim: 3, label: 'Hydrogen 3D' },
  { mode: 'hydrogenND', dim: 5, label: 'Hydrogen 5D' },
  { mode: 'hydrogenND', dim: 7, label: 'Hydrogen 7D' },
  { mode: 'hydrogenND', dim: 9, label: 'Hydrogen 9D' },
  { mode: 'hydrogenND', dim: 11, label: 'Hydrogen 11D' },
  // Compute-pass modes at reference dimension
  { mode: 'freeScalarField', dim: 3, label: 'Free Scalar 3D' },
  { mode: 'tdseDynamics', dim: 3, label: 'TDSE 3D' },
  { mode: 'becDynamics', dim: 3, label: 'BEC 3D' },
  { mode: 'diracEquation', dim: 3, label: 'Dirac 3D' },
] as const

// ─── Types ───────────────────────────────────────────────────────────────────

interface BenchmarkResult {
  label: string
  mode: string
  dim: number
  meanFps: number
  meanFrameMs: number
  p95FrameMs: number
  meanCpuMs: number
  vramMB: number
  totalGpuMs: number
  passTimings: Record<string, number>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Collect frame timing samples by polling performanceMetricsStore across
 * multiple frame advances. The store publishes at 2Hz with smoothed values,
 * so we sample after each batch of frames to build a time series.
 */
async function collectTimingSamples(
  page: import('@playwright/test').Page,
  frameCount: number
): Promise<PerfMetricsSnapshot[]> {
  const samples: PerfMetricsSnapshot[] = []
  const batchSize = 10
  let remaining = frameCount

  while (remaining > 0) {
    const batch = Math.min(batchSize, remaining)
    const current = await getFrameCount(page)
    await waitForFrameAdvance(page, current + batch)
    samples.push(await getPerformanceMetrics(page))
    remaining -= batch
  }

  return samples
}

/** Compute mean of a number array. */
function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

/** Compute p95 (95th percentile) of a number array. */
function p95(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil(sorted.length * 0.95) - 1
  return sorted[Math.max(0, index)]!
}

/** Format a number to fixed decimal places, right-aligned. */
function fmt(value: number, decimals = 1): string {
  return value.toFixed(decimals)
}

/** Format top-3 heaviest passes as a compact string. */
function formatTopPasses(passTimings: Record<string, number>): string {
  const sorted = Object.entries(passTimings).sort(([, a], [, b]) => b - a)
  return sorted
    .slice(0, 3)
    .map(([id, ms]) => `${id}:${fmt(ms)}`)
    .join(', ')
}

/** Print the results table to stdout. */
function printResultsTable(results: BenchmarkResult[]): void {
  const header =
    '| Mode | Dim | Mean FPS | Mean Frame (ms) | P95 Frame (ms) | Mean CPU (ms) | GPU Total (ms) | VRAM (MB) | Top Passes |'
  const separator = '|-|-|-|-|-|-|-|-|-|'

  const rows = results.map(
    (r) =>
      `| ${r.label.padEnd(16)} | ${String(r.dim).padStart(3)} | ${fmt(r.meanFps).padStart(8)} | ${fmt(r.meanFrameMs).padStart(15)} | ${fmt(r.p95FrameMs).padStart(14)} | ${fmt(r.meanCpuMs).padStart(13)} | ${fmt(r.totalGpuMs).padStart(14)} | ${fmt(r.vramMB).padStart(9)} | ${formatTopPasses(r.passTimings)} |`
  )

  const table = ['\n## Performance Scaling Table\n', header, separator, ...rows, ''].join('\n')

  // eslint-disable-next-line no-console
  console.log(table)

  // Print per-pass breakdown matrix
  const allPasses = new Set<string>()
  for (const r of results) {
    for (const passId of Object.keys(r.passTimings)) {
      allPasses.add(passId)
    }
  }

  if (allPasses.size > 0) {
    const passIds = [...allPasses].sort()
    const passHeader = `| Mode | ${passIds.join(' | ')} |`
    const passSep = `|-|${passIds.map(() => '-').join('|')}|`
    const passRows = results.map((r) => {
      const cells = passIds.map((id) => {
        const ms = r.passTimings[id]
        return ms !== undefined ? fmt(ms).padStart(id.length) : '—'.padStart(id.length)
      })
      return `| ${r.label.padEnd(16)} | ${cells.join(' | ')} |`
    })

    const passTable = [
      '\n## Per-Pass GPU Timing Matrix (ms)\n',
      passHeader,
      passSep,
      ...passRows,
      '',
    ].join('\n')

    // eslint-disable-next-line no-console
    console.log(passTable)
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('performance benchmark', () => {
  test.setTimeout(300_000) // 5 min — full matrix takes time

  const results: BenchmarkResult[] = []

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    test.skip(!(await hasWebGPU(page)), 'WebGPU not available')
  })

  for (const { mode, dim, label } of BENCHMARK_MATRIX) {
    test(`benchmark ${label}`, async ({ page }) => {
      const gpuErrors = collectFatalGpuErrors(page)

      // Navigate and wait for full pipeline readiness
      await gotoMode(page, mode, dim)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)

      // Uncap FPS limiter so frame times reflect actual GPU workload,
      // not the 60fps vsync ceiling. 0 = uncapped (transient, not persisted).
      // Also enable perf monitor so WebGPUStatsCollector publishes metrics.
      await page.evaluate(async () => {
        const perfMod = await import('/src/stores/performanceStore.ts')
        perfMod.usePerformanceStore.getState().setMaxFps(0)
        const uiMod = await import('/src/stores/uiStore.ts')
        uiMod.useUIStore.setState({ showPerfMonitor: true, perfMonitorExpanded: true })
      })

      // Warm-up: discard initial frames (driver JIT, cache fill, FPS limiter transition)
      const warmupStart = await getFrameCount(page)
      await waitForFrameAdvance(page, warmupStart + WARMUP_FRAMES)

      // Measure: collect timing samples over MEASURE_FRAMES
      const samples = await collectTimingSamples(page, MEASURE_FRAMES)

      // Extract frame time series from samples
      const frameTimes = samples.map((s) => s.frameTime).filter((t) => t > 0)
      const cpuTimes = samples.map((s) => s.cpuTime).filter((t) => t > 0)
      const fpsValues = samples.map((s) => s.fps).filter((f) => f > 0)
      const lastSample = samples[samples.length - 1]!

      // Capture per-pass GPU timing from the last sample
      const passTimings: Record<string, number> = {}
      for (const pt of lastSample.passTimings) {
        if (!pt.skipped && pt.gpuTimeMs > 0) {
          passTimings[pt.passId] = pt.gpuTimeMs
        }
      }

      const result: BenchmarkResult = {
        label,
        mode,
        dim,
        meanFps: mean(fpsValues),
        meanFrameMs: mean(frameTimes),
        p95FrameMs: p95(frameTimes),
        meanCpuMs: mean(cpuTimes),
        vramMB: lastSample.vramMB,
        totalGpuMs: lastSample.totalGpuTimeMs,
        passTimings,
      }

      results.push(result)

      // Annotate test with timing data for Playwright report
      test.info().annotations.push({
        type: 'benchmark',
        description: `${label}: ${fmt(result.meanFps)} FPS, ${fmt(result.meanFrameMs)} ms/frame, ${fmt(result.meanCpuMs)} ms CPU`,
      })

      // Assert: no fatal GPU errors
      expect(gpuErrors, `${label}: no fatal GPU errors`).toEqual([])

      // Assert: renderer produced measurable frames
      expect(frameTimes.length, `${label}: collected timing samples`).toBeGreaterThan(0)
    })
  }

  test('scaling analysis: HO dimension sweep', async ({ page }) => {
    // This test runs after the individual benchmarks and validates scaling
    // relationships across the collected HO results.
    test.skip(!(await hasWebGPU(page)), 'WebGPU not available')

    const hoResults = results
      .filter((r) => r.mode === 'harmonicOscillator')
      .sort((a, b) => a.dim - b.dim)

    // Need at least dim=3 and dim=11 to check scaling
    const dim3 = hoResults.find((r) => r.dim === 3)
    const dim11 = hoResults.find((r) => r.dim === 11)

    if (!dim3 || !dim11) {
      test.skip(true, 'HO dim=3 and dim=11 results not available')
      return
    }

    // Scaling sanity: dim=11 should not be catastrophically slower
    const ratio = dim11.meanFrameMs / Math.max(dim3.meanFrameMs, 0.1)
    expect(
      ratio,
      `HO scaling ratio dim=11/dim=3 = ${fmt(ratio, 2)}x (max ${MAX_SCALING_RATIO}x)`
    ).toBeLessThan(MAX_SCALING_RATIO)

    // Monotonic trend: each step should not be dramatically faster than previous
    for (let i = 1; i < hoResults.length; i++) {
      const prev = hoResults[i - 1]!
      const curr = hoResults[i]!
      expect(
        curr.meanFrameMs,
        `HO dim=${curr.dim} (${fmt(curr.meanFrameMs)}ms) should not be much faster than dim=${prev.dim} (${fmt(prev.meanFrameMs)}ms)`
      ).toBeGreaterThanOrEqual(prev.meanFrameMs * MIN_MONOTONIC_RATIO)
    }

    // Log scaling analysis
    test.info().annotations.push({
      type: 'scaling',
      description: `HO dim=11/dim=3 ratio: ${fmt(ratio, 2)}x`,
    })
  })

  test('scaling analysis: hydrogen dimension sweep', async ({ page }) => {
    test.skip(!(await hasWebGPU(page)), 'WebGPU not available')

    const hResults = results.filter((r) => r.mode === 'hydrogenND').sort((a, b) => a.dim - b.dim)

    const dim3 = hResults.find((r) => r.dim === 3)
    const dim11 = hResults.find((r) => r.dim === 11)

    if (!dim3 || !dim11) {
      test.skip(true, 'Hydrogen dim=3 and dim=11 results not available')
      return
    }

    const ratio = dim11.meanFrameMs / Math.max(dim3.meanFrameMs, 0.1)
    expect(
      ratio,
      `Hydrogen scaling ratio dim=11/dim=3 = ${fmt(ratio, 2)}x (max ${MAX_SCALING_RATIO}x)`
    ).toBeLessThan(MAX_SCALING_RATIO)

    test.info().annotations.push({
      type: 'scaling',
      description: `Hydrogen dim=11/dim=3 ratio: ${fmt(ratio, 2)}x`,
    })
  })

  test.afterAll(() => {
    if (results.length > 0) {
      printResultsTable(results)
    }
  })
})
