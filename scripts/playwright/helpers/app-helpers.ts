/**
 * Shared e2e test helpers for the mquantum app.
 *
 * Provides deterministic wait conditions, store access, and error collection
 * so spec files stay focused on user-flow assertions.
 */

import { expect, type Page } from '@playwright/test'
import sharp from 'sharp'

// ─── Constants ───────────────────────────────────────────────────────────────

export const RENDERER_READY_TIMEOUT = 15_000
export const FIRST_FRAME_TIMEOUT = 20_000
export const APP_LOAD_TIMEOUT = 15_000
export const UI_SETTLE_TIMEOUT = 5_000

// ─── App Load & Renderer ─────────────────────────────────────────────────────

/** Wait for the top bar to be visible — proves React tree mounted. */
export async function waitForAppLoaded(page: Page): Promise<void> {
  await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: APP_LOAD_TIMEOUT })
}

/** Wait for WebGPU renderer to report "ready". */
export async function waitForRendererReady(page: Page): Promise<void> {
  await expect(
    page.locator('[data-testid="webgpu-container"][data-renderer-state="ready"]')
  ).toBeVisible({ timeout: RENDERER_READY_TIMEOUT })
}

/** Wait for the renderer to settle to "ready" or "error" — never stuck at "initializing". */
export async function waitForRendererSettled(page: Page): Promise<'ready' | 'error'> {
  const container = page.locator('[data-testid="webgpu-container"]')
  await expect(async () => {
    const state = await container.getAttribute('data-renderer-state')
    expect(['ready', 'error']).toContain(state)
  }).toPass({ timeout: RENDERER_READY_TIMEOUT })
  return (await container.getAttribute('data-renderer-state')) as 'ready' | 'error'
}

/** Wait until data-frame-count > 0 on the canvas. */
export async function waitForFirstFrame(
  page: Page,
  timeoutMs = FIRST_FRAME_TIMEOUT
): Promise<void> {
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
      return parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10) > 0
    },
    { timeout: timeoutMs }
  )
}

/** Read current frame count from the canvas attribute. */
export async function getFrameCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
    return parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10)
  })
}

/**
 * Wait for frame count to increase beyond a known value.
 * Replaces `waitForTimeout(1000)` in animation tests.
 */
export async function waitForFrameAdvance(
  page: Page,
  beyondCount: number,
  timeoutMs = 10_000
): Promise<number> {
  await page.waitForFunction(
    (minCount: number) => {
      const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
      return parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10) > minCount
    },
    beyondCount,
    { timeout: timeoutMs }
  )
  return getFrameCount(page)
}

/**
 * Wait for a store uniform change to propagate to the GPU.
 *
 * After mutating a Zustand store value that flows through uniforms (not a
 * shader recompilation), the new value takes effect on the next frame.
 * Wait for 2 frames to ensure the uniform buffer is updated and one full
 * frame has been rendered with the new value.
 */
export async function waitForUniformUpdate(page: Page): Promise<void> {
  const current = await getFrameCount(page)
  await waitForFrameAdvance(page, current + 2)
}

// ─── Navigation ──────────────────────────────────────────────────────────────

/** Navigate to a specific quantum mode + dimension. */
export async function gotoMode(page: Page, mode: string, dim = 3): Promise<void> {
  await page.goto(`/?t=schroedinger&d=${dim}&qm=${mode}`)
  await waitForAppLoaded(page)
}

/**
 * Navigate to a quantum mode with extended URL params.
 * Params are merged — only specified values override defaults.
 *
 * @example
 * ```ts
 * await gotoModeWithParams(page, 'tdseDynamics', 3, { obs: '1', diag: '1', pot: 'harmonicTrap' })
 * ```
 */
export async function gotoModeWithParams(
  page: Page,
  mode: string,
  dim: number,
  params: Record<string, string>
): Promise<void> {
  const search = new URLSearchParams({ t: 'schroedinger', d: String(dim), qm: mode, ...params })
  await page.goto(`/?${search.toString()}`)
  await waitForAppLoaded(page)
}

/**
 * Check whether WebGPU is available.
 *
 * IMPORTANT: WebGPU requires a secure context (https: or localhost).
 * This function navigates to baseURL first if the page is on about:blank,
 * because navigator.gpu is undefined on insecure/blank origins.
 */
export async function hasWebGPU(page: Page): Promise<boolean> {
  // WebGPU needs a secure context — about:blank won't have navigator.gpu
  if (page.url() === 'about:blank') {
    await page.goto('/')
    await waitForAppLoaded(page)
  }
  return page.evaluate(async () => {
    if (!navigator.gpu) return false
    return !!(await navigator.gpu.requestAdapter())
  })
}

/**
 * Assert WebGPU is available — hard fail if not.
 *
 * Use this instead of `test.skip(!(await hasWebGPU(page)))`.
 * Only falls back to skip if ALLOW_GPU_SKIP=1 is set.
 *
 * This prevents AI agents from silently skipping GPU tests and claiming
 * "all tests passed" when WebGPU was never actually tested.
 */
export async function requireWebGPU(
  page: Page,
  testInfo: { skip: (skip: boolean, description?: string) => void }
): Promise<void> {
  const available = await hasWebGPU(page)
  if (available) return

  if (process.env.ALLOW_GPU_SKIP === '1') {
    testInfo.skip(true, 'WebGPU not available (ALLOW_GPU_SKIP=1)')
    return
  }

  throw new Error(
    'WebGPU is NOT available but ALLOW_GPU_SKIP is not set. ' +
      'This test requires GPU. Fix the Chrome launch flags or set ALLOW_GPU_SKIP=1.'
  )
}

