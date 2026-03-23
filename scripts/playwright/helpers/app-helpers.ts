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
export async function waitForFrameAdvance(page: Page, beyondCount: number): Promise<number> {
  await page.waitForFunction(
    (minCount: number) => {
      const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
      return parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10) > minCount
    },
    beyondCount,
    { timeout: 10_000 }
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

/** Attach a listener that collects fatal GPU errors. Returns the array (mutated in-place). */
export function collectFatalGpuErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (/device.*lost|rendergraph.*cycle|unhandled.*gpu/i.test(text)) {
      errors.push(text)
    }
  })
  return errors
}

/**
 * Collect console errors and warnings that indicate GPU/shader problems.
 * Catches: shader compilation failures, WGSL errors, pipeline errors,
 * WebGPU validation, bind group mismatches, and renderer-level error logs.
 *
 * Returns the array (mutated in-place by the listener).
 */
export function collectGpuWarningsAndErrors(page: Page): string[] {
  const issues: string[] = []
  page.on('console', (msg) => {
    const type = msg.type()
    if (type !== 'error' && type !== 'warning') return
    const text = msg.text()
    // WGSL shader errors (unresolved values, syntax errors, etc.)
    if (/\[WGSL ERROR\]|unresolved value|shader.*error/i.test(text)) {
      issues.push(`[${type}] ${text}`)
      return
    }
    // Shader / pipeline errors
    if (/GPUPipelineError|shader.*compil|pipeline.*fail|binding.*doesn.*exist/i.test(text)) {
      issues.push(`[${type}] ${text}`)
      return
    }
    // WebGPU validation errors
    if (/GPUValidationError|validation.*error/i.test(text)) {
      issues.push(`[${type}] ${text}`)
      return
    }
    // Renderer-level errors logged via logger.error
    if (/\[SchrodingerRenderer\].*fail|\[WebGPU.*\].*fail|\[WebGPU.*\].*error/i.test(text)) {
      issues.push(`[${type}] ${text}`)
      return
    }
    // Dawn context lines — any "While ..." prefix indicates a GPU validation problem
    if (/While encoding|While finishing|While calling|While initializing/i.test(text)) {
      issues.push(`[${type}] ${text}`)
      return
    }
    // Device lost / fatal
    if (/device.*lost|rendergraph.*cycle|unhandled.*gpu/i.test(text)) {
      issues.push(`[${type}] ${text}`)
    }
  })
  return issues
}

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
    const mod = await import('/src/stores/tdseDiagnosticsStore.ts')
    const s = mod.useTdseDiagnosticsStore.getState()
    return {
      hasData: s.hasData,
      totalNorm: s.totalNorm,
      normDrift: s.normDrift,
      R: s.R,
      T: s.T,
      maxDensity: s.maxDensity,
      simTime: s.simTime,
    }
  })
}

/** Read Pauli spinor diagnostics from the running app (GPU readback values). */
export async function readPauliDiagnostics(page: Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/pauliDiagnosticsStore.ts')
    const s = mod.usePauliDiagnosticsStore.getState()
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
    const mod = await import('/src/stores/becDiagnosticsStore.ts')
    const s = mod.useBecDiagnosticsStore.getState()
    return {
      hasData: s.hasData,
      totalNorm: s.totalNorm,
      normDrift: s.normDrift,
      chemicalPotential: s.chemicalPotential,
      healingLength: s.healingLength,
      soundSpeed: s.soundSpeed,
      thomasFermiRadius: s.thomasFermiRadius,
      maxDensity: s.maxDensity,
    }
  })
}

/** Read Dirac diagnostics from the running app (GPU readback values). */
export async function readDiracDiagnostics(page: Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/diracDiagnosticsStore.ts')
    const s = mod.useDiracDiagnosticsStore.getState()
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
    const mod = await import('/src/stores/fsfDiagnosticsStore.ts')
    const s = mod.useFsfDiagnosticsStore.getState()
    return {
      hasData: s.hasData,
      totalEnergy: s.totalEnergy,
      totalNorm: s.totalNorm,
      energyDrift: s.energyDrift,
      maxPhi: s.maxPhi,
    }
  })
}

/** Read density grid diagnostics from the running app (GPU readback values). */
export async function readDensityDiagnostics(page: Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/densityDiagnosticsStore.ts')
    const s = mod.useDensityDiagnosticsStore.getState()
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
 */
export async function waitForDiagnostics(
  page: Page,
  storeModule: string,
  timeout = 30_000
): Promise<void> {
  await page.waitForFunction(
    async (modulePath: string) => {
      const mod = await import(/* @vite-ignore */ modulePath)
      const storeExports = Object.values(mod) as Array<{ getState: () => { hasData: boolean } }>
      const store = storeExports.find((v) => typeof v === 'object' && v !== null && 'getState' in v)
      return store?.getState().hasData === true
    },
    storeModule,
    { timeout }
  )
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
  // 120 frames = ~2 seconds of simulation time.
  const currentFrame = await getFrameCount(page)
  await waitForFrameAdvance(page, currentFrame + 120)

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
 * Uses mean absolute channel difference — threshold of 2.0 avoids
 * false positives from compression artifacts or dithering.
 */
export function expectSnapshotsDiffer(a: PixelSnapshot, b: PixelSnapshot, label: string): void {
  const dist = snapshotDistance(a, b)
  expect(
    dist,
    `${label}: pixel snapshots must differ (distance=${dist.toFixed(2)})`
  ).toBeGreaterThan(2.0)
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
  await waitForDiagnostics(page, '/src/stores/densityDiagnosticsStore.ts')
}

// ─── Observables Readback ────────────────────────────────────────────────────

/** Read observables diagnostics from the GPU readback store. */
export async function readObservablesDiagnostics(page: Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/observablesDiagnosticsStore.ts')
    const s = mod.useObservablesDiagnosticsStore.getState()
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

// ─── Classical Overlay Helpers ───────────────────────────────────────────────

/** Enable classical overlay and set hbar value. */
export async function enableClassicalOverlay(page: Page, hbar = 1.0): Promise<void> {
  await page.evaluate(async (h: number) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    const store = mod.useExtendedObjectStore.getState()
    store.setSchroedingerClassicalOverlayEnabled(true)
    store.setSchroedingerClassicalOverlayHbar(h)
  }, hbar)
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
