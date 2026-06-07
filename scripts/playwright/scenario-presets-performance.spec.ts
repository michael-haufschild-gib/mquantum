/**
 * Scenario preset performance sweep.
 *
 * Parses docs/reports/scenario_presets.md and measures every documented
 * scenario preset at its highest listed scene dimension. This is a benchmark,
 * not a correctness spec: sub-target FPS is logged for optimization work.
 *
 * Run against the already-running dev server:
 *   PLAYWRIGHT_DEV_SERVER_PORT=3100 pnpm exec playwright test \
 *     --config playwright.benchmark.config.ts \
 *     scripts/playwright/scenario-presets-performance.spec.ts --workers=1
 */

import fs from 'node:fs'
import path from 'node:path'

import type { Page, TestInfo } from '@playwright/test'

import { test } from './fixtures'
import {
  getFrameCount,
  getPerformanceMetrics,
  requireWebGPU,
  waitForAppLoaded,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

type ScenarioObjectType = 'schroedinger' | 'pauliSpinor' | 'bellPair'

interface ScenarioPassTiming {
  computeGpuTimeMs: number
  cpuTimeMs: number
  gpuTimeMs: number
  passId: string
  renderGpuTimeMs: number
  skipped: boolean
}

interface ScenarioPresetCase {
  objectType: ScenarioObjectType
  mode: string
  modeLabel: string
  presetId: string
  label: string
  dimensions: number[]
  dimension: number
  note: string
}

interface ScenarioPresetResult extends ScenarioPresetCase {
  camera: { distance: number; position: number[]; target: number[] }
  cpuTimeMs: number
  error?: string
  fps: number
  fpsMad: number
  fpsMax: number
  fpsMedian: number
  fpsMin: number
  frameTimeMs: number
  measuredFrames: number
  measurementElapsedMs: number
  noise: 'low' | 'medium' | 'high'
  overlayFps: number
  passTimings: ScenarioPassTiming[]
  status: 'pass' | 'fail' | 'error'
  totalGpuTimeMs: number
  viewport: { dpr: number; height: number; width: number }
  vramMB: number
  samples: ScenarioPresetSample[]
}

const DOC_PATH = path.resolve(process.cwd(), 'docs/reports/scenario_presets.md')
const OUT_DIR = path.resolve(process.cwd(), 'logs')
const TARGET_FPS = Number(process.env.SCENARIO_PERF_TARGET_FPS ?? 55)
const WARMUP_FRAMES = Number(process.env.SCENARIO_PERF_WARMUP_FRAMES ?? 60)
const MEASURE_FRAMES = Number(process.env.SCENARIO_PERF_MEASURE_FRAMES ?? 120)
const SAMPLE_COUNT = Math.max(1, Math.floor(Number(process.env.SCENARIO_PERF_SAMPLES ?? 3)))
const TIMEOUT_MS = Number(process.env.SCENARIO_PERF_TIMEOUT_MS ?? 28_800_000)
const PROFILING_STRIP = parseProfilingStrip(process.env.SCENARIO_PERF_PROFILING_STRIP)
const DEFAULT_CAMERA_POSITION = [0, 3.125, 7.5] as const
const DEFAULT_CAMERA_TARGET = [0, 0, 0] as const
const DEFAULT_CAMERA_DISTANCE = Math.hypot(
  DEFAULT_CAMERA_POSITION[0] - DEFAULT_CAMERA_TARGET[0],
  DEFAULT_CAMERA_POSITION[1] - DEFAULT_CAMERA_TARGET[1],
  DEFAULT_CAMERA_POSITION[2] - DEFAULT_CAMERA_TARGET[2]
)
const CAMERA_EPSILON = 1e-5

test.setTimeout(TIMEOUT_MS)

interface ScenarioPresetSample {
  camera: ScenarioPresetResult['camera']
  cpuTimeMs: number
  fps: number
  frameTimeMs: number
  measuredFrames: number
  measurementElapsedMs: number
  overlayFps: number
  passTimings: ScenarioPassTiming[]
  sample: number
  totalGpuTimeMs: number
  viewport: ScenarioPresetResult['viewport']
  vramMB: number
}

/** Parse the optional profiling-strip JSON used to disable selected renderer costs. */
function parseProfilingStrip(value: string | undefined): Record<string, boolean> | null {
  if (!value) return null
  const parsed = JSON.parse(value) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('SCENARIO_PERF_PROFILING_STRIP must be a JSON object')
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([key, raw]) => {
      if (typeof raw !== 'boolean') {
        throw new Error(`SCENARIO_PERF_PROFILING_STRIP.${key} must be boolean`)
      }
      return [key, raw]
    })
  )
}