// ─── Store Access ────────────────────────────────────────────────────────────

/** Read geometry store fields from the running app. */
export async function getGeometryState(page: Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/geometryStore.ts')
    const s = mod.useGeometryStore.getState()
    return { dimension: s.dimension, objectType: s.objectType }
  })
}

/** Read the current quantum mode from the extended object store. */
export async function getQuantumMode(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    const s = mod.useExtendedObjectStore.getState() as Record<string, unknown>
    const schroedinger = s.schroedinger as Record<string, unknown> | undefined
    return (schroedinger?.quantumMode as string) ?? 'unknown'
  })
}

/** Read dimension from geometry store. */
export async function getDimension(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/geometryStore.ts')
    return mod.useGeometryStore.getState().dimension
  })
}

/** Read full app state snapshot for URL/store consistency checks. */
export async function getAppState(page: Page) {
  return page.evaluate(async () => {
    const geoMod = await import('/src/stores/geometryStore.ts')
    const extMod = await import('/src/stores/extendedObjectStore.ts')
    const geo = geoMod.useGeometryStore.getState()
    const ext = extMod.useExtendedObjectStore.getState() as Record<string, unknown>
    const schroedinger = ext.schroedinger as Record<string, unknown> | undefined
    return {
      dimension: geo.dimension,
      objectType: geo.objectType,
      quantumMode: (schroedinger?.quantumMode as string) ?? 'unknown',
    }
  })
}

// ─── Error Collection ────────────────────────────────────────────────────────
//
// GPU/shader error collection is handled automatically by the test fixtures
// (see fixtures.ts). The collectFatalGpuErrors and collectGpuWarningsAndErrors
// functions were removed — use fixtures instead.

/** Attach a listener for all uncaught page errors. Returns the array (mutated in-place). */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

/**
 * Filter out known benign errors (ResizeObserver) from a page error list.
 */
export function filterBenignErrors(errors: string[]): string[] {
  return errors.filter((e) => !e.includes('ResizeObserver'))
}

// ─── Diagnostic Store Readers ────────────────────────────────────────────────

/** Read TDSE diagnostics from the running app (GPU readback values). */
export async function readTdseDiagnostics(page: Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/diagnosticsStore.ts')
    const s = mod.useDiagnosticsStore.getState().tdse
    return {
      hasData: s.hasData,
      totalNorm: s.totalNorm,
      normDrift: s.normDrift,
      R: s.R,
      T: s.T,
      ipr: s.ipr,
      maxDensity: s.maxDensity,
      simTime: s.simTime,
    }
  })
}

/** Read Pauli spinor diagnostics from the running app (GPU readback values). */
export async function readPauliDiagnostics(page: Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/diagnosticsStore.ts')
    const s = mod.useDiagnosticsStore.getState().pauli
    return {
      hasData: s.hasData,
      totalNorm: s.totalNorm,
      normDrift: s.normDrift,
      spinUpFraction: s.spinUpFraction,
      spinDownFraction: s.spinDownFraction,
      spinExpectationZ: s.spinExpectationZ,
      coherenceMagnitude: s.coherenceMagnitude,
      larmorFrequency: s.larmorFrequency,
      maxDensity: s.maxDensity,
    }
  })
}

/** Read BEC diagnostics from the running app (GPU readback values). */
export async function readBecDiagnostics(page: Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/diagnosticsStore.ts')
    const s = mod.useDiagnosticsStore.getState().bec
    return {
      hasData: s.hasData,
      totalNorm: s.totalNorm,
      normDrift: s.normDrift,
      chemicalPotential: s.chemicalPotential,
      healingLength: s.healingLength,
      soundSpeed: s.soundSpeed,
      thomasFermiRadius: s.thomasFermiRadius,
      maxDensity: s.maxDensity,
      vortexCount: s.vortexCount,
      vortexPlaquettes: s.vortexPlaquettes,
      vortexPositiveCharge: s.vortexPositiveCharge,
      vortexNegativeCharge: s.vortexNegativeCharge,
      incompressibleSpectrum: Array.from(s.incompressibleSpectrum),
      totalIncompressibleEnergy: s.totalIncompressibleEnergy,
      totalCompressibleEnergy: s.totalCompressibleEnergy,
    }
  })
}

/** Read Dirac diagnostics from the running app (GPU readback values). */
export async function readDiracDiagnostics(page: Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/diagnosticsStore.ts')
    const s = mod.useDiagnosticsStore.getState().dirac
    return {
      hasData: s.hasData,
      totalNorm: s.totalNorm,
      normDrift: s.normDrift,
      particleFraction: s.particleFraction,
      antiparticleFraction: s.antiparticleFraction,
      maxDensity: s.maxDensity,
    }
  })
}

/** Read free scalar field diagnostics from the running app (GPU readback values). */
export async function readFsfDiagnostics(page: Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/diagnosticsStore.ts')
    const s = mod.useDiagnosticsStore.getState().fsf
    return {
      hasData: s.hasData,
      totalEnergy: s.totalEnergy,
      totalNorm: s.totalNorm,
      energyDrift: s.energyDrift,
      maxPhi: s.maxPhi,
      maxPi: s.maxPi,
      meanPhi: s.meanPhi,
      variancePhi: s.variancePhi,
    }
  })
}

/** Read density grid diagnostics from the running app (GPU readback values). */
export async function readDensityDiagnostics(page: Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/diagnosticsStore.ts')
    const s = mod.useDiagnosticsStore.getState().density
    return {
      hasData: s.hasData,
      maxDensity: s.maxDensity,
      totalDensityMass: s.totalDensityMass,
      activeVoxelCount: s.activeVoxelCount,
      centerDensity: s.centerDensity,
      gridSize: s.gridSize,
      worldBound: s.worldBound,
    }
  })
}

