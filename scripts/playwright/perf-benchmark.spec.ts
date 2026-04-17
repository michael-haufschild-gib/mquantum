/**
 * Render Performance Benchmark
 *
 * Measures per-pass GPU and CPU timing across quantum modes and dimensions.
 * Uses the existing GPU timestamp query infrastructure in the render graph.
 *
 * Run: pnpm exec playwright test scripts/playwright/perf-benchmark.spec.ts --workers=1
 * Output: structured JSON benchmark results to stdout
 */

import { test } from './fixtures'
import {
  gotoMode,
  type PassTimingSnapshot,
  requireWebGPU,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

// Benchmark configuration
const WARMUP_FRAMES = 30
const MEASURE_FRAMES = 120

interface BenchmarkSample {
  fps: number
  frameTimeMs: number
  cpuTimeMs: number
  totalGpuTimeMs: number
  passTimings: PassTimingSnapshot[]
  cpuBreakdown: { setupMs: number; passesMs: number; submitMs: number }
  vramMB: number
  viewport: { width: number; height: number }
}

interface BenchmarkResult {
  mode: string
  dimension: number
  label: string
  sample: BenchmarkSample
}

test.setTimeout(300_000) // 5 min per test

test.describe('render performance benchmark', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  const scenarios = [
    { mode: 'harmonicOscillator', dim: 3, label: 'HO 3D' },
    { mode: 'harmonicOscillator', dim: 5, label: 'HO 5D' },
    { mode: 'harmonicOscillator', dim: 7, label: 'HO 7D' },
    { mode: 'hydrogenND', dim: 3, label: 'Hydrogen 3D' },
    { mode: 'hydrogenND', dim: 5, label: 'Hydrogen 5D' },
    { mode: 'hydrogenND', dim: 7, label: 'Hydrogen 7D' },
    { mode: 'tdseDynamics', dim: 3, label: 'TDSE 3D' },
    { mode: 'freeScalarField', dim: 3, label: 'Free Scalar 3D' },
    { mode: 'becDynamics', dim: 3, label: 'BEC 3D' },
    { mode: 'diracEquation', dim: 3, label: 'Dirac 3D' },
  ] as const

  const allResults: BenchmarkResult[] = []

  for (const { mode, dim, label } of scenarios) {
    test(`benchmark: ${label}`, async ({ page }) => {
      // Navigate to mode
      await gotoMode(page, mode, dim)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)

      // Uncap FPS + enable performance monitor for timing collection
      await page.evaluate(async () => {
        const perfStore = (await import('/src/stores/performanceStore.ts')).usePerformanceStore
        perfStore.getState().setMaxFps(0)
        const mod = await import('/src/stores/uiStore.ts')
        mod.useUIStore.setState({ showPerfMonitor: true, perfMonitorExpanded: true })
      })

      // Start animation for dynamic scenes
      await page.evaluate(async () => {
        const mod = await import('/src/stores/animationStore.ts')
        mod.useAnimationStore.getState().play()
      })

      // Warmup: let the renderer settle, GPU caches warm, perf monitor activate
      await page.waitForFunction(
        (warmupFrames: number) => {
          const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
          return parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10) > warmupFrames
        },
        WARMUP_FRAMES,
        { timeout: 30_000 }
      )

      // Wait for the perf collector to publish at least one stats cycle (fps > 0)
      await page.waitForFunction(
        async () => {
          const mod = await import('/src/stores/performanceMetricsStore.ts')
          return mod.usePerformanceMetricsStore.getState().fps > 0
        },
        { timeout: 10_000 }
      )

      // Wait for measurement frames
      const startFrame = await page.evaluate(() => {
        const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
        return parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10)
      })

      await page.waitForFunction(
        ({ start, count }: { start: number; count: number }) => {
          const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
          return parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10) > start + count
        },
        { start: startFrame, count: MEASURE_FRAMES },
        { timeout: 60_000 }
      )

      // Wait for final stats to publish (fps > 0 from the measurement window)
      await page.waitForFunction(
        async () => {
          const mod = await import('/src/stores/performanceMetricsStore.ts')
          return mod.usePerformanceMetricsStore.getState().fps > 0
        },
        { timeout: 5_000 }
      )

      // Collect metrics from performanceMetricsStore
      const sample = await page.evaluate(async (): Promise<BenchmarkSample> => {
        const mod = await import('/src/stores/performanceMetricsStore.ts')
        const s = mod.usePerformanceMetricsStore.getState()
        return {
          fps: s.fps,
          frameTimeMs: s.frameTime,
          cpuTimeMs: s.cpuTime,
          totalGpuTimeMs: s.totalGpuTimeMs,
          passTimings: s.passTimings.map((pt) => ({
            passId: pt.passId,
            gpuTimeMs: pt.gpuTimeMs,
            computeGpuTimeMs: pt.computeGpuTimeMs ?? 0,
            renderGpuTimeMs: pt.renderGpuTimeMs ?? 0,
            cpuTimeMs: pt.cpuTimeMs,
            skipped: pt.skipped,
          })),
          cpuBreakdown: { ...s.cpuBreakdown },
          vramMB: s.vram.total,
          viewport: { width: s.viewport.width, height: s.viewport.height },
        }
      })

      const result: BenchmarkResult = { mode, dimension: dim, label, sample }
      allResults.push(result)

      // Print per-scenario results immediately
      console.log(`\n━━━ ${label} ━━━`)
      console.log(
        `  FPS: ${sample.fps} | Frame: ${sample.frameTimeMs.toFixed(2)}ms | CPU: ${sample.cpuTimeMs.toFixed(2)}ms | GPU total: ${sample.totalGpuTimeMs.toFixed(2)}ms`
      )
      console.log(
        `  VRAM: ${sample.vramMB.toFixed(1)}MB | Viewport: ${sample.viewport.width}×${sample.viewport.height}`
      )
      console.log(
        `  CPU breakdown — setup: ${sample.cpuBreakdown.setupMs.toFixed(2)}ms | passes: ${sample.cpuBreakdown.passesMs.toFixed(2)}ms | submit: ${sample.cpuBreakdown.submitMs.toFixed(2)}ms`
      )

      if (sample.passTimings.length > 0) {
        console.log('  Per-pass timing:')
        for (const pt of sample.passTimings) {
          if (pt.skipped) continue
          const gpuStr = pt.gpuTimeMs > 0 ? `GPU ${pt.gpuTimeMs.toFixed(3)}ms` : 'GPU N/A'
          console.log(
            `    ${pt.passId.padEnd(28)} ${gpuStr.padEnd(16)} CPU ${pt.cpuTimeMs.toFixed(3)}ms`
          )
        }
      }
    })
  }

  test.afterAll(() => {
    if (allResults.length > 0) {
      console.log('\n\n════════════════════════════════════════════')
      console.log('  BENCHMARK SUMMARY')
      console.log('════════════════════════════════════════════')
      for (const r of allResults) {
        const s = r.sample
        const heaviest = [...s.passTimings]
          .filter((p) => !p.skipped)
          .sort((a, b) => b.gpuTimeMs - a.gpuTimeMs)
        const bottleneck = heaviest[0]
        console.log(
          `  ${r.label.padEnd(22)} FPS: ${String(s.fps).padStart(3)} | ` +
            `Frame: ${s.frameTimeMs.toFixed(1).padStart(6)}ms | ` +
            `GPU: ${s.totalGpuTimeMs.toFixed(1).padStart(6)}ms | ` +
            `Bottleneck: ${bottleneck ? `${bottleneck.passId} (${bottleneck.gpuTimeMs.toFixed(2)}ms)` : 'N/A'}`
        )
      }
      console.log('════════════════════════════════════════════\n')

      // Output machine-readable JSON
      console.log('BENCHMARK_JSON_START')
      console.log(JSON.stringify(allResults, null, 2))
      console.log('BENCHMARK_JSON_END')
    }
  })
})

