/**
 * N-D Vortex Topology E2E tests.
 *
 * Verifies that all higher-dimensional vortex reconnection presets and
 * configurations:
 * 1. Initialize without GPU/shader/WGSL errors (via fixtures auto-collection)
 * 2. Produce rendered frames (frame count advances)
 * 3. Render non-blank pixels (actual content visible)
 * 4. Console stays clean (no uncaught errors)
 * 5. Diagnostics readback produces finite values
 *
 * Section A: Each vortex preset at its target dimension
 * Section B: Manual vortexReconnection config at D=4 with all field views
 * Section C: Vortex diagnostics readback produces plausible values
 * Section D: Edge cases — dimension switch, single vortex, plane changes
 *
 * GPU/shader error detection is automatic via fixtures.ts.
 */

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  applyBecPreset,
  assertNonBlankPixels,
  getFrameCount,
  gotoMode,
  readBecDiagnostics,
  requireWebGPU,
  waitForDiagnostics,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
  waitForSimulationFrames,
} from './helpers/app-helpers'

test.setTimeout(600_000)

// ─── Helpers ─────────────────────────────────────────────────────────────────

const assertPixels = assertNonBlankPixels

/** Set BEC initial condition via store. */
async function setBecInitialCondition(page: Page, condition: string): Promise<void> {
  await page.evaluate(async (c) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).setBecInitialCondition(c)
  }, condition)
}

/** Set BEC vortex plane 1 via store. */
async function setBecVortexPlane1(page: Page, plane: [number, number]): Promise<void> {
  await page.evaluate(async (p) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).setBecVortexPlane1(p)
  }, plane)
}

/** Set BEC vortex plane 2 via store. */
async function setBecVortexPlane2(page: Page, plane: [number, number]): Promise<void> {
  await page.evaluate(async (p) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).setBecVortexPlane2(p)
  }, plane)
}

/** Set BEC vortex separation via store. */
async function setBecVortexSeparation(page: Page, sep: number): Promise<void> {
  await page.evaluate(async (s) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).setBecVortexSeparation(s)
  }, sep)
}

/** Set BEC vortex pair count via store. */
async function setBecVortexPairCount(page: Page, count: number): Promise<void> {
  await page.evaluate(async (c) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).setBecVortexPairCount(c)
  }, count)
}

/** Set BEC field view via store mutation. */
async function setFieldView(page: Page, view: string): Promise<void> {
  await page.evaluate(async (v) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).setBecFieldView(v)
  }, view)
}

/** Enable BEC diagnostics readback. */
async function enableDiagnostics(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).setBecDiagnosticsEnabled(true)
  })
}

// ─── A. Vortex Preset Rendering ─────────────────────────────────────────────

const vortexPresets = [
  { id: 'vortex4DReconnection', dim: 4, label: '4D Vortex Reconnection' },
  { id: 'vortex4DParallel', dim: 4, label: '4D Parallel Vortices' },
  { id: 'vortex4DSingle', dim: 4, label: '4D Single Vortex Surface' },
  { id: 'vortex5DReconnection', dim: 5, label: '5D Vortex Reconnection' },
] as const

test.describe('vortex topology: preset rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  for (const { id, dim, label } of vortexPresets) {
    test(`${label} (D=${dim}): renders with no GPU errors`, async ({ page }) => {
      await gotoMode(page, 'becDynamics', dim)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)

      await applyBecPreset(page, id)
      await waitForShaderCompilation(page)
      const fc = await getFrameCount(page)
      // BEC compute modes need time to initialize and produce density
      await waitForFrameAdvance(page, fc + 180)

      // Higher-D slices are faint — low pixel threshold
      await assertPixels(page, `${label} D=${dim}`, 1)
    })
  }
})

// ─── B. Manual vortexReconnection Config + Field Views ──────────────────────

test.describe('vortex topology: manual config and field views', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('manual vortexReconnection at D=4: all field views render', async ({ page }) => {
    await gotoMode(page, 'becDynamics', 4)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // Configure vortex reconnection manually (not via preset)
    await setBecInitialCondition(page, 'vortexReconnection')
    await setBecVortexPlane1(page, [0, 1])
    await setBecVortexPlane2(page, [2, 3])
    await setBecVortexSeparation(page, 0.5)
    await setBecVortexPairCount(page, 2)

    await waitForShaderCompilation(page)
    const fc0 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc0 + 180)

    // Verify each field view renders without GPU errors
    for (const view of ['density', 'phase', 'superfluidVelocity'] as const) {
      await setFieldView(page, view)
      await waitForShaderCompilation(page)
      const fc = await getFrameCount(page)
      await waitForFrameAdvance(page, fc + 60)
      await assertPixels(page, `vortexReconnection D=4 ${view}`, 1)
    }
  })

  test('vortexReconnection at D=5: renders non-blank', async ({ page }) => {
    await gotoMode(page, 'becDynamics', 5)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await setBecInitialCondition(page, 'vortexReconnection')
    await setBecVortexPlane1(page, [0, 1])
    await setBecVortexPlane2(page, [3, 4])
    await setBecVortexSeparation(page, 0.3)
    await setBecVortexPairCount(page, 2)

    await waitForShaderCompilation(page)
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 180)
    await assertPixels(page, 'vortexReconnection D=5', 1)
  })
})

