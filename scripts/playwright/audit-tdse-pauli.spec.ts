/**
 * TDSE + Pauli FPS audit benchmark.
 *
 * Measures steady-state FPS, GPU time per pass, and CPU time for the
 * scenarios most relevant to the user's request:
 *   - TDSE 3D 64^3 default + non-default features
 *   - Pauli 3D 64^3 across all curated scenario presets + analysis overlays
 *
 * NOT a correctness test — produces JSON for before/after comparison.
 *
 * Run:
 *   PLAYWRIGHT_DEV_SERVER_PORT=3000 pnpm exec playwright test \
 *     scripts/playwright/audit-tdse-pauli.spec.ts --workers=1
 */

import { test } from './fixtures'
import {
  applyPauliPreset,
  applyTdsePreset,
  getFrameCount,
  getPerformanceMetrics,
  gotoMode,
  gotoPauli,
  requireWebGPU,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.setTimeout(180_000)
// Force sequential execution — `allResults` is module-scoped and the summary
// test reads results pushed by every prior test in this file. Parallel workers
// would each see an empty array and the summary would be useless.
test.describe.configure({ mode: 'serial' })

const WARMUP_FRAMES = 60
const MEASURE_FRAMES = 120

interface AuditResult {
  label: string
  mode: string
  preset: string | null
  fps: number
  frameTimeMs: number
  cpuTimeMs: number
  totalGpuMs: number
  passDeltas: Record<string, number>
  passCompute: Record<string, number>
  passRender: Record<string, number>
  passCpu: Record<string, number>
}

const allResults: AuditResult[] = []

async function uncapAndEnablePerf(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    const perfStore =
      window.__PERFORMANCE_STORE__ ??
      (await import('/src/stores/performanceStore.ts')).usePerformanceStore
    perfStore.getState().setMaxFps(0)
    const uiStore = window.__UI_STORE__ ?? (await import('/src/stores/uiStore.ts')).useUIStore
    uiStore.setState({ showPerfMonitor: true, perfMonitorExpanded: true })
  })
}

async function profile(
  page: import('@playwright/test').Page,
  label: string,
  mode: string,
  preset: string | null
): Promise<AuditResult> {
  await uncapAndEnablePerf(page)
  const warmStart = await getFrameCount(page)
  await waitForFrameAdvance(page, warmStart + WARMUP_FRAMES, 30_000)
  const measureStart = await getFrameCount(page)
  await waitForFrameAdvance(page, measureStart + MEASURE_FRAMES, 30_000)
  await page.waitForFunction(
    async () => {
      const mod = await import('/src/stores/performanceMetricsStore.ts')
      return mod.usePerformanceMetricsStore.getState().fps > 0
    },
    { timeout: 5_000 }
  )
  const m = await getPerformanceMetrics(page)
  const passDeltas: Record<string, number> = {}
  const passCompute: Record<string, number> = {}
  const passRender: Record<string, number> = {}
  const passCpu: Record<string, number> = {}
  for (const pt of m.passTimings) {
    if (pt.skipped) continue
    passDeltas[pt.passId] = pt.gpuTimeMs
    passCompute[pt.passId] = pt.computeGpuTimeMs
    passRender[pt.passId] = pt.renderGpuTimeMs
    passCpu[pt.passId] = pt.cpuTimeMs
  }
  const r: AuditResult = {
    label,
    mode,
    preset,
    fps: m.fps,
    frameTimeMs: m.frameTime,
    cpuTimeMs: m.cpuTime,
    totalGpuMs: m.totalGpuTimeMs ?? 0,
    passDeltas,
    passCompute,
    passRender,
    passCpu,
  }
  allResults.push(r)
  return r
}

// ─── Pauli ──────────────────────────────────────────────────────────────────

