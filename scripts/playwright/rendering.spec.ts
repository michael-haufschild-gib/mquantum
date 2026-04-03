/**
 * Quantum rendering tests with pixel verification.
 *
 * Verifies that each quantum mode:
 * 1. Initializes the WebGPU renderer (data-renderer-state="ready")
 * 2. Produces rendered frames (data-frame-count > 0)
 * 3. Emits no fatal GPU errors
 * 4. Actually renders visible content (pixel readback shows >1 color)
 *
 * Pixel verification uses the app's own GPU buffer readback
 * (captureScreenshotAsync) — the only reliable way to read a WebGPU canvas.
 *
 * Bugs caught:
 * - Shader compilation error for a specific quantum mode
 * - Pipeline workgroup size exceeds device limit
 * - Render loop runs but produces blank frames (clear color only)
 * - Dimension change triggers crash in shader recompilation
 * - Renderer stuck in "initializing" (async init never resolves)
 * - Fatal GPU errors (render graph cycles, device lost)
 * - Mode switch leaves stale pipeline producing wrong output
 */

import { expect, test } from './fixtures'
import {
  expectCanvasNotBlank,
  getFrameCount,
  getPerformanceMetrics,
  gotoMode,
  gotoPauli,
  hasWebGPU,
  pauseAnimation,
  requireWebGPU,
  waitForFirstFrame,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForRendererSettled,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.setTimeout(360_000)

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('quantum mode rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  const modes = [
    { mode: 'harmonicOscillator', dim: 3, label: 'HO 3D' },
    { mode: 'harmonicOscillator', dim: 5, label: 'HO 5D' },
    { mode: 'hydrogenND', dim: 2, label: 'Hydrogen 2D (true 2D Coulomb)' },
    { mode: 'hydrogenNDCoupled', dim: 2, label: 'Hydrogen Coupled 2D (falls back to uncoupled)' },
    { mode: 'hydrogenND', dim: 3, label: 'Hydrogen 3D' },
    { mode: 'hydrogenND', dim: 4, label: 'Hydrogen 4D' },
    { mode: 'hydrogenND', dim: 5, label: 'Hydrogen 5D (odd D, half-int λ)' },
    { mode: 'hydrogenND', dim: 7, label: 'Hydrogen 7D' },
    { mode: 'hydrogenND', dim: 11, label: 'Hydrogen 11D (max dim)' },
    { mode: 'freeScalarField', dim: 3, label: 'Free Scalar Field' },
    { mode: 'tdseDynamics', dim: 3, label: 'TDSE' },
    { mode: 'becDynamics', dim: 3, label: 'BEC' },
    { mode: 'diracEquation', dim: 3, label: 'Dirac' },
    { mode: 'quantumWalk', dim: 3, label: 'Quantum Walk 3D' },
    { mode: 'harmonicOscillator', dim: 11, label: 'HO 11D (max dim)' },
  ] as const

  // Pauli spinor uses a different objectType ('pauliSpinor'), so it needs
  // gotoPauli() instead of gotoMode(). Test it with the same triple check:
  // shader compiles + no GPU errors + non-blank pixels.
  const pauliModes = [
    { dim: 3, label: 'Pauli 3D' },
    { dim: 5, label: 'Pauli 5D' },
  ] as const

  for (const { dim, label } of pauliModes) {
    test(`${label}: renders non-blank pixels with no fatal errors`, async ({ page }) => {
      await gotoPauli(page, dim)
      await waitForShaderCompilation(page)

      await expectCanvasNotBlank(page)
    })
  }

  for (const { mode, dim, label } of modes) {
    test(`${label}: renders non-blank pixels with no fatal errors`, async ({ page }) => {
      // Quantum Walk: if this test fails with an empty screenshot, QW is
      // broken — not "too faint". Nothing rendering at all is a real bug.
      await gotoMode(page, mode, dim)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)

      // Quantum Walk starts from a single lattice site (delta function).
      // Let it evolve ~60 frames so the interference pattern is large enough
      // to hit the 20×20 pixel sampling grid, then pause. The adaptive
      // maxDensity normalization keeps colors bright as the walk spreads.
      if (mode === 'quantumWalk') {
        const fc = await getFrameCount(page)
        await waitForFrameAdvance(page, fc + 60)
        await pauseAnimation(page)
      }

      await expectCanvasNotBlank(page)
    })
  }

  test('switching modes: renderer recovers and renders each mode', async ({ page }) => {
    for (const mode of ['harmonicOscillator', 'hydrogenND', 'harmonicOscillator'] as const) {
      await gotoMode(page, mode, 3)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)
      await expectCanvasNotBlank(page)
    }
  })

  test('animation loop: frame count increases over time', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForFirstFrame(page)

    const count1 = await getFrameCount(page)
    const count2 = await waitForFrameAdvance(page, count1)

    expect(count2, 'Frame count should increase').toBeGreaterThan(count1)
  })

  test('renderer settles to ready or error, never stuck at initializing', async ({ page }) => {
    await page.goto('/')
    const state = await waitForRendererSettled(page)
    expect(['ready', 'error']).toContain(state)
  })

  test('dimension change does not crash renderer and renders new dimension', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await gotoMode(page, 'harmonicOscillator', 7)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await expectCanvasNotBlank(page)
  })

  test('rapid mode switching does not crash renderer', async ({ page }) => {
    // Quick succession — only the last navigation's shader needs to compile
    const modeSequence = ['harmonicOscillator', 'tdseDynamics', 'becDynamics', 'hydrogenND']

    for (const mode of modeSequence) {
      await gotoMode(page, mode, 3)
    }

    // After the last navigation, wait for full pipeline compilation
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await expectCanvasNotBlank(page)
  })
})