/** Parse a documented dimension cell such as `3` or `3-6` into explicit dimensions. */
function parseDimensions(value: string): number[] {
  const trimmed = value.trim()
  const range = /^(\d+)-(\d+)$/.exec(trimmed)
  if (range) {
    const min = Number(range[1])
    const max = Number(range[2])
    return Array.from({ length: max - min + 1 }, (_, i) => min + i)
  }
  const single = Number(trimmed)
  if (Number.isInteger(single)) return [single]
  throw new Error(`Unsupported dimension range: ${value}`)
}

/** Select the highest documented dimension for benchmark stress coverage. */
function pickDimension(dimensions: readonly number[]): number {
  return Math.max(...dimensions)
}

/** Extract benchmarkable scenario preset cases from the generated Markdown report. */
function parseScenarioPresets(markdown: string): {
  declaredTotal: number | null
  scenarios: ScenarioPresetCase[]
} {
  const totalMatch = /^Total scenario presets:\s*(\d+)\./m.exec(markdown)
  const declaredTotal = totalMatch ? Number(totalMatch[1]) : null
  const scenarios: ScenarioPresetCase[] = []
  let current:
    | {
        mode: string
        modeLabel: string
        objectType: ScenarioObjectType
      }
    | undefined

  for (const line of markdown.split('\n')) {
    const heading = /^## `?([^`/\s]+)`? \/ `?([^`\s]+)`? - (.+)$/.exec(line)
    if (heading) {
      current = {
        objectType: heading[1] as ScenarioObjectType,
        mode: heading[2]!,
        modeLabel: heading[3]!.trim(),
      }
      continue
    }

    if (!current) continue
    const row = /^\| `([^`]+)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/.exec(line)
    if (!row) continue
    const dimensions = parseDimensions(row[3]!)
    scenarios.push({
      ...current,
      presetId: row[1]!,
      label: row[2]!.trim(),
      dimensions,
      dimension: pickDimension(dimensions),
      note: row[4]!.trim(),
    })
  }

  return { declaredTotal, scenarios }
}

/** Build the active scenario list after applying environment filters and limits. */
function activeScenarioSet(): ScenarioPresetCase[] {
  const markdown = fs.readFileSync(DOC_PATH, 'utf8')
  const parsed = parseScenarioPresets(markdown)
  if (parsed.declaredTotal !== null && parsed.scenarios.length !== parsed.declaredTotal) {
    throw new Error(
      `Parsed ${parsed.scenarios.length} scenario presets from ${DOC_PATH}, expected ${parsed.declaredTotal}`
    )
  }

  let scenarios = parsed.scenarios
  const modeFilter = process.env.SCENARIO_PERF_MODE
  if (modeFilter) scenarios = scenarios.filter((s) => s.mode === modeFilter)

  const presetFilter = process.env.SCENARIO_PERF_PRESET
  if (presetFilter) scenarios = scenarios.filter((s) => s.presetId === presetFilter)

  const limit = Number(process.env.SCENARIO_PERF_LIMIT ?? 0)
  if (Number.isInteger(limit) && limit > 0) scenarios = scenarios.slice(0, limit)

  return scenarios
}

const SCENARIOS = activeScenarioSet()

/** Convert a scenario case into the app URL that selects object type, mode, and dimension. */
function scenarioUrl(scenario: ScenarioPresetCase): string {
  const params = new URLSearchParams({
    d: String(scenario.dimension),
    t: scenario.objectType,
  })
  if (scenario.objectType === 'schroedinger') params.set('qm', scenario.mode)
  return `/?${params.toString()}`
}

/** Convert unknown caught values into stable report strings. */
function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Compute the median value of a numeric sample set. */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

/** Compute median absolute deviation around the supplied or computed center. */
function medianAbsoluteDeviation(values: readonly number[], center = median(values)): number {
  return median(values.map((value) => Math.abs(value - center)))
}

