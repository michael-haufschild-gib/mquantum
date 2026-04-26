/**
 * Compute mode GPU profiling — per-preset, uncapped FPS.
 *
 * Profiles each compute mode (TDSE, BEC, Dirac, Free Scalar) with its
 * heaviest presets to find actual GPU bottlenecks. Default presets often
 * use conservative settings; the interesting work surfaces with:
 * - Higher stepsPerFrame (8 vs 4)
 * - Self-interaction (Mexican hat potential, BEC nonlinearity)
 * - Larger grid sizes
 * - Multiple simulation steps per rendered frame
 *
 * Run: pnpm exec playwright test scripts/playwright/compute-mode-profiling.spec.ts --workers=1
 */

import { test } from './fixtures'
import {
  getFrameCount,
  getPerformanceMetrics,
  gotoMode,
  requireWebGPU,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
  waitForSimulationFrames,
} from './helpers/app-helpers'

test.setTimeout(300_000)

const WARMUP_FRAMES = 30
const MEASURE_FRAMES = 60

interface ProfilingResult {
  label: string
  mode: string
  preset: string | null
  fps: number
  frameTimeMs: number
  gpuTotalMs: number
  cpuTimeMs: number
  passDeltas: Record<string, number>
}

const allResults: ProfilingResult[] = []

/** Uncap FPS and enable perf monitor. Works in both dev and production builds. */
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

/** Apply a TDSE preset. */
async function applyTdsePreset(page: import('@playwright/test').Page, presetId: string) {
  await page.evaluate(async (id: string) => {
    const store =
      window.__EXTENDED_OBJECT_STORE__ ??
      (await import('/src/stores/extendedObjectStore.ts')).useExtendedObjectStore
    ;(store.getState() as Record<string, (...a: unknown[]) => void>).applyTdsePreset(id)
  }, presetId)
}

/** Apply a BEC preset. */
async function applyBecPreset(page: import('@playwright/test').Page, presetId: string) {
  await page.evaluate(async (id: string) => {
    const store =
      window.__EXTENDED_OBJECT_STORE__ ??
      (await import('/src/stores/extendedObjectStore.ts')).useExtendedObjectStore
    ;(store.getState() as Record<string, (...a: unknown[]) => void>).applyBecPreset(id)
  }, presetId)
}

/** Apply a Dirac preset. */
async function applyDiracPreset(page: import('@playwright/test').Page, presetId: string) {
  await page.evaluate(async (id: string) => {
    const store =
      window.__EXTENDED_OBJECT_STORE__ ??
      (await import('/src/stores/extendedObjectStore.ts')).useExtendedObjectStore
    ;(store.getState() as Record<string, (...a: unknown[]) => void>).applyDiracPreset(id)
  }, presetId)
}

/** Set Free Scalar Field initial condition and self-coupling. */
async function configureFsf(
  page: import('@playwright/test').Page,
  config: {
    initialCondition?: string
    selfCouplingEnabled?: boolean
    lambda?: number
    stepsPerFrame?: number
  }
) {
  await page.evaluate(async (cfg: Record<string, unknown>) => {
    const store =
      window.__EXTENDED_OBJECT_STORE__ ??
      (await import('/src/stores/extendedObjectStore.ts')).useExtendedObjectStore
    const s = store.getState() as Record<string, (...a: unknown[]) => void>
    if (cfg.initialCondition !== undefined) s.setFreeScalarInitialCondition(cfg.initialCondition)
    if (cfg.selfCouplingEnabled !== undefined)
      s.setFreeScalarSelfInteractionEnabled(cfg.selfCouplingEnabled)
    if (cfg.lambda !== undefined) s.setFreeScalarSelfInteractionLambda(cfg.lambda)
    if (cfg.stepsPerFrame !== undefined) s.setFreeScalarStepsPerFrame(cfg.stepsPerFrame)
  }, config)
}

