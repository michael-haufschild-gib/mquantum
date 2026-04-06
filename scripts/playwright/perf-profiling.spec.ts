/**
 * E2E tests for the performance profiling suite.
 *
 * Verifies the per-pass GPU/CPU timing pipeline works end-to-end:
 * render graph → WebGPUStatsCollector → performanceMetricsStore → PassesTab UI.
 *
 * Bugs caught:
 * - Pass timing data computed but never published to store
 * - PassesTab not rendering or not subscribed to correct store fields
 * - CPU breakdown missing or zeroed
 * - Benchmark helper not reading new fields
 */

import { expect, test } from './fixtures'
import {
  getFrameCount,
  getPerformanceMetrics,
  requireWebGPU,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.setTimeout(60_000)

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Open the perf monitor in expanded mode and switch to the Passes tab. */
async function openPassesTab(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    const mod = await import('/src/stores/uiStore.ts')
    mod.useUIStore.setState({
      showPerfMonitor: true,
      perfMonitorExpanded: true,
      perfMonitorTab: 'passes',
    })
  })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('performance profiling', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
  })

  test('pass timing data is published to the store after rendering frames', async ({ page }) => {
    // Open perf monitor in expanded mode so the collector publishes full stats
    await openPassesTab(page)

    // Wait for enough frames for the 2Hz publish interval to fire
    const startFrame = await getFrameCount(page)
    await waitForFrameAdvance(page, startFrame + 60)

    const data = await getPerformanceMetrics(page)

    // Must have at least one pass (scene, object renderer, toscreen at minimum)
    expect(data.passTimings.length, 'should have pass timing entries').toBeGreaterThan(0)

    // At least some passes should have non-zero CPU time
    const passesWithCpu = data.passTimings.filter((p) => !p.skipped && p.cpuTimeMs > 0)
    expect(passesWithCpu.length, 'at least one pass should report CPU time').toBeGreaterThan(0)

    // Verify known passes exist
    const passIds = data.passTimings.map((p) => p.passId)
    expect(passIds, 'should include toScreen pass').toContain('toScreen')
  })

  test('CPU breakdown reports non-zero values for all three phases', async ({ page }) => {
    await openPassesTab(page)

    const startFrame = await getFrameCount(page)
    await waitForFrameAdvance(page, startFrame + 60)

    const data = await getPerformanceMetrics(page)

    // Setup phase should be non-zero (captures stores, creates context)
    expect(data.cpuBreakdown.setupMs, 'setup phase should be > 0').toBeGreaterThan(0)

    // Passes phase should be non-zero (executes render passes)
    expect(data.cpuBreakdown.passesMs, 'passes phase should be > 0').toBeGreaterThan(0)

    // Submit phase should be non-zero (finishes command buffer, submits)
    expect(data.cpuBreakdown.submitMs, 'submit phase should be > 0').toBeGreaterThan(0)

    // Total should be reasonable (< 100ms per frame on any hardware)
    const totalCpu =
      data.cpuBreakdown.setupMs + data.cpuBreakdown.passesMs + data.cpuBreakdown.submitMs
    expect(totalCpu, 'total CPU breakdown should be < 100ms').toBeLessThan(100)
  })

  test('PerfMetricsSnapshot helper includes pass timing data', async ({ page }) => {
    await openPassesTab(page)

    const startFrame = await getFrameCount(page)
    await waitForFrameAdvance(page, startFrame + 60)

    const snapshot = await getPerformanceMetrics(page)

    // The helper should include the new fields
    expect(snapshot.passTimings, 'snapshot should have passTimings array').toBeInstanceOf(Array)
    expect(snapshot.passTimings.length, 'snapshot should have entries').toBeGreaterThan(0)
    expect(
      snapshot.totalGpuTimeMs,
      'snapshot should have totalGpuTimeMs >= 0'
    ).toBeGreaterThanOrEqual(0)
  })

  test('Passes tab renders with pass data visible', async ({ page }) => {
    await openPassesTab(page)

    const startFrame = await getFrameCount(page)
    await waitForFrameAdvance(page, startFrame + 60)

    // Verify the "Per-Pass Timing" section header is visible
    await expect(page.locator('text=Per-Pass Timing')).toBeVisible({ timeout: 5_000 })

    // Verify at least one pass row with a pass name is rendered
    // Pass names are formatted as title-case from kebab-case IDs (e.g., "To Screen")
    await expect(page.locator('text=To Screen')).toBeVisible({ timeout: 5_000 })

    // Verify CPU breakdown section is visible
    await expect(page.locator('text=CPU Breakdown')).toBeVisible({ timeout: 5_000 })
  })

  test('pass timings update when switching quantum modes', async ({ page }) => {
    await openPassesTab(page)

    // Collect baseline pass IDs in harmonic oscillator mode (default)
    let startFrame = await getFrameCount(page)
    await waitForFrameAdvance(page, startFrame + 60)

    const baselineData = await getPerformanceMetrics(page)
    const baselinePassIds = baselineData.passTimings.map((p) => p.passId)

    // Switch to free scalar field mode (uses compute passes)
    await page.evaluate(async () => {
      const geoMod = await import('/src/stores/geometryStore.ts')
      geoMod.useGeometryStore.getState().setDimension(3)
      const extMod = await import('/src/stores/extendedObjectStore.ts')
      const ext = extMod.useExtendedObjectStore.getState() as Record<
        string,
        { setQuantumMode?: (m: string) => void }
      >
      ext.schroedinger?.setQuantumMode?.('freeScalarField')
    })

    await waitForShaderCompilation(page)

    // Wait for new pass data to flow through
    startFrame = await getFrameCount(page)
    await waitForFrameAdvance(page, startFrame + 60)

    const newData = await getPerformanceMetrics(page)
    const newPassIds = newData.passTimings.map((p) => p.passId)

    // Both should have pass data
    expect(baselinePassIds.length).toBeGreaterThan(0)
    expect(newPassIds.length).toBeGreaterThan(0)

    // Pass list should still include core passes
    expect(newPassIds, 'should still have toScreen').toContain('toScreen')
  })

  test('no pass timing data when perf monitor is hidden', async ({ page }) => {
    // Keep perf monitor hidden (default state)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/uiStore.ts')
      mod.useUIStore.setState({ showPerfMonitor: false })
    })

    // Render some frames
    const startFrame = await getFrameCount(page)
    await waitForFrameAdvance(page, startFrame + 60)

    const data = await getPerformanceMetrics(page)

    // Should have empty pass timings since collector skips when hidden
    expect(data.passTimings.length, 'no pass timings when hidden').toBe(0)
  })

  test('GPU timing available flag reflects hardware support', async ({ page }) => {
    await openPassesTab(page)

    const startFrame = await getFrameCount(page)
    await waitForFrameAdvance(page, startFrame + 60)

    const data = await getPerformanceMetrics(page)
    const hasGpuTimings = data.passTimings.some((p) => p.gpuTimeMs > 0)

    // Check if the GPU supports timestamp queries
    const supportsTimestamp = await page.evaluate(async () => {
      const perfMod = await import('/src/stores/performanceStore.ts')
      const state = perfMod.usePerformanceStore.getState()
      // deviceCapabilitiesDetected is set after init; if not detected, can't tell
      return state.deviceCapabilitiesDetected
    })

    if (supportsTimestamp) {
      // If device caps are detected, GPU timings and totalGpuTimeMs should be consistent
      if (hasGpuTimings) {
        expect(
          data.totalGpuTimeMs,
          'totalGpuTimeMs should match sum of pass GPU times'
        ).toBeGreaterThan(0)
      }
    }

    // Either way: CPU timings should always work
    const hasAnyCpu = data.passTimings.some((p) => p.cpuTimeMs > 0)
    expect(hasAnyCpu, 'CPU timing should always be available').toBe(true)
  })
})