/** Classify FPS spread so noisy scenarios are easy to triage in the report. */
function classifyNoise(fpsMad: number, fpsMedian: number): ScenarioPresetResult['noise'] {
  if (fpsMedian <= 0) return 'high'
  const relative = fpsMad / fpsMedian
  if (fpsMad >= 5 || relative >= 0.1) return 'high'
  if (fpsMad >= 2 || relative >= 0.04) return 'medium'
  return 'low'
}

/** Pick the sample closest to median FPS for representative non-FPS metrics. */
function representativeSample(
  samples: readonly ScenarioPresetSample[],
  fpsMedian: number
): ScenarioPresetSample {
  if (samples.length === 0) throw new Error('representativeSample requires at least one sample')
  return [...samples].sort((a, b) => Math.abs(a.fps - fpsMedian) - Math.abs(b.fps - fpsMedian))[0]!
}

/** Aggregate repeated samples into one scenario result with median, range, and noise fields. */
function aggregateScenarioResult(
  scenario: ScenarioPresetCase,
  samples: ScenarioPresetSample[]
): ScenarioPresetResult {
  const fpsValues = samples.map((sample) => sample.fps)
  const fpsMedian = median(fpsValues)
  const fpsMad = medianAbsoluteDeviation(fpsValues, fpsMedian)
  const representative = representativeSample(samples, fpsMedian)
  return {
    ...scenario,
    ...representative,
    fps: fpsMedian,
    fpsMad,
    fpsMax: Math.max(...fpsValues),
    fpsMedian,
    fpsMin: Math.min(...fpsValues),
    noise: classifyNoise(fpsMad, fpsMedian),
    samples,
    status: fpsMedian >= TARGET_FPS ? 'pass' : 'fail',
  }
}

/** Reset the app camera to a deterministic default and wait for a rendered frame. */
async function resetCamera(page: Page): Promise<ScenarioPresetResult['camera']> {
  const camera = await page.evaluate(
    ({ distance, eps, position, target }) => {
      const cameraStore = window.__CAMERA_STORE__
      if (!cameraStore) throw new Error('__CAMERA_STORE__ missing on window')

      cameraStore.getState().reset()
      const captured = cameraStore.getState().captureState()
      if (!captured) throw new Error('camera reset failed: captureState returned null')

      const close = (a: number, b: number) => Math.abs(a - b) <= eps
      const positionMatches = captured.position.every((value, index) =>
        close(value, position[index]!)
      )
      const targetMatches = captured.target.every((value, index) => close(value, target[index]!))
      const actualDistance = Math.hypot(
        captured.position[0] - captured.target[0],
        captured.position[1] - captured.target[1],
        captured.position[2] - captured.target[2]
      )
      if (!positionMatches || !targetMatches || !close(actualDistance, distance)) {
        throw new Error(
          `camera reset mismatch: position=${captured.position.join(',')} target=${captured.target.join(',')} distance=${actualDistance}`
        )
      }
      return {
        distance: actualDistance,
        position: [...captured.position],
        target: [...captured.target],
      }
    },
    {
      distance: DEFAULT_CAMERA_DISTANCE,
      eps: CAMERA_EPSILON,
      position: DEFAULT_CAMERA_POSITION,
      target: DEFAULT_CAMERA_TARGET,
    }
  )

  const frame = await getFrameCount(page)
  await waitForFrameAdvance(page, frame, 15_000)
  return camera
}

/** Enable uncapped playback and expanded performance metrics in the app stores. */
async function configurePerfCollection(page: Page): Promise<void> {
  await page.evaluate(() => {
    const perfStore = window.__PERFORMANCE_STORE__
    const uiStore = window.__UI_STORE__
    const animationStore = window.__ANIMATION_STORE__
    if (!perfStore || !uiStore || !animationStore) {
      throw new Error('__PERFORMANCE_STORE__/__UI_STORE__/__ANIMATION_STORE__ missing on window')
    }
    perfStore.getState().setMaxFps(0)
    uiStore.setState({ showPerfMonitor: true, perfMonitorExpanded: true })
    animationStore.getState().play()
  })
}

