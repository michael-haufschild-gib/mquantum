/**
 * Curved-space TDSE v2 e2e tests — Wave 7 (plan 5.4, tests 17-25).
 *
 * Covers the 7 curved-metric presets added in Wave 5, the overlay /
 * proper-volume render toggles added in Wave 6, and URL-state round-trips
 * for the tdse_co / tdse_co_op / tdse_dv params plus the existing metric
 * params (tdse_metric, tdse_sm, tdse_h, tdse_sr, tdse_ads, tdse_tp*,
 * tdse_dts, tdse_b0).
 *
 * GPU/shader error detection is automatic via fixtures.ts — the v2 plan's
 * "no GPU errors" requirement is satisfied for every test in this file by
 * the shared fixture.
 *
 * See: docs/plans/curved-space-tdse-v2.md section 5.4.
 */

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  applyTdsePreset,
  assertNonBlankPixels,
  capturePixelSnapshot,
  type CurvedMetricConfig,
  expectSnapshotsDiffer,
  getFrameCount,
  readTdseDiagnostics,
  readTdseV2State,
  requireWebGPU,
  setTdseDensityView,
  setTdseShowCurvatureOverlay,
  snapshotDistance,
  waitForDiagnostics,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
  waitForSimulationFrames,
} from './helpers/app-helpers'

test.setTimeout(600_000)

// ─── Preset inventory ────────────────────────────────────────────────────────

/** Wave 5 curved-metric preset IDs. Keep in sync with curvedMetricPresets.ts. */
const V2_PRESET_IDS = [
  'wormholeEntangledPair',
  'schwarzschildOrbit',
  'gravitationalRedshift',
  'cosmologicalRedshift',
  'sphereCompactification',
  'torusEigenstates',
  'adsBoundaryBounce',
] as const

/**
 * Metric config each preset configures — used to build URLs for the
 * per-preset round-trip test (test 10). Mirror of preset `overrides.metric`.
 */
const V2_PRESET_METRICS: Record<(typeof V2_PRESET_IDS)[number], CurvedMetricConfig> = {
  wormholeEntangledPair: {
    kind: 'doubleThroat',
    throatRadius: 0.4,
    doubleThroatSeparation: 4.0,
    doubleThroatRadius: 0.4,
  },
  schwarzschildOrbit: { kind: 'schwarzschild', schwarzschildMass: 0.8 },
  gravitationalRedshift: { kind: 'schwarzschild', schwarzschildMass: 1.0 },
  cosmologicalRedshift: { kind: 'deSitter', hubbleRate: 0.3 },
  sphereCompactification: { kind: 'sphere2D', sphereRadius: 2.0 },
  torusEigenstates: { kind: 'torus', torusPeriod: [Math.PI, Math.PI, Math.PI] },
  adsBoundaryBounce: { kind: 'antiDeSitter', adsRadius: 2.0 },
}

// ─── Local helpers ───────────────────────────────────────────────────────────

/**
 * Shared boot: navigate into TDSE mode, wait for the renderer and shader
 * compilation, apply the v2 preset, then wait for the preset's re-init
 * shader swap (preset flips `needsReset`) and a small frame settle.
 */
async function bootPreset(page: Page, presetId: string): Promise<void> {
  await page.goto('/?t=schroedinger&d=3&qm=tdseDynamics')
  await waitForRendererReady(page)
  await waitForShaderCompilation(page)
  await applyTdsePreset(page, presetId)
  // Presets may resize the lattice + recompile shaders — wait for the swap.
  await waitForShaderCompilation(page)
  const fc = await getFrameCount(page)
  await waitForFrameAdvance(page, fc + 4)
}

/**
 * Per-kind URL fragment builders. Each returns a list of `key=value` parts for
 * the metric-specific scalars; the caller prepends the shared identity params.
 * Mirrors the encoder in `src/lib/url/state-serializer.ts` (`emitMetricParams`).
 */
const METRIC_QUERY_BUILDERS: {
  [K in CurvedMetricConfig['kind']]: (cfg: Extract<CurvedMetricConfig, { kind: K }>) => string[]
} = {
  flat: () => [],
  morrisThorne: (cfg) => (cfg.throatRadius !== undefined ? [`tdse_b0=${cfg.throatRadius}`] : []),
  schwarzschild: (cfg) =>
    cfg.schwarzschildMass !== undefined ? [`tdse_sm=${cfg.schwarzschildMass}`] : [],
  deSitter: (cfg) => (cfg.hubbleRate !== undefined ? [`tdse_h=${cfg.hubbleRate}`] : []),
  antiDeSitter: (cfg) => (cfg.adsRadius !== undefined ? [`tdse_ads=${cfg.adsRadius}`] : []),
  sphere2D: (cfg) => (cfg.sphereRadius !== undefined ? [`tdse_sr=${cfg.sphereRadius}`] : []),
  torus: (cfg) =>
    cfg.torusPeriod
      ? [
          `tdse_tp0=${cfg.torusPeriod[0]}`,
          `tdse_tp1=${cfg.torusPeriod[1]}`,
          `tdse_tp2=${cfg.torusPeriod[2]}`,
        ]
      : [],
  doubleThroat: (cfg) => {
    const out: string[] = []
    if (cfg.doubleThroatSeparation !== undefined) out.push(`tdse_dts=${cfg.doubleThroatSeparation}`)
    if (cfg.doubleThroatRadius !== undefined) out.push(`tdse_dtb=${cfg.doubleThroatRadius}`)
    return out
  },
}