test.describe('Pauli FPS audit', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  const presets = [
    'larmorPrecession',
    'sternGerlach',
    'spinFlip',
    'harmonicTrap',
    'spinCoherence',
    'freeSpinUp',
  ]

  for (const id of presets) {
    test(`pauli-3d-${id}`, async ({ page }) => {
      await gotoPauli(page, 3)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)
      await applyPauliPreset(page, id)
      await waitForShaderCompilation(page)
      await profile(page, `Pauli 3D — ${id}`, 'pauliSpinor', id)
    })
  }

  test('pauli-3d-default-with-diagnostics', async ({ page }) => {
    await gotoPauli(page, 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await page.evaluate(async () => {
      const ext = window.__EXTENDED_OBJECT_STORE__
      if (!ext) throw new Error('extended store dev bridge missing')
      const s = ext.getState() as Record<string, (...a: unknown[]) => void>
      // Fail fast on missing setters: a silent no-op would let the audit run
      // produce a "+ diagnostics" benchmark label without diagnostics enabled.
      if (typeof s.setPauliDiagnosticsEnabled !== 'function') {
        throw new Error('setPauliDiagnosticsEnabled is unavailable')
      }
      s.setPauliDiagnosticsEnabled(true)
    })
    await waitForShaderCompilation(page)
    await profile(page, 'Pauli 3D — default + diagnostics', 'pauliSpinor', 'diag')
  })
})

// ─── TDSE baseline (smaller subset focused on FPS) ───────────────────────────

test.describe('TDSE FPS audit', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  const presets = ['classicTunneling', 'doubleSlit', 'falseVacuumDecay', 'periodicLattice']

  for (const id of presets) {
    test(`tdse-3d-${id}`, async ({ page }) => {
      await gotoMode(page, 'tdseDynamics', 3)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)
      await applyTdsePreset(page, id)
      await waitForShaderCompilation(page)
      await profile(page, `TDSE 3D — ${id}`, 'tdseDynamics', id)
    })
  }

  test('tdse-3d-all-features', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await page.evaluate(async () => {
      const ext = window.__EXTENDED_OBJECT_STORE__
      if (!ext) throw new Error('extended store dev bridge missing')
      const s = ext.getState() as Record<string, (...a: unknown[]) => void>
      // Fail fast on missing setters — see Pauli diagnostics rationale above.
      const required = [
        'setTdseAbsorberEnabled',
        'setTdseDiagnosticsEnabled',
        'setTdseObservablesEnabled',
        'setTdseStochasticEnabled',
        'setTdseStochasticGamma',
      ] as const
      for (const k of required) {
        if (typeof s[k] !== 'function') throw new Error(`${k} is unavailable`)
      }
      s.setTdseAbsorberEnabled(true)
      s.setTdseDiagnosticsEnabled(true)
      s.setTdseObservablesEnabled(true)
      s.setTdseStochasticEnabled(true)
      s.setTdseStochasticGamma(2.0)
    })
    await waitForShaderCompilation(page)
    await profile(page, 'TDSE 3D — all features', 'tdseDynamics', 'allFeatures')
  })
})

// ─── Summary ────────────────────────────────────────────────────────────────

test.describe('summary', () => {
  test('print results', async ({ page }) => {
    test.skip(
      allResults.length === 0,
      'no results — ensure audit tests ran in the same worker (--workers=1)'
    )
    await page.goto('/')
    const sorted = [...allResults].sort((a, b) => a.fps - b.fps)
    console.log('\n══ TDSE + PAULI AUDIT ══')
    for (const r of sorted) {
      const top = Object.entries(r.passDeltas)
        .filter(([k]) => !['scene', 'tonemap', 'fxaa', 'smaa'].includes(k))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([k, v]) => `${k}:${v.toFixed(2)}`)
        .join(' ')
      console.log(
        `  ${r.label.padEnd(40)} fps:${String(r.fps).padStart(3)} | ` +
          `frame:${r.frameTimeMs.toFixed(2)}ms gpu:${r.totalGpuMs.toFixed(2)}ms ` +
          `cpu:${r.cpuTimeMs.toFixed(2)}ms | top:${top}`
      )
    }
    console.log('AUDIT_TDSE_PAULI_JSON_START')
    console.log(JSON.stringify(allResults, null, 2))
    console.log('AUDIT_TDSE_PAULI_JSON_END')
  })
})