/** Apply the scenario preset using the same mode-specific store actions as the UI. */
async function applyScenarioPreset(page: Page, scenario: ScenarioPresetCase): Promise<void> {
  await page.evaluate(async (input) => {
    const extStore = window.__EXTENDED_OBJECT_STORE__
    const appearanceStore = window.__APPEARANCE_STORE__
    if (!extStore) throw new Error('__EXTENDED_OBJECT_STORE__ missing on window')

    const state = extStore.getState()
    switch (input.mode) {
      case 'harmonicOscillator':
        state.setSchroedingerPresetName(input.presetId)
        break
      case 'hydrogenND':
        state.setSchroedingerHydrogenNDPreset(input.presetId)
        break
      case 'hydrogenNDCoupled': {
        const { HYDROGEN_COUPLED_PRESETS } =
          await import('/src/lib/physics/hydrogenCoupled/presets.ts')
        const preset = HYDROGEN_COUPLED_PRESETS.find((p) => p.id === input.presetId)
        if (!preset) throw new Error(`Hydrogen-coupled preset missing: ${input.presetId}`)
        state.setSchroedingerConfig(preset.overrides)
        break
      }
      case 'tdseDynamics':
        await state.applyTdsePreset(input.presetId, { expectedQuantumMode: 'tdseDynamics' })
        break
      case 'becDynamics':
        await state.applyBecPreset(input.presetId, { expectedQuantumMode: 'becDynamics' })
        break
      case 'diracEquation':
        await state.applyDiracPreset(input.presetId, { expectedQuantumMode: 'diracEquation' })
        break
      case 'freeScalarField':
        await state.applyFreeScalarPreset(input.presetId, {
          expectedQuantumMode: 'freeScalarField',
        })
        break
      case 'quantumWalk':
        await state.applyQuantumWalkPreset(input.presetId, { expectedQuantumMode: 'quantumWalk' })
        break
      case 'wheelerDeWitt':
        await state.applyWheelerDeWittPreset(input.presetId, {
          expectedQuantumMode: 'wheelerDeWitt',
        })
        break
      case 'antiDeSitter': {
        state.setAdsPreset(input.presetId)
        const { ADS_PRESETS } = await import('/src/lib/physics/antiDeSitter/presets.ts')
        const preset = ADS_PRESETS.find((p) => p.id === input.presetId)
        if (preset?.colorAlgorithm && appearanceStore) {
          appearanceStore.getState().setColorAlgorithm(preset.colorAlgorithm)
        }
        break
      }
      case 'pauliSpinor': {
        const { PAULI_SCENARIO_PRESETS } = await import('/src/lib/physics/pauli/presets.ts')
        const preset = PAULI_SCENARIO_PRESETS.find((p) => p.id === input.presetId)
        if (!preset) throw new Error(`Pauli preset missing: ${input.presetId}`)
        state.setPauliConfig({ ...preset.overrides, needsReset: true })
        break
      }
      case 'bellTest': {
        const { BELL_SCENARIO_PRESETS } = await import('/src/lib/physics/bell/presets.ts')
        const preset = BELL_SCENARIO_PRESETS.find((p) => p.id === input.presetId)
        if (!preset) throw new Error(`Bell preset missing: ${input.presetId}`)
        state.setBellPairConfig({ ...preset.overrides, needsReset: true })
        break
      }
      default:
        throw new Error(`Unsupported scenario mode: ${input.mode}`)
    }
  }, scenario)
}

/** Wait until the performance metrics store has populated frame and pass timings. */
async function waitForMetrics(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const store = window.__PERFORMANCE_METRICS_STORE__
      if (!store) return false
      const state = store.getState()
      return (
        state.fps > 0 &&
        state.frameTime > 0 &&
        state.cpuTime >= 0 &&
        state.passTimings.some((p) => !p.skipped && p.cpuTimeMs >= 0)
      )
    },
    { timeout: 15_000 }
  )
}

