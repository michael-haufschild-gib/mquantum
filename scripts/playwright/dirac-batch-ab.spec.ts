/**
 * Dirac Strang-step batching A/B benchmark.
 *
 * Runs Dirac zitterbewegung (8 steps/frame) in both the batched and legacy
 * per-dispatch paths, back-to-back in the same process, so baseline and
 * optimized numbers are collected under identical GPU/thermal conditions.
 *
 * Run under the benchmark config (which is already wired to match this spec
 * via testMatch) rather than the default Playwright config:
 *   pnpm exec playwright test --config=playwright.benchmark.config.ts scripts/playwright/dirac-batch-ab.spec.ts
 */

import fs from 'node:fs'
import path from 'node:path'

import { test } from './fixtures'
import {
  getFrameCount,
  getPerformanceMetrics,
  gotoMode,
  type PerfMetricsSnapshot,
  requireWebGPU,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
  waitForSimulationFrames,
} from './helpers/app-helpers'

const WARMUP_FRAMES = 40
const MEASURE_FRAMES = 180
const SAMPLES_PER_ARM = 5

interface ArmResult {
  arm: 'batched' | 'legacy'
  sample: number
  schroMs: number
  gpuTotalMs: number
  fps: number
  frameMs: number
}

test.setTimeout(600_000)

async function configureDirac(
  page: import('@playwright/test').Page,
  preset: string | null
): Promise<void> {
  await page.evaluate(
    async ([presetId]: [string | null]) => {
      const perfStore =
        window.__PERFORMANCE_STORE__ ??
        (await import('/src/stores/performanceStore.ts')).usePerformanceStore
      perfStore.getState().setMaxFps(0)
      const uiStore = window.__UI_STORE__ ?? (await import('/src/stores/uiStore.ts')).useUIStore
      uiStore.setState({ showPerfMonitor: true, perfMonitorExpanded: true })

      if (presetId) {
        const store =
          window.__EXTENDED_OBJECT_STORE__ ??
          (await import('/src/stores/extendedObjectStore.ts')).useExtendedObjectStore
        const s = store.getState() as Record<string, (...a: unknown[]) => unknown>
        await (s.applyDiracPreset as (id: string) => Promise<void>)(presetId)
      }

      const anim = await import('/src/stores/animationStore.ts')
      anim.useAnimationStore.getState().play()
    },
    [preset]
  )
}

async function setBatchEnabled(
  page: import('@playwright/test').Page,
  enabled: boolean
): Promise<void> {
  await page.evaluate((disable: boolean) => {
    ;(window as unknown as { __DIRAC_DISABLE_BATCH?: boolean }).__DIRAC_DISABLE_BATCH = disable
  }, !enabled)
}

async function collectSample(page: import('@playwright/test').Page): Promise<PerfMetricsSnapshot> {
  const warmupStart = await getFrameCount(page)
  await waitForFrameAdvance(page, warmupStart + WARMUP_FRAMES)
  await waitForSimulationFrames(page, 40)
  const measureStart = await getFrameCount(page)
  await waitForFrameAdvance(page, measureStart + MEASURE_FRAMES)
  try {
    await page.waitForFunction(
      async () => {
        const mod = await import('/src/stores/performanceMetricsStore.ts')
        return mod.usePerformanceMetricsStore.getState().fps > 0
      },
      { timeout: 5_000 }
    )
  } catch (err) {
    // Wrap with identifying details so the failure explains why FPS stayed
    // at 0 instead of surfacing as an opaque playwright timeout. Include
    // frame counters and the current store snapshot so the log pinpoints
    // collectSample / getPerformanceMetrics as the stall site.
    const fps = await page
      .evaluate(async () => {
        const mod = await import('/src/stores/performanceMetricsStore.ts')
        return mod.usePerformanceMetricsStore.getState().fps
      })
      .catch(() => 'unavailable')
    throw new Error(
      `[collectSample] FPS remained 0 after 5s (warmupStart=${warmupStart}, ` +
        `measureStart=${measureStart}, WARMUP_FRAMES=${WARMUP_FRAMES}, ` +
        `MEASURE_FRAMES=${MEASURE_FRAMES}, current fps=${String(fps)}) — ` +
        `getPerformanceMetrics would return stale data`,
      { cause: err }
    )
  }
  return getPerformanceMetrics(page)
}