/**
 * Wait for a diagnostic store to report hasData === true.
 * Diagnostics are decimated (every 5-60 frames), so this may take a few seconds.
 *
 * For the unified diagnosticsStore, pass the `channel` parameter to specify
 * which channel to check (e.g. 'tdse', 'bec', 'density'). Without `channel`,
 * checks top-level `hasData` (for legacy per-store modules).
 */
export async function waitForDiagnostics(
  page: Page,
  storeModule: string,
  timeout?: number,
  channel?: string
): Promise<void> {
  const effectiveTimeout = timeout ?? 30_000
  await page.waitForFunction(
    async ([modulePath, ch]: [string, string | null]) => {
      const mod = await import(/* @vite-ignore */ modulePath)
      const storeExports = Object.values(mod) as Array<{
        getState: () => Record<string, { hasData: boolean }>
      }>
      const store = storeExports.find(
        (v) => (typeof v === 'object' || typeof v === 'function') && v !== null && 'getState' in v
      )
      if (!store) return false
      const state = store.getState()
      if (ch) return (state[ch] as { hasData: boolean } | undefined)?.hasData === true
      return (state as unknown as { hasData: boolean }).hasData === true
    },
    [storeModule, channel ?? null] as [string, string | null],
    { timeout: effectiveTimeout }
  )
}

/**
 * Wait for a fresh GPU readback after a parameter change.
 *
 * Two-phase approach to avoid reading stale in-flight mapAsync data:
 * 1. Drain: wait a few frames so any in-flight readbacks from the OLD config
 *    complete and write to the store.
 * 2. Snapshot the current `readbackGeneration`, then wait for it to advance.
 *    The next readback is guaranteed to be from the NEW config.
 *
 * Use this instead of bare `waitForDiagnostics` after changing quantum
 * numbers, potential type, OQ config, or any parameter that changes what
 * the GPU computes.
 *
 * For the unified diagnosticsStore, pass the `channel` parameter to specify
 * which channel's readbackGeneration to track (e.g. 'tdse', 'density').
 */
export async function waitForFreshReadback(
  page: Page,
  storeModule: string,
  timeout = 30_000,
  channel?: string
): Promise<void> {
  // Phase 1: drain stale in-flight readbacks (typically ≤1 in flight)
  const fc = await getFrameCount(page)
  await waitForFrameAdvance(page, fc + 3, timeout)

  // Phase 2: snapshot generation and wait for a post-drain readback
  const gen = await page.evaluate(
    async ([mod, ch]: [string, string | null]) => {
      const m = await import(/* @vite-ignore */ mod)
      const store = (
        Object.values(m) as Array<{
          getState?: () => Record<string, { readbackGeneration: number }>
        }>
      ).find(
        (v) => (typeof v === 'object' || typeof v === 'function') && v !== null && 'getState' in v
      )
      if (!store?.getState) return 0
      const state = store.getState()
      if (ch)
        return (state[ch] as { readbackGeneration: number } | undefined)?.readbackGeneration ?? 0
      return (state as unknown as { readbackGeneration: number }).readbackGeneration ?? 0
    },
    [storeModule, channel ?? null] as [string, string | null]
  )

  await page.waitForFunction(
    async ([mod, prevGen, ch]: [string, number, string | null]) => {
      const m = await import(/* @vite-ignore */ mod)
      const store = (
        Object.values(m) as Array<{
          getState?: () => Record<string, { readbackGeneration: number }>
        }>
      ).find(
        (v) => (typeof v === 'object' || typeof v === 'function') && v !== null && 'getState' in v
      )
      if (!store?.getState) return false
      const state = store.getState()
      const gen = ch
        ? ((state[ch] as { readbackGeneration: number } | undefined)?.readbackGeneration ?? 0)
        : ((state as unknown as { readbackGeneration: number }).readbackGeneration ?? 0)
      return gen > prevGen
    },
    [storeModule, gen, channel ?? null] as [string, number, string | null],
    { timeout }
  )
}

/**
 * Reset a density diagnostics store and wait for fresh post-reset data.
 * Use after changing quantum numbers to avoid reading stale snapshots.
 */
export async function resetAndWaitForDensityDiagnostics(
  page: Page,
  timeout = 30_000
): Promise<void> {
  await page.evaluate(async () => {
    const mod = await import('/src/stores/diagnosticsStore.ts')
    mod.useDiagnosticsStore.getState().resetDensity()
  })
  await waitForFreshReadback(page, '/src/stores/diagnosticsStore.ts', timeout, 'density')
}

/**
 * Wait for the simulation to render at least `minFrames` frames.
 * For compute modes, simulation steps = frames × stepsPerFrame.
 */
export async function waitForSimulationFrames(
  page: Page,
  minFrames = 120,
  timeout = 60_000
): Promise<void> {
  await page.waitForFunction(
    (min: number) => {
      const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
      return parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10) > min
    },
    minFrames,
    { timeout }
  )
}

// ─── Shader Compilation ──────────────────────────────────────────────────────

/**
 * Wait for shader compilation to finish.
 *
 * The app tracks `isShaderCompiling` in the performance store. This goes
 * `true` at the start of pass setup and `false` in the `finally` block
 * after pipeline compilation completes (WebGPUScene.ts).
 *
 * Importantly, `graph.compile()` (which swaps the new pipeline into the
 * render loop) runs synchronously AFTER `isShaderCompiling` goes false.
 * So we also wait for at least one more rendered frame to ensure the
 * new pipeline is actually active — not the stale old one.
 */
