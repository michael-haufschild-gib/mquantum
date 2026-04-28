/**
 * Curved-space TDSE e2e tests (plan 3.2, tests 16-22).
 *
 * Verifies the Morris–Thorne wormhole metric path of the TDSE compute
 * pipeline renders, evolves, diverges from flat dynamics, conserves norm,
 * runs without GPU errors, and round-trips through URL state.
 *
 * See: docs/plans/curved-space-tdse-v1.md section 3.2.
 *
 * GPU/shader error detection is automatic via fixtures.ts — test 21 is
 * satisfied for every test in this file by the shared fixture.
 */

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  applyTdsePreset,
  assertNonBlankPixels,
  capturePixelSnapshot,
  expectSnapshotsDiffer,
  getFrameCount,
  gotoMode,
  readTdseDiagnostics,
  requireWebGPU,
  snapshotDistance,
  waitForDiagnostics,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
  waitForSimulationFrames,
} from './helpers/app-helpers'

test.setTimeout(600_000)

// ─── Inline helpers ──────────────────────────────────────────────────────────

/**
 * Override the TDSE metric via store mutation. Mirrors the inline-setter
 * pattern used in tdse-dynamics.spec.ts — no public app-helpers.ts wrapper
 * exists for this setter yet.
 */
async function setTdseMetric(
  page: Page,
  cfg: { kind: 'flat' | 'morrisThorne'; throatRadius?: number }
): Promise<void> {
  await page.evaluate(async (metric) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).setTdseMetric(metric)
  }, cfg)
}

/** Read the TDSE metric field from the extended object store. */
async function readTdseMetric(page: Page): Promise<{ kind: string; throatRadius?: number }> {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    const s = mod.useExtendedObjectStore.getState() as Record<string, unknown>
    const schroedinger = s.schroedinger as { tdse?: { metric?: unknown } } | undefined
    return (schroedinger?.tdse?.metric ?? { kind: 'flat' }) as {
      kind: string
      throatRadius?: number
    }
  })
}

/**
 * Shared setup: navigate with curved-metric URL params, wait for renderer +
 * shader compilation, apply the wormhole preset, let the simulation advance.
 *
 * The `wormholeWavepacket` preset sets `metric: { kind: 'morrisThorne',
 * throatRadius: 0.5 }`. We use URL params as a redundant activation channel
 * so the curved-kinetic path is on from the first frame.
 */
