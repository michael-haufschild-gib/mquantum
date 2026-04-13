/**
 * BEC Performance Baseline Benchmark
 *
 * Measures every BEC scenario preset with full per-pass GPU timing.
 * Writes machine-readable JSON to logs/bec_baseline_<timestamp>.json.
 *
 * Run: npx playwright test scripts/playwright/bec-perf-baseline.spec.ts --workers=1
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

const WARMUP_FRAMES = 30
const MEASURE_FRAMES = 120
const SIM_WARMUP_FRAMES = 60

/**
 * BEC presets to benchmark. 3D default grid for all, plus higher-dim presets
 * at their declared minDim.
 */
const BEC_SCENARIOS: { preset: string; dim: number; label: string }[] = [
  { preset: 'groundState', dim: 3, label: 'BEC 3D: groundState' },
  { preset: 'singleVortex', dim: 3, label: 'BEC 3D: singleVortex' },
  { preset: 'vortexDipole', dim: 3, label: 'BEC 3D: vortexDipole' },
  { preset: 'darkSoliton', dim: 3, label: 'BEC 3D: darkSoliton' },
  { preset: 'quantumTurbulence', dim: 3, label: 'BEC 3D: quantumTurbulence' },
  { preset: 'breathingMode', dim: 3, label: 'BEC 3D: breathingMode' },
  { preset: 'attractiveBec', dim: 3, label: 'BEC 3D: attractiveBec' },
  { preset: 'vortex4DReconnection', dim: 4, label: 'BEC 4D: vortex4DReconnection' },
  { preset: 'vortex4DParallel', dim: 4, label: 'BEC 4D: vortex4DParallel' },
  { preset: 'vortex4DSingle', dim: 4, label: 'BEC 4D: vortex4DSingle' },
  { preset: 'vortex5DReconnection', dim: 5, label: 'BEC 5D: vortex5DReconnection' },
]

interface Sample {
  preset: string
  dim: number
  label: string
  fps: number
  frameTimeMs: number
  cpuTimeMs: number
  totalGpuTimeMs: number
  vramMB: number
  passTimings: {
    passId: string
    gpuTimeMs: number
    computeGpuTimeMs: number
    renderGpuTimeMs: number
    cpuTimeMs: number
    skipped: boolean
  }[]
  cpuBreakdown: { setupMs: number; passesMs: number; submitMs: number }
  schroedingerGpuMs: number
  postGpuMs: number
}

const allResults: Sample[] = []

test.setTimeout(300_000)

test.describe('BEC performance baseline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  for (const { preset, dim, label } of BEC_SCENARIOS) {
    test(label, async ({ page }) => {
      await gotoMode(page, 'becDynamics', dim)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)
      await applyBecPreset(page, preset)
      await waitForShaderCompilation(page)

      // Uncap FPS + enable perf monitor + play
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

      // Frame warmup + sim warmup
      const warmupStart = await getFrameCount(page)
      await waitForFrameAdvance(page, warmupStart + WARMUP_FRAMES)
      await waitForSimulationFrames(page, SIM_WARMUP_FRAMES)

      // Let perf metrics update
      await page.waitForFunction(
        async () => {
          const mod = await import('/src/stores/performanceMetricsStore.ts')
          return mod.usePerformanceMetricsStore.getState().fps > 0
        },
        { timeout: 10_000 }
      )

      // Measurement window
      const measureStart = await getFrameCount(page)
      await waitForFrameAdvance(page, measureStart + MEASURE_FRAMES)
      await page.waitForFunction(
        async () => {
          const mod = await import('/src/stores/performanceMetricsStore.ts')
          return mod.usePerformanceMetricsStore.getState().fps > 0
        },
        { timeout: 5_000 }
      )

      const metrics = await getPerformanceMetrics(page)
      const schrodTime =
        metrics.passTimings.find((p) => p.passId === 'schroedinger')?.gpuTimeMs ?? 0
      const postTime = metrics.passTimings
        .filter((p) => !p.skipped && p.passId !== 'schroedinger' && p.passId !== 'scene')
        .reduce((acc, p) => acc + p.gpuTimeMs, 0)

      const sample: Sample = {
        preset,
        dim,
        label,
        fps: metrics.fps,
        frameTimeMs: metrics.frameTime,
        cpuTimeMs: metrics.cpuTime,
        totalGpuTimeMs: metrics.totalGpuTimeMs,
        vramMB: metrics.vramMB,
        passTimings: metrics.passTimings,
        cpuBreakdown: metrics.cpuBreakdown,
        schroedingerGpuMs: schrodTime,
        postGpuMs: postTime,
      }
      allResults.push(sample)

      console.log(
        `\n${label}: fps=${sample.fps} frame=${sample.frameTimeMs.toFixed(2)}ms cpu=${sample.cpuTimeMs.toFixed(2)}ms gpu=${sample.totalGpuTimeMs.toFixed(2)}ms schrod=${schrodTime.toFixed(2)}ms`
      )

      // Per-pass listing
      for (const pt of metrics.passTimings) {
        if (pt.skipped) continue
        console.log(
          `  ${pt.passId.padEnd(30)} gpu=${pt.gpuTimeMs.toFixed(3)}ms  cpu=${pt.cpuTimeMs.toFixed(3)}ms`
        )
      }
    })
  }

  test.afterAll(() => {
    if (allResults.length === 0) return
    const outDir = path.resolve(process.cwd(), 'logs')
    fs.mkdirSync(outDir, { recursive: true })
    const stamp = new Date()
      .toISOString()
      .replace(/[-:T.Z]/g, '')
      .slice(0, 14)
    const outFile = path.join(outDir, `bec_baseline_${stamp}.json`)
    const stableFile = path.join(outDir, 'bec_baseline.json')
    const payload = {
      generated: new Date().toISOString(),
      results: allResults,
    }
    fs.writeFileSync(outFile, JSON.stringify(payload, null, 2))
    fs.writeFileSync(stableFile, JSON.stringify(payload, null, 2))
    console.log(`\nBEC benchmark written → ${outFile}`)
  })
})