export async function waitForShaderCompilation(page: Page, timeoutMs = 300_000): Promise<void> {
  // Wait for the pipeline generation attribute to appear on the canvas.
  // WebGPUScene writes data-pipeline-gen after graph.compile() succeeds.
  // This is a definitive signal that shaders are compiled and the render
  // graph is active — no polling of store flags, no timing races.
  await page.waitForFunction(
    () => {
      const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
      return parseInt(canvas?.getAttribute('data-pipeline-gen') ?? '0', 10) > 0
    },
    { timeout: timeoutMs }
  )

  // Wait for a frame rendered with the new pipeline
  const currentFrame = await getFrameCount(page)
  await waitForFrameAdvance(page, currentFrame)
}

// ─── Pixel Verification ──────────────────────────────────────────────────────

/**
 * Capture the WebGPU canvas and count how many sampled pixels are NOT dark
 * background. Samples a 20×20 grid (400 points).
 *
 * The canvas background is near-black (~13,13,13). Any pixel where ANY
 * channel exceeds 25 is counted as "content" — this catches green spheres,
 * white spheres, colored orbitals, brighter grays, dark greens, etc.
 *
 * Decodes the PNG in Node.js via sharp — no browser round-trip needed.
 */
export async function captureAndSamplePixels(page: Page): Promise<{
  nonBgPixels: number
  totalPixels: number
}> {
  // Capture the canvas element via compositor screenshot (avoids WebGPU
  // readback bug in headless Chrome 146+), then crop to center 30% to
  // safely exclude UI panels overlaid at edges. The left/right panels each
  // cover ~25-30% of canvas width; top/bottom bars cover ~10-15% of height.
  const canvas = page.locator('[data-testid="webgpu-canvas"]')
  const pngBuffer = await canvas.screenshot({ type: 'png' })
  const meta = await sharp(pngBuffer).metadata()
  const fullW = meta.width!
  const fullH = meta.height!
  const cropW = Math.floor(fullW * 0.3)
  const cropH = Math.floor(fullH * 0.3)

  const { data, info } = await sharp(pngBuffer)
    .extract({
      left: Math.floor((fullW - cropW) / 2),
      top: Math.floor((fullH - cropH) / 2),
      width: cropW,
      height: cropH,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  // Count every pixel where any channel exceeds the background threshold.
  // At ~384×216 (~83k pixels) this is sub-millisecond — no sampling needed.
  const DARK_THRESHOLD = 25
  const totalPixels = info.width * info.height
  let nonBgPixels = 0
  for (let i = 0; i < data.length; i += 4) {
    if (
      data[i]! > DARK_THRESHOLD ||
      data[i + 1]! > DARK_THRESHOLD ||
      data[i + 2]! > DARK_THRESHOLD
    ) {
      nonBgPixels++
    }
  }

  return { nonBgPixels, totalPixels }
}

/**
 * Assert that the WebGPU canvas has rendered non-blank content.
 *
 * Enforces the full wait sequence before sampling:
 * 1. Renderer in ready state (not error/initializing)
 * 2. Shader compilation complete (pipeline-gen > 0)
 * 3. Shader compilation overlay dismissed
 * 4. 2-second settle for compute modes to populate density grids
 *
 * Then takes 3 screenshots spaced 150ms apart and checks if ANY of them
 * show ≥5 non-background pixels. This handles modes like Free Scalar Field
 * that have faint fluctuations with phases of near-blackness — a single
 * snapshot can miss the content during a dark phase.
 */
export async function expectCanvasNotBlank(page: Page): Promise<void> {
  // Gate 1: renderer must be in ready state, not error
  const rendererState = await page
    .locator('[data-testid="webgpu-container"]')
    .getAttribute('data-renderer-state')
  expect(
    rendererState,
    'Renderer must be in ready state (not error/initializing) before pixel check'
  ).toBe('ready')

  // Gate 2: shader must be compiled and swapped in
  await waitForShaderCompilation(page)

  // Gate 3: shader compilation overlay must be gone (it covers the canvas center)
  await expect(page.getByTestId('shader-compilation-overlay')).not.toBeVisible({ timeout: 10_000 })

  // Gate 4: wait for sufficient frames to render after shader swap.
  // Compute modes need many frames for density grids to populate and
  // for walks/simulations to spread from initial conditions. At 60fps,
  // 120 frames = ~2 seconds. Heavy shader variants (open quantum,
  // decoherence) may run at 10-15fps, so allow 30s for 120 frames.
  const currentFrame = await getFrameCount(page)
  await waitForFrameAdvance(page, currentFrame + 120, 30_000)

  // Gate 5: check for GPU errors
  const consoleErrors = await page.evaluate(() => {
    const container = document.querySelector('[data-testid="webgpu-container"]')
    return container?.getAttribute('data-renderer-error') ?? null
  })
  if (consoleErrors) {
    throw new Error(`Renderer reported error: ${consoleErrors}`)
  }

  // Gate 6: frames must be advancing (not stuck)
  const frameCount = await getFrameCount(page)
  expect(frameCount, 'Frame count must be > 0 before pixel check').toBeGreaterThan(0)

  // Take 3 snapshots 150ms apart — modes with oscillating brightness
  // (FSF, some TDSE configs) may be dark at any single instant.
  let bestCount = 0
  for (let i = 0; i < 3; i++) {
    const { nonBgPixels } = await captureAndSamplePixels(page)
    bestCount = Math.max(bestCount, nonBgPixels)
    if (bestCount >= 5) break
    if (i < 2) {
      // Wait for a few frames to render between snapshots so oscillating
      // modes (FSF, some TDSE configs) show different phases.
      const fc = await getFrameCount(page)
      await waitForFrameAdvance(page, fc + 5)
    }
  }

  expect(
    bestCount,
    `At least 5 pixels in center crop must differ from background across 3 snapshots — proves an object rendered (best=${bestCount})`
  ).toBeGreaterThanOrEqual(5)
}

// ─── Performance Metrics ─────────────────────────────────────────────────────

/** Per-pass timing entry from the performance metrics store. */
export interface PassTimingSnapshot {
  passId: string
  gpuTimeMs: number
  computeGpuTimeMs: number
  renderGpuTimeMs: number
  cpuTimeMs: number
  skipped: boolean
}

/** Snapshot of performance metrics from the running app. */
export interface PerfMetricsSnapshot {
  fps: number
  frameTime: number
  cpuTime: number
  vramMB: number
  fpsHistory: number[]
  cpuHistory: number[]
  passTimings: PassTimingSnapshot[]
  totalGpuTimeMs: number
  cpuBreakdown: { setupMs: number; passesMs: number; submitMs: number }
}

/** Read a performance metrics snapshot from the performanceMetricsStore. */
export async function getPerformanceMetrics(page: Page): Promise<PerfMetricsSnapshot> {
  return page.evaluate(async () => {
    const store =
      window.__PERFORMANCE_METRICS_STORE__ ??
      (await import('/src/stores/performanceMetricsStore.ts')).usePerformanceMetricsStore
    const s = store.getState()
    return {
      fps: s.fps,
      frameTime: s.frameTime,
      cpuTime: s.cpuTime,
      vramMB: s.vram.total,
      fpsHistory: [...s.history.fps],
      cpuHistory: [...s.history.cpu],
      passTimings: s.passTimings.map((p) => ({
        passId: p.passId,
        gpuTimeMs: p.gpuTimeMs,
        computeGpuTimeMs: p.computeGpuTimeMs ?? 0,
        renderGpuTimeMs: p.renderGpuTimeMs ?? 0,
        cpuTimeMs: p.cpuTimeMs,
        skipped: p.skipped,
      })),
      totalGpuTimeMs: s.totalGpuTimeMs,
      cpuBreakdown: { ...s.cpuBreakdown },
    }
  })
}

// ─── Differential Pixel Assertions ───────────────────────────────────────────

/**
 * A snapshot of pixel data for differential comparison.
 * Contains the raw pixel color values at 25 evenly distributed sample points.
 */
export interface PixelSnapshot {
  /** R,G,B triplets at each sample point */
  samples: Array<{ r: number; g: number; b: number }>
  /** PNG data URL length — proxy for image complexity */
  dataUrlLength: number
}

/**
 * Capture a pixel snapshot from the WebGPU canvas.
 * Samples 25 points in a 5×5 grid for robust differential comparison.
 *
 * Crops to center 30% to exclude UI panels overlaid on the canvas edges.
 * Decodes PNG in Node.js via sharp — no browser round-trip needed.
 */
export async function capturePixelSnapshot(page: Page): Promise<PixelSnapshot> {
  // Fail-fast: if the renderer has crashed, report that instead of producing
  // a misleading pixel comparison later.
  const rendererState = await page
    .locator('[data-testid="webgpu-container"]')
    .getAttribute('data-renderer-state')
  if (rendererState === 'error') {
    const errMsg = await page
      .locator('[data-testid="webgpu-container"]')
      .getAttribute('data-renderer-error')
    throw new Error(
      `Cannot capture pixel snapshot: renderer is in error state. ` +
        `This usually means shader compilation failed.\nRenderer error: ${errMsg}`
    )
  }

  const canvas = page.locator('[data-testid="webgpu-canvas"]')
  const pngBuffer = await canvas.screenshot({ type: 'png' })
  const dataUrlLength = pngBuffer.length
  const meta = await sharp(pngBuffer).metadata()
  const fullW = meta.width!
  const fullH = meta.height!
  const cropW = Math.floor(fullW * 0.3)
  const cropH = Math.floor(fullH * 0.3)

  const { data, info } = await sharp(pngBuffer)
    .extract({
      left: Math.floor((fullW - cropW) / 2),
      top: Math.floor((fullH - cropH) / 2),
      width: cropW,
      height: cropH,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const w = info.width
  const h = info.height

  // 5×5 grid = 25 sample points
  const samples: Array<{ r: number; g: number; b: number }> = []
  for (let row = 1; row <= 5; row++) {
    for (let col = 1; col <= 5; col++) {
      const x = Math.floor((col * w) / 6)
      const y = Math.floor((row * h) / 6)
      const offset = (y * w + x) * 4
      samples.push({ r: data[offset]!, g: data[offset + 1]!, b: data[offset + 2]! })
    }
  }

  return { samples, dataUrlLength }
}

/**
 * Compute a distance metric between two pixel snapshots.
 * Returns the mean absolute difference across all sample points and channels.
 * Range: 0 (identical) to 255 (maximally different).
 */
export function snapshotDistance(a: PixelSnapshot, b: PixelSnapshot): number {
  const count = Math.min(a.samples.length, b.samples.length)
  if (count === 0) return 0

  let totalDiff = 0
  for (let i = 0; i < count; i++) {
    totalDiff += Math.abs(a.samples[i].r - b.samples[i].r)
    totalDiff += Math.abs(a.samples[i].g - b.samples[i].g)
    totalDiff += Math.abs(a.samples[i].b - b.samples[i].b)
  }
  return totalDiff / (count * 3)
}

/**
 * Assert two pixel snapshots are visually different.
 *
 * Default threshold is 0.3 mean absolute channel difference (0-255 scale).
 * Compression artifacts and dithering produce < 0.1; genuine visual changes
 * from preset/setting switches produce 0.4-10+. The old threshold of 2.0 was
 * too aggressive and rejected subtle but real differences (e.g. Pauli spinor
 * presets at 0.47-0.65).
 *
 * When distance is exactly 0.00, the error message flags a likely
 * shader compilation failure (identical frames = nothing changed).
 */
export function expectSnapshotsDiffer(
  a: PixelSnapshot,
  b: PixelSnapshot,
  label: string,
  threshold = 0.3
): void {
  const dist = snapshotDistance(a, b)
  const hint =
    dist === 0
      ? ' — distance is exactly 0 which usually means a shader compilation failed and the scene did not change. Check GPU/shader errors in the test output.'
      : ''
  expect(
    dist,
    `${label}: pixel snapshots must differ (distance=${dist.toFixed(2)}, threshold=${threshold})${hint}`
  ).toBeGreaterThan(threshold)
}

/**
 * Assert two pixel snapshots are visually similar (same scene, same config).
 * Useful for verifying that reload or re-render produces consistent output.
 */
export function expectSnapshotsSimilar(
  a: PixelSnapshot,
  b: PixelSnapshot,
  label: string,
  maxDistance = 10.0
): void {
  const dist = snapshotDistance(a, b)
  expect(
    dist,
    `${label}: pixel snapshots should be similar (distance=${dist.toFixed(2)})`
  ).toBeLessThan(maxDistance)
}

// ─── Store Mutation Helpers ──────────────────────────────────────────────────

/** Set hydrogen quantum numbers via store injection. */
export async function setHydrogenQuantumNumbers(
  page: Page,
  n: number,
  l: number,
  m: number
): Promise<void> {
  await page.evaluate(
    async ({ n, l, m }: { n: number; l: number; m: number }) => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const store = mod.useExtendedObjectStore.getState()
      store.setSchroedingerPrincipalQuantumNumber(n)
      store.setSchroedingerAzimuthalQuantumNumber(l)
      store.setSchroedingerMagneticQuantumNumber(m)
    },
    { n, l, m }
  )
}

/** Set HO superposition term count via store injection. */
export async function setTermCount(page: Page, count: number): Promise<void> {
  await page.evaluate(async (tc: number) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerTermCount(tc)
  }, count)
}

/** Pause animation for deterministic snapshots/readback. */
export async function pauseAnimation(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const mod = await import('/src/stores/animationStore.ts')
    const store = mod.useAnimationStore.getState()
    if (store.isPlaying) store.toggle()
  })
}