/** Collect perf metrics after warmup + measurement frames. */
async function profileScenario(
  page: import('@playwright/test').Page,
  label: string,
  mode: string,
  preset: string | null
): Promise<ProfilingResult> {
  await uncapAndEnablePerf(page)

  // Warmup
  const warmupStart = await getFrameCount(page)
  await waitForFrameAdvance(page, warmupStart + WARMUP_FRAMES)

  // Let simulation run to fill pipeline
  await waitForSimulationFrames(page, 60)

  // Measure
  const measureStart = await getFrameCount(page)
  await waitForFrameAdvance(page, measureStart + MEASURE_FRAMES)

  // Wait for perf metrics to have valid data
  await page.waitForFunction(
    async () => {
      const mod = await import('/src/stores/performanceMetricsStore.ts')
      return mod.usePerformanceMetricsStore.getState().fps > 0
    },
    { timeout: 5_000 }
  )

  const metrics = await getPerformanceMetrics(page)

  // The metrics store publishes per-pass GPU deltas; keep the historical
  // `passDeltas` output shape for downstream summary code.
  const passDeltas: Record<string, number> = {}
  for (const pt of metrics.passTimings) {
    if (!pt.skipped && pt.gpuTimeMs > 0.001) {
      passDeltas[pt.passId] = pt.gpuTimeMs
    }
  }

  const result: ProfilingResult = {
    label,
    mode,
    preset,
    fps: metrics.fps,
    frameTimeMs: metrics.frameTime,
    gpuTotalMs: metrics.totalGpuTimeMs,
    cpuTimeMs: metrics.cpuTime,
    passDeltas,
  }

  allResults.push(result)

  test.info().annotations.push({
    type: 'profiling',
    description: `${label}: ${metrics.fps} FPS, GPU: ${Object.entries(passDeltas)
      .map(([k, v]) => `${k}:${v.toFixed(2)}ms`)
      .join(', ')}`,
  })

  return result
}

// ─── TDSE Presets ────────────────────────────────────────────────────────────

test.describe('TDSE profiling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  const tdsePresets = [
    { id: 'classicTunneling', label: 'TDSE: classic tunneling (4 steps/frame)' },
    { id: 'doubleSlit', label: 'TDSE: double slit (8 steps/frame)' },
    { id: 'falseVacuumDecay', label: 'TDSE: false vacuum decay (6 steps/frame)' },
    { id: 'bubbleNucleation', label: 'TDSE: bubble nucleation (6 steps/frame)' },
    { id: 'periodicLattice', label: 'TDSE: periodic lattice (4 steps/frame)' },
  ]

  for (const { id, label } of tdsePresets) {
    test(label, async ({ page }) => {
      await gotoMode(page, 'tdseDynamics', 3)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)
      await applyTdsePreset(page, id)
      await waitForShaderCompilation(page)
      await profileScenario(page, label, 'tdseDynamics', id)
    })
  }
})

// ─── BEC Presets ─────────────────────────────────────────────────────────────

test.describe('BEC profiling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  const becPresets = [
    { id: 'groundState', label: 'BEC: ground state (default steps)' },
    { id: 'singleVortex', label: 'BEC: single vortex' },
    { id: 'quantumTurbulence', label: 'BEC: quantum turbulence (8 steps/frame)' },
    { id: 'attractiveBec', label: 'BEC: attractive (collapse dynamics)' },
    { id: 'vortexDipole', label: 'BEC: vortex dipole' },
  ]

  for (const { id, label } of becPresets) {
    test(label, async ({ page }) => {
      await gotoMode(page, 'becDynamics', 3)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)
      await applyBecPreset(page, id)
      await waitForShaderCompilation(page)
      await profileScenario(page, label, 'becDynamics', id)
    })
  }
})

// ─── Dirac Presets ───────────────────────────────────────────────────────────

test.describe('Dirac profiling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  const diracPresets = [
    { id: 'kleinParadox', label: 'Dirac: Klein paradox (4 steps/frame)' },
    { id: 'zitterbewegung', label: 'Dirac: zitterbewegung (8 steps/frame)' },
    { id: 'relativisticHydrogen', label: 'Dirac: relativistic hydrogen' },
    { id: 'diracBarrierTunneling', label: 'Dirac: barrier tunneling' },
  ]

  for (const { id, label } of diracPresets) {
    test(label, async ({ page }) => {
      await gotoMode(page, 'diracEquation', 3)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)
      await applyDiracPreset(page, id)
      await waitForShaderCompilation(page)
      await profileScenario(page, label, 'diracEquation', id)
    })
  }
})

// ─── Free Scalar Field Configs ───────────────────────────────────────────────

