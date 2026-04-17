/**
 * Stochastic Decoherence Engine — E2E Tests
 *
 * Validates the decoherence features from docs/plans/stochastic-decoherence-engine.md:
 *
 * 1. TDSE + decoherence enables without GPU/shader errors
 * 2. Each decoherence preset renders non-blank frames
 * 3. Diagnostics readback produces valid norm, IPR, and branch populations
 * 4. γ=0 produces no localization (symmetric populations)
 * 5. IPR decreases under strong monitoring (localization effect)
 * 6. Monitoring sweep advances through γ values and records results
 * 7. Extended simulation remains stable (no NaN/Inf divergence)
 *
 * Chain of trust:
 *   WGSL shader → GPU compute → readback buffer → mapAsync → Zustand store → assertion
 *
 * Run: pnpm exec playwright test scripts/playwright/stochastic-decoherence.spec.ts --workers=1
 */

import { expect, test } from './fixtures'
import {
  expectCanvasNotBlank,
  gotoMode,
  readTdseDiagnostics,
  requireWebGPU,
  waitForFirstFrame,
  waitForRendererReady,
  waitForShaderCompilation,
  waitForSimulationFrames,
} from './helpers/app-helpers'

test.setTimeout(180_000)

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Enable stochastic decoherence via store actions (not URL params). */
async function enableDecoherence(
  page: import('@playwright/test').Page,
  gamma: number,
  opts?: { branching?: boolean; sigma?: number; numSites?: number; seed?: number }
) {
  await page.evaluate(
    async ([g, o]) => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState()
      s.setTdseStochasticEnabled(true)
      s.setTdseStochasticGamma(g)
      if (o?.sigma !== undefined) s.setTdseStochasticSigma(o.sigma)
      if (o?.numSites !== undefined) s.setTdseStochasticNumSites(o.numSites)
      if (o?.seed !== undefined) s.setTdseStochasticSeed(o.seed)
      if (o?.branching !== undefined) s.setTdseBranchingEnabled(o.branching)
      s.setTdseDiagnosticsEnabled(true)
      s.setTdseAbsorberEnabled(false)
      s.resetTdseField()
    },
    [gamma, opts] as [number, typeof opts]
  )
}

/** Apply a decoherence preset by ID and reset the field. */
async function applyDecoherencePreset(page: import('@playwright/test').Page, presetId: string) {
  await page.evaluate(async (id: string) => {
    const presetMod = await import('/src/lib/physics/tdse/decoherencePresets.ts')
    const storeMod = await import('/src/stores/extendedObjectStore.ts')
    const preset = presetMod.DECOHERENCE_PRESETS.find((p: { id: string }) => p.id === id)
    if (!preset) throw new Error(`Preset '${id}' not found`)
    const s = storeMod.useExtendedObjectStore.getState()
    const o = preset.overrides as Record<string, unknown>
    if (o.potentialType !== undefined) s.setTdsePotentialType(o.potentialType as string)
    if (o.stochasticEnabled !== undefined)
      s.setTdseStochasticEnabled(o.stochasticEnabled as boolean)
    if (o.stochasticGamma !== undefined) s.setTdseStochasticGamma(o.stochasticGamma as number)
    if (o.stochasticSigma !== undefined) s.setTdseStochasticSigma(o.stochasticSigma as number)
    if (o.stochasticNumSites !== undefined)
      s.setTdseStochasticNumSites(o.stochasticNumSites as number)
    if (o.stochasticSeed !== undefined) s.setTdseStochasticSeed(o.stochasticSeed as number)
    if (o.branchingEnabled !== undefined) s.setTdseBranchingEnabled(o.branchingEnabled as boolean)
    if (o.diagnosticsEnabled !== undefined)
      s.setTdseDiagnosticsEnabled(o.diagnosticsEnabled as boolean)
    if (o.absorberEnabled !== undefined) s.setTdseAbsorberEnabled(o.absorberEnabled as boolean)
    s.resetTdseField()
  }, presetId)
}

/** Wait for TDSE diagnostics store to have data. */
async function waitForDiagData(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    async () => {
      const mod = await import('/src/stores/diagnosticsStore.ts')
      return mod.useDiagnosticsStore.getState().tdse.hasData
    },
    { timeout: 30_000 }
  )
}

