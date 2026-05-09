/**
 * GPU Timing Profiler E2E Test
 *
 * Reads per-pass GPU timing from the performance metrics store to identify
 * which passes consume the most GPU time. This reveals actual bottlenecks
 * beyond vsync-capped FPS measurements.
 *
 * Run: pnpm exec playwright test scripts/playwright/perf-gpu-timing.spec.ts
 */

import { expect, test } from '@playwright/test'

import {
  getFrameCount,
  getPerformanceMetrics,
  gotoMode,
  requireWebGPU,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.describe('GPU timing profiler', () => {
  test.beforeEach(async ({ page }) => {
    await requireWebGPU(page, test.info())
  })

  const modes = [
    { mode: 'harmonicOscillator', dim: 3, label: 'HO 3D' },
    { mode: 'harmonicOscillator', dim: 5, label: 'HO 5D' },
    { mode: 'hydrogenND', dim: 3, label: 'Hydrogen 3D' },
    { mode: 'hydrogenND', dim: 5, label: 'Hydrogen 5D' },
    { mode: 'hydrogenND', dim: 7, label: 'Hydrogen 7D' },
    { mode: 'hydrogenND', dim: 11, label: 'Hydrogen 11D' },
    { mode: 'tdseDynamics', dim: 3, label: 'TDSE 3D' },
    { mode: 'becDynamics', dim: 3, label: 'BEC 3D' },
  ] as const

  for (const { mode, dim, label } of modes) {
    test(`${label}: per-pass GPU timing`, async ({ page }) => {
      await gotoMode(page, mode, dim)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)

      // The perf collector publishes pass timings only when the monitor is
      // expanded — without this the test silently reports zeroed data.
      await page.evaluate(() => {
        const ui = window.__UI_STORE__
        if (!ui) throw new Error('no UI store on window')
        ui.getState().setShowPerfMonitor(true)
        ui.getState().setPerfMonitorExpanded(true)
      })

      // Let rendering stabilize for 2 seconds
      const fc = await getFrameCount(page)
      await waitForFrameAdvance(page, fc + 120)
      await page.waitForFunction(
        () => {
          const store = window.__PERFORMANCE_METRICS_STORE__
          if (!store) return false
          const metrics = store.getState()
          return (
            metrics.passTimings.some((p) => !p.skipped && p.cpuTimeMs > 0) &&
            metrics.cpuBreakdown.passesMs > 0
          )
        },
        undefined,
        { timeout: 10_000 }
      )

      // Read GPU timings
      const data = await getPerformanceMetrics(page)

      console.log(`\n[GPU-PROFILE] === ${label} ===`)
      console.log(`  FPS: ${data.fps.toFixed(1)}, frameTime: ${data.frameTime.toFixed(2)}ms`)
      console.log(`  totalGpuTimeMs: ${data.totalGpuTimeMs.toFixed(2)}ms`)
      console.log(
        `  CPU breakdown: setup=${data.cpuBreakdown.setupMs.toFixed(2)}ms, passes=${data.cpuBreakdown.passesMs.toFixed(2)}ms, submit=${data.cpuBreakdown.submitMs.toFixed(2)}ms`
      )

      // Sort passes by GPU time descending
      const sorted = [...data.passTimings]
        .filter((p) => !p.skipped && p.gpuTimeMs > 0.001)
        .sort((a, b) => b.gpuTimeMs - a.gpuTimeMs)

      for (const p of sorted) {
        const gpu = p.gpuTimeMs.toFixed(3)
        const compute = p.computeGpuTimeMs > 0 ? ` compute=${p.computeGpuTimeMs.toFixed(3)}` : ''
        const render = p.renderGpuTimeMs > 0 ? ` render=${p.renderGpuTimeMs.toFixed(3)}` : ''
        const cpu = p.cpuTimeMs > 0.01 ? ` cpu=${p.cpuTimeMs.toFixed(3)}` : ''
        console.log(`  ${p.passId}: ${gpu}ms${compute}${render}${cpu}`)
      }

      // Sanity check
      expect(data.fps).toBeGreaterThan(0)
      expect(
        data.passTimings.length,
        'expanded perf monitor must publish pass timings'
      ).toBeGreaterThan(0)
      expect(
        data.passTimings.some((p) => !p.skipped && p.cpuTimeMs > 0),
        'at least one active pass must report CPU timing'
      ).toBe(true)
      expect(
        data.cpuBreakdown.passesMs,
        'render-pass CPU breakdown must be populated'
      ).toBeGreaterThan(0)
      if (data.passTimings.some((p) => p.gpuTimeMs > 0)) {
        expect(
          data.totalGpuTimeMs,
          'total GPU time must match non-zero pass GPU timings'
        ).toBeGreaterThan(0)
      } else {
        console.log('  GPU timestamps unavailable or not yet populated; CPU pass timing verified')
      }
    })
  }
})
