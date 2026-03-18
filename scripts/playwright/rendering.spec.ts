/**
 * Quantum rendering smoke tests.
 *
 * Verifies that each quantum mode produces non-blank pixels on the WebGPU
 * canvas. These catch shader compilation failures, pipeline creation errors,
 * render graph cycles, and blank-canvas regressions that unit tests with
 * mocked GPU cannot detect.
 *
 * Uses pixel sampling — not screenshots — to determine if the renderer
 * produced visible content.
 *
 * Bugs caught:
 * - Shader compilation error for a specific quantum mode
 * - Pipeline workgroup size exceeds device limit
 * - Render graph produces blank output after mode switch
 * - Dimension change triggers crash in shader recompilation
 */

import { expect, test, type Page } from '@playwright/test'

test.setTimeout(60_000)

/**
 * Sample center of the WebGPU canvas and count non-background pixels.
 * Returns 0 if canvas not found or all pixels are background.
 */
async function countNonBgPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const canvas = document.querySelector(
      '[data-testid="webgpu-canvas"]'
    ) as HTMLCanvasElement | null
    if (!canvas || canvas.width === 0 || canvas.height === 0) return 0

    const offscreen = document.createElement('canvas')
    offscreen.width = canvas.width
    offscreen.height = canvas.height
    const ctx = offscreen.getContext('2d')
    if (!ctx) return 0

    ctx.drawImage(canvas, 0, 0)

    const cx = Math.floor(canvas.width / 2)
    const cy = Math.floor(canvas.height / 2)
    const radius = 200
    const x0 = Math.max(0, cx - radius)
    const y0 = Math.max(0, cy - radius)
    const w = Math.min(canvas.width, cx + radius) - x0
    const h = Math.min(canvas.height, cy + radius) - y0
    if (w <= 0 || h <= 0) return 0

    const data = ctx.getImageData(x0, y0, w, h).data
    const BG_TOL = 15
    let count = 0
    for (let i = 0; i < data.length; i += 32) {
      // every 8th pixel
      const r = data[i]!,
        g = data[i + 1]!,
        b = data[i + 2]!
      const isBlack = r <= BG_TOL && g <= BG_TOL && b <= BG_TOL
      const isSceneBg =
        Math.abs(r - 35) <= BG_TOL && Math.abs(g - 35) <= BG_TOL && Math.abs(b - 35) <= BG_TOL
      if (!isBlack && !isSceneBg) count++
    }
    return count
  })
}

/**
 * Wait until the canvas has rendered visible content, or timeout.
 */
async function waitForPixels(page: Page, timeoutMs = 20_000): Promise<number> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const n = await countNonBgPixels(page)
    if (n >= 20) return n
    await page.waitForTimeout(500)
  }
  return countNonBgPixels(page)
}