test.describe('Free Scalar Field profiling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('FSF: default gaussian packet', async ({ page }) => {
    await gotoMode(page, 'freeScalarField', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await profileScenario(page, 'FSF: gaussian packet (default)', 'freeScalarField', null)
  })

  test('FSF: vacuum noise', async ({ page }) => {
    await gotoMode(page, 'freeScalarField', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await configureFsf(page, { initialCondition: 'vacuumNoise' })
    await waitForShaderCompilation(page)
    await profileScenario(page, 'FSF: vacuum noise', 'freeScalarField', 'vacuumNoise')
  })

  test('FSF: self-coupling (Mexican hat)', async ({ page }) => {
    await gotoMode(page, 'freeScalarField', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await configureFsf(page, { selfCouplingEnabled: true, lambda: 1.0 })
    await waitForShaderCompilation(page)
    await profileScenario(page, 'FSF: Mexican hat (λ=1.0)', 'freeScalarField', 'mexicanHat')
  })

  test('FSF: vacuum noise + self-coupling + 8 steps', async ({ page }) => {
    await gotoMode(page, 'freeScalarField', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await configureFsf(page, {
      initialCondition: 'vacuumNoise',
      selfCouplingEnabled: true,
      lambda: 1.0,
      stepsPerFrame: 8,
    })
    await waitForShaderCompilation(page)
    await profileScenario(page, 'FSF: vacuum + Mexican hat + 8 steps', 'freeScalarField', 'heavy')
  })
})

// ─── TDSE Non-Default Features ──────────────────────────────────────────────

test.describe('TDSE non-default features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('TDSE: Anderson disorder', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await page.evaluate(async () => {
      const store =
        window.__EXTENDED_OBJECT_STORE__ ??
        (await import('/src/stores/extendedObjectStore.ts')).useExtendedObjectStore
      const s = store.getState() as Record<string, (...a: unknown[]) => void>
      s.setTdsePotentialType('andersonDisorder')
    })
    await waitForShaderCompilation(page)
    await profileScenario(page, 'TDSE: Anderson disorder', 'tdseDynamics', 'anderson')
  })

  test('TDSE: absorber + diagnostics', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await page.evaluate(async () => {
      const store =
        window.__EXTENDED_OBJECT_STORE__ ??
        (await import('/src/stores/extendedObjectStore.ts')).useExtendedObjectStore
      const s = store.getState() as Record<string, (...a: unknown[]) => void>
      s.setTdseAbsorberEnabled(true)
      s.setTdseDiagnosticsEnabled(true)
    })
    await waitForShaderCompilation(page)
    await profileScenario(page, 'TDSE: absorber + diagnostics', 'tdseDynamics', 'abs+diag')
  })

  test('TDSE: observables', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await page.evaluate(async () => {
      const store =
        window.__EXTENDED_OBJECT_STORE__ ??
        (await import('/src/stores/extendedObjectStore.ts')).useExtendedObjectStore
      const s = store.getState() as Record<string, (...a: unknown[]) => void>
      s.setTdseObservablesEnabled(true)
    })
    await waitForShaderCompilation(page)
    await profileScenario(page, 'TDSE: observables', 'tdseDynamics', 'observables')
  })

  test('TDSE: stochastic localization (CSL)', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await page.evaluate(async () => {
      const store =
        window.__EXTENDED_OBJECT_STORE__ ??
        (await import('/src/stores/extendedObjectStore.ts')).useExtendedObjectStore
      const s = store.getState() as Record<string, (...a: unknown[]) => void>
      s.setTdseStochasticEnabled(true)
      s.setTdseStochasticGamma(2.0)
      s.setTdseStochasticSigma(1.5)
      s.setTdseStochasticNumSites(8)
    })
    await waitForShaderCompilation(page)
    await profileScenario(page, 'TDSE: stochastic localization (CSL)', 'tdseDynamics', 'csl')
  })

  test('TDSE: imaginary time (eigenstate finder)', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await page.evaluate(async () => {
      const store =
        window.__EXTENDED_OBJECT_STORE__ ??
        (await import('/src/stores/extendedObjectStore.ts')).useExtendedObjectStore
      const s = store.getState() as Record<string, (...a: unknown[]) => void>
      s.setTdsePotentialType('harmonicTrap')
      s.setTdseImaginaryTimeEnabled(true)
    })
    await waitForShaderCompilation(page)
    await profileScenario(page, 'TDSE: imaginary time', 'tdseDynamics', 'imagTime')
  })

  test('TDSE: all features combined', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await page.evaluate(async () => {
      const store =
        window.__EXTENDED_OBJECT_STORE__ ??
        (await import('/src/stores/extendedObjectStore.ts')).useExtendedObjectStore
      const s = store.getState() as Record<string, (...a: unknown[]) => void>
      s.setTdseAbsorberEnabled(true)
      s.setTdseDiagnosticsEnabled(true)
      s.setTdseObservablesEnabled(true)
      s.setTdseStochasticEnabled(true)
      s.setTdseStochasticGamma(2.0)
    })
    await waitForShaderCompilation(page)
    await profileScenario(page, 'TDSE: ALL features', 'tdseDynamics', 'allFeatures')
  })
})