/** Measure one warmed-up scenario sample from canvas frame-count deltas and perf store data. */
async function measureScenario(page: Page, sample: number): Promise<ScenarioPresetSample> {
  const camera = await resetCamera(page)
  await configurePerfCollection(page)

  const warmupStart = await getFrameCount(page)
  await waitForFrameAdvance(page, warmupStart + WARMUP_FRAMES, 60_000)
  await waitForMetrics(page)

  const measurement = await page.evaluate(
    async ({ measureFrames }) => {
      const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
      if (!canvas) throw new Error('webgpu canvas missing')
      const readFrame = () => Number.parseInt(canvas.getAttribute('data-frame-count') ?? '0', 10)
      const startFrame = readFrame()
      const startTimeMs = performance.now()
      let endFrame = readFrame()
      let endTimeMs = startTimeMs

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => {
          reject(new Error(`measurement timed out after ${measureFrames} frames`))
        }, 90_000)
        const tick = () => {
          endFrame = readFrame()
          endTimeMs = performance.now()
          if (endFrame - startFrame >= measureFrames) {
            window.clearTimeout(timeout)
            resolve()
            return
          }
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })

      return { endFrame, endTimeMs, startFrame, startTimeMs }
    },
    { measureFrames: MEASURE_FRAMES }
  )
  await waitForMetrics(page)

  const metrics = await getPerformanceMetrics(page)
  const viewport = await page.evaluate(() => {
    const store = window.__PERFORMANCE_METRICS_STORE__
    if (!store) throw new Error('__PERFORMANCE_METRICS_STORE__ missing on window')
    const { viewport: v } = store.getState()
    return { width: v.width, height: v.height, dpr: v.dpr }
  })
  const measuredFrames = Math.max(0, measurement.endFrame - measurement.startFrame)
  const measurementElapsedMs = Math.max(0.001, measurement.endTimeMs - measurement.startTimeMs)
  const measuredFps = (measuredFrames * 1000) / measurementElapsedMs

  return {
    camera,
    cpuTimeMs: metrics.cpuTime,
    fps: measuredFps,
    frameTimeMs: metrics.frameTime,
    measuredFrames,
    measurementElapsedMs,
    overlayFps: metrics.fps,
    passTimings: metrics.passTimings,
    sample,
    totalGpuTimeMs: metrics.totalGpuTimeMs,
    viewport,
    vramMB: metrics.vramMB,
  }
}

/** Navigate, initialize WebGPU, apply the preset, and settle shader compilation. */
async function bootScenario(
  page: Page,
  scenario: ScenarioPresetCase,
  testInfo: TestInfo
): Promise<void> {
  await page.goto(scenarioUrl(scenario))
  await waitForAppLoaded(page)
  await requireWebGPU(page, testInfo)
  await waitForRendererReady(page)
  await waitForShaderCompilation(page)
  await resetCamera(page)
  await applyScenarioPreset(page, scenario)
  await waitForRendererReady(page)
  await waitForShaderCompilation(page)
  await resetCamera(page)
}

/** Return the pass with highest GPU time for concise slow-case reporting. */
function topBottleneck(result: ScenarioPresetResult): string {
  const timing = [...result.passTimings]
    .filter((p) => !p.skipped)
    .sort((a, b) => b.gpuTimeMs - a.gpuTimeMs)[0]
  if (!timing) return 'n/a'
  return `${timing.passId} ${timing.gpuTimeMs.toFixed(3)}ms`
}

