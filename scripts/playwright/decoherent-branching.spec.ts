/**
 * E2E: TDSE Decoherent Branching Visualization
 *
 * Exercises the branching-partition feature end-to-end:
 *
 *   - `brc=1` + `brc_p=<x>` URL params activate the branch plane in the
 *     TDSE diagnostics dispatcher, so `normLeft` / `normRight` partition at
 *     `x = brc_p * halfExtent` instead of the default `barrierCenter`.
 *   - With `sloc=1` + `sloc_g>0`, continuous spontaneous localization kicks
 *     are applied between Strang split-steps, which should measurably change
 *     the inverse participation ratio relative to free evolution.
 *
 * Uses deterministic waits (`waitForFreshReadback` on the unified
 * diagnostics store) instead of `waitForTimeout`, and asserts physics
 * directionally rather than via trivial floor bounds.
 */

import { expect, test } from './fixtures'
import {
  gotoModeWithParams,
  waitForFirstFrame,
  waitForFreshReadback,
  waitForRendererSettled,
} from './helpers/app-helpers'

const DIAGNOSTICS_MODULE = '/src/stores/diagnosticsStore.ts'

/**
 * Wait for at least `minGenerations` fresh TDSE diagnostic readbacks after
 * the renderer is settled. Each call to `waitForFreshReadback` returns as
 * soon as the generation counter advances past the pre-call value, so this
 * guarantees the requested number of *post-settle* physics updates have
 * been pushed into the unified diagnostics store.
 */
async function waitForTdseReadbacks(
  page: import('@playwright/test').Page,
  minGenerations: number
): Promise<void> {
  for (let i = 0; i < minGenerations; i++) {
    await waitForFreshReadback(page, DIAGNOSTICS_MODULE, 30_000, 'tdse')
  }
}

/** Read the TDSE diagnostic snapshot currently in the unified store. */
async function readTdseDiagnostics(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/diagnosticsStore.ts')
    const s = mod.useDiagnosticsStore.getState().tdse
    return {
      simTime: s.simTime,
      totalNorm: s.totalNorm,
      normLeft: s.normLeft,
      normRight: s.normRight,
      ipr: s.ipr,
      readbackGeneration: s.readbackGeneration,
    }
  })
}