/** Read animation store state. */
export async function getAnimationState(page: Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/animationStore.ts')
    const s = mod.useAnimationStore.getState()
    return {
      isPlaying: s.isPlaying,
      speed: s.speed,
      direction: s.direction,
    }
  })
}

/** Navigate to a Pauli spinor mode at given dimension. */
export async function gotoPauli(page: Page, dim = 3): Promise<void> {
  await page.goto(`/?t=pauliSpinor&d=${dim}`)
  await waitForRendererReady(page)
}

/** Apply a TDSE preset via store injection. */
export async function applyTdsePreset(page: Page, presetId: string): Promise<void> {
  await page.evaluate(async (id: string) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).applyTdsePreset(id)
  }, presetId)
}

/** Apply a BEC preset via store injection. */
export async function applyBecPreset(page: Page, presetId: string): Promise<void> {
  await page.evaluate(async (id: string) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).applyBecPreset(id)
  }, presetId)
}

/** Apply a Dirac preset via store injection. */
export async function applyDiracPreset(page: Page, presetId: string): Promise<void> {
  await page.evaluate(async (id: string) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).applyDiracPreset(id)
  }, presetId)
}

/** Apply a Pauli preset via setPauliConfig. */
export async function applyPauliPreset(page: Page, presetId: string): Promise<void> {
  await page.evaluate(async (id: string) => {
    const presetMod = await import('/src/lib/physics/pauli/presets.ts')
    const storeMod = await import('/src/stores/extendedObjectStore.ts')
    const preset = presetMod.PAULI_SCENARIO_PRESETS.find((p: { id: string }) => p.id === id)
    if (preset) {
      ;(
        storeMod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
      ).setPauliConfig({ ...preset.overrides, needsReset: true })
    }
  }, presetId)
}