/** Navigate to a quantum mode and wait for the app to be ready. */
async function gotoMode(page: Page, mode: string, dim = 3): Promise<void> {
  await page.goto(`/?t=schroedinger&d=${dim}&qm=${mode}`)
  await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 15_000 })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('quantum mode rendering', () => {
  test.beforeEach(async ({ page }) => {
    // Check WebGPU availability AND device capability
    await page.goto('/')
    const gpuInfo = await page.evaluate(async () => {
      if (!navigator.gpu) return { available: false, reason: 'no navigator.gpu' }
      const adapter = await navigator.gpu.requestAdapter()
      if (!adapter) return { available: false, reason: 'no adapter' }
      return { available: true, reason: '' }
    })
    test.skip(!gpuInfo.available, `GPU not capable: ${gpuInfo.reason}`)
  })

  test('harmonic oscillator 3D', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await expect(page.getByTestId('webgpu-canvas')).toBeVisible({ timeout: 10_000 })
    const pixels = await waitForPixels(page)
    expect(pixels, 'HO 3D should render non-blank pixels').toBeGreaterThanOrEqual(20)
  })

  test('harmonic oscillator 5D', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 5)
    await expect(page.getByTestId('webgpu-canvas')).toBeVisible({ timeout: 10_000 })
    const pixels = await waitForPixels(page)
    expect(pixels, 'HO 5D should render non-blank pixels').toBeGreaterThanOrEqual(20)
  })

  test('hydrogen orbital 3D', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 3)
    await expect(page.getByTestId('webgpu-canvas')).toBeVisible({ timeout: 10_000 })
    const pixels = await waitForPixels(page)
    expect(pixels, 'hydrogen 3D should render non-blank pixels').toBeGreaterThanOrEqual(20)
  })

  test('hydrogen orbital 4D', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 4)
    await expect(page.getByTestId('webgpu-canvas')).toBeVisible({ timeout: 10_000 })
    const pixels = await waitForPixels(page)
    expect(pixels, 'hydrogen 4D should render non-blank pixels').toBeGreaterThanOrEqual(20)
  })

  test('free scalar field', async ({ page }) => {
    await gotoMode(page, 'freeScalarField', 3)
    await expect(page.getByTestId('webgpu-canvas')).toBeVisible({ timeout: 10_000 })
    const pixels = await waitForPixels(page, 30_000) // compute modes need more time
    expect(pixels, 'FSF should render non-blank pixels').toBeGreaterThanOrEqual(20)
  })

  test('TDSE dynamics', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await expect(page.getByTestId('webgpu-canvas')).toBeVisible({ timeout: 10_000 })
    const pixels = await waitForPixels(page, 30_000)
    expect(pixels, 'TDSE should render non-blank pixels').toBeGreaterThanOrEqual(20)
  })

  test('BEC dynamics', async ({ page }) => {
    await gotoMode(page, 'becDynamics', 3)
    await expect(page.getByTestId('webgpu-canvas')).toBeVisible({ timeout: 10_000 })
    const pixels = await waitForPixels(page, 30_000)
    expect(pixels, 'BEC should render non-blank pixels').toBeGreaterThanOrEqual(20)
  })

  test('Dirac equation', async ({ page }) => {
    await gotoMode(page, 'diracEquation', 3)
    await expect(page.getByTestId('webgpu-canvas')).toBeVisible({ timeout: 10_000 })
    const pixels = await waitForPixels(page, 30_000)
    expect(pixels, 'Dirac should render non-blank pixels').toBeGreaterThanOrEqual(20)
  })

  test('dimension 11 (max) renders', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 11)
    await expect(page.getByTestId('webgpu-canvas')).toBeVisible({ timeout: 10_000 })
    const pixels = await waitForPixels(page)
    expect(pixels, 'HO 11D should render non-blank pixels').toBeGreaterThanOrEqual(20)
  })

  test('switching modes preserves rendering', async ({ page }) => {
    // HO → hydrogen → back to HO
    await gotoMode(page, 'harmonicOscillator', 3)
    await expect(page.getByTestId('webgpu-canvas')).toBeVisible({ timeout: 10_000 })
    let pixels = await waitForPixels(page)
    expect(pixels, 'initial HO should render').toBeGreaterThanOrEqual(20)

    await gotoMode(page, 'hydrogenND', 3)
    pixels = await waitForPixels(page)
    expect(pixels, 'hydrogen after switch should render').toBeGreaterThanOrEqual(20)

    await gotoMode(page, 'harmonicOscillator', 3)
    pixels = await waitForPixels(page)
    expect(pixels, 'HO after round-trip should render').toBeGreaterThanOrEqual(20)
  })
})

test.describe('WebGPU fallback', () => {
  test('shows fallback message when WebGPU unavailable', async ({ page }) => {
    await page.goto('/')
    const hasGPU = await page.evaluate(() => !!navigator.gpu)
    test.skip(hasGPU, 'WebGPU is available — fallback not triggered')

    await expect(page.getByText('WebGPU Required')).toBeVisible({ timeout: 15_000 })
  })
})