// Higher-resolution BEC scenario — forces GPU-bound conditions on M3 Max where
// the default 1280x800 hits VSync. At DPR=2 the fragment raymarcher does ~4×
// the per-pixel work, making render-side optimizations measurable.
test.describe('render performance benchmark @2x', () => {
  test.use({ deviceScaleFactor: 2 })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  const hiResScenarios = [
    { mode: 'becDynamics', dim: 3, label: 'BEC 3D @2x' },
    { mode: 'tdseDynamics', dim: 3, label: 'TDSE 3D @2x' },
  ] as const

  const hiResResults: BenchmarkResult[] = []

  for (const { mode, dim, label } of hiResScenarios) {
    test(`benchmark: ${label}`, async ({ page }) => {
      await gotoMode(page, mode, dim)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)

      await page.evaluate(async () => {
        const perfStore = (await import('/src/stores/performanceStore.ts')).usePerformanceStore
        perfStore.getState().setMaxFps(0)
        const mod = await import('/src/stores/uiStore.ts')
        mod.useUIStore.setState({ showPerfMonitor: true, perfMonitorExpanded: true })
      })

      await page.evaluate(async () => {
        const mod = await import('/src/stores/animationStore.ts')
        mod.useAnimationStore.getState().play()
      })

      await page.waitForFunction(
        (warmupFrames: number) => {
          const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
          return parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10) > warmupFrames
        },
        WARMUP_FRAMES,
        { timeout: 30_000 }
      )

      await page.waitForFunction(
        async () => {
          const mod = await import('/src/stores/performanceMetricsStore.ts')
          return mod.usePerformanceMetricsStore.getState().fps > 0
        },
        { timeout: 10_000 }
      )

      const startFrame = await page.evaluate(() => {
        const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
        return parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10)
      })

      await page.waitForFunction(
        ({ start, count }: { start: number; count: number }) => {
          const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
          return parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10) > start + count
        },
        { start: startFrame, count: MEASURE_FRAMES },
        { timeout: 60_000 }
      )

      // Collect a full BenchmarkSample so the @2x entries flow through the
      // same BENCHMARK_JSON pipeline as the primary scenarios and can be
      // aggregated by scripts/bench-summary.js.
      const sample = await page.evaluate(async (): Promise<BenchmarkSample> => {
        const mod = await import('/src/stores/performanceMetricsStore.ts')
        const s = mod.usePerformanceMetricsStore.getState()
        return {
          fps: s.fps,
          frameTimeMs: s.frameTime,
          cpuTimeMs: s.cpuTime,
          totalGpuTimeMs: s.totalGpuTimeMs,
          passTimings: s.passTimings.map((pt) => ({
            passId: pt.passId,
            gpuTimeMs: pt.gpuTimeMs,
            computeGpuTimeMs: pt.computeGpuTimeMs ?? 0,
            renderGpuTimeMs: pt.renderGpuTimeMs ?? 0,
            cpuTimeMs: pt.cpuTimeMs,
            skipped: pt.skipped,
          })),
          cpuBreakdown: { ...s.cpuBreakdown },
          vramMB: s.vram.total,
          viewport: { width: s.viewport.width, height: s.viewport.height },
        }
      })

      const schrod = sample.passTimings.find((p) => p.passId === 'schroedinger')
      const result: BenchmarkResult = { mode, dimension: dim, label, sample }
      hiResResults.push(result)

      console.log(`\n━━━ ${label} ━━━`)
      console.log(
        `  FPS: ${sample.fps} | Frame: ${sample.frameTimeMs.toFixed(2)}ms | GPU total: ${sample.totalGpuTimeMs.toFixed(2)}ms`
      )
      if (schrod) {
        console.log(
          `  Schroedinger: total=${schrod.gpuTimeMs.toFixed(3)}ms render=${schrod.renderGpuTimeMs.toFixed(3)}ms compute=${schrod.computeGpuTimeMs.toFixed(3)}ms`
        )
      }
      console.log(`  Viewport: ${sample.viewport.width}×${sample.viewport.height} (DPR=2)`)
    })
  }

  test.afterAll(() => {
    if (hiResResults.length > 0) {
      console.log('BENCHMARK_JSON_START')
      console.log(JSON.stringify(hiResResults, null, 2))
      console.log('BENCHMARK_JSON_END')
    }
  })
})