/**
 * Navigate to mode, wait for render, pause animation, verify non-blank.
 * Reusable setup for physics coverage and density oracle tests.
 */
export async function setupRenderMode(page: Page, mode: string, dim: number): Promise<void> {
  await gotoMode(page, mode, dim)
  await waitForRendererReady(page)
  await waitForShaderCompilation(page)
  await pauseAnimation(page)
  await expectCanvasNotBlank(page)
}

/**
 * Navigate to mode, wait for pipeline + density grid readback.
 * Reusable setup for density oracle tests.
 */
export async function setupAndWaitForDensity(page: Page, mode: string, dim: number): Promise<void> {
  await gotoMode(page, mode, dim)
  await waitForRendererReady(page)
  await waitForShaderCompilation(page)
  await pauseAnimation(page)
  await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'density')
}

// ─── Open Quantum Diagnostics ────────────────────────────────────────────────

/** Snapshot of the open quantum diagnostics store. */
export interface OQDiagnosticsSnapshot {
  purity: number
  linearEntropy: number
  vonNeumannEntropy: number
  coherenceMagnitude: number
  groundPopulation: number
  trace: number
  basisCount: number
  historyCount: number
  populations: number[]
}

/** Read the open quantum diagnostics store from the running app. */
export async function readOQDiagnostics(page: Page): Promise<OQDiagnosticsSnapshot> {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/diagnosticsStore.ts')
    const s = mod.useDiagnosticsStore.getState().openQuantum
    return {
      purity: s.purity,
      linearEntropy: s.linearEntropy,
      vonNeumannEntropy: s.vonNeumannEntropy,
      coherenceMagnitude: s.coherenceMagnitude,
      groundPopulation: s.groundPopulation,
      trace: s.trace,
      basisCount: s.basisCount,
      historyCount: s.historyCount,
      populations: Array.from(s.populations.slice(0, s.basisCount)),
    }
  })
}

