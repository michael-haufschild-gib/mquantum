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

      // Let rendering stabilize for 2 seconds
      const fc = await getFrameCount(page)
      await waitForFrameAdvance(page, fc + 120)

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
    })
  }
})
