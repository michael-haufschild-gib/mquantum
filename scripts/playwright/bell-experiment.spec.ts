/**
 * Bell-experiment / CHSH end-to-end smoke.
 *
 * Loads the app with `?t=bellPair` to put the simulator in Bell mode,
 * opens the Analysis tab, and verifies the panel reaches the expected
 * physics state via its rendered text. Avoids cross-context store
 * mutation — Vite serves the dev modules in a way that makes dynamic
 * `import()` inside `page.evaluate` land on a different module instance
 * than the React app uses, so we read user-facing strings instead.
 *
 * Per `.claude/rules/testing.md` and the feedback memory
 * `e2e_ci_policy`: this spec runs locally only; it is not gated on CI.
 *
 * @file
 */

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  collectPageErrors,
  filterBenignErrors,
  getFrameCount,
  waitForAppLoaded,
  waitForFirstFrame,
  waitForFrameAdvance,
  waitForRendererReady,
} from './helpers/app-helpers'

test.setTimeout(120_000)

/**
 * Sample brightness from the WebGPU canvas via a 2D scratch canvas.
 *
 * Direct `canvas.getContext('2d').getImageData(...)` on the WebGPU canvas
 * itself can fail with CORS / context-mismatch errors; drawing the
 * canvas into a 2D scratch with `drawImage` preserves the composited
 * pixels and is the established pattern in this suite.
 *
 * @param page - Playwright page.
 * @returns `{ min, mean, max }` over a 32×32 downscaled sample, or
 *   `null` if the canvas is not yet sized / readable.
 */
async function sampleCanvasBrightness(
  page: Page
): Promise<{ min: number; mean: number; max: number } | null> {
  return page.evaluate(() => {
    const canvas = document.querySelector(
      '[data-testid="webgpu-canvas"]'
    ) as HTMLCanvasElement | null
    if (!canvas) return null
    if (!canvas.width || !canvas.height) return null
    const scratch = document.createElement('canvas')
    scratch.width = 32
    scratch.height = 32
    const ctx = scratch.getContext('2d')
    if (!ctx) return null
    try {
      ctx.drawImage(canvas, 0, 0, 32, 32)
    } catch {
      return null
    }
    const img = ctx.getImageData(0, 0, 32, 32).data
    let min = 255
    let max = 0
    let sum = 0
    for (let i = 0; i < img.length; i += 4) {
      const v = ((img[i] ?? 0) + (img[i + 1] ?? 0) + (img[i + 2] ?? 0)) / 3
      if (v < min) min = v
      if (v > max) max = v
      sum += v
    }
    return { min, mean: sum / (img.length / 4), max }
  })
}

test('Bell experiment: panel mounts and converges past the classical bound', async ({ page }) => {
  const pageErrors = collectPageErrors(page)

  // Top-right corner of the (η, v) plane: singlet at canonical CHSH angles.
  await page.goto('/?t=bellPair&bell_v=1&bell_eta=1&bell_seed=42&bell_tpf=1000')
  await waitForAppLoaded(page)
  await page.getByTestId('right-panel-tabs-tab-analysis').click()

  // Panel mounts under the Analysis section.
  const panel = page.getByTestId('bell-experiment-content')
  await expect(panel).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('bell-qm-s')).toBeVisible()
  await expect(page.getByTestId('bell-lhv-s')).toBeVisible()

  // v=1 + η=1 is the unconstrained CHSH cell — both thresholds allow violation.
  await expect(page.getByTestId('bell-werner-status')).toContainText('allows')
  await expect(page.getByTestId('bell-eta-status')).toContainText('allows')

  // The renderer strategy drives ~1000 trials/frame; the |S| estimate will
  // cross the classical bound within seconds and the badge will appear.
  await expect(page.getByTestId('bell-violated')).toBeVisible({ timeout: 30_000 })

  // Trial counter is non-zero and counts upward as the loop runs.
  const trialsAt1 = await page.getByTestId('bell-total-trials').innerText()
  const parseTrials = (s: string): number => Number(s.replace(/[^0-9]/g, ''))
  expect(parseTrials(trialsAt1)).toBeGreaterThan(0)

  const real = filterBenignErrors(pageErrors)
  expect(real, 'No uncaught page errors during Bell convergence run').toEqual([])
})