/**
 * Wait for the open quantum system to evolve for at least `minUpdates` steps.
 * Polls the diagnostics store's historyCount. Each count corresponds to one
 * density matrix propagation step (with frame stride applied).
 */
export async function waitForOQEvolution(
  page: Page,
  minUpdates = 20,
  timeout = 60_000
): Promise<void> {
  await page.waitForFunction(
    async (min: number) => {
      const mod = await import('/src/stores/diagnosticsStore.ts')
      return mod.useDiagnosticsStore.getState().openQuantum.historyCount >= min
    },
    minUpdates,
    { timeout }
  )
}

/**
 * Set open quantum configuration via the extended object store.
 * Merges the provided partial config with the existing OQ config.
 */
export async function setOQConfig(page: Page, config: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (cfg: Record<string, unknown>) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    const store = mod.useExtendedObjectStore.getState()
    // Apply each setting via the individual setters when available
    if ('enabled' in cfg) store.setOpenQuantumEnabled(cfg.enabled as boolean)
    if ('dephasingRate' in cfg) store.setOpenQuantumDephasingRate(cfg.dephasingRate as number)
    if ('relaxationRate' in cfg) store.setOpenQuantumRelaxationRate(cfg.relaxationRate as number)
    if ('thermalUpRate' in cfg) store.setOpenQuantumThermalUpRate(cfg.thermalUpRate as number)
    if ('dt' in cfg) store.setOpenQuantumDt(cfg.dt as number)
    if ('substeps' in cfg) store.setOpenQuantumSubsteps(cfg.substeps as number)
    if ('bathTemperature' in cfg) store.setOpenQuantumBathTemperature(cfg.bathTemperature as number)
    if ('couplingScale' in cfg) store.setOpenQuantumCouplingScale(cfg.couplingScale as number)
    if ('hydrogenBasisMaxN' in cfg)
      store.setOpenQuantumHydrogenBasisMaxN(cfg.hydrogenBasisMaxN as number)
    if ('dephasingModel' in cfg)
      store.setOpenQuantumDephasingModel(cfg.dephasingModel as 'none' | 'uniform')
    if ('visualizationMode' in cfg)
      store.setOpenQuantumVisualizationMode(cfg.visualizationMode as string)

    // Channel toggles via generic setter.
    // The setter expects short channel names ('dephasing', 'relaxation', 'thermal'),
    // NOT the full store key names ('dephasingEnabled', etc).
    if ('dephasingEnabled' in cfg)
      store.setOpenQuantumChannelEnabled('dephasing', cfg.dephasingEnabled as boolean)
    if ('relaxationEnabled' in cfg)
      store.setOpenQuantumChannelEnabled('relaxation', cfg.relaxationEnabled as boolean)
    if ('thermalEnabled' in cfg)
      store.setOpenQuantumChannelEnabled('thermal', cfg.thermalEnabled as boolean)
  }, config)
}

/**
 * Reset the open quantum diagnostics store and trigger density matrix re-init.
 * Uses readbackGeneration to guarantee the returned data is post-reset.
 */
export async function resetOQState(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const diagMod = await import('/src/stores/diagnosticsStore.ts')
    diagMod.useDiagnosticsStore.getState().resetOpenQuantum()
    const extMod = await import('/src/stores/extendedObjectStore.ts')
    extMod.useExtendedObjectStore.getState().requestOpenQuantumStateReset()
  })
  await waitForFreshReadback(page, '/src/stores/diagnosticsStore.ts', 30_000, 'openQuantum')
}

// ─── Observables Readback ────────────────────────────────────────────────────

/** Read observables diagnostics from the GPU readback store. */
export async function readObservablesDiagnostics(page: Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/diagnosticsStore.ts')
    const s = mod.useDiagnosticsStore.getState().observables
    return {
      hasData: s.hasData,
      activeDims: s.activeDims,
      positionMean: [...s.positionMean],
      positionVariance: [...s.positionVariance],
      momentumMean: [...s.momentumMean],
      momentumVariance: [...s.momentumVariance],
      uncertaintyProduct: [...s.uncertaintyProduct],
      totalEnergy: s.totalEnergy,
      positionNorm: s.positionNorm,
      momentumNorm: s.momentumNorm,
    }
  })
}

/** Read quantum walk diagnostics from the running app (GPU readback values). */
export async function readQwDiagnostics(page: Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/diagnosticsStore.ts')
    const s = mod.useDiagnosticsStore.getState().qw
    return {
      hasData: s.hasData,
      totalNorm: s.totalNorm,
      normDrift: s.normDrift,
      stepCount: s.stepCount,
      positionMean: s.positionMean,
      positionVariance: s.positionVariance,
    }
  })
}

// ─── Quantum Walk Helpers ────────────────────────────────────────────────────