const SCENARIOS: { id: string | null; label: string; spfNote: string }[] = [
  { id: null, label: 'default (2 spf)', spfNote: '2 steps/frame' },
  { id: 'kleinParadox', label: 'kleinParadox', spfNote: '4 steps/frame' },
  { id: 'zitterbewegung', label: 'zitterbewegung', spfNote: '8 steps/frame' },
]

test.describe('Dirac batching A/B', () => {
  test.describe.configure({ mode: 'serial' })

  for (const scenario of SCENARIOS) {
    test(`${scenario.label}: alternating batched/legacy samples`, async ({ page }) => {
      await page.goto('/')
      await requireWebGPU(page, test.info())
      await gotoMode(page, 'diracEquation', 3)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)
      await configureDirac(page, scenario.id)
      await waitForShaderCompilation(page)

      const results: ArmResult[] = []

      // Interleave samples to average out thermal drift between the two arms.
      for (let s = 0; s < SAMPLES_PER_ARM; s++) {
        for (const arm of ['batched', 'legacy'] as const) {
          await setBatchEnabled(page, arm === 'batched')
          const m = await collectSample(page)
          const schro = m.passTimings.find((p) => p.passId === 'schroedinger')?.gpuTimeMs ?? 0
          results.push({
            arm,
            sample: s,
            schroMs: schro,
            gpuTotalMs: m.totalGpuTimeMs,
            fps: m.fps,
            frameMs: m.frameTime,
          })
          console.log(
            `  [${arm.padEnd(7)}] s${s} schro=${schro.toFixed(3)}ms gpu=${m.totalGpuTimeMs.toFixed(2)}ms fps=${m.fps}`
          )
        }
      }

      const byArm = {
        batched: results.filter((r) => r.arm === 'batched'),
        legacy: results.filter((r) => r.arm === 'legacy'),
      }
      const stats = (arr: ArmResult[], key: keyof ArmResult) => {
        const vals = arr.map((r) => r[key] as number).sort((a, b) => a - b)
        if (vals.length === 0) {
          throw new Error(
            `[dirac-batch-ab] stats called with empty ${key} array — ` +
              `expected SAMPLES_PER_ARM=${SAMPLES_PER_ARM} values from collectSample`
          )
        }
        const med =
          vals.length % 2 === 0
            ? (vals[vals.length / 2 - 1]! + vals[vals.length / 2]!) / 2
            : vals[(vals.length - 1) / 2]!
        return { med, min: vals[0]!, max: vals[vals.length - 1]!, all: vals }
      }
      const bSch = stats(byArm.batched, 'schroMs')
      const lSch = stats(byArm.legacy, 'schroMs')
      const bFrame = stats(byArm.batched, 'frameMs')
      const lFrame = stats(byArm.legacy, 'frameMs')
      const bFps = stats(byArm.batched, 'fps')
      const lFps = stats(byArm.legacy, 'fps')

      console.log('\n═══════════════════════════════════════════════════════════════')
      console.log(`  Dirac ${scenario.label} (${scenario.spfNote}) A/B — Strang batching`)
      console.log('═══════════════════════════════════════════════════════════════')
      console.log(`  schroedinger GPU ms:`)
      console.log(
        `    batched med=${bSch.med.toFixed(3)} min=${bSch.min.toFixed(3)} max=${bSch.max.toFixed(3)}`
      )
      console.log(
        `    legacy  med=${lSch.med.toFixed(3)} min=${lSch.min.toFixed(3)} max=${lSch.max.toFixed(3)}`
      )
      console.log(
        `    Δ med=${(bSch.med - lSch.med).toFixed(3)}ms (${(((bSch.med - lSch.med) / lSch.med) * 100).toFixed(1)}%)`
      )
      console.log(
        `  frame ms:    batched med=${bFrame.med.toFixed(3)} legacy med=${lFrame.med.toFixed(3)}`
      )
      console.log(`  fps:         batched med=${bFps.med}         legacy med=${lFps.med}`)
      console.log('═══════════════════════════════════════════════════════════════\n')

      const outDir = path.resolve(process.cwd(), 'logs')
      fs.mkdirSync(outDir, { recursive: true })
      const stamp = new Date()
        .toISOString()
        .replace(/[-:T.Z]/g, '')
        .slice(0, 14)
      const safeLabel = scenario.label.replace(/\W+/g, '_')
      fs.writeFileSync(
        path.join(outDir, `dirac_batch_ab_${safeLabel}_${stamp}.json`),
        JSON.stringify({ scenario, generated: new Date().toISOString(), results, byArm }, null, 2)
      )
    })
  }
})
