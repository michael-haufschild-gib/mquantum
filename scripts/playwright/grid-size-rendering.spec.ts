/**
 * Grid size extremes rendering tests.
 *
 * Verifies that every compute mode with grid settings in 3D can switch to
 * both the lowest and highest available grid size without GPU errors and
 * while continuing to produce rendered frames.
 *
 * Modes tested: TDSE, BEC, Free Scalar Field, Dirac, Quantum Walk, Pauli.
 *
 * For each extreme, we verify:
 * - No GPU/shader errors (automatic via fixtures)
 * - Frames continue advancing after grid change
 * - Renderer remains in "ready" state
 *
 * Pixel checks (expectCanvasNotBlank) are intentionally NOT used here.
 * Some modes (FSF vacuum noise, QW diffuse walk) produce sub-pixel faint
 * output at extreme grid sizes — that's physics, not a rendering bug.
 * Pixel verification at default grids is covered by rendering.spec.ts.
 *
 * Bugs this catches:
 * - Shader workgroup dispatch fails at extreme grid sizes
 * - Buffer allocation crashes at min/max grid
 * - Compute pass reinitialization hangs after grid resize
 * - Density grid / writeGrid pass breaks at non-default sizes
 * - Buffer alignment violations at small grids (e.g. Dirac at grid=2)
 */

import { expect, test } from './fixtures'
import {
  getFrameCount,
  gotoMode,
  gotoPauli,
  requireWebGPU,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.setTimeout(600_000)

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Set grid size for a compute mode via store injection.
 *
 * Grid size changes set `needsReset: true` in the store, which the
 * compute strategy picks up on the next frame — buffer reallocation
 * and state reinit happen inline, not via pipeline rebuild.
 */
async function setGridSize(
  page: import('@playwright/test').Page,
  mode: string,
  size: number,
  dim: number
): Promise<void> {
  const gridArray = Array.from({ length: dim }, () => size)

  if (mode === 'quantumWalk') {
    await page.evaluate(
      async ({ grid, d }: { grid: number[]; d: number }) => {
        const mod = await import('/src/stores/extendedObjectStore.ts')
        const state = mod.useExtendedObjectStore.getState()
        const qw = state.schroedinger.quantumWalk
        state.setSchroedingerConfig({
          quantumWalk: { ...qw, gridSize: grid, latticeDim: d, needsReset: true },
        })
      },
      { grid: gridArray, d: dim }
    )
  } else if (mode === 'pauliSpinor') {
    await page.evaluate(async (grid: number[]) => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setPauliGridSize(grid)
    }, gridArray)
  } else {
    const setterMap: Record<string, string> = {
      tdseDynamics: 'setTdseGridSize',
      becDynamics: 'setBecGridSize',
      freeScalarField: 'setFreeScalarGridSize',
      diracEquation: 'setDiracGridSize',
    }
    const setter = setterMap[mode]
    await page.evaluate(
      async ({ fn, grid }: { fn: string; grid: number[] }) => {
        const mod = await import('/src/stores/extendedObjectStore.ts')
        ;(mod.useExtendedObjectStore.getState() as Record<string, (s: number[]) => void>)[fn](grid)
      },
      { fn: setter, grid: gridArray }
    )
  }
}

/** Navigate to mode and wait for initial pipeline + frames. */
async function setupMode(page: import('@playwright/test').Page, mode: string): Promise<void> {
  if (mode === 'pauliSpinor') {
    await gotoPauli(page, 3)
  } else {
    await gotoMode(page, mode, 3)
  }
  await waitForRendererReady(page)
  await waitForShaderCompilation(page)
  const fc = await getFrameCount(page)
  await waitForFrameAdvance(page, fc + 30)
}

/**
 * Assert the renderer is healthy and producing frames after a grid change.
 *
 * Waits for frames to advance (compute pass picked up the new grid),
 * then checks renderer state. GPU/shader errors are caught automatically
 * by the fixtures' console listener.
 */
async function assertRendererHealthy(
  page: import('@playwright/test').Page,
  label: string,
  gridSize: number
): Promise<void> {
  // Wait for compute pass to process the needsReset + produce frames
  const fc = await getFrameCount(page)
  await waitForFrameAdvance(page, fc + 120)

  // Renderer must still be in "ready" state (not error/initializing)
  const state = await page
    .locator('[data-testid="webgpu-container"]')
    .getAttribute('data-renderer-state')
  expect(state, `${label} renderer must be ready after grid=${gridSize}`).toBe('ready')

  // Frames must still be advancing (renderer not stuck in error loop)
  const fc2 = await getFrameCount(page)
  const fc3 = await waitForFrameAdvance(page, fc2)
  expect(fc3, `${label} frames must advance at grid=${gridSize}`).toBeGreaterThan(fc2)
}

// ─── Mode Definitions ────────────────────────────────────────────────────────

interface ModeGridSpec {
  /** Quantum mode key or 'pauliSpinor' for Pauli */
  mode: string
  /** Human-readable label */
  label: string
  /** Lowest available grid size per dimension at 3D */
  lowest: number
  /** Highest available grid size per dimension at 3D */
  highest: number
}

const modes: ModeGridSpec[] = [
  { mode: 'tdseDynamics', label: 'TDSE', lowest: 2, highest: 64 },
  { mode: 'becDynamics', label: 'BEC', lowest: 2, highest: 64 },
  { mode: 'freeScalarField', label: 'Free Scalar Field', lowest: 2, highest: 64 },
  { mode: 'diracEquation', label: 'Dirac', lowest: 4, highest: 64 },
  { mode: 'quantumWalk', label: 'Quantum Walk', lowest: 16, highest: 64 },
  { mode: 'pauliSpinor', label: 'Pauli Spinor', lowest: 8, highest: 64 },
]

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('grid size extremes rendering (3D)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  for (const { mode, label, lowest, highest } of modes) {
    test(`${label}: lowest grid (${lowest}) renders without errors`, async ({ page }) => {
      await setupMode(page, mode)
      await setGridSize(page, mode, lowest, 3)
      await assertRendererHealthy(page, label, lowest)
    })

    test(`${label}: highest grid (${highest}) renders without errors`, async ({ page }) => {
      await setupMode(page, mode)
      await setGridSize(page, mode, highest, 3)
      await assertRendererHealthy(page, label, highest)
    })
  }
})
