#!/usr/bin/env node
/**
 * Benchmark every ScenarioSelector preset against the already-running app.
 *
 * This script intentionally does not start a dev server. It exits if BASE_URL
 * is not reachable so it can respect agent/session constraints.
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const LOG_DIR = path.join(ROOT, 'logs')
const DEFAULT_BASE_URL = 'http://localhost:3000'
const EXPECTED_SCENARIO_COUNT = 184
const TARGET_FPS = 45

const args = parseArgs(process.argv.slice(2))
const baseURL = args.baseUrl ?? process.env.BASE_URL ?? DEFAULT_BASE_URL
const warmupFrames = numberArg(args.warmupFrames, 'WARMUP_FRAMES', 90)
const measureFrames = numberArg(args.measureFrames, 'MEASURE_FRAMES', 180)
const listOnly = args.listOnly === true
const limit = args.limit == null ? null : Number(args.limit)
const filter = args.filter ? new RegExp(String(args.filter), 'i') : null
const runLabel = args.label ?? 'baseline'
const stamp = new Date()
  .toISOString()
  .replace(/[-:T.Z]/g, '')
  .slice(0, 14)
const outputFile =
  args.output ?? path.join(LOG_DIR, `scenario_preset_${sanitizeFilePart(runLabel)}_${stamp}.jsonl`)
const summaryFile = outputFile.replace(/\.jsonl$/u, '.summary.json')

function parseArgs(argv) {
  const parsed = {}
  for (const arg of argv) {
    if (arg === '--list-only') {
      parsed.listOnly = true
      continue
    }
    const match = /^--([^=]+)=(.*)$/u.exec(arg)
    if (match) parsed[toCamel(match[1])] = match[2]
  }
  return parsed
}

function toCamel(value) {
  return value.replace(/-([a-z])/gu, (_, ch) => ch.toUpperCase())
}

function numberArg(cliValue, envKey, fallback) {
  const value = cliValue ?? process.env[envKey]
  if (value == null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${envKey} must be a positive finite number; got ${String(value)}`)
  }
  return Math.floor(parsed)
}

function sanitizeFilePart(value) {
  return String(value).replace(/[^a-z0-9_.-]+/giu, '_')
}

async function withTimeout(promise, timeoutMs, label) {
  let timeout
  let timedOut = false
  try {
    await Promise.race([
      promise,
      new Promise((resolve) => {
        timeout = setTimeout(() => {
          timedOut = true
          resolve()
        }, timeoutMs)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
  if (timedOut) {
    console.warn(`${label} did not finish within ${timeoutMs}ms; exiting benchmark process`)
  }
}

function ensureLogsDir() {
  fs.mkdirSync(LOG_DIR, { recursive: true })
}

async function assertServerReachable() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3_000)
  try {
    const response = await fetch(baseURL, { signal: controller.signal })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
  } catch (error) {
    throw new Error(
      `Existing app server is not reachable at ${baseURL}. Start it outside this script. ` +
        `Details: ${error instanceof Error ? error.message : String(error)}`
    )
  } finally {
    clearTimeout(timeout)
  }
}

function attachConsoleCapture(page, bucket) {
  const gpuWarning =
    /Invalid CommandBuffer|Invalid.*Encoder|WGSL ERROR|GPUValidationError|validation.*error|shader.*compil|pipeline.*fail|device.*lost|While encoding|While finishing|While calling/iu
  page.on('console', (msg) => {
    const type = msg.type()
    const text = msg.text()
    if (type === 'error' || (type === 'warning' && gpuWarning.test(text))) {
      bucket.push({ type, text })
    }
  })
  page.on('pageerror', (err) => bucket.push({ type: 'pageerror', text: err.message }))
}

async function waitForAppLoaded(page) {
  await page.waitForSelector('[data-testid="top-bar"]', { timeout: 20_000 })
}

async function waitForStoreBridge(page) {
  await page.waitForFunction(
    () =>
      !!window.__GEOMETRY_STORE__ &&
      !!window.__EXTENDED_OBJECT_STORE__ &&
      !!window.__PERFORMANCE_STORE__ &&
      !!window.__PERFORMANCE_METRICS_STORE__ &&
      !!window.__UI_STORE__ &&
      !!window.__ANIMATION_STORE__,
    { timeout: 20_000 }
  )
}

async function requireWebGPU(page) {
  const status = await page.evaluate(async () => {
    if (!navigator.gpu) return { ok: false, reason: 'navigator.gpu missing' }
    const adapter = await navigator.gpu.requestAdapter()
    if (!adapter) return { ok: false, reason: 'requestAdapter returned null' }
    return {
      ok: true,
      reason: adapter.info?.description || adapter.info?.vendor || 'adapter available',
    }
  })
  if (!status.ok) throw new Error(`WebGPU unavailable: ${status.reason}`)
  return status.reason
}

async function waitForRendererReady(page) {
  await page.waitForSelector('[data-testid="webgpu-container"][data-renderer-state="ready"]', {
    timeout: 60_000,
  })
}

async function getFrameCount(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
    return Number.parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10)
  })
}

async function getPipelineGen(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
    return Number.parseInt(canvas?.getAttribute('data-pipeline-gen') ?? '0', 10)
  })
}

async function waitForFrameCount(page, target, timeoutMs) {
  await page.waitForFunction(
    (minCount) => {
      const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
      return Number.parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10) >= minCount
    },
    target,
    { timeout: timeoutMs }
  )
}

async function waitForShaderIdle(page, previousPipelineGen = null) {
  await page.waitForFunction(
    (prevGen) => {
      const perf = window.__PERFORMANCE_STORE__?.getState()
      const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
      const gen = Number.parseInt(canvas?.getAttribute('data-pipeline-gen') ?? '0', 10)
      return gen > 0 && !perf?.isShaderCompiling && (prevGen == null || gen >= prevGen)
    },
    previousPipelineGen,
    { timeout: 300_000 }
  )
  const frame = await getFrameCount(page)
  await waitForFrameCount(page, frame + 1, 60_000)
}

async function configureBenchmarkMode(page) {
  await page.evaluate(() => {
    window.__PERFORMANCE_STORE__.setState({ maxFps: 0 })
    window.__UI_STORE__.setState({ showPerfMonitor: true, perfMonitorExpanded: true })
    window.__ANIMATION_STORE__.getState().play()
  })
}

async function getScenarioCatalog(page) {
  const scenarios = await page.evaluate(async () => {
    const [
      hoMod,
      hydrogenMod,
      hydrogenCoupledMod,
      tdseMod,
      becMod,
      diracMod,
      freeScalarMod,
      qwMod,
      wdwMod,
      adsMod,
      pauliMod,
      bellMod,
    ] = await Promise.all([
      import('/src/lib/geometry/extended/schroedinger/presets.ts'),
      import('/src/lib/geometry/extended/schroedinger/hydrogenNDPresets.ts'),
      import('/src/lib/physics/hydrogenCoupled/presets.ts'),
      import('/src/lib/physics/tdse/presets.ts'),
      import('/src/lib/physics/bec/presets.ts'),
      import('/src/lib/physics/dirac/presets.ts'),
      import('/src/lib/physics/freeScalar/presets.ts'),
      import('/src/lib/physics/quantumWalk/presets.ts'),
      import('/src/lib/physics/wheelerDeWitt/presets/index.ts'),
      import('/src/lib/physics/antiDeSitter/presets.ts'),
      import('/src/lib/physics/pauli/presets.ts'),
      import('/src/lib/physics/bell/presets.ts'),
    ])

    const out = []
    const add = (scenario) => out.push(scenario)
    const maxDim = (min, max, predicate = () => true) => {
      let found = min
      for (let dim = min; dim <= max; dim++) {
        if (predicate(dim)) found = dim
      }
      return found
    }
    const rangeLabel = (min, max) => (min === max ? String(min) : `${min}-${max}`)

    for (const [id, preset] of Object.entries(hoMod.SCHROEDINGER_NAMED_PRESETS)) {
      add({
        objectType: 'schroedinger',
        mode: 'harmonicOscillator',
        presetId: id,
        label: preset.name,
        dimension: 11,
        availableDimensions: '2-11',
      })
    }

    for (const [id, preset] of Object.entries(hydrogenMod.HYDROGEN_ND_PRESETS)) {
      if (id === 'custom') continue
      const min = preset.dimension
      add({
        objectType: 'schroedinger',
        mode: 'hydrogenND',
        presetId: id,
        label: preset.name,
        dimension: 11,
        availableDimensions: rangeLabel(min, 11),
      })
    }

    for (const preset of hydrogenCoupledMod.HYDROGEN_COUPLED_PRESETS) {
      add({
        objectType: 'schroedinger',
        mode: 'hydrogenNDCoupled',
        presetId: preset.id,
        label: preset.name,
        dimension: 11,
        availableDimensions: rangeLabel(preset.minDim, 11),
      })
    }

    for (const preset of tdseMod.TDSE_SCENARIO_PRESETS) {
      const dim = maxDim(3, 6, (d) => tdseMod.isTdsePresetCompatibleWithDimension(preset, d))
      add({
        objectType: 'schroedinger',
        mode: 'tdseDynamics',
        presetId: preset.id,
        label: preset.name,
        dimension: dim,
        availableDimensions:
          preset.overrides.maxDim === preset.overrides.latticeDim
            ? String(preset.overrides.latticeDim)
            : rangeLabel(preset.overrides.latticeDim ?? 3, preset.overrides.maxDim ?? 6),
      })
    }

    for (const preset of becMod.BEC_SCENARIO_PRESETS) {
      const min = preset.minDim ?? 2
      add({
        objectType: 'schroedinger',
        mode: 'becDynamics',
        presetId: preset.id,
        label: preset.name,
        dimension: 6,
        availableDimensions: rangeLabel(Math.max(3, min), 6),
      })
    }

    for (const preset of diracMod.DIRAC_SCENARIO_PRESETS) {
      add({
        objectType: 'schroedinger',
        mode: 'diracEquation',
        presetId: preset.id,
        label: preset.name,
        dimension: 6,
        availableDimensions: '3-6',
      })
    }

    for (const preset of freeScalarMod.FREE_SCALAR_PRESETS) {
      const exact = preset.overrides.latticeDim
      add({
        objectType: 'schroedinger',
        mode: 'freeScalarField',
        presetId: preset.id,
        label: preset.name,
        dimension: exact ?? 6,
        availableDimensions: exact == null ? '3-6' : String(exact),
      })
    }

    for (const preset of qwMod.QUANTUM_WALK_PRESETS) {
      add({
        objectType: 'schroedinger',
        mode: 'quantumWalk',
        presetId: preset.id,
        label: preset.name,
        dimension: 7,
        availableDimensions: '3-7',
      })
    }

    for (const preset of wdwMod.WDW_SCENARIO_PRESETS) {
      add({
        objectType: 'schroedinger',
        mode: 'wheelerDeWitt',
        presetId: preset.id,
        label: preset.name,
        dimension: 3,
        availableDimensions: '3',
      })
    }

    for (const preset of adsMod.ADS_PRESETS) {
      add({
        objectType: 'schroedinger',
        mode: 'antiDeSitter',
        presetId: preset.id,
        label: preset.label,
        dimension: 7,
        availableDimensions: '3-7',
      })
    }

    for (const preset of pauliMod.PAULI_SCENARIO_PRESETS) {
      add({
        objectType: 'pauliSpinor',
        mode: 'pauliSpinor',
        presetId: preset.id,
        label: preset.name,
        dimension: 6,
        availableDimensions: '3-6',
      })
    }

    for (const preset of bellMod.BELL_SCENARIO_PRESETS) {
      add({
        objectType: 'bellPair',
        mode: 'bellTest',
        presetId: preset.id,
        label: preset.name,
        dimension: 3,
        availableDimensions: '3',
      })
    }

    return out.map((scenario, index) => ({
      ...scenario,
      index,
      key: `${scenario.objectType}/${scenario.mode}/${scenario.presetId}@${scenario.dimension}D`,
    }))
  })

  if (scenarios.length !== EXPECTED_SCENARIO_COUNT) {
    throw new Error(
      `Scenario catalog count mismatch: expected ${EXPECTED_SCENARIO_COUNT}, got ${scenarios.length}`
    )
  }
  return scenarios
}

function scenarioUrl(scenario) {
  const params = new URLSearchParams({
    t: scenario.objectType,
    d: String(scenario.dimension),
  })
  if (scenario.objectType === 'schroedinger') {
    params.set('qm', scenario.mode)
  }
  return `${baseURL}/?${params.toString()}`
}

async function applyScenarioPreset(page, scenario) {
  await page.evaluate(async (s) => {
    const geoStore = window.__GEOMETRY_STORE__
    const extStore = window.__EXTENDED_OBJECT_STORE__
    if (!geoStore || !extStore) throw new Error('DEV store bridge missing')
    const ext = extStore.getState()

    switch (s.mode) {
      case 'harmonicOscillator':
        ext.setSchroedingerPresetName(s.presetId)
        break
      case 'hydrogenND':
        ext.setSchroedingerHydrogenNDPreset(s.presetId)
        break
      case 'hydrogenNDCoupled': {
        const { HYDROGEN_COUPLED_PRESETS } =
          await import('/src/lib/physics/hydrogenCoupled/presets.ts')
        const preset = HYDROGEN_COUPLED_PRESETS.find((p) => p.id === s.presetId)
        if (preset) ext.setSchroedingerConfig(preset.overrides)
        break
      }
      case 'tdseDynamics':
        await ext.applyTdsePreset(s.presetId, { expectedQuantumMode: s.mode })
        break
      case 'becDynamics':
        await ext.applyBecPreset(s.presetId, { expectedQuantumMode: s.mode })
        break
      case 'diracEquation':
        await ext.applyDiracPreset(s.presetId, { expectedQuantumMode: s.mode })
        break
      case 'freeScalarField':
        await ext.applyFreeScalarPreset(s.presetId, { expectedQuantumMode: s.mode })
        break
      case 'quantumWalk':
        await ext.applyQuantumWalkPreset(s.presetId, { expectedQuantumMode: s.mode })
        break
      case 'wheelerDeWitt':
        await ext.applyWheelerDeWittPreset(s.presetId, { expectedQuantumMode: s.mode })
        break
      case 'antiDeSitter': {
        const [{ ADS_PRESETS }, { useAppearanceStore }] = await Promise.all([
          import('/src/lib/physics/antiDeSitter/presets.ts'),
          import('/src/stores/scene/appearanceStore.ts'),
        ])
        ext.setAdsPreset(s.presetId)
        const preset = ADS_PRESETS.find((p) => p.id === s.presetId)
        if (preset?.colorAlgorithm)
          useAppearanceStore.getState().setColorAlgorithm(preset.colorAlgorithm)
        break
      }
      case 'pauliSpinor': {
        const [{ PAULI_SCENARIO_PRESETS }, { PAULI_FIELD_VIEW_TO_COLOR_ALGO }, appearance] =
          await Promise.all([
            import('/src/lib/physics/pauli/presets.ts'),
            import('/src/lib/colors/palette/types.ts'),
            import('/src/stores/scene/appearanceStore.ts'),
          ])
        const preset = PAULI_SCENARIO_PRESETS.find((p) => p.id === s.presetId)
        if (preset) {
          ext.setPauliConfig({ ...preset.overrides, needsReset: true })
          const algo = preset.overrides.fieldView
            ? PAULI_FIELD_VIEW_TO_COLOR_ALGO[preset.overrides.fieldView]
            : undefined
          if (algo) appearance.useAppearanceStore.getState().setColorAlgorithm(algo)
        }
        break
      }
      case 'bellTest': {
        const { BELL_SCENARIO_PRESETS } = await import('/src/lib/physics/bell/presets.ts')
        const preset = BELL_SCENARIO_PRESETS.find((p) => p.id === s.presetId)
        if (preset) ext.setBellPairConfig({ ...preset.overrides, needsReset: true })
        break
      }
      default:
        throw new Error(`Unsupported scenario mode: ${s.mode}`)
    }
  }, scenario)
}

async function collectSettings(page) {
  return page.evaluate(() => {
    const perf = window.__PERFORMANCE_STORE__.getState()
    const geo = window.__GEOMETRY_STORE__.getState()
    const ext = window.__EXTENDED_OBJECT_STORE__.getState()
    const metrics = window.__PERFORMANCE_METRICS_STORE__.getState()
    return {
      objectType: geo.objectType,
      dimension: geo.dimension,
      quantumMode: ext.schroedinger?.quantumMode ?? null,
      renderResolutionScale: perf.renderResolutionScale,
      densityGridResolution: perf.densityGridResolution,
      maxFps: perf.maxFps,
      qualityPreset: ext.schroedinger?.qualityPreset ?? null,
      raymarchQuality: ext.schroedinger?.raymarchQuality ?? null,
      sampleCount: ext.schroedinger?.sampleCount ?? null,
      gpuTimingSupported: metrics.gpuTimingSupported,
      viewport: metrics.viewport,
    }
  })
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const metrics = window.__PERFORMANCE_METRICS_STORE__.getState()
    return {
      overlayFps: metrics.fps,
      frameTimeMs: metrics.frameTime,
      cpuTimeMs: metrics.cpuTime,
      totalGpuTimeMs: metrics.totalGpuTimeMs,
      vramBytes: metrics.vram.total,
      cpuBreakdown: { ...metrics.cpuBreakdown },
      passTimings: metrics.passTimings.map((p) => ({
        passId: p.passId,
        gpuTimeMs: p.gpuTimeMs,
        computeGpuTimeMs: p.computeGpuTimeMs ?? 0,
        renderGpuTimeMs: p.renderGpuTimeMs ?? 0,
        cpuTimeMs: p.cpuTimeMs,
        skipped: p.skipped,
      })),
      fpsHistory: [...metrics.history.fps],
    }
  })
}

async function benchmarkScenario(page, scenario) {
  const consoleStart = page.__scenarioConsoleErrors.length
  const url = scenarioUrl(scenario)
  await page.goto(url)
  await waitForAppLoaded(page)
  await waitForStoreBridge(page)
  await waitForRendererReady(page)
  await configureBenchmarkMode(page)
  await waitForShaderIdle(page)

  const beforeGen = await getPipelineGen(page)
  await applyScenarioPreset(page, scenario)
  await configureBenchmarkMode(page)
  await waitForShaderIdle(page, beforeGen)

  const warmupStart = await getFrameCount(page)
  await waitForFrameCount(page, warmupStart + warmupFrames, timeoutForFrames(warmupFrames))

  const startFrame = await getFrameCount(page)
  const startTimeMs = await page.evaluate(() => performance.now())
  await waitForFrameCount(page, startFrame + measureFrames, timeoutForFrames(measureFrames))
  const endTimeMs = await page.evaluate(() => performance.now())
  const endFrame = await getFrameCount(page)

  await page.waitForFunction(
    () => {
      const metrics = window.__PERFORMANCE_METRICS_STORE__?.getState()
      return !!metrics && metrics.frameTime > 0 && metrics.passTimings.length > 0
    },
    { timeout: 10_000 }
  )

  const settings = await collectSettings(page)
  const metrics = await collectMetrics(page)
  const elapsedMs = Math.max(0.001, endTimeMs - startTimeMs)
  const measuredFrames = Math.max(0, endFrame - startFrame)
  const measuredFps = (measuredFrames * 1000) / elapsedMs
  const consoleErrors = page.__scenarioConsoleErrors.slice(consoleStart)
  const schroedingerPass = metrics.passTimings.find((p) => p.passId === 'schroedinger')
  const heaviestPass = metrics.passTimings
    .filter((p) => !p.skipped)
    .sort((a, b) => b.gpuTimeMs - a.gpuTimeMs)[0]

  return {
    generatedAt: new Date().toISOString(),
    status: 'ok',
    targetFps: TARGET_FPS,
    belowTarget: measuredFps < TARGET_FPS,
    scenario,
    settings,
    measurement: {
      warmupFrames,
      requestedMeasureFrames: measureFrames,
      measuredFrames,
      elapsedMs,
      measuredFps,
      overlayFps: metrics.overlayFps,
      frameTimeMs: metrics.frameTimeMs,
      cpuTimeMs: metrics.cpuTimeMs,
      totalGpuTimeMs: metrics.totalGpuTimeMs,
      vramMB: metrics.vramBytes / (1024 * 1024),
      cpuBreakdown: metrics.cpuBreakdown,
      schroedingerGpuMs: schroedingerPass?.gpuTimeMs ?? null,
      schroedingerComputeGpuMs: schroedingerPass?.computeGpuTimeMs ?? null,
      schroedingerRenderGpuMs: schroedingerPass?.renderGpuTimeMs ?? null,
      heaviestPass: heaviestPass
        ? { passId: heaviestPass.passId, gpuTimeMs: heaviestPass.gpuTimeMs }
        : null,
      passTimings: metrics.passTimings,
      fpsHistory: metrics.fpsHistory,
    },
    consoleErrors,
  }
}

function timeoutForFrames(frameCount) {
  return Math.max(90_000, Math.ceil((frameCount / 3) * 1000) + 45_000)
}

function appendJsonl(file, value) {
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`)
}

function printResult(result) {
  if (result.status !== 'ok') {
    console.log(`ERR ${result.scenario.key}: ${result.error}`)
    return
  }
  const m = result.measurement
  const mark = result.belowTarget ? 'LOW' : 'OK '
  const bottleneck = m.heaviestPass
    ? `${m.heaviestPass.passId}:${m.heaviestPass.gpuTimeMs.toFixed(2)}ms`
    : 'n/a'
  console.log(
    `${mark} ${result.scenario.key.padEnd(58)} ` +
      `fps=${m.measuredFps.toFixed(1).padStart(5)} ` +
      `overlay=${String(m.overlayFps).padStart(3)} ` +
      `gpu=${m.totalGpuTimeMs.toFixed(2).padStart(6)}ms ` +
      `bottleneck=${bottleneck}`
  )
}

function summarize(results) {
  const ok = results.filter((r) => r.status === 'ok')
  const errors = results.filter((r) => r.status !== 'ok')
  const below = ok.filter((r) => r.belowTarget)
  const byMode = new Map()
  for (const result of ok) {
    const key = `${result.scenario.objectType}/${result.scenario.mode}`
    const current = byMode.get(key) ?? { count: 0, below: 0, minFps: Infinity, maxGpuMs: 0 }
    current.count++
    if (result.belowTarget) current.below++
    current.minFps = Math.min(current.minFps, result.measurement.measuredFps)
    current.maxGpuMs = Math.max(current.maxGpuMs, result.measurement.totalGpuTimeMs)
    byMode.set(key, current)
  }

  return {
    generatedAt: new Date().toISOString(),
    baseURL,
    targetFps: TARGET_FPS,
    warmupFrames,
    measureFrames,
    outputFile,
    totalScenarios: results.length,
    ok: ok.length,
    errors: errors.length,
    belowTarget: below.length,
    minFps: ok.length > 0 ? Math.min(...ok.map((r) => r.measurement.measuredFps)) : Number.NaN,
    slowest: ok
      .slice()
      .sort((a, b) => a.measurement.measuredFps - b.measurement.measuredFps)
      .slice(0, 30)
      .map((r) => ({
        key: r.scenario.key,
        measuredFps: r.measurement.measuredFps,
        overlayFps: r.measurement.overlayFps,
        totalGpuTimeMs: r.measurement.totalGpuTimeMs,
        heaviestPass: r.measurement.heaviestPass,
      })),
    errorsList: errors.map((r) => ({ key: r.scenario.key, error: r.error })),
    byMode: Object.fromEntries(byMode),
  }
}

async function main() {
  ensureLogsDir()
  await assertServerReachable()
  const consoleErrors = []
  const browser = await chromium.launch({
    channel: 'chrome',
    args: [
      '--headless=new',
      '--enable-gpu',
      '--enable-unsafe-webgpu',
      '--ignore-gpu-blocklist',
      '--use-angle=metal',
      '--use-gl=angle',
    ],
  })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  page.__scenarioConsoleErrors = consoleErrors
  attachConsoleCapture(page, consoleErrors)

  try {
    await page.goto(baseURL)
    await waitForAppLoaded(page)
    const gpu = await requireWebGPU(page)
    await waitForStoreBridge(page)
    const allScenarios = await getScenarioCatalog(page)
    const selectedScenarios = allScenarios
      .filter((scenario) =>
        filter ? filter.test(scenario.key) || filter.test(scenario.label) : true
      )
      .slice(0, limit ?? undefined)

    console.log(
      `scenario-preset-benchmark: ${selectedScenarios.length}/${allScenarios.length} scenarios, ` +
        `base=${baseURL}, gpu=${gpu}, warmup=${warmupFrames}, measure=${measureFrames}`
    )

    if (listOnly) {
      for (const scenario of selectedScenarios) {
        console.log(`${String(scenario.index).padStart(3)} ${scenario.key} "${scenario.label}"`)
      }
      return
    }

    fs.writeFileSync(outputFile, '')
    const results = []
    for (let i = 0; i < selectedScenarios.length; i++) {
      const scenario = selectedScenarios[i]
      process.stdout.write(`[${i + 1}/${selectedScenarios.length}] `)
      try {
        const result = await benchmarkScenario(page, scenario)
        appendJsonl(outputFile, result)
        results.push(result)
        printResult(result)
      } catch (error) {
        const result = {
          generatedAt: new Date().toISOString(),
          status: 'error',
          targetFps: TARGET_FPS,
          scenario,
          error: error instanceof Error ? error.message : String(error),
          consoleErrors: consoleErrors.slice(-20),
        }
        appendJsonl(outputFile, result)
        results.push(result)
        printResult(result)
      }
    }

    const summary = summarize(results)
    fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2))
    console.log(`summary: ${summaryFile}`)
    console.log(
      `complete: ok=${summary.ok} errors=${summary.errors} belowTarget=${summary.belowTarget} minFps=${summary.minFps.toFixed(1)}`
    )
  } finally {
    await withTimeout(
      context.close().catch(() => {}),
      2_000,
      'context.close()'
    )
    await withTimeout(
      browser.close().catch(() => {}),
      2_000,
      'browser.close()'
    )
  }
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error))
    process.exit(1)
  })