/** Read quantum walk configuration from the store. */
export async function getQuantumWalkConfig(page: Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    const qw = mod.useExtendedObjectStore.getState().schroedinger.quantumWalk
    return {
      coinType: qw.coinType,
      gridSize: [...qw.gridSize],
      stepsPerFrame: qw.stepsPerFrame,
      steps: qw.steps,
      fieldView: qw.fieldView,
      needsReset: qw.needsReset,
    }
  })
}

/** Set quantum walk coin type via store injection. */
export async function setQuantumWalkCoin(page: Page, coinType: string): Promise<void> {
  await page.evaluate(async (coin: string) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    const store = mod.useExtendedObjectStore.getState()
    store.setSchroedingerConfig({
      quantumWalk: { ...store.schroedinger.quantumWalk, coinType: coin as never, needsReset: true },
    })
  }, coinType)
}

/** Set quantum walk field view via store injection. */
export async function setQuantumWalkFieldView(page: Page, fieldView: string): Promise<void> {
  await page.evaluate(async (view: string) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    const store = mod.useExtendedObjectStore.getState()
    store.setSchroedingerConfig({
      quantumWalk: { ...store.schroedinger.quantumWalk, fieldView: view as never },
    })
  }, fieldView)
}

// ─── Measurement Helpers ─────────────────────────────────────────────────────

/** Read measurement store state. */
export async function readMeasurementState(page: Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/measurementStore.ts')
    const s = mod.useMeasurementStore.getState()
    return {
      enabled: s.enabled,
      totalCount: s.totalCount,
      measurementCount: s.measurements.length,
      collapseWidth: s.collapseWidth,
      measureAxis: s.measureAxis,
      isCollapsing: s.isCollapsing,
      positionMean: [...s.positionMean],
      positionStd: [...s.positionStd],
    }
  })
}

// ─── Imaginary Time Helpers ──────────────────────────────────────────────────

/** Enable imaginary-time propagation. */
export async function enableImaginaryTime(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setTdseImaginaryTimeEnabled(true)
  })
}

/** Read simulation state (eigenstate storage, etc). */
export async function readSimulationState(page: Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/simulationStateStore.ts')
    const s = mod.useSimulationStateStore.getState()
    return {
      storedEigenstateCount: s.storedEigenstateCount,
      pendingStoreRequest: s.pendingStoreRequest,
    }
  })
}

/** Read TDSE imaginary-time configuration. */
export async function getImaginaryTimeConfig(page: Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    const tdse = mod.useExtendedObjectStore.getState().schroedinger.tdse
    return {
      imaginaryTimeEnabled: tdse.imaginaryTimeEnabled,
      potentialType: tdse.potentialType,
    }
  })
}

// ─── Shared Pixel Verification ───────────────────────────────────────────────

/**
 * Is the renderer producing visible content?
 *
 * Single screenshot: checks if any pixel in the center 30% crop is brighter
 * than the dark background (~13,13,13). Returns true if at least `minPixels`
 * non-background pixels are found.
 *
 * For modes that oscillate through dark phases (FSF, QW), use
 * `isRenderingMultiShot` which takes 3 screenshots with frame gaps.
 */
export async function isRendering(page: Page, minPixels = 5): Promise<boolean> {
  const { nonBgPixels } = await captureAndSamplePixels(page)
  return nonBgPixels >= minPixels
}

/**
 * Is the renderer producing visible content? (multi-shot variant)
 *
 * Takes up to 3 screenshots with 30-frame gaps between them. Returns true
 * if ANY of the 3 shots has at least `minPixels` non-background pixels.
 *
 * Use for modes that can have phases of near-total darkness:
 * - Free Scalar Field: vacuum fluctuations oscillate through zero
 * - Quantum Walk: interference pattern has dark nodes
 */
export async function isRenderingMultiShot(page: Page, minPixels = 5): Promise<boolean> {
  for (let i = 0; i < 3; i++) {
    if (await isRendering(page, minPixels)) return true
    if (i < 2) {
      const fc = await getFrameCount(page)
      await waitForFrameAdvance(page, fc + 30)
    }
  }
  return false
}

/**
 * Assert the renderer is producing visible content.
 *
 * Takes up to 3 screenshots (handles oscillating modes). Fails with a
 * descriptive message including the context label.
 */
export async function assertRendering(page: Page, context: string, minPixels = 5): Promise<void> {
  const rendering = await isRenderingMultiShot(page, minPixels)
  expect(
    rendering,
    `${context}: expected >= ${minPixels} non-bg pixels across 3 snapshots — nothing rendered`
  ).toBe(true)
}

// Backward-compatible aliases
export const multiShotPixelCheck = async (page: Page, minPixels = 5) => {
  const pass = await isRenderingMultiShot(page, minPixels)
  return { pass, bestCount: pass ? minPixels : 0 }
}
export const assertNonBlankPixels = assertRendering

/**
 * Wait for renderer + shader compilation + optional frame advance.
 * Replaces per-mode `waitForTdseReady`, `waitForBecReady`, etc.
 */
export async function waitForModeReady(page: Page, extraFrames = 0): Promise<void> {
  await waitForRendererReady(page)
  await waitForShaderCompilation(page)
  if (extraFrames > 0) {
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + extraFrames)
  }
}

/**
 * Make the quantum object invisible so only the skybox/background is visible.
 * Sets densityGain to near-zero and scale to minimum via direct setState
 * (bypasses clamped setters). Use this before pixel-checking skybox rendering.
 */
export async function hideQuantumObject(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const mod = await import('/src/stores/geometryStore.ts')
    mod.useGeometryStore.setState({
      schroedinger: {
        ...mod.useGeometryStore.getState().schroedinger,
        densityGain: 0.001,
        schroedingerScale: 0.01,
      },
    })
  })
  await waitForUniformUpdate(page)
}
