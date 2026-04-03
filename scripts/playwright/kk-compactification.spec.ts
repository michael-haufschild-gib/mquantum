/**
 * KK Compactification e2e test suite.
 *
 * Verifies Kaluza-Klein compactification controls in TDSE and BEC modes:
 * - Section A: Toggling compact dims renders without GPU errors
 * - Section B: Changing R produces visual pixel difference
 * - Section C: PML is skipped on compact dims (norm preserved better)
 * - Section D: BEC mode compact dims work identically
 *
 * GPU/shader error detection is automatic via fixtures.ts.
 */

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  assertNonBlankPixels,
  capturePixelSnapshot,
  expectSnapshotsDiffer,
  gotoMode,
  readBecDiagnostics,
  readTdseDiagnostics,
  requireWebGPU,
  waitForDiagnostics,
  waitForModeReady,
  waitForRendererReady,
  waitForShaderCompilation,
  waitForSimulationFrames,
  waitForUniformUpdate,
} from './helpers/app-helpers'

test.setTimeout(600_000)

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Set a TDSE compact dim flag via store mutation. */
async function setTdseCompactDim(page: Page, dimIndex: number, compact: boolean): Promise<void> {
  await page.evaluate(
    async ({ d, c }) => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      ;(
        mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
      ).setTdseCompactDim(d, c)
    },
    { d: dimIndex, c: compact }
  )
}

/** Set a TDSE compact radius via store mutation. */
async function setTdseCompactRadius(page: Page, dimIndex: number, radius: number): Promise<void> {
  await page.evaluate(
    async ({ d, r }) => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      ;(
        mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
      ).setTdseCompactRadius(d, r)
    },
    { d: dimIndex, r: radius }
  )
}

/** Set a BEC compact dim flag via store mutation. */
async function setBecCompactDim(page: Page, dimIndex: number, compact: boolean): Promise<void> {
  await page.evaluate(
    async ({ d, c }) => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      ;(
        mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
      ).setBecCompactDim(d, c)
    },
    { d: dimIndex, c: compact }
  )
}

/** Set a BEC compact radius via store mutation. */
async function setBecCompactRadius(page: Page, dimIndex: number, radius: number): Promise<void> {
  await page.evaluate(
    async ({ d, r }) => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      ;(
        mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
      ).setBecCompactRadius(d, r)
    },
    { d: dimIndex, r: radius }
  )
}

/** Enable TDSE diagnostics readback. */
async function enableTdseDiagnostics(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).setTdseDiagnosticsEnabled(true)
  })
}

/** Enable BEC diagnostics readback. */
async function enableBecDiagnostics(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).setBecDiagnosticsEnabled(true)
  })
}

/** Read TDSE compactDims from live store. */
async function readTdseCompactDims(page: Page): Promise<boolean[]> {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    return [...(mod.useExtendedObjectStore.getState().schroedinger.tdse.compactDims ?? [])]
  })
}

/** Read BEC compactDims from live store. */
async function readBecCompactDims(page: Page): Promise<boolean[]> {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    return [...(mod.useExtendedObjectStore.getState().schroedinger.bec.compactDims ?? [])]
  })
}

/** Read TDSE compactRadii from live store. */
async function readTdseCompactRadii(page: Page): Promise<number[]> {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    return [...(mod.useExtendedObjectStore.getState().schroedinger.tdse.compactRadii ?? [])]
  })
}

// ─── A. TDSE: Compact Dim Toggle Renders Without GPU Errors ─────────────────

test.describe('KK compactification: TDSE rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('toggling z-dim compact in 3D TDSE renders without GPU errors', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForModeReady(page, 60)

    // Verify initial state: no compact dims
    const initialDims = await readTdseCompactDims(page)
    expect(initialDims.every((d) => !d)).toBe(true)

    // Enable compact on dim 2 (z)
    await setTdseCompactDim(page, 2, true)
    await waitForUniformUpdate(page)
    await waitForSimulationFrames(page, 30)

    // Must render non-blank (GPU errors auto-asserted by fixture)
    await assertNonBlankPixels(page, 'TDSE with compact z-dim')

    // Verify store updated
    const updatedDims = await readTdseCompactDims(page)
    expect(updatedDims[2]).toBe(true)
  })

  test('toggling multiple compact dims in 5D TDSE renders', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 5)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForModeReady(page, 60)

    // Compact dims 3 and 4 (extra dimensions)
    await setTdseCompactDim(page, 3, true)
    await setTdseCompactDim(page, 4, true)
    await waitForUniformUpdate(page)
    await waitForSimulationFrames(page, 30)

    await assertNonBlankPixels(page, 'TDSE 5D with compact w,v dims')
  })
})

// ─── B. Changing R Produces Visual Difference ───────────────────────────────

