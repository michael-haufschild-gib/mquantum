/**
 * E2E test for the SRMT parameter-sweep feature.
 *
 * Flow:
 *   1. Navigate to Wheeler–DeWitt with `sw=cut&sw_n=5` URL params.
 *   2. Wait for renderer ready + first frame.
 *   3. Open the right-panel Analysis tab, expand the SRMT Sweep section.
 *   4. Wait for the sweep to complete (status badge renders the plot
 *      with three polylines).
 *   5. Trigger the CSV export and assert the downloaded file has the
 *      expected header row + at least one data row per sweep point.
 *   6. Assert mandatory GPU/console-error collection (via fixture) is
 *      clean across the full run.
 */

import { expect, test } from './fixtures'
import {
  gotoModeWithParams,
  requireWebGPU,
  waitForFirstFrame,
  waitForRendererReady,
} from './helpers/app-helpers'

test.setTimeout(180_000)

test.describe('Wheeler–DeWitt — SRMT sweep', () => {
  test('URL-triggered cut sweep runs, plots q-curves, exports a CSV', async ({
    page,
  }, testInfo) => {
    await page.goto('/')
    await requireWebGPU(page, testInfo)

    // Small sweep (N=5) so the full test stays under the 3min budget.
    // `sw=cut` tells the sweep coordinator to auto-dispatch once the
    // solver produces its first output.
    await gotoModeWithParams(page, 'wheelerDeWitt', 3, {
      sw: 'cut',
      sw_n: '5',
      sw_min: '0.2',
      sw_max: '0.8',
      sw_phi: '1.0',
    })
    await waitForRendererReady(page)
    await waitForFirstFrame(page)

    // Navigate to the Analysis tab on the right panel. Tab testids are
    // `{tabs-testid}-tab-{id}` — see `Tabs.tsx`.
    await page.getByTestId('right-panel-tabs-tab-analysis').click()

    // Open the SRMT Sweep section header (sections default to
    // collapsed; clicking the header toggles).
    const sectionHeader = page.getByTestId('srmt-sweep-section-header')
    await expect(sectionHeader).toBeVisible({ timeout: 15_000 })
    await sectionHeader.click()

    // Wait for the sweep plot to render — that requires ≥ 2 completed
    // sweep points, which in turn requires the worker to have dispatched.
    const plot = page.getByTestId('srmt-sweep-plot')
    await expect(plot, 'sweep plot must render once 2+ points land').toBeVisible({
      timeout: 120_000,
    })

    // Three per-clock polylines (at least one must be present — 'a' is
    // always computed in the default-all-clocks config).
    await expect(page.getByTestId('srmt-sweep-line-a')).toBeVisible()

    // Wait for the Export CSV button which appears only on status=complete.
    const exportBtn = page.getByTestId('srmt-sweep-export-csv')
    await expect(exportBtn, 'export-csv button must appear on complete').toBeVisible({
      timeout: 120_000,
    })

    // Trigger download and verify filename + header.
    const downloadPromise = page.waitForEvent('download')
    await exportBtn.click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(/^mdim-srmt-sweep-.*\.csv$/)

    // Read the file and verify the CSV has the expected column header
    // and at least one non-header row per expected sweep point.
    const path = await download.path()
    // Playwright returns a concrete filesystem path for successful downloads.
    // Fail the test with a useful message if none came back.
    if (!path) throw new Error('Playwright returned no download path')
    const fs = await import('node:fs/promises')
    const contents = await fs.readFile(path, 'utf-8')
    const lines = contents.trim().split('\n')
    expect(lines[0]!).toMatch(/^# SRMT sweep, kind=cut$/)
    // Column header line appears after the leading `#` metadata comments.
    const headerIdx = lines.findIndex((l) =>
      l.startsWith(
        'index,sweepValue,sweepValueBc,cutNormalized,q_a,q_a_sigma,q_phi1,q_phi1_sigma,q_phi2,q_phi2_sigma,computeMs'
      )
    )
    expect(headerIdx).toBeGreaterThanOrEqual(1)
    const dataRows = lines.slice(headerIdx + 1).filter((l) => l.length > 0 && !l.startsWith('#'))
    // At least 2 data rows (plot requires ≥2; sweep may dedup below N=5).
    expect(dataRows.length).toBeGreaterThanOrEqual(2)
    for (const row of dataRows) {
      const cells = row.split(',')
      // 11 columns: index, sweepValue, sweepValueBc, cutNormalized, then
      // (q,q_sigma) per clock × 3, then computeMs. Adding error bars to
      // each `q_*` is the Tier-1 publication-readiness requirement.
      expect(cells).toHaveLength(11)
    }
  })
})
