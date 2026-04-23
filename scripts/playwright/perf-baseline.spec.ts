/**
 * Performance Baseline Measurement
 *
 * Deterministic, repeatable measurement of the metrics that matter to users:
 *   - Cold-load TTI: navigateStart → renderer ready → first frame
 *   - Shader compile time (first render graph setup)
 *   - Steady-state FPS, CPU frame time, pass timings
 *
 * Run:  pnpm exec playwright test scripts/playwright/perf-baseline.spec.ts --config=playwright.benchmark.config.ts
 * Output: baseline.json in logs/ (structured results the audit can diff against).
 */

import { mkdirSync, writeFileSync } from 'fs'
import { dirname } from 'path'

import { test } from './fixtures'
import {
  getFrameCount,
  getPerformanceMetrics,
  gotoMode,
  requireWebGPU,
  waitForFirstFrame,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.setTimeout(120_000)

interface BaselineSample {
  label: string
  mode: string
  dim: number
  // TTI components (ms from navigateStart)
  nav: {
    navigationToRendererReadyMs: number
    navigationToFirstFrameMs: number
    rendererReadyToFirstFrameMs: number
    domContentLoadedMs: number
    loadEventEndMs: number
  }
  // After warmup — steady-state
  steady: {
    fps: number
    frameTimeMs: number
    cpuTimeMs: number
    cpuSetupMs: number
    cpuPassesMs: number
    cpuSubmitMs: number
    totalGpuTimeMs: number
    vramMB: number
    topPasses: Array<{ passId: string; cpuMs: number; gpuMs: number }>
  }
}

const SCENARIOS = [
  { mode: 'harmonicOscillator', dim: 3, label: 'HO-3D' },
  { mode: 'harmonicOscillator', dim: 7, label: 'HO-7D' },
  { mode: 'hydrogenND', dim: 3, label: 'Hydrogen-3D' },
  { mode: 'tdseDynamics', dim: 3, label: 'TDSE-3D' },
  { mode: 'diracEquation', dim: 3, label: 'Dirac-3D' },
] as const

const WARMUP_FRAMES = 40
const MEASURE_FRAMES = 120

test.describe('perf baseline', () => {
  const results: BaselineSample[] = []

  test.afterAll(async () => {
    const out = {
      collectedAt: new Date().toISOString(),
      chromium: 'chrome-channel',
      results,
    }
    const outPath = 'logs/perf-baseline.json'
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, JSON.stringify(out, null, 2))
    // Compact console summary

    console.log('\n==== PERF BASELINE SUMMARY ====')
    for (const r of results) {
      console.log(
        `${r.label.padEnd(18)}  TTI(first-frame)=${r.nav.navigationToFirstFrameMs.toFixed(0)}ms  ` +
          `rendererReady=${r.nav.navigationToRendererReadyMs.toFixed(0)}ms  ` +
          `fps=${r.steady.fps.toFixed(1)}  cpu=${r.steady.cpuTimeMs.toFixed(2)}ms  ` +
          `cpuBreakdown(setup/passes/submit)=${r.steady.cpuSetupMs.toFixed(2)}/${r.steady.cpuPassesMs.toFixed(2)}/${r.steady.cpuSubmitMs.toFixed(2)}  ` +
          `gpu=${r.steady.totalGpuTimeMs.toFixed(2)}ms`
      )
    }
    console.log('================================\n')
  })

  for (const scen of SCENARIOS) {
    test(`baseline: ${scen.label}`, async ({ page }) => {
      // Hard-reload each scenario to measure cold TTI. `performance.now()`
      // is reset per document (its time origin is set at navigation start),
      // so timings sampled before navigation can't be subtracted from those
      // sampled after — we instead read post-navigation timestamps directly,
      // which already represent ms-from-navigation-start.
      await gotoMode(page, scen.mode, scen.dim)
      await requireWebGPU(page, test.info())
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)

      const tReady = await page.evaluate(() => performance.now())

      await waitForFirstFrame(page)
      const tFirstFrame = await page.evaluate(() => performance.now())

      // Enable full stats (expanded perf monitor) so CPU breakdown + pass timings populate
      await page.evaluate(() => {
        const ui = window.__UI_STORE__
        if (ui) {
          ui.getState().setShowPerfMonitor(true)
          ui.getState().setPerfMonitorExpanded?.(true)
        }
      })

      // Warmup
      const warmupStart = await getFrameCount(page)
      await waitForFrameAdvance(page, warmupStart + WARMUP_FRAMES, 20_000)

      // Measure
      const measureStart = await getFrameCount(page)
      const measureStartMs = await page.evaluate(() => performance.now())
      await waitForFrameAdvance(page, measureStart + MEASURE_FRAMES, 30_000)
      const measureEndMs = await page.evaluate(() => performance.now())
      const measureEnd = await getFrameCount(page)

      const metrics = await getPerformanceMetrics(page)

      const measuredMs = measureEndMs - measureStartMs
      const measuredFrames = measureEnd - measureStart
      const fps = measuredFrames > 0 ? (measuredFrames * 1000) / measuredMs : 0

      const navTiming = await page.evaluate(() => {
        const [n] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
        if (!n) return { domContentLoadedMs: 0, loadEventEndMs: 0 }
        return {
          domContentLoadedMs: n.domContentLoadedEventEnd,
          loadEventEndMs: n.loadEventEnd,
        }
      })

      const topPasses = [...metrics.passTimings]
        .filter((p) => !p.skipped)
        .sort((a, b) => b.cpuTimeMs + b.gpuTimeMs - (a.cpuTimeMs + a.gpuTimeMs))
        .slice(0, 12)
        .map((p) => ({ passId: p.passId, cpuMs: p.cpuTimeMs, gpuMs: p.gpuTimeMs }))

      console.log(`\n[${scen.label}] TOP PASSES (sorted by cpu+gpu):`)
      for (const p of topPasses) {
        console.log(
          `  ${p.passId.padEnd(40)}  cpu=${p.cpuMs.toFixed(3)}ms  gpu=${p.gpuMs.toFixed(3)}ms`
        )
      }

      results.push({
        label: scen.label,
        mode: scen.mode,
        dim: scen.dim,
        nav: {
          navigationToRendererReadyMs: tReady,
          navigationToFirstFrameMs: tFirstFrame,
          rendererReadyToFirstFrameMs: tFirstFrame - tReady,
          domContentLoadedMs: navTiming.domContentLoadedMs,
          loadEventEndMs: navTiming.loadEventEndMs,
        },
        steady: {
          fps,
          frameTimeMs: metrics.frameTime,
          cpuTimeMs: metrics.cpuTime,
          cpuSetupMs: metrics.cpuBreakdown.setupMs,
          cpuPassesMs: metrics.cpuBreakdown.passesMs,
          cpuSubmitMs: metrics.cpuBreakdown.submitMs,
          totalGpuTimeMs: metrics.totalGpuTimeMs,
          vramMB: metrics.vramMB,
          topPasses,
        },
      })
    })
  }
})