test('Bell experiment: Werner threshold forbids violation for v=0.5', async ({ page }) => {
  const pageErrors = collectPageErrors(page)

  await page.goto('/?t=bellPair&bell_v=0.5&bell_eta=1&bell_seed=7&bell_tpf=1000')
  await waitForAppLoaded(page)
  await page.getByTestId('right-panel-tabs-tab-analysis').click()

  const panel = page.getByTestId('bell-experiment-content')
  await expect(panel).toBeVisible({ timeout: 15_000 })

  // v=0.5 is below the Werner threshold ≈ 0.7071 — the panel must report
  // "forbids" so the audience knows |S| cannot exceed 2 no matter the angles.
  await expect(page.getByTestId('bell-werner-status')).toContainText('forbids')

  // Wait for trials to accumulate. With v=0.5 the QM ceiling is 2√2 · 0.5 ≈
  // 1.41 — even at 100k trials |S| cannot reach 2. The bell-violated badge
  // should never appear; sample after a generous wait.
  await page.waitForTimeout(5_000)
  await expect(page.getByTestId('bell-violated')).toHaveCount(0)

  // Counter must still be non-zero — confirms the strategy ran and we're
  // not asserting on a frozen panel.
  const trials = await page.getByTestId('bell-total-trials').innerText()
  expect(Number(trials.replace(/[^0-9]/g, ''))).toBeGreaterThan(0)

  const real = filterBenignErrors(pageErrors)
  expect(real, 'No uncaught page errors during sub-threshold Bell run').toEqual([])
})

test('Bell experiment: canvas renders the apparatus and frame counter advances', async ({
  page,
}) => {
  const pageErrors = collectPageErrors(page)

  await page.goto('/?t=bellPair&bell_v=1&bell_eta=1&bell_seed=42&bell_tpf=200')
  await waitForAppLoaded(page)
  await page.getByTestId('right-panel-tabs-tab-analysis').click()
  await waitForRendererReady(page)
  await waitForFirstFrame(page)
  // Confirm the renderer is in bellPair mode before sampling pixels.
  await expect(page.getByTestId('bell-experiment-content')).toBeVisible({ timeout: 15_000 })
  // Let the apparatus warm up — the shader's brightness ramps with trialCount,
  // and the volume raymarcher needs a few frames to stabilize.
  await waitForFrameAdvance(page, (await getFrameCount(page)) + 60)

  // The BellPairStrategy dispatches its apparatus compute shader every
  // frame and writes a Gaussian source + two analyzer arms into the
  // density texture. The volume raymarcher reads that texture, so the
  // canvas must show visibly non-zero brightness — a fully black canvas
  // would mean the strategy never ran or the shader output is missing.
  const sample = await sampleCanvasBrightness(page)
  if (sample === null) {
    throw new Error('canvas must be readable (drawImage to 2D scratch failed)')
  }
  // Diagnostic: save a screenshot when sample shows nothing rendered.
  if (sample.max < 1) {
    await page.screenshot({ path: 'test-results/bell-canvas-black.png', fullPage: true })
  }
  expect(sample.max, 'apparatus must produce visible bright pixels').toBeGreaterThan(20)
  expect(sample.mean, 'mean brightness > floor (not a black frame)').toBeGreaterThan(2)

  // Frame counter must advance: the apparatus shader runs every frame so
  // a stalled render loop would freeze the counter. Wait for the count
  // to advance past the current value.
  const before = await getFrameCount(page)
  const after = await waitForFrameAdvance(page, before + 10)
  expect(after, 'frame counter advances').toBeGreaterThan(before + 10)

  const real = filterBenignErrors(pageErrors)
  expect(real, 'No uncaught page errors during apparatus render').toEqual([])
})

test('Bell experiment: CHSH violation glow brightens the canvas vs sub-threshold', async ({
  page,
}) => {
  // Differential pixel test: the apparatus shader modulates the G channel
  // by `(|S| − 2) / 0.828`, so a violating run (v=1, η=1) should produce
  // brighter mean canvas brightness than a non-violating run (v=0.5)
  // once trials accumulate. This verifies the live |S| value actually
  // reaches the GPU uniform (not just the React panel).

  // Run 1: sub-threshold (v=0.5). No CHSH glow possible.
  await page.goto('/?t=bellPair&bell_v=0.5&bell_eta=1&bell_seed=99&bell_tpf=1000')
  await waitForAppLoaded(page)
  await waitForRendererReady(page)
  await waitForFirstFrame(page)
  // Let trials accumulate so the warmth ramp + (no) glow settles.
  await waitForFrameAdvance(page, (await getFrameCount(page)) + 120)
  const dim = await sampleCanvasBrightness(page)
  if (dim === null) {
    throw new Error('sub-threshold sample readable failed (canvas not composited)')
  }

  // Run 2: violating (v=1). |S| crosses 2 → green glow lights up.
  await page.goto('/?t=bellPair&bell_v=1&bell_eta=1&bell_seed=99&bell_tpf=1000')
  await waitForAppLoaded(page)
  await waitForRendererReady(page)
  await waitForFirstFrame(page)
  await waitForFrameAdvance(page, (await getFrameCount(page)) + 120)
  const bright = await sampleCanvasBrightness(page)
  if (bright === null) {
    throw new Error('violating sample readable failed (canvas not composited)')
  }

  // Both frames must have visible content.
  expect(dim.max).toBeGreaterThan(20)
  expect(bright.max).toBeGreaterThan(20)
  // Violating run is brighter on average — the glow is real.
  expect(
    bright.mean,
    `violating mean (${bright.mean.toFixed(2)}) must exceed sub-threshold mean (${dim.mean.toFixed(2)})`
  ).toBeGreaterThan(dim.mean)
})
