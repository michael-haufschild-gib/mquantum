/**
 * Page curve + island formula HUD e2e test.
 *
 * Verifies that with the BEC "Sonic Horizon (Waterfall)" preset and the
 * Page-curve HUD toggle on:
 *
 * 1. Samples actually flow into `pageCurveStore` (version > 0, count > 0).
 * 2. `S_therm` measured live from the running simulator is strictly positive
 *    — this is the exact bug the user reported ("HUD stays flat"). The
 *    primary blocker was a hardcoded `n0=1.0` in the panel that disagreed
 *    with the simulator's `computeWaterfallBackgroundDensity`; with that
 *    fixed and the default `hawkingVmax` bumped above c_s0, the rate must
 *    be > 0.
 * 3. The rendered `<path>` for the thermal trace has > 1 segment and
 *    spans a non-trivial y-range (flat baseline fails).
 * 4. Toggling the island overlay flips the panel's `data-island-overlay`
 *    attribute — the sliders producing visible effects.
 *
 * GPU/shader error collection happens automatically via fixtures.ts.
 */

import { expect, test } from './fixtures'
import {
  applyBecPreset,
  gotoMode,
  requireWebGPU,
  waitForModeReady,
  waitForShaderCompilation,
  waitForSimulationFrames,
} from './helpers/app-helpers'

test.setTimeout(180_000)

test.describe('Page curve HUD', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('renders non-flat S_therm trace on Sonic Horizon preset', async ({ page }) => {
    await gotoMode(page, 'becDynamics', 3)
    await waitForShaderCompilation(page)
    await waitForModeReady(page, 60)

    await applyBecPreset(page, 'blackHoleAnalog')
    await waitForModeReady(page, 60)

    // Turn on BEC diagnostics + the Page-curve HUD.
    await page.evaluate(async () => {
      const extMod = await import('/src/stores/extendedObjectStore.ts')
      const pcMod = await import('/src/stores/pageCurveStore.ts')
      const ext = extMod.useExtendedObjectStore.getState() as Record<
        string,
        (...args: unknown[]) => void
      >
      ext.setBecDiagnosticsEnabled?.(true)
      const pc = pcMod.usePageCurveStore.getState() as Record<string, (...args: unknown[]) => void>
      pc.clear()
      pc.setPageCurveHudEnabled(true)
    })

    // Let the simulator push diagnostic samples. We want ≥ 10 BEC readback
    // ticks so the Page curve has a real time series to plot. The BEC
    // diagnostic cadence is `diagnosticsInterval` frames (default 5); at 60 fps
    // that's ≈ 12 ticks per second.
    await waitForSimulationFrames(page, 240)
    await page.waitForFunction(
      async () => {
        const m = await import('/src/stores/diagnosticsStore.ts')
        const gen =
          (m.useDiagnosticsStore.getState() as { bec?: { readbackGeneration?: number } })?.bec
            ?.readbackGeneration ?? 0
        return gen >= 10
      },
      null,
      { timeout: 30_000 }
    )
    await waitForSimulationFrames(page, 360)

    // Assert producer path: store actually accumulating non-trivial samples.
    const snapshot = await page.evaluate(async () => {
      const mod = await import('/src/stores/pageCurveStore.ts')
      const s = mod.usePageCurveStore.getState()
      return {
        version: s.version,
        count: s.buffer.count,
        lastSTherm: s.lastSTherm,
        lastSBH: s.lastSBH,
        lastRate: s.lastRate,
      }
    })
    expect(snapshot.version).toBeGreaterThan(0)
    expect(snapshot.count).toBeGreaterThan(1)
    expect(snapshot.lastSTherm).toBeGreaterThan(1e-4)
    expect(snapshot.lastRate).toBeGreaterThan(0)
    expect(snapshot.lastSBH).toBeGreaterThan(0)

    // Assert rendered SVG is showing a non-flat curve.
    const traceStats = await page.evaluate(() => {
      const svg = document.querySelector('svg[data-island-overlay]')
      if (!svg) return null
      const paths = svg.querySelectorAll('path')
      let maxSpan = 0
      let segmentCount = 0
      paths.forEach((p) => {
        const d = p.getAttribute('d') ?? ''
        const ys = Array.from(d.matchAll(/[ML]\s*-?\d+(?:\.\d+)?\s+(-?\d+(?:\.\d+)?)/g)).map((m) =>
          Number(m[1])
        )
        if (ys.length > 1) {
          const span = Math.max(...ys) - Math.min(...ys)
          if (span > maxSpan) maxSpan = span
          if (ys.length > segmentCount) segmentCount = ys.length
        }
      })
      return { maxSpan, segmentCount }
    })
    if (!traceStats) throw new Error('page-curve SVG not rendered')
    // Baseline flat path (the broken state we're preventing regression of)
    // produces span ≈ 0 because all y-coords collapse to the axis floor.
    // A working curve spans several SVG px once S_therm has integrated a
    // few readback ticks — 2 px is enough to distinguish broken-flat from
    // rising; a real run over 10+ ticks spans ~40+ px.
    expect(traceStats.maxSpan).toBeGreaterThan(2)
    expect(traceStats.segmentCount).toBeGreaterThan(2)

    // Island overlay toggle: flips the data-island-overlay attribute.
    const before = await page.evaluate(() => {
      const svg = document.querySelector('svg[data-island-overlay]')
      return svg?.getAttribute('data-island-overlay')
    })
    expect(before).toBe('off')

    await page.evaluate(async () => {
      const mod = await import('/src/stores/pageCurveStore.ts')
      const pc = mod.usePageCurveStore.getState() as Record<string, (...args: unknown[]) => void>
      pc.setIslandOverlayEnabled(true)
    })
    // Wait one frame for React to flush the attribute change.
    await page.waitForFunction(
      () =>
        document.querySelector('svg[data-island-overlay]')?.getAttribute('data-island-overlay') ===
        'on',
      null,
      { timeout: 5000 }
    )

    // G_eff slider observable effect: S_BH = A_h / (4·G_eff), so setting
    // G_eff to 10× its current value must cut S_BH by 10× on the next push.
    const { gEffBefore, sBHBefore } = await page.evaluate(async () => {
      const mod = await import('/src/stores/pageCurveStore.ts')
      const s = mod.usePageCurveStore.getState()
      return { gEffBefore: s.gEff, sBHBefore: s.lastSBH }
    })
    await page.evaluate(async (newG: number) => {
      const mod = await import('/src/stores/pageCurveStore.ts')
      const pc = mod.usePageCurveStore.getState() as Record<string, (...args: unknown[]) => void>
      pc.setGEff(newG)
    }, gEffBefore * 10)
    // Wait for at least one BEC readback tick so the next sample bakes the
    // new G_eff into S_BH.
    await page.waitForFunction(
      async (prevSBH: number) => {
        const m = await import('/src/stores/pageCurveStore.ts')
        return m.usePageCurveStore.getState().lastSBH < 0.5 * prevSBH
      },
      sBHBefore,
      { timeout: 10_000 }
    )
    const sBHAfter = await page.evaluate(async () => {
      const mod = await import('/src/stores/pageCurveStore.ts')
      return mod.usePageCurveStore.getState().lastSBH
    })
    expect(sBHAfter).toBeGreaterThan(0)
    expect(sBHAfter).toBeLessThan(sBHBefore * 0.2)
  })
})