test.describe('shader compilation time gate', () => {
  test('HO 3D shader compiles within 30 seconds', async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())

    const start = Date.now()
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    const elapsed = Date.now() - start

    expect(elapsed, 'shader compilation should complete within 30s').toBeLessThan(30_000)
  })

  test('hydrogen 7D shader compiles within 30 seconds', async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())

    const start = Date.now()
    await gotoMode(page, 'hydrogenND', 7)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    const elapsed = Date.now() - start

    expect(elapsed, 'shader compilation should complete within 30s').toBeLessThan(30_000)
  })
})

test.describe('shader compilation overlay', () => {
  test('overlay appears during mode switch and disappears after compilation', async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())

    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // Navigate to a different mode — should trigger shader compilation
    // The overlay should either appear briefly or not appear at all (fast compilation).
    // What matters: after compilation completes, the overlay must NOT be stuck visible.
    await gotoMode(page, 'hydrogenND', 7)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // After shader compilation is done, the overlay must not be visible
    await expect(
      page.getByTestId('shader-compilation-overlay'),
      'Shader compilation overlay must not persist after compilation completes'
    ).not.toBeVisible({ timeout: 10_000 })

    // Canvas must be rendering
    await expectCanvasNotBlank(page)
  })
})

test.describe('viewport resize during rendering', () => {
  test('resize does not crash renderer', async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())

    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await expectCanvasNotBlank(page)

    // Resize to a smaller viewport — forces render target recreation
    await page.setViewportSize({ width: 800, height: 600 })

    // Renderer must recover: frames advance, canvas not blank
    const count = await getFrameCount(page)
    await waitForFrameAdvance(page, count)
    await expectCanvasNotBlank(page)

    // Resize to a larger viewport
    await page.setViewportSize({ width: 1600, height: 1000 })

    const count2 = await getFrameCount(page)
    await waitForFrameAdvance(page, count2)
    await expectCanvasNotBlank(page)
  })
})

test.describe('VRAM stability', () => {
  test('VRAM does not grow unboundedly after mode switch cycle', async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())

    // Enable perf monitor so VRAM tracking is active
    await page.evaluate(async () => {
      const mod = await import('/src/stores/uiStore.ts')
      mod.useUIStore.setState({ showPerfMonitor: true, perfMonitorExpanded: true })
    })

    // Baseline: measure VRAM after initial HO 3D render
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    const baselineCount = await getFrameCount(page)
    await waitForFrameAdvance(page, baselineCount + 30)
    const baseline = await getPerformanceMetrics(page)

    // Cycle through all modes twice
    const cycleModes = [
      'hydrogenND',
      'tdseDynamics',
      'becDynamics',
      'diracEquation',
      'freeScalarField',
      'harmonicOscillator',
      'hydrogenND',
      'tdseDynamics',
      'becDynamics',
      'diracEquation',
      'freeScalarField',
      'harmonicOscillator',
    ]

    for (const mode of cycleModes) {
      await gotoMode(page, mode, 3)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)
    }

    // Let GC and buffer cleanup settle
    const finalCount = await getFrameCount(page)
    await waitForFrameAdvance(page, finalCount + 30)
    const final = await getPerformanceMetrics(page)

    // VRAM should not have grown by more than 50% over baseline.
    // Some growth is expected from shader pipeline caches, but
    // unbounded growth indicates a GPU resource leak.
    const ratio = final.vramMB / Math.max(baseline.vramMB, 1)
    expect(
      ratio,
      `VRAM ratio after mode cycling: ${ratio.toFixed(2)}x (baseline=${baseline.vramMB.toFixed(1)}MB, final=${final.vramMB.toFixed(1)}MB)`
    ).toBeLessThan(1.5)
  })
})

test.describe('WebGPU fallback', () => {
  test('shows fallback message when WebGPU unavailable', async ({ page }) => {
    await page.goto('/')
    test.skip(await hasWebGPU(page), 'WebGPU is available — fallback not triggered')

    await expect(page.getByText('WebGPU Required')).toBeVisible({ timeout: 15_000 })
  })
})
