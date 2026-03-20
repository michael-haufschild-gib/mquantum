/**
 * Shared e2e test helpers for the mquantum app.
 *
 * Provides deterministic wait conditions, store access, and error collection
 * so spec files stay focused on user-flow assertions.
 */

import { expect, type Page } from '@playwright/test'

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
 * Check whether WebGPU is available. Use in beforeEach to skip tests.
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
 * Capture the WebGPU canvas via the app's GPU buffer readback, then sample pixels.
 * Returns the number of unique colors found across 9 sample points.
 *
 * This is the only reliable way to read WebGPU canvas pixels — naive drawImage
 * returns zeroes because the front buffer is cleared after present.
 */
export async function captureAndSamplePixels(page: Page): Promise<{
  uniqueColors: number
  dataUrlLength: number
}> {
  return page.evaluate(async () => {
    const mod = await import('/src/hooks/useScreenshotCapture.ts')
    const dataUrl = await mod.captureScreenshotAsync()

    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = reject
      img.src = dataUrl
    })

    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)

    const w = img.width
    const h = img.height

    const points = [
      [w / 2, h / 2],
      [w / 4, h / 4],
      [(3 * w) / 4, h / 4],
      [w / 4, (3 * h) / 4],
      [(3 * w) / 4, (3 * h) / 4],
      [w / 2, h / 4],
      [w / 2, (3 * h) / 4],
      [w / 4, h / 2],
      [(3 * w) / 4, h / 2],
    ]

    const colorSet = new Set(
      points.map(([x, y]) => {
        const px = Math.floor(x)
        const py = Math.floor(y)
        const pixel = ctx.getImageData(px, py, 1, 1).data
        return `${pixel[0]},${pixel[1]},${pixel[2]}`
      })
    )

    return { uniqueColors: colorSet.size, dataUrlLength: dataUrl.length }
  })
}

/**
 * Assert that the WebGPU canvas has rendered non-blank content.
 * Captures via GPU readback and verifies >1 unique color across sample points.
 *
 * Retries up to 3 times with a frame advance between each attempt.
 * Compute modes (Dirac, BEC, TDSE, FSF) may need several frames
 * after shader swap for the density grid to populate.
 */
export async function expectCanvasNotBlank(page: Page): Promise<void> {
  const maxAttempts = 3
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { uniqueColors, dataUrlLength } = await captureAndSamplePixels(page)
    if (uniqueColors > 1 && dataUrlLength > 500) return // pass

    if (attempt < maxAttempts - 1) {
      // Wait for more frames — compute pipeline may still be populating the density grid
      const current = await getFrameCount(page)
      await waitForFrameAdvance(page, current + 3)
    } else {
      // Final attempt — assert and fail with diagnostics
      expect(dataUrlLength, 'Captured PNG should be non-trivial size').toBeGreaterThan(500)
      expect(uniqueColors, 'Canvas must have >1 color — proves scene rendered').toBeGreaterThan(1)
    }
  }
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
 */
export async function capturePixelSnapshot(page: Page): Promise<PixelSnapshot> {
  return page.evaluate(async () => {
    const mod = await import('/src/hooks/useScreenshotCapture.ts')
    const dataUrl = await mod.captureScreenshotAsync()

    const img = new Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = reject
      img.src = dataUrl
    })

    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)

    const w = img.width
    const h = img.height

    // 5×5 grid = 25 sample points
    const samples: Array<{ r: number; g: number; b: number }> = []
    for (let row = 1; row <= 5; row++) {
      for (let col = 1; col <= 5; col++) {
        const x = Math.floor((col * w) / 6)
        const y = Math.floor((row * h) / 6)
        const pixel = ctx.getImageData(x, y, 1, 1).data
        samples.push({ r: pixel[0], g: pixel[1], b: pixel[2] })
      }
    }

    return { samples, dataUrlLength: dataUrl.length }
  })
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
export async function setupRenderMode(
  page: Page,
  mode: string,
  dim: number,
  gpuErrors: string[]
): Promise<void> {
  await gotoMode(page, mode, dim)
  await waitForRendererReady(page)
  await waitForShaderCompilation(page)
  await pauseAnimation(page)
  await expectCanvasNotBlank(page)
  expect(gpuErrors, `${mode} ${dim}D: no fatal GPU errors after setup`).toEqual([])
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