// ─── FSF Cosmology & Preheating ─────────────────────────────────────────────

test.describe('FSF cosmology & preheating', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('FSF: cosmology — de Sitter', async ({ page }) => {
    await gotoMode(page, 'freeScalarField', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await page.evaluate(async () => {
      const store =
        window.__EXTENDED_OBJECT_STORE__ ??
        (await import('/src/stores/extendedObjectStore.ts')).useExtendedObjectStore
      const s = store.getState() as Record<string, (...a: unknown[]) => void>
      s.setFreeScalarCosmologyEnabled(true)
      s.setFreeScalarCosmologyPreset('deSitter')
      s.setFreeScalarCosmologyHubble(1.0)
      s.setFreeScalarCosmologyEta0(-10)
      s.setFreeScalarInitialCondition('vacuumNoise')
    })
    await waitForShaderCompilation(page)
    await profileScenario(page, 'FSF: de Sitter cosmology', 'freeScalarField', 'deSitter')
  })

  test('FSF: cosmology — ekpyrotic', async ({ page }) => {
    await gotoMode(page, 'freeScalarField', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await page.evaluate(async () => {
      const store =
        window.__EXTENDED_OBJECT_STORE__ ??
        (await import('/src/stores/extendedObjectStore.ts')).useExtendedObjectStore
      const s = store.getState() as Record<string, (...a: unknown[]) => void>
      s.setFreeScalarCosmologyEnabled(true)
      s.setFreeScalarCosmologyPreset('ekpyrotic')
      s.setFreeScalarCosmologySteepness(10)
      s.setFreeScalarCosmologyEta0(-5)
      s.setFreeScalarInitialCondition('vacuumNoise')
    })
    await waitForShaderCompilation(page)
    await profileScenario(page, 'FSF: ekpyrotic cosmology', 'freeScalarField', 'ekpyrotic')
  })

  test('FSF: cosmology — Kasner (Bianchi-I)', async ({ page }) => {
    await gotoMode(page, 'freeScalarField', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await page.evaluate(async () => {
      const store =
        window.__EXTENDED_OBJECT_STORE__ ??
        (await import('/src/stores/extendedObjectStore.ts')).useExtendedObjectStore
      const s = store.getState() as Record<string, (...a: unknown[]) => void>
      s.setFreeScalarCosmologyEnabled(true)
      s.setFreeScalarCosmologyPreset('kasner')
      s.setFreeScalarCosmologyEta0(1.5)
      s.setFreeScalarInitialCondition('vacuumNoise')
    })
    await waitForShaderCompilation(page)
    await profileScenario(page, 'FSF: Kasner (Bianchi-I)', 'freeScalarField', 'kasner')
  })

  test('FSF: preheating (Mathieu drive)', async ({ page }) => {
    await gotoMode(page, 'freeScalarField', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await page.evaluate(async () => {
      const store =
        window.__EXTENDED_OBJECT_STORE__ ??
        (await import('/src/stores/extendedObjectStore.ts')).useExtendedObjectStore
      const s = store.getState() as Record<string, (...a: unknown[]) => void>
      s.setFreeScalarPreheatingEnabled(true)
      s.setFreeScalarPreheatingAmplitude(0.5)
      s.setFreeScalarPreheatingFrequency(5.0)
      s.setFreeScalarInitialCondition('vacuumNoise')
    })
    await waitForShaderCompilation(page)
    await profileScenario(page, 'FSF: preheating (Mathieu)', 'freeScalarField', 'preheating')
  })

  test('FSF: cosmology + preheating', async ({ page }) => {
    await gotoMode(page, 'freeScalarField', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await page.evaluate(async () => {
      const store =
        window.__EXTENDED_OBJECT_STORE__ ??
        (await import('/src/stores/extendedObjectStore.ts')).useExtendedObjectStore
      const s = store.getState() as Record<string, (...a: unknown[]) => void>
      s.setFreeScalarCosmologyEnabled(true)
      s.setFreeScalarCosmologyPreset('deSitter')
      s.setFreeScalarCosmologyHubble(1.0)
      s.setFreeScalarCosmologyEta0(-10)
      s.setFreeScalarPreheatingEnabled(true)
      s.setFreeScalarPreheatingAmplitude(0.5)
      s.setFreeScalarPreheatingFrequency(5.0)
      s.setFreeScalarInitialCondition('vacuumNoise')
    })
    await waitForShaderCompilation(page)
    await profileScenario(
      page,
      'FSF: de Sitter + preheating',
      'freeScalarField',
      'deSitter+preheating'
    )
  })

  test('FSF: absorber', async ({ page }) => {
    await gotoMode(page, 'freeScalarField', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await page.evaluate(async () => {
      const store =
        window.__EXTENDED_OBJECT_STORE__ ??
        (await import('/src/stores/extendedObjectStore.ts')).useExtendedObjectStore
      const s = store.getState() as Record<string, (...a: unknown[]) => void>
      s.setFreeScalarAbsorberEnabled(true)
    })
    await waitForShaderCompilation(page)
    await profileScenario(page, 'FSF: PML absorber', 'freeScalarField', 'absorber')
  })
})

// ─── Quantum Walk & Dirac Non-Default ───────────────────────────────────────

test.describe('QW & Dirac non-default features', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('Quantum Walk: absorber', async ({ page }) => {
    await gotoMode(page, 'quantumWalk', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await page.evaluate(async () => {
      const store =
        window.__EXTENDED_OBJECT_STORE__ ??
        (await import('/src/stores/extendedObjectStore.ts')).useExtendedObjectStore
      const s = store.getState() as Record<string, (...a: unknown[]) => void>
      s.setQwAbsorberEnabled(true)
    })
    await waitForShaderCompilation(page)
    await profileScenario(page, 'QW: absorber', 'quantumWalk', 'absorber')
  })

  test('Dirac: absorber + diagnostics', async ({ page }) => {
    await gotoMode(page, 'diracEquation', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await page.evaluate(async () => {
      const store =
        window.__EXTENDED_OBJECT_STORE__ ??
        (await import('/src/stores/extendedObjectStore.ts')).useExtendedObjectStore
      const s = store.getState() as Record<string, (...a: unknown[]) => void>
      s.setDiracAbsorberEnabled(true)
      s.setDiracDiagnosticsEnabled(true)
    })
    await waitForShaderCompilation(page)
    await profileScenario(page, 'Dirac: absorber + diagnostics', 'diracEquation', 'abs+diag')
  })
})

// ─── Summary ─────────────────────────────────────────────────────────────────

test.describe('summary', () => {
  test('print results table', async ({ page }) => {
    test.skip(allResults.length === 0, 'No results collected')
    await page.goto('/')

    // Sort by GPU total descending
    const sorted = [...allResults].sort((a, b) => {
      const aSchrod = a.passDeltas['schroedinger'] ?? 0
      const bSchrod = b.passDeltas['schroedinger'] ?? 0
      return bSchrod - aSchrod
    })

    console.log('\n═══════════════════════════════════════════════════════════════')
    console.log('  COMPUTE MODE GPU PROFILING — Per-Preset Breakdown')
    console.log('═══════════════════════════════════════════════════════════════')
    for (const r of sorted) {
      const schrod = r.passDeltas['schroedinger'] ?? 0
      const otherGpu = Object.entries(r.passDeltas)
        .filter(([k]) => k !== 'schroedinger' && k !== 'scene')
        .reduce((s, [, v]) => s + v, 0)
      console.log(
        `  ${r.label.padEnd(45)} FPS: ${String(r.fps).padStart(3)} | ` +
          `schroedinger: ${schrod.toFixed(2).padStart(6)}ms | ` +
          `post: ${otherGpu.toFixed(2).padStart(5)}ms | ` +
          `CPU: ${r.cpuTimeMs.toFixed(2).padStart(5)}ms`
      )
    }
    console.log('═══════════════════════════════════════════════════════════════\n')

    // Machine-readable output
    console.log('COMPUTE_PROFILING_JSON_START')
    console.log(JSON.stringify(allResults, null, 2))
    console.log('COMPUTE_PROFILING_JSON_END')
  })
})
