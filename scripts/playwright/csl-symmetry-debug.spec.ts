/**
 * CSL Symmetry-Breaking Diagnostic Test
 *
 * Investigates whether CSL (Continuous Spontaneous Localization) actually
 * breaks the left/right symmetry in the Schrödinger's Cat preset.
 *
 * Reports: normLeft/normRight ratio over time, CSL debug console output.
 *
 * This is a diagnostic/investigative test, not a pass/fail regression test.
 */

import { expect, test } from './fixtures'
import {
  gotoMode,
  waitForFirstFrame,
  waitForRendererSettled,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.setTimeout(120_000)

/** Read TDSE diagnostics from the store. */
async function readDiagnostics(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/diagnosticsStore.ts')
    const s = mod.useDiagnosticsStore.getState().tdse
    return {
      totalNorm: s.totalNorm,
      normLeft: s.normLeft,
      normRight: s.normRight,
      maxDensity: s.maxDensity,
      ipr: s.ipr,
    }
  })
}

/** Read TDSE stochastic config from the store. */
async function readTdseConfig(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const ext = await import('/src/stores/extendedObjectStore.ts')
    const tdse = ext.useExtendedObjectStore.getState().schroedinger.tdse
    return {
      potentialType: tdse.potentialType,
      stochasticEnabled: tdse.stochasticEnabled,
      stochasticGamma: tdse.stochasticGamma,
      stochasticSigma: tdse.stochasticSigma,
      stochasticNumSites: tdse.stochasticNumSites,
      packetCenter: Array.from(tdse.packetCenter),
      packetMomentum: Array.from(tdse.packetMomentum),
      doubleWellLambda: tdse.doubleWellLambda,
      doubleWellSeparation: tdse.doubleWellSeparation,
      doubleWellAsymmetry: tdse.doubleWellAsymmetry,
      branchingEnabled: tdse.branchingEnabled,
    }
  })
}

/** Select a scenario from the dropdown by value. */
async function selectScenario(page: import('@playwright/test').Page, scenarioId: string) {
  const selector = page.getByTestId('scenario-selector')
  await selector.selectOption(scenarioId)
  // Wait for re-init (field reset triggers shader recompilation)
  await page.waitForTimeout(3000)
  await waitForShaderCompilation(page)
}

interface Sample {
  time: number
  normLeft: number
  normRight: number
  ratio: number
  totalNorm: number
}

/** Run CSL and collect normLeft/normRight samples over time. */
async function collectSamples(
  page: import('@playwright/test').Page,
  count: number,
  intervalMs: number
): Promise<Sample[]> {
  const samples: Sample[] = []
  for (let i = 0; i < count; i++) {
    await page.waitForTimeout(intervalMs)
    const diag = await readDiagnostics(page)
    const ratio =
      diag.normRight > 1e-10 ? diag.normLeft / diag.normRight : diag.normLeft > 0 ? Infinity : 1
    samples.push({
      time: (i + 1) * (intervalMs / 1000),
      normLeft: diag.normLeft,
      normRight: diag.normRight,
      ratio,
      totalNorm: diag.totalNorm,
    })
  }
  return samples
}

/** Print a table of samples. */
function printTable(label: string, samples: Sample[]) {
  console.log(`\n═══ ${label} ═══\n`)
  console.log('Time(s) | normLeft    | normRight   | L/R ratio  | totalNorm')
  console.log('--------+-------------+-------------+------------+-----------')
  for (const s of samples) {
    console.log(
      `  ${String(s.time).padStart(4)}s  | ` +
        `${s.normLeft.toFixed(4).padStart(11)} | ` +
        `${s.normRight.toFixed(4).padStart(11)} | ` +
        `${s.ratio.toFixed(4).padStart(10)} | ` +
        `${s.totalNorm.toFixed(4).padStart(10)}`
    )
  }
  const ratios = samples.map((s) => s.ratio).filter(isFinite)
  if (ratios.length > 0) {
    const maxDev = Math.max(...ratios.map((r) => Math.abs(r - 1.0)))
    console.log(`\nMax deviation from 1.0: ${maxDev.toFixed(4)}`)
    if (maxDev < 0.05) console.log('[WARN] NO symmetry breaking detected')
    else if (maxDev < 0.2) console.log('[INFO] Weak symmetry breaking')
    else console.log('[OK] Significant symmetry breaking')
  }
}