/** Write JSON, latest aliases, Markdown summary, and stdout payload for the sweep. */
function writeResults(results: ScenarioPresetResult[]): void {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const stamp = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14)
  const payload = {
    generated: new Date().toISOString(),
    docPath: DOC_PATH,
    targetFps: TARGET_FPS,
    warmupFrames: WARMUP_FRAMES,
    measureFrames: MEASURE_FRAMES,
    dimensionPolicy: 'highest-listed-compatible-dimension',
    profilingStrip: PROFILING_STRIP,
    sampleCount: SAMPLE_COUNT,
    total: results.length,
    passing: results.filter((r) => r.status === 'pass').length,
    failing: results.filter((r) => r.status === 'fail').length,
    errors: results.filter((r) => r.status === 'error').length,
    results,
  }
  const jsonPath = path.join(OUT_DIR, `scenario_preset_perf_${stamp}.json`)
  const latestPath = path.join(OUT_DIR, 'scenario_preset_perf_latest.json')
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2))
  fs.writeFileSync(latestPath, JSON.stringify(payload, null, 2))

  const sorted = [...results].sort((a, b) => a.fps - b.fps)
  const markdown = [
    '# Scenario Preset Performance Sweep',
    '',
    `- Generated: ${payload.generated}`,
    `- Target FPS: ${TARGET_FPS}`,
    `- Samples per preset: ${SAMPLE_COUNT}`,
    `- Total: ${payload.total}`,
    `- Passing: ${payload.passing}`,
    `- Failing: ${payload.failing}`,
    `- Errors: ${payload.errors}`,
    `- JSON: ${jsonPath}`,
    '',
    '## Slowest Presets',
    '',
    '| FPS median | MAD | Min | Max | Overlay | Frame ms | Noise | Mode | Preset | Dim | Bottleneck |',
    '|---:|---:|---:|---:|---:|---:|---|---|---|---:|---|',
    ...sorted
      .slice(0, 40)
      .map(
        (r) =>
          `| ${r.fpsMedian.toFixed(1)} | ${r.fpsMad.toFixed(1)} | ${r.fpsMin.toFixed(1)} | ${r.fpsMax.toFixed(1)} | ${r.overlayFps} | ${r.frameTimeMs.toFixed(2)} | ${r.noise} | ${r.mode} | ${r.presetId} | ${r.dimension} | ${topBottleneck(r)} |`
      ),
    '',
  ].join('\n')
  fs.writeFileSync(path.join(OUT_DIR, `scenario_preset_perf_${stamp}.md`), markdown)
  fs.writeFileSync(path.join(OUT_DIR, 'scenario_preset_perf_latest.md'), markdown)

  console.log('SCENARIO_PRESET_PERF_JSON_START')
  console.log(JSON.stringify(payload, null, 2))
  console.log('SCENARIO_PRESET_PERF_JSON_END')
}

test.describe('scenario preset performance sweep', () => {
  test.describe.configure({ mode: 'serial' })

  test('measures every documented scenario preset', async ({ page }, testInfo) => {
    const results: ScenarioPresetResult[] = []

    if (PROFILING_STRIP) {
      await page.addInitScript((strip) => {
        ;(globalThis as Record<string, unknown>).__PROFILING_STRIP__ = strip
      }, PROFILING_STRIP)
    }

    for (const [index, scenario] of SCENARIOS.entries()) {
      const prefix = `${index + 1}/${SCENARIOS.length}`
      console.log(
        `[scenario-perf] ${prefix} ${scenario.objectType}/${scenario.mode}/${scenario.presetId} d=${scenario.dimension}`
      )

      try {
        await bootScenario(page, scenario, testInfo)
        const samples: ScenarioPresetSample[] = []
        for (let sampleIndex = 0; sampleIndex < SAMPLE_COUNT; sampleIndex++) {
          const sample = await measureScenario(page, sampleIndex + 1)
          samples.push(sample)
          console.log(
            `[scenario-perf] ${prefix} sample=${sample.sample}/${SAMPLE_COUNT} fps=${sample.fps.toFixed(1)} overlay=${sample.overlayFps} frame=${sample.frameTimeMs.toFixed(2)}ms gpu=${sample.totalGpuTimeMs.toFixed(2)}ms`
          )
        }
        const result = aggregateScenarioResult(scenario, samples)
        results.push(result)
        console.log(
          `[scenario-perf] ${prefix} median=${result.fpsMedian.toFixed(1)} mad=${result.fpsMad.toFixed(1)} range=${result.fpsMin.toFixed(1)}-${result.fpsMax.toFixed(1)} noise=${result.noise} overlay=${result.overlayFps} frame=${result.frameTimeMs.toFixed(2)}ms gpu=${result.totalGpuTimeMs.toFixed(2)}ms bottleneck=${topBottleneck(result)}`
        )
      } catch (error) {
        const result: ScenarioPresetResult = {
          ...scenario,
          camera: { distance: 0, position: [], target: [] },
          cpuTimeMs: 0,
          error: stringifyError(error),
          fps: 0,
          fpsMad: 0,
          fpsMax: 0,
          fpsMedian: 0,
          fpsMin: 0,
          frameTimeMs: 0,
          measuredFrames: 0,
          measurementElapsedMs: 0,
          noise: 'high',
          overlayFps: 0,
          passTimings: [],
          samples: [],
          status: 'error',
          totalGpuTimeMs: 0,
          viewport: { dpr: 0, height: 0, width: 0 },
          vramMB: 0,
        }
        results.push(result)
        console.log(`[scenario-perf] ${prefix} error=${result.error}`)
      }
    }

    writeResults(results)
  })
})