/**
 * Build a URL search string for a metric config. Mirrors the v2 param set
 * documented in `docs/plans/archived/curved-space-tdse-v2.md` and the encoder
 * in `src/lib/url/state-serializer.ts` (`emitMetricParams`).
 */
function buildMetricQuery(cfg: CurvedMetricConfig): string {
  const head = ['t=schroedinger', 'd=3', 'qm=tdseDynamics', `tdse_metric=${cfg.kind}`]
  const builder = METRIC_QUERY_BUILDERS[cfg.kind] as (c: CurvedMetricConfig) => string[]
  return [...head, ...builder(cfg)].join('&')
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('TDSE curved space v2 — presets and render toggles', () => {
  // Test 1: each v2 preset loads and renders. One Playwright test PER preset
  // so a single failing preset doesn't mask the others and the report lists
  // each case by name.
  for (const presetId of V2_PRESET_IDS) {
    test(`17.${presetId}: preset loads, advances frames, renders non-blank`, async ({
      page,
    }, testInfo) => {
      await page.goto('/')
      await requireWebGPU(page, testInfo)

      await bootPreset(page, presetId)

      const fc = await getFrameCount(page)
      await waitForFrameAdvance(page, fc + 60)

      await assertNonBlankPixels(page, `v2 preset ${presetId}`, 1)
    })
  }

  test('18: Ricci-overlay toggle visibly changes render on sphere preset', async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    // sphereCompactification enables the overlay by default (Wave 6 config).
    await bootPreset(page, 'sphereCompactification')
    await waitForSimulationFrames(page, 60)
    const snapOn = await capturePixelSnapshot(page)

    // Toggle overlay off — render-only flag, no re-init.
    await setTdseShowCurvatureOverlay(page, false)
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 10)
    const snapOff = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(
      snapOn,
      snapOff,
      'Ricci overlay toggle must change the rendered image on sphere2D',
      1.0
    )
  })

  test('19: proper-volume density view differs from coordinate view on curved metric', async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    // Apply the v1 Morris–Thorne preset — non-trivial √|g| throughout.
    await page.goto('/?t=schroedinger&d=3&qm=tdseDynamics')
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await applyTdsePreset(page, 'wormholeWavepacket')
    await waitForShaderCompilation(page)
    await setTdseDensityView(page, 'coordinate')
    await waitForSimulationFrames(page, 60)
    const snapCoord = await capturePixelSnapshot(page)

    await setTdseDensityView(page, 'proper')
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 10)
    const snapProper = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(
      snapCoord,
      snapProper,
      'Proper-volume density view must differ from coordinate view on MT metric',
      1.0
    )
  })

  test('20: URL round-trip for Schwarzschild preset params', async ({ page }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    await page.goto(
      '/?t=schroedinger&d=3&qm=tdseDynamics&tdse_metric=schwarzschild&tdse_sm=0.8&tdse_co=1&tdse_co_op=0.35&tdse_dv=proper'
    )
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    const s = await readTdseV2State(page)
    expect(s.metric.kind).toBe('schwarzschild')
    expect(s.metric.schwarzschildMass).toBeCloseTo(0.8, 4)
    expect(s.showCurvatureOverlay).toBe(true)
    expect(s.curvatureOverlayOpacity).toBeCloseTo(0.35, 3)
    expect(s.densityView).toBe('proper')
  })

  test('21: flat metric ignores v2 metric-specific params', async ({ page }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    await page.goto('/?t=schroedinger&d=3&qm=tdseDynamics&tdse_metric=flat&tdse_sm=0.8')
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    const s = await readTdseV2State(page)
    expect(s.metric.kind).toBe('flat')
    // schwarzschildMass must not leak into flat metric config — normalizer
    // strips mismatched fields per `setTdseMetric` in tdseUiSetters.ts.
    expect(s.metric.schwarzschildMass).toBeUndefined()
  })

  test('22: torus preset produces visible evolution across frame window', async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    await bootPreset(page, 'torusEigenstates')

    await waitForSimulationFrames(page, 60)
    const snapEarly = await capturePixelSnapshot(page)

    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 140)
    const snapLate = await capturePixelSnapshot(page)

    // Plane wave phase rotates — density may appear stationary only if the
    // color mapping is density-only. Use non-zero distance as evidence the
    // renderer is advancing, not frozen. (Strict differ would still pass
    // for phase-view presets.)
    expect(
      snapshotDistance(snapEarly, snapLate),
      'Torus preset must produce non-static frames between t=60 and t=200'
    ).toBeGreaterThan(0)
  })

  test('23: de Sitter wave packet spreads (max density decreases over time)', async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    await bootPreset(page, 'cosmologicalRedshift')

    // Frame A sample — packet near peak concentration.
    await waitForSimulationFrames(page, 60)
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', 30_000, 'tdse')
    const diagA = await readTdseDiagnostics(page)

    // Frame B sample — packet has stretched under a(t) = exp(H·t).
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 140)
    const diagB = await readTdseDiagnostics(page)

    expect(
      diagA.hasData,
      `deSitter diagnostics must surface for early-time sample (A.hasData=${diagA.hasData})`
    ).toBe(true)
    expect(
      diagB.hasData,
      `deSitter diagnostics must surface for late-time sample (B.hasData=${diagB.hasData})`
    ).toBe(true)
    expect(
      diagB.maxDensity,
      `Expanding-universe packet must spread: maxDensity(late=${diagB.maxDensity}) < maxDensity(early=${diagA.maxDensity})`
    ).toBeLessThan(diagA.maxDensity)
  })

  test('24: sphere preset stays stable — no blowup near polar clamp', async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    await bootPreset(page, 'sphereCompactification')
    await waitForSimulationFrames(page, 200)

    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', 30_000, 'tdse')
    const diag = await readTdseDiagnostics(page)
    expect(
      diag.hasData,
      'sphere2D diagnostics must be present after waitForDiagnostics — missing implies the diagnostic emitter regressed'
    ).toBe(true)
    expect(
      Number.isFinite(diag.maxDensity),
      `sphere preset maxDensity must stay finite (got ${diag.maxDensity})`
    ).toBe(true)
    // GPU-error collection is handled by fixtures.ts; nothing more needed here.
  })

  test('25: AdS packet produces a visibly different scene after long evolution', async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    await bootPreset(page, 'adsBoundaryBounce')

    // Centroid is not exposed via readTdseDiagnostics (no meanX field), so we
    // fall back to a snapshot-distance check across a long evolution window.
    // A packet bouncing off the conformal boundary guarantees the rendered
    // image at frame ≈300 differs from frame ≈100 by well above noise floor.
    await waitForSimulationFrames(page, 100)
    const snapMid = await capturePixelSnapshot(page)

    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 200)
    const snapLate = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(
      snapMid,
      snapLate,
      'AdS packet evolution must change the rendered image between frames ~100 and ~300',
      1.0
    )
  })

  // Test 10: per-preset URL round-trip — every v2 preset's metric config
  // must serialize into URL params that deserialize back into the store.
  for (const presetId of V2_PRESET_IDS) {
    test(`26.${presetId}: URL metric params round-trip into store`, async ({ page }, testInfo) => {
      await page.goto('/')
      await requireWebGPU(page, testInfo)

      const cfg = V2_PRESET_METRICS[presetId]
      const qs = buildMetricQuery(cfg)
      await page.goto(`/?${qs}`)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)

      const s = await readTdseV2State(page)
      expect(s.metric.kind).toBe(cfg.kind)

      // Verify scalar fields that ride along with this kind.
      if (cfg.schwarzschildMass !== undefined)
        expect(s.metric.schwarzschildMass as number).toBeCloseTo(cfg.schwarzschildMass, 4)
      if (cfg.hubbleRate !== undefined)
        expect(s.metric.hubbleRate as number).toBeCloseTo(cfg.hubbleRate, 4)
      if (cfg.adsRadius !== undefined)
        expect(s.metric.adsRadius as number).toBeCloseTo(cfg.adsRadius, 4)
      if (cfg.sphereRadius !== undefined)
        expect(s.metric.sphereRadius as number).toBeCloseTo(cfg.sphereRadius, 4)
      if (cfg.kind === 'doubleThroat') {
        if (cfg.doubleThroatRadius !== undefined)
          expect(s.metric.doubleThroatRadius as number).toBeCloseTo(cfg.doubleThroatRadius, 4)
      } else if (cfg.throatRadius !== undefined) {
        expect(s.metric.throatRadius as number).toBeCloseTo(cfg.throatRadius, 4)
      }
      if (cfg.doubleThroatSeparation !== undefined)
        expect(s.metric.doubleThroatSeparation as number).toBeCloseTo(cfg.doubleThroatSeparation, 4)
      if (cfg.torusPeriod !== undefined) {
        const tp = s.metric.torusPeriod as [number, number, number]
        expect(tp[0]).toBeCloseTo(cfg.torusPeriod[0], 4)
        expect(tp[1]).toBeCloseTo(cfg.torusPeriod[1], 4)
        expect(tp[2]).toBeCloseTo(cfg.torusPeriod[2], 4)
      }
    })
  }
})