test.describe('CSL Symmetry-Breaking Investigation', () => {
  /**
   * Select Schrödinger's Cat preset via UI dropdown, verify config,
   * then measure normLeft/normRight over time.
   */
  test('Schrödinger Cat preset via dropdown: σ=1.0 γ=2.0', async ({ page }) => {
    const consoleLogs: string[] = []
    page.on('console', (msg) => {
      if (msg.text().includes('[CSL-DEBUG')) consoleLogs.push(msg.text())
    })

    // Navigate to TDSE mode
    await gotoMode(page, 'tdseDynamics', 3)
    const state = await waitForRendererSettled(page)
    expect(
      state,
      'renderer entered error state — investigate WebGPU init / shader compilation rather than silently skipping'
    ).not.toBe('error')
    await waitForFirstFrame(page)

    // Select the Schrödinger's Cat preset from the dropdown
    await selectScenario(page, 'schrodingersCat')

    // Verify store config
    const config = await readTdseConfig(page)
    console.log('\n── Store Config After Preset Selection ──')
    console.log(JSON.stringify(config, null, 2))

    // Confirm the preset was applied correctly
    expect(config.potentialType).toBe('doubleWell')
    expect(config.stochasticEnabled).toBe(true)
    expect(config.stochasticGamma).toBeCloseTo(2.0)
    expect(config.stochasticSigma).toBeCloseTo(1.0)
    expect(config.packetCenter[0]).toBeCloseTo(0) // symmetric start
    expect(config.doubleWellAsymmetry).toBeCloseTo(0) // symmetric well

    // Collect samples
    const samples = await collectSamples(page, 10, 2000)
    printTable('Schrödinger Cat (σ=1.0, γ=2.0)', samples)

    console.log(`\n── CSL Debug Logs (${consoleLogs.length} total) ──`)
    for (const log of consoleLogs.slice(0, 15)) console.log(`  ${log}`)
    if (consoleLogs.length === 0)
      console.log('  [WARN] NONE captured -- stochastic dispatch may not be running')

    // Analysis
    const validSamples = samples.filter((s) => s.totalNorm > 1e-6)
    const ratios = validSamples.map((s) => s.ratio).filter(isFinite)
    if (ratios.length > 0) {
      const maxDev = Math.max(...ratios.map((r) => Math.abs(r - 1.0)))
      console.log(`\n── Verdict ──`)
      console.log(`Max L/R asymmetry: ${maxDev.toFixed(4)}`)
      if (maxDev < 0.05) {
        console.log('BUG CONFIRMED: CSL with σ=1.0 does not break symmetry')
      }
    }

    // Diagnostic: verify wavefunction survived (norm > 0)
    expect(validSamples.length).toBeGreaterThan(0)
  })

  /**
   * User's exact scenario: max γ=10, min σ, both blobs should NOT disappear.
   * One should dominate while the other fades.
   */
  test('rapid collapse preset: one blob must survive', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    const state = await waitForRendererSettled(page)
    expect(
      state,
      'renderer entered error state — investigate WebGPU init / shader compilation rather than silently skipping'
    ).not.toBe('error')
    await waitForFirstFrame(page)

    // rapidCollapse has γ=5, σ=1, 32 centers — strongest branching preset
    await selectScenario(page, 'rapidCollapse')

    const config = await readTdseConfig(page)
    console.log('\n── Rapid Collapse Config ──')
    console.log(JSON.stringify(config, null, 2))

    const samples = await collectSamples(page, 8, 2000)
    printTable('Rapid Collapse (γ=5, σ=1)', samples)

    // Check that density stays concentrated
    const lastMaxDensity = await page.evaluate(async () => {
      const mod = await import('/src/stores/diagnosticsStore.ts')
      return mod.useDiagnosticsStore.getState().tdse.maxDensity
    })
    console.log(`\nMax density at end: ${lastMaxDensity.toFixed(6)}`)

    expect(lastMaxDensity).toBeGreaterThan(0)
  })
})