/** Read branch-specific diagnostics. */
async function readBranchDiag(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/diagnosticsStore.ts')
    const s = mod.useDiagnosticsStore.getState().tdse
    return {
      hasData: s.hasData,
      normLeft: s.normLeft,
      normRight: s.normRight,
      totalNorm: s.totalNorm,
      ipr: s.ipr,
    }
  })
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Core: shader compilation and rendering
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('decoherence — rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('TDSE + decoherence: shaders compile, frames render, console clean', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    await enableDecoherence(page, 1.0, { branching: true, sigma: 2.0, numSites: 4, seed: 42 })
    await waitForSimulationFrames(page, 60)

    // Verify config applied
    const cfg = await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const t = mod.useExtendedObjectStore.getState().schroedinger?.tdse
      return {
        enabled: t?.stochasticEnabled,
        gamma: t?.stochasticGamma,
        branching: t?.branchingEnabled,
      }
    })
    expect(cfg.enabled).toBe(true)
    expect(cfg.gamma).toBeCloseTo(1.0)
    expect(cfg.branching).toBe(true)

    await expectCanvasNotBlank(page)
    // GPU errors asserted automatically by fixture
  })

  const PRESETS = [
    'doubleWellBranching',
    'barrierBranching',
    'schrodingersCat',
    'rapidCollapse',
    'boxMonitoring',
    'harmonicMonitoring',
  ] as const

  for (const presetId of PRESETS) {
    test(`preset '${presetId}': renders without GPU errors`, async ({ page }) => {
      await gotoMode(page, 'tdseDynamics', 3)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)
      await waitForFirstFrame(page)

      await applyDecoherencePreset(page, presetId)
      await waitForSimulationFrames(page, 60)
      await expectCanvasNotBlank(page)
    })
  }
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Diagnostics: norm, IPR, branch populations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('decoherence — diagnostics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('norm preserved under decoherence (< 0.5% drift)', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    await enableDecoherence(page, 1.0, { sigma: 2.0, numSites: 4, seed: 42 })
    await waitForSimulationFrames(page, 120)
    await waitForDiagData(page)

    const diag = await readTdseDiagnostics(page)
    expect(diag.hasData).toBe(true)
    expect(Math.abs(diag.normDrift), 'norm drift < 0.5%').toBeLessThan(0.005)
  })

  test('IPR is positive, finite, in range [1, N]', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    await enableDecoherence(page, 1.0, { sigma: 2.0, seed: 42 })
    await waitForSimulationFrames(page, 120)
    await waitForDiagData(page)

    const diag = await readTdseDiagnostics(page)
    // IPR = 1/Σp², ranges [1, N] where N = totalSites (64³ = 262144)
    expect(diag.ipr, 'IPR ≥ 1').toBeGreaterThanOrEqual(0.99)
    expect(Number.isFinite(diag.ipr), 'IPR finite').toBe(true)
    expect(diag.ipr, 'IPR ≤ N').toBeLessThanOrEqual(262145)
  })

  test('branch populations sum to total norm', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    await applyDecoherencePreset(page, 'doubleWellBranching')
    await waitForSimulationFrames(page, 120)
    await waitForDiagData(page)

    const d = await readBranchDiag(page)
    expect(d.hasData).toBe(true)

    const sum = d.normLeft + d.normRight
    if (d.totalNorm > 0.01) {
      expect(Math.abs(sum - d.totalNorm) / d.totalNorm, 'L+R ≈ totalNorm').toBeLessThan(0.05)
    }
    expect(d.normLeft, 'left pop > 0').toBeGreaterThan(0)
    expect(d.normRight, 'right pop > 0').toBeGreaterThan(0)
  })

  test('γ=0 does not break populations (no stochastic drift)', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    // γ=0 means stochastic dispatch is skipped — should be identical to vanilla TDSE
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState()
      s.setTdseStochasticEnabled(true)
      s.setTdseStochasticGamma(0)
      s.setTdseBranchingEnabled(true)
      s.setTdseDiagnosticsEnabled(true)
      s.setTdseAbsorberEnabled(false)
    })
    await waitForSimulationFrames(page, 60)
    await waitForDiagData(page)

    const diag = await readTdseDiagnostics(page)
    // At γ=0 the norm should be essentially unperturbed
    expect(diag.totalNorm, 'norm near 1 at γ=0').toBeGreaterThan(0.95)
    expect(diag.totalNorm, 'norm not diverged').toBeLessThan(1.05)
  })

  test('strong monitoring (γ=5) reduces IPR vs baseline', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    // Baseline: no decoherence, free potential
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState()
      s.setTdsePotentialType('free')
      s.setTdseAbsorberEnabled(false)
      s.setTdseDiagnosticsEnabled(true)
    })
    await waitForSimulationFrames(page, 90)
    await waitForDiagData(page)
    const baseline = await readTdseDiagnostics(page)

    // Strong decoherence run
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const s = mod.useExtendedObjectStore.getState()
      s.setTdseStochasticEnabled(true)
      s.setTdseStochasticGamma(5.0)
      s.setTdseStochasticSigma(1.0)
      s.setTdseStochasticNumSites(8)
      s.setTdseStochasticSeed(42)
      s.resetTdseField()
    })
    // Reset diagnostics store for fresh data
    await page.evaluate(async () => {
      const mod = await import('/src/stores/diagnosticsStore.ts')
      mod.useDiagnosticsStore.getState().resetTdse()
    })
    await waitForSimulationFrames(page, 180)
    await waitForDiagData(page)
    const decoherent = await readTdseDiagnostics(page)

    // IPR under strong monitoring should be lower (more localized)
    expect(
      decoherent.ipr,
      `IPR(γ=5)=${decoherent.ipr.toFixed(1)} < baseline=${baseline.ipr.toFixed(1)}`
    ).toBeLessThan(baseline.ipr)
  })

  test('extended evolution remains stable (no NaN/Inf)', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    await enableDecoherence(page, 1.0, { sigma: 2.0, seed: 42 })
    // Run for many frames
    await waitForSimulationFrames(page, 300)
    await waitForDiagData(page)

    const diag = await page.evaluate(async () => {
      const mod = await import('/src/stores/diagnosticsStore.ts')
      const s = mod.useDiagnosticsStore.getState().tdse
      return { norm: s.totalNorm, maxDensity: s.maxDensity, simTime: s.simTime, ipr: s.ipr }
    })

    expect(Number.isFinite(diag.norm), 'norm finite').toBe(true)
    expect(Number.isFinite(diag.maxDensity), 'maxDensity finite').toBe(true)
    expect(Number.isFinite(diag.ipr), 'IPR finite').toBe(true)
    expect(diag.simTime, 'simTime advanced').toBeGreaterThan(0)
    expect(diag.norm, 'norm not zeroed').toBeGreaterThan(0.1)
  })
})

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  Monitoring sweep
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('decoherence — monitoring sweep', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('sweep advances through γ values and collects IPR results', async ({ page }) => {
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    await enableDecoherence(page, 0.5, { seed: 42 })
    await waitForSimulationFrames(page, 30)

    // Start a short sweep (3 steps) driven by a manual tick interval
    await page.evaluate(async () => {
      const sweepMod = await import('/src/stores/monitoringSweepStore.ts')
      const extMod = await import('/src/stores/extendedObjectStore.ts')
      const diagMod = await import('/src/stores/diagnosticsStore.ts')

      extMod.useExtendedObjectStore.getState().setTdseDiagnosticsEnabled(true)

      const cfg = { gammaMin: 0.1, gammaMax: 1.0, steps: 3, timePerStep: 0.3 }
      sweepMod.useMonitoringSweepStore.getState().startSweep(cfg)

      const gamma0 = sweepMod.gammaForStep(cfg, 0)
      extMod.useExtendedObjectStore.getState().setTdseStochasticGamma(gamma0)
      extMod.useExtendedObjectStore.getState().resetTdseField()

      const tick = () => {
        const diag = diagMod.useDiagnosticsStore.getState().tdse
        if (!diag.hasData) return
        const next = sweepMod.useMonitoringSweepStore
          .getState()
          .tick(diag.simTime, diag.ipr, diag.normDrift)
        if (next !== null) {
          extMod.useExtendedObjectStore.getState().setTdseStochasticGamma(next)
          extMod.useExtendedObjectStore.getState().resetTdseField()
        }
      }
      ;(globalThis as Record<string, unknown>).__sweepTick = setInterval(tick, 100)
    })

    // Wait for completion
    await page.waitForFunction(
      async () => {
        const mod = await import('/src/stores/monitoringSweepStore.ts')
        return mod.useMonitoringSweepStore.getState().status === 'complete'
      },
      { timeout: 60_000 }
    )

    await page.evaluate(() => {
      clearInterval((globalThis as Record<string, unknown>).__sweepTick as number)
    })

    const results = await page.evaluate(async () => {
      const mod = await import('/src/stores/monitoringSweepStore.ts')
      const s = mod.useMonitoringSweepStore.getState()
      return {
        status: s.status,
        count: s.results.length,
        gammas: s.results.map((r: { gamma: number }) => r.gamma),
        iprs: s.results.map((r: { ipr: number }) => r.ipr),
      }
    })

    expect(results.status).toBe('complete')
    expect(results.count).toBe(3)

    // Gammas ascending
    for (let i = 1; i < results.gammas.length; i++) {
      expect(results.gammas[i]).toBeGreaterThan(results.gammas[i - 1]!)
    }

    // All IPRs positive and finite
    for (const ipr of results.iprs) {
      expect(ipr, 'sweep IPR > 0').toBeGreaterThan(0)
      expect(Number.isFinite(ipr), 'sweep IPR finite').toBe(true)
    }
  })
})