// ─── C. Vortex Diagnostics ──────────────────────────────────────────────────

test.describe('vortex topology: diagnostics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('4D reconnection: diagnostics produce finite values', async ({ page }) => {
    await gotoMode(page, 'becDynamics', 4)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await applyBecPreset(page, 'vortex4DReconnection')
    await enableDiagnostics(page)
    await waitForShaderCompilation(page)
    await waitForDiagnostics(page, '/src/stores/becDiagnosticsStore.ts')
    await waitForSimulationFrames(page, 200)

    const diag = await readBecDiagnostics(page)
    expect(diag.hasData, 'diagnostics must have data').toBe(true)
    expect(Number.isFinite(diag.totalNorm), 'totalNorm must be finite').toBe(true)
    expect(diag.totalNorm, 'totalNorm must be positive').toBeGreaterThan(0)
    expect(Number.isFinite(diag.maxDensity), 'maxDensity must be finite').toBe(true)
    expect(diag.maxDensity, 'maxDensity must be positive').toBeGreaterThan(0)
    expect(Number.isFinite(diag.chemicalPotential), 'mu must be finite').toBe(true)
    // Repulsive BEC (g=500) — mu should be positive
    expect(diag.chemicalPotential, 'mu must be > 0 for repulsive BEC').toBeGreaterThan(0)
    expect(Number.isFinite(diag.healingLength), 'healing length must be finite').toBe(true)
    expect(diag.healingLength, 'healing length must be > 0').toBeGreaterThan(0)
  })

  test('4D reconnection: norm stable over 200 frames', async ({ page }) => {
    await gotoMode(page, 'becDynamics', 4)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await applyBecPreset(page, 'vortex4DReconnection')
    await enableDiagnostics(page)
    await waitForShaderCompilation(page)
    await waitForDiagnostics(page, '/src/stores/becDiagnosticsStore.ts')
    await waitForSimulationFrames(page, 200)

    const diag = await readBecDiagnostics(page)
    expect(diag.hasData, 'diagnostics must have data').toBe(true)
    // Strang splitting is unitary — norm drift should be small
    expect(
      Math.abs(diag.normDrift),
      `4D vortex normDrift (${diag.normDrift}) should be < 20%`
    ).toBeLessThan(0.2)
  })
})

// ─── D. Edge Cases ──────────────────────────────────────────────────────────

test.describe('vortex topology: edge cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('single vortex (pairCount=1) at D=4: renders without errors', async ({ page }) => {
    await gotoMode(page, 'becDynamics', 4)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await applyBecPreset(page, 'vortex4DSingle')
    await waitForShaderCompilation(page)
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 180)
    await assertPixels(page, 'single vortex D=4', 1)
  })

  test('dimension switch D=3 → D=4 with vortex preset: no crash', async ({ page }) => {
    // Start at D=3 BEC
    await gotoMode(page, 'becDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await applyBecPreset(page, 'singleVortex')
    await waitForShaderCompilation(page)
    const fc1 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc1 + 60)
    await assertPixels(page, 'BEC 3D vortex before switch')

    // Switch to D=4 with reconnection preset
    await gotoMode(page, 'becDynamics', 4)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await applyBecPreset(page, 'vortex4DReconnection')
    await waitForShaderCompilation(page)
    const fc2 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc2 + 180)
    await assertPixels(page, 'BEC 4D vortex after switch', 1)
  })

  test('changing vortex planes at D=4: no GPU errors', async ({ page }) => {
    await gotoMode(page, 'becDynamics', 4)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await applyBecPreset(page, 'vortex4DReconnection')
    await waitForShaderCompilation(page)
    const fc1 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc1 + 120)

    // Change planes: (0,1)+(2,3) → (0,2)+(1,3)
    await setBecVortexPlane1(page, [0, 2])
    await setBecVortexPlane2(page, [1, 3])
    await waitForShaderCompilation(page)
    const fc2 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc2 + 120)
    await assertPixels(page, 'BEC 4D changed planes', 1)
  })

  test('existing 3D BEC presets still work (no regression)', async ({ page }) => {
    // Quick regression: existing presets must not break
    await gotoMode(page, 'becDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    for (const presetId of ['groundState', 'singleVortex', 'darkSoliton'] as const) {
      await applyBecPreset(page, presetId)
      await waitForShaderCompilation(page)
      const fc = await getFrameCount(page)
      await waitForFrameAdvance(page, fc + 120)
      await assertPixels(page, `regression: ${presetId} 3D`, 3)
    }
  })
})
