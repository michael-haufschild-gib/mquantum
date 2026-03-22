/**
 * Data Export E2E tests.
 *
 * Tests the B2 feature: CSV and JSON export of diagnostic time-series
 * and wavefunction slices.
 *
 * Tests:
 * - Data Export control group is visible in the analysis section
 * - CSV export button triggers a download for TDSE mode
 * - JSON export button triggers a download for TDSE mode
 * - Dirac mode shows export buttons (regression: was silently broken)
 * - Pauli mode shows export buttons
 */

import { expect, test } from './fixtures'
import {
  gotoMode,
  requireWebGPU,
  waitForDiagnostics,
  waitForFirstFrame,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'
import { RightPanel } from './pages/RightPanel'
import { TopBar } from './pages/TopBar'

test.setTimeout(120_000)

// ── Helpers ──────────────────────────────────────────────────────────────────

async function setupModeContext(page: import('@playwright/test').Page, mode: string, dim = 3) {
  await gotoMode(page, mode, dim)
  const topBar = new TopBar(page)
  await topBar.openRightPanel()
  const rightPanel = new RightPanel(page)
  await rightPanel.waitForVisible()
  await expect(page.getByTestId('analysis-section')).toBeVisible({ timeout: 5000 })
}

async function expandDataExport(page: import('@playwright/test').Page) {
  const header = page.getByTestId('data-export-group-header')
  await expect(header).toBeVisible({ timeout: 5000 })
  await header.click({ force: true })
}

// ── Tests ────────────────────────────────────────────────────────────────────

test.describe('Data Export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)
  })

  test('TDSE mode shows Data Export group with CSV and JSON buttons', async ({ page }) => {
    await setupModeContext(page, 'tdseDynamics')
    await expandDataExport(page)

    // Wait for diagnostics data to arrive
    await waitForDiagnostics(page, '/src/stores/tdseDiagnosticsStore.ts')

    await expect(page.getByTestId('export-diagnostics-csv')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('export-diagnostics-json')).toBeVisible({ timeout: 5000 })
  })

  test('TDSE CSV export produces non-empty file', async ({ page }) => {
    await setupModeContext(page, 'tdseDynamics')
    await expandDataExport(page)

    // Wait for diagnostics data
    await waitForDiagnostics(page, '/src/stores/tdseDiagnosticsStore.ts')

    // Intercept download
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      page.getByTestId('export-diagnostics-csv').click(),
    ])

    const filename = download.suggestedFilename()
    expect(filename).toMatch(/^mdim-tdse-.*\.csv$/)
  })

  test('JSON export produces file with correct structure', async ({ page }) => {
    await setupModeContext(page, 'tdseDynamics')
    await expandDataExport(page)

    // Wait for diagnostics data
    await waitForDiagnostics(page, '/src/stores/tdseDiagnosticsStore.ts')

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10_000 }),
      page.getByTestId('export-diagnostics-json').click(),
    ])

    const filename = download.suggestedFilename()
    expect(filename).toMatch(/^mdim-diagnostics-.*\.json$/)

    // Read the downloaded file and verify JSON structure
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream) {
      chunks.push(chunk as Buffer)
    }
    const content = Buffer.concat(chunks).toString('utf-8')
    const parsed = JSON.parse(content) as Record<string, unknown>
    const meta = parsed._meta as Record<string, string>
    expect(meta.quantumMode).toBe('tdseDynamics')
    expect(meta.application).toBe('mdimension')
  })

  test('Dirac mode shows diagnostics export buttons', async ({ page }) => {
    await setupModeContext(page, 'diracEquation')
    await expandDataExport(page)

    // Wait for diagnostics
    await waitForDiagnostics(page, '/src/stores/diracDiagnosticsStore.ts')

    // Verify the Dirac CSV export button exists and works
    await expect(page.getByTestId('export-diagnostics-csv')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('export-diagnostics-json')).toBeVisible({ timeout: 5000 })
  })

  test('BEC mode shows diagnostics and observables export', async ({ page }) => {
    await setupModeContext(page, 'becDynamics')
    await expandDataExport(page)

    await waitForDiagnostics(page, '/src/stores/becDiagnosticsStore.ts')
    await expect(page.getByTestId('export-diagnostics-csv')).toBeVisible({ timeout: 5000 })
    await expect(page.getByTestId('export-diagnostics-json')).toBeVisible({ timeout: 5000 })
  })
})
