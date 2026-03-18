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

// ─── Navigation ──────────────────────────────────────────────────────────────

/** Navigate to a specific quantum mode + dimension. */
export async function gotoMode(page: Page, mode: string, dim = 3): Promise<void> {
  await page.goto(`/?t=schroedinger&d=${dim}&qm=${mode}`)
  await waitForAppLoaded(page)
}

/** Check whether WebGPU is available. Use in beforeEach to skip tests. */
export async function hasWebGPU(page: Page): Promise<boolean> {
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
export async function waitForShaderCompilation(page: Page, timeoutMs = 60_000): Promise<void> {
  // Step 1: Wait for isShaderCompiling to be false
  await page.waitForFunction(
    async () => {
      const mod = await import('/src/stores/performanceStore.ts')
      return !mod.usePerformanceStore.getState().isShaderCompiling
    },
    { timeout: timeoutMs }
  )

  // Step 2: Record current frame count, then wait for at least one
  // new frame. That frame will be rendered with the new graph (since
  // graph.compile() runs synchronously after isShaderCompiling → false).
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