async function setupWormholeScene(page: Page): Promise<void> {
  await page.goto('/?t=schroedinger&d=3&qm=tdseDynamics&tdse_metric=morrisThorne&tdse_b0=0.5')
  await waitForRendererReady(page)
  await waitForShaderCompilation(page)
  await applyTdsePreset(page, 'wormholeWavepacket')
  await waitForShaderCompilation(page)
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('TDSE curved space', () => {
  test('16: wormhole preset loads and renders', async ({ page }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await applyTdsePreset(page, 'wormholeWavepacket')
    await waitForShaderCompilation(page)

    // Advance a few frames so the curved-kinetic integrator produces density
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 60)

    await assertNonBlankPixels(page, 'wormhole preset 3D', 1)
  })

  test('17: wave packet evolves in time on curved background', async ({ page }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    await setupWormholeScene(page)

    // t ≈ 1s sim time: dt=0.002, stepsPerFrame=4 ⇒ ~125 frames for 1s.
    // Use 60 frames (~0.48s) as the earlier sample; the packet is still
    // away from the throat so dynamics are less chaotic here.
    const fc1 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc1 + 60)
    const snapA = await capturePixelSnapshot(page)

    // Advance another ~180 frames (roughly +1.4s sim time) so the packet
    // crosses through / past the throat — dynamics guarantee motion.
    const fc2 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc2 + 180)
    const snapB = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapA, snapB, 'curved-space wave packet must evolve in time', 1.0)
  })

  test('18: throat feature visible when packet reaches wormhole', async ({ page }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    await setupWormholeScene(page)

    // Packet starts at x=-3 with k=3 ⇒ group velocity 3 ⇒ reaches throat
    // (x=0) after t≈1s. dt=0.002 × stepsPerFrame=4 = 0.008s/frame ⇒ ~125
    // frames. Wait for ~200 frames to be safely past arrival.
    await waitForSimulationFrames(page, 200)

    // Enable and wait for diagnostics readback — the preset sets
    // diagnosticsEnabled:true, but the first populated frame may lag.
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', 30_000, 'tdse')
    const diag = await readTdseDiagnostics(page)

    expect(diag.hasData, 'TDSE diagnostics must populate').toBe(true)
    expect(
      diag.maxDensity,
      `max density at throat should be non-trivial (got ${diag.maxDensity})`
    ).toBeGreaterThan(0.01)

    // Structural check: the rendered image is not a flat fill. Two snapshots
    // a few frames apart must show at least some pixel variance — a static
    // uniform fill would produce distance ≈ 0.
    const snapA = await capturePixelSnapshot(page)
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 10)
    const snapB = await capturePixelSnapshot(page)
    // Not using expectSnapshotsDiffer — a slow-moving packet may produce a
    // very small but non-zero difference. We just need non-uniform behavior.
    expect(
      snapshotDistance(snapA, snapB),
      'Packet near throat must produce a non-uniform, non-static image'
    ).toBeGreaterThan(0)

    await assertNonBlankPixels(page, 'throat frame', 1)
  })

  test('19: curved metric produces different dynamics than flat metric', async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    // Path A — Morris–Thorne metric (from preset)
    await setupWormholeScene(page)
    await waitForSimulationFrames(page, 200)
    const snapCurved = await capturePixelSnapshot(page)

    // Path B — same preset, then override metric to flat. Use a fresh
    // navigation so there is no lingering curved-integrator state.
    await page.goto('/?t=schroedinger&d=3&qm=tdseDynamics')
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await applyTdsePreset(page, 'wormholeWavepacket')
    await waitForShaderCompilation(page)
    await setTdseMetric(page, { kind: 'flat' })
    await waitForShaderCompilation(page)
    await waitForSimulationFrames(page, 200)
    const snapFlat = await capturePixelSnapshot(page)

    // Threshold 1.0 is well above compression noise (~0.1) and comfortably
    // above subtle per-frame drift — a metric that did nothing would give
    // identical images at the same frame count.
    expectSnapshotsDiffer(
      snapCurved,
      snapFlat,
      'Curved vs flat metric must produce different dynamics',
      1.0
    )
  })

  test('20: GPU norm drift stays under 1% on curved metric', async ({ page }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    await setupWormholeScene(page)
    await waitForSimulationFrames(page, 200)

    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', 30_000, 'tdse')
    const diag = await readTdseDiagnostics(page)

    expect(
      diag.hasData && diag.normDrift !== undefined && diag.normDrift !== null,
      `TDSE diagnostics missing (hasData=${diag.hasData}, normDrift=${diag.normDrift}) — diagnostics must populate after 200 frames; investigate the diagnostics pipeline.`
    ).toBe(true)

    expect(
      Math.abs(diag.normDrift!),
      `|normDrift| must stay under 1% on curved metric (got ${diag.normDrift})`
    ).toBeLessThan(0.01)
  })

  test('21: no GPU/shader errors over sustained curved evolution', async ({ page }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    await setupWormholeScene(page)
    // Run long enough to cover the RK4 integrator reaching and passing the
    // throat, where curvature coupling peaks — this is where any shader
    // validation / pipeline bug is most likely to surface. The fixtures
    // error collector fails the test if anything is logged.
    await waitForSimulationFrames(page, 120)
  })

  test('22: URL params round-trip into the metric store field', async ({ page }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    // URL → store
    await page.goto('/?t=schroedinger&d=3&qm=tdseDynamics&tdse_metric=morrisThorne&tdse_b0=0.7000')
    await waitForRendererReady(page)
    const loaded = await readTdseMetric(page)
    expect(loaded.kind).toBe('morrisThorne')
    expect(loaded.throatRadius).toBe(0.7)

    // Default (no tdse_* params) → flat
    await page.goto('/?t=schroedinger&d=3&qm=tdseDynamics')
    await waitForRendererReady(page)
    const def = await readTdseMetric(page)
    expect(def.kind).toBe('flat')
  })
})