test.describe('TDSE Decoherent Branching Visualization', () => {
  test('brc URL params route into the extended store and pass the reduction identity', async ({
    page,
  }) => {
    // This test guards two independent pipelines:
    //
    //   1. URL → deserialize → `applyBranchingParams` → store setter. We
    //      read the store directly (avoiding any physics timing) to verify
    //      `branchingEnabled` and `branchPlanePosition` actually land.
    //   2. TDSE diagnostic reduction identity: `normLeft + normRight ≡
    //      totalNorm` to float precision. The WGSL shader builds each site
    //      into exactly one partition bucket with `select(...)`, so the
    //      only way to break this is a genuine bug in partial-sum reduction
    //      or a regression in how the partition uniform is written.
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'harmonicTrap',
      abs: '0',
      diag: '1',
      brc: '1',
      brc_p: '0.3',
    })
    const state = await waitForRendererSettled(page)
    expect(state, 'renderer must reach ready state (WebGPU required)').toBe('ready')

    const store = await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const tdse = mod.useExtendedObjectStore.getState().schroedinger.tdse
      return {
        branchingEnabled: tdse.branchingEnabled,
        branchPlanePosition: tdse.branchPlanePosition,
      }
    })
    expect(store.branchingEnabled).toBe(true)
    expect(store.branchPlanePosition).toBeCloseTo(0.3, 4)

    await waitForFirstFrame(page)
    await waitForTdseReadbacks(page, 1)
    const diag = await readTdseDiagnostics(page)

    // Reduction identity — tight tolerance. A float-order drift would be
    // around 1e-6 for a 64³ grid; 1e-4 leaves safety margin for mixed-
    // precision float16/float32 back-ends while still catching bugs.
    const partitionSum = diag.normLeft + diag.normRight
    expect(Math.abs(partitionSum - diag.totalNorm) / diag.totalNorm).toBeLessThan(1e-4)
    expect(diag.totalNorm, 'simulation must have evolved past init').toBeGreaterThan(0)
  })

  test('moving the branch plane shifts normLeft monotonically', async ({ page }) => {
    // Regression guard for the `TDSEComputePassDispatchers` partition wiring:
    // branchPlanePosition must actually flow through to the diagnostic
    // reduction uniform. We read the same packet under two plane positions
    // and require that moving the plane rightward increases the left-side
    // norm, since more of the density now falls to the left of the plane.
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'harmonicTrap',
      abs: '0',
      diag: '1',
      brc: '1',
      brc_p: '-0.5',
    })
    const stateA = await waitForRendererSettled(page)
    expect(stateA, 'renderer must reach ready state').toBe('ready')
    await waitForFirstFrame(page)
    await waitForTdseReadbacks(page, 2)
    const diagLeftPlane = await readTdseDiagnostics(page)

    // Nudge the plane right by moving brc_p from −0.5 → +0.5 via store
    // setter (cheaper than a full remount via gotoModeWithParams and keeps
    // the simulation timeline continuous so differences are attributable
    // to the plane move).
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setTdseBranchPlanePosition(0.5)
    })
    await waitForFreshReadback(page, DIAGNOSTICS_MODULE, 30_000, 'tdse')
    const diagRightPlane = await readTdseDiagnostics(page)

    const fracLeftAtMinusHalf = diagLeftPlane.normLeft / diagLeftPlane.totalNorm
    const fracLeftAtPlusHalf = diagRightPlane.normLeft / diagRightPlane.totalNorm

    // Moving the plane from −0.5 → +0.5 must strictly increase the
    // fraction counted as "left". 5 percentage-point minimum gap rejects
    // the degenerate case where the partition is silently wired to a
    // stale / static constant.
    expect(fracLeftAtPlusHalf - fracLeftAtMinusHalf).toBeGreaterThan(0.05)
  })

  test('CSL localization reduces IPR in a double well versus free evolution', async ({ page }) => {
    // Physics directionality: under strong continuous spontaneous
    // localization, a double-well potential traps the wavefunction in the
    // wells (lower IPR = more localized), whereas free evolution lets the
    // localized noise source spread over the full grid (higher IPR).
    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'doubleWell',
      abs: '0',
      diag: '1',
      sloc: '1',
      sloc_g: '2.0',
    })
    let state = await waitForRendererSettled(page)
    expect(state, 'renderer must reach ready state').toBe('ready')
    await waitForFirstFrame(page)
    // Enough readbacks for CSL + potential to differentiate.
    await waitForTdseReadbacks(page, 8)
    const diagDW = await readTdseDiagnostics(page)

    await gotoModeWithParams(page, 'tdseDynamics', 3, {
      pot: 'free',
      abs: '0',
      diag: '1',
      sloc: '1',
      sloc_g: '2.0',
    })
    state = await waitForRendererSettled(page)
    expect(state, 'renderer must reach ready state').toBe('ready')
    await waitForFirstFrame(page)
    await waitForTdseReadbacks(page, 8)
    const diagFree = await readTdseDiagnostics(page)

    // Both IPR values should be non-degenerate.
    expect(diagDW.ipr).toBeGreaterThan(1)
    expect(diagFree.ipr).toBeGreaterThan(1)

    // Physics check: IPR ordering. `diagFree.ipr` should exceed
    // `diagDW.ipr` because free + CSL diffuses probability over a larger
    // effective support than double-well + CSL. The relative-difference
    // threshold rejects floor-level numerical noise while staying robust
    // to small shifts in the default grid parameters.
    const larger = Math.max(diagDW.ipr, diagFree.ipr)
    const relDiff = Math.abs(diagDW.ipr - diagFree.ipr) / larger
    expect(relDiff, 'IPR must differ meaningfully between DW and free').toBeGreaterThan(0.1)
    expect(diagFree.ipr, 'free + CSL should be more delocalized than DW + CSL').toBeGreaterThan(
      diagDW.ipr
    )
  })
})