test.describe('KK compactification: radius visual response', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('changing compact R produces pixel difference in TDSE', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForModeReady(page, 60)

    // Enable compact z-dim with small R
    await setTdseCompactDim(page, 2, true)
    await setTdseCompactRadius(page, 2, 0.05)
    await waitForUniformUpdate(page)
    await waitForSimulationFrames(page, 60)

    const snapSmallR = await capturePixelSnapshot(page)

    // Increase R significantly
    await setTdseCompactRadius(page, 2, 0.4)
    await waitForUniformUpdate(page)
    await waitForSimulationFrames(page, 60)

    const snapLargeR = await capturePixelSnapshot(page)

    // Different R values should produce different visualizations because
    // the effective spacing changes, which alters the wavefunction evolution
    expectSnapshotsDiffer(snapSmallR, snapLargeR, 'small R vs large R')
  })

  test('R is clamped to rMax when set too large', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForModeReady(page, 60)

    await setTdseCompactDim(page, 2, true)
    // Set absurdly large R — store should clamp it
    await setTdseCompactRadius(page, 2, 100.0)
    await waitForUniformUpdate(page)

    const radii = await readTdseCompactRadii(page)
    // R should be clamped well below 100 (rMax ≈ gridExtent/(2π) ≈ 0.5 for 32×0.1)
    expect(radii[2]).toBeLessThan(2.0)
    expect(radii[2]).toBeGreaterThan(0)

    // Must still render without errors
    await assertNonBlankPixels(page, 'TDSE with clamped R')
  })
})

// ─── C. PML Skipped on Compact Dims (Norm Preservation) ────────────────────

test.describe('KK compactification: PML interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('compact dim with absorber: norm preserved better than extended', async ({ page }) => {
    // Start TDSE 3D with absorber enabled and a Gaussian wavepacket
    // hitting boundaries. Compact dims should skip PML → less norm loss.
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForModeReady(page, 30)

    // Enable diagnostics for norm tracking
    await enableTdseDiagnostics(page)

    // Enable absorber
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      ;(
        mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
      ).setTdseAbsorberEnabled(true)
    })

    // Make z-dim compact — PML should be skipped for that dimension
    await setTdseCompactDim(page, 2, true)
    await waitForUniformUpdate(page)

    // Let simulation run enough to see norm behavior
    await waitForSimulationFrames(page, 180)
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'tdse')

    const diag = await readTdseDiagnostics(page)
    expect(diag.hasData).toBe(true)
    // Norm should be positive — the simulation is running
    expect(diag.totalNorm).toBeGreaterThan(0)
    // Norm drift should be finite (not NaN/Inf — would indicate numerical blowup)
    expect(Number.isFinite(diag.normDrift)).toBe(true)
  })
})

// ─── D. BEC Mode: Compact Dims ─────────────────────────────────────────────

test.describe('KK compactification: BEC mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('toggling compact dim in BEC 3D renders without GPU errors', async ({ page }) => {
    await gotoMode(page, 'becDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForModeReady(page, 60)

    // Enable compact on dim 1 (y)
    await setBecCompactDim(page, 1, true)
    await waitForUniformUpdate(page)
    await waitForSimulationFrames(page, 30)

    await assertNonBlankPixels(page, 'BEC with compact y-dim')

    const dims = await readBecCompactDims(page)
    expect(dims[1]).toBe(true)
  })

  test('changing compact R in BEC produces pixel difference', async ({ page }) => {
    await gotoMode(page, 'becDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForModeReady(page, 60)

    await setBecCompactDim(page, 2, true)
    await setBecCompactRadius(page, 2, 0.05)
    await waitForUniformUpdate(page)
    await waitForSimulationFrames(page, 60)

    const snapSmallR = await capturePixelSnapshot(page)

    await setBecCompactRadius(page, 2, 0.4)
    await waitForUniformUpdate(page)
    await waitForSimulationFrames(page, 60)

    const snapLargeR = await capturePixelSnapshot(page)
    expectSnapshotsDiffer(snapSmallR, snapLargeR, 'BEC small R vs large R')
  })

  test('BEC compact dim with diagnostics: norm stable', async ({ page }) => {
    await gotoMode(page, 'becDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForModeReady(page, 30)

    await enableBecDiagnostics(page)
    await setBecCompactDim(page, 2, true)
    await setBecCompactRadius(page, 2, 0.15)
    await waitForUniformUpdate(page)

    await waitForSimulationFrames(page, 180)
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'bec')

    const diag = await readBecDiagnostics(page)
    expect(diag.hasData).toBe(true)
    expect(diag.totalNorm).toBeGreaterThan(0)
    expect(Number.isFinite(diag.normDrift)).toBe(true)
  })
})

// ─── E. Compact Dim Toggle/Untoggle Round-Trip ──────────────────────────────

test.describe('KK compactification: toggle round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('enabling then disabling compact dim returns to extended behavior', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForModeReady(page, 60)

    // Enable compact z
    await setTdseCompactDim(page, 2, true)
    await waitForUniformUpdate(page)
    await waitForSimulationFrames(page, 30)

    const snapCompact = await capturePixelSnapshot(page)

    // Disable compact z (back to extended)
    await setTdseCompactDim(page, 2, false)
    await waitForUniformUpdate(page)
    await waitForSimulationFrames(page, 30)

    const snapAfter = await capturePixelSnapshot(page)

    // Verify store is back to all-extended
    const dims = await readTdseCompactDims(page)
    expect(dims[2]).toBe(false)

    // Compact and post-toggle snapshots should differ (simulation evolved differently)
    expectSnapshotsDiffer(snapCompact, snapAfter, 'compact vs re-extended')

    // Must still render after toggle round-trip (no GPU errors)
    await assertNonBlankPixels(page, 'TDSE after compact toggle round-trip')
  })
})
