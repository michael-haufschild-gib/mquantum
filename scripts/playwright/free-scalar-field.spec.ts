/**
 * Free Scalar Field comprehensive e2e test suite.
 *
 * Verifies ALL major FSF configurations produce no GPU/shader errors,
 * render visible content, evolve correctly, and handle feature toggles.
 *
 * Coverage matrix:
 * - Initial conditions: gaussianPacket, vacuumNoise, singleMode, kinkProfile
 * - Dimensions: 2D, 3D, 5D
 * - Field views: phi, pi, energyDensity, wallDensity
 * - Color algorithms: 3 random per variant (day-seeded rotation), kSpaceOccupation forced for vacuumNoise
 * - Isosurface mode (3D)
 * - Feature toggles: absorber, autoScale, self-interaction
 * - Animation: field evolves over time
 * - Physics: energy conservation, kink stability
 * - Dimension switching: 2D → 5D without crash
 *
 * GPU/shader error detection is automatic via fixtures.ts — every test
 * fails if any Dawn validation warning or console error is emitted.
 */

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  assertNonBlankPixels,
  getFrameCount,
  gotoMode,
  readFsfDiagnostics,
  requireWebGPU,
  waitForDiagnostics,
  waitForFrameAdvance,
  waitForModeReady,
  waitForRendererReady,
  waitForShaderCompilation,
  waitForSimulationFrames,
} from './helpers/app-helpers'

test.setTimeout(600_000)

// ─── FSF-valid color algorithms ──────────────────────────────────────────────
// kSpaceOccupation excluded — async GPU readback → FFT pipeline, tested separately.
// Educational algorithms (hamiltonianDecomposition, modeCharacter, energyFlux)
// excluded from vacuum pool — they require excited-state structure to produce
// visible output; vacuum fluctuations are below their sensitivity threshold.

const FSF_COLOR_ALGORITHMS = [
  'blackbody',
  'phaseDiverging',
  'diverging',
  'viridis',
  'inferno',
  'densityContours',
  'hamiltonianDecomposition',
  'modeCharacter',
  'energyFlux',
] as const

/** Subset for exact vacuum — excludes educational analysis algorithms. */
const FSF_VACUUM_COLOR_ALGORITHMS = [
  'blackbody',
  'phaseDiverging',
  'diverging',
  'viridis',
  'inferno',
  'densityContours',
] as const

type FsfColorAlgorithm = (typeof FSF_COLOR_ALGORITHMS)[number]

// ─── Deterministic seeded random ─────────────────────────────────────────────

/** Simple mulberry32 PRNG from a 32-bit seed. */
function mulberry32(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Hash a string into a 32-bit integer for seeding. */
function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return hash
}

/**
 * Pick `count` unique random items from `pool`, using the test label as seed.
 * Mixes in the current date (YYYY-MM-DD) so selections rotate across CI days
 * but are stable within a single day.
 */
function pickRandom<T>(pool: readonly T[], count: number, label: string): T[] {
  const daySeed = hashString(new Date().toISOString().slice(0, 10))
  const rng = mulberry32(hashString(label) ^ daySeed)
  const indices = pool.map((_, i) => i)
  const result: T[] = []
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const idx = Math.floor(rng() * indices.length)
    result.push(pool[indices[idx]!]!)
    indices.splice(idx, 1)
  }
  return result
}

/** Pick 3 FSF color algorithms from the appropriate pool. */
function pickColorAlgorithms(label: string, initCond: string): FsfColorAlgorithm[] {
  const pool = initCond === 'vacuumNoise' ? FSF_VACUUM_COLOR_ALGORITHMS : FSF_COLOR_ALGORITHMS
  return pickRandom(pool, 3, label)
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const assertPixels = assertNonBlankPixels
const waitForFsfReady = (page: Page, extraFrames = 120) => waitForModeReady(page, extraFrames)

/** Set FSF initial condition via store. Enables selfInteraction first if kinkProfile. */
async function setInitialCondition(page: Page, initCond: string): Promise<void> {
  await page.evaluate(async (cond) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    const store = mod.useExtendedObjectStore.getState()
    if (cond === 'kinkProfile') {
      store.setFreeScalarSelfInteractionEnabled(true)
    }
    store.setFreeScalarInitialCondition(
      cond as 'vacuumNoise' | 'singleMode' | 'gaussianPacket' | 'kinkProfile'
    )
  }, initCond)
}

/** Set color algorithm via appearance store. Retries on context-destroyed (shader rebuild). */
async function setColorAlgorithm(page: Page, algo: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.evaluate(async (a) => {
        const mod = await import('/src/stores/appearanceStore.ts')
        mod.useAppearanceStore.setState({ colorAlgorithm: a })
      }, algo)
      return
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('Execution context was destroyed') && attempt < 2) {
        // Pipeline rebuild triggered a navigation — wait and retry
        await page.waitForTimeout(2000)
        continue
      }
      throw e
    }
  }
}

/** Set field view via store. Enables selfInteraction first if wallDensity. */
async function setFieldView(page: Page, view: string): Promise<void> {
  await page.evaluate(async (v) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    const store = mod.useExtendedObjectStore.getState()
    if (v === 'wallDensity') {
      store.setFreeScalarSelfInteractionEnabled(true)
    }
    store.setFreeScalarFieldView(v as 'phi' | 'pi' | 'energyDensity' | 'wallDensity')
  }, view)
}

/** Enable isosurface mode via store. */
async function enableIsosurface(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerIsoEnabled(true)
  })
}

/** Enable FSF diagnostics readback. */
async function enableDiagnostics(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setFreeScalarDiagnosticsEnabled(true)
  })
}

// ─── A. Rendering Matrix ─────────────────────────────────────────────────────

const initialConditions = [
  { key: 'gaussianPacket', label: 'Gaussian Packet' },
  { key: 'vacuumNoise', label: 'Exact Vacuum' },
  { key: 'singleMode', label: 'Single Mode' },
  { key: 'kinkProfile', label: 'Kink (self-interaction)' },
] as const

const dimensions = [2, 3, 5] as const

test.describe('free scalar field: rendering matrix', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  for (const { key: initCond, label: initLabel } of initialConditions) {
    for (const dim of dimensions) {
      const testLabel = `FSF ${dim}D ${initLabel}`
      const colorAlgos = pickColorAlgorithms(testLabel, initCond)

      test(`${testLabel}: renders [${colorAlgos.join(', ')}]`, async ({ page }) => {
        await gotoMode(page, 'freeScalarField', dim)
        await waitForRendererReady(page)
        await waitForShaderCompilation(page)

        // Exact vacuum has inherently tiny field values — verify "not blank"
        // rather than "clearly visible". Higher dimensions slice further,
        // making output even fainter.
        const minPx = initCond === 'vacuumNoise' ? 1 : 5

        for (const algo of colorAlgos) {
          await setInitialCondition(page, initCond)
          await setColorAlgorithm(page, algo)

          await waitForShaderCompilation(page)
          const fc = await getFrameCount(page)
          await waitForFrameAdvance(page, fc + 120)

          await assertPixels(page, `${testLabel} / ${algo}`, minPx)
        }
      })
    }
  }
})

// ─── B. Field View Coverage ──────────────────────────────────────────────────

test.describe('free scalar field: field views', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  const fieldViews = [
    { view: 'phi', label: 'φ (field amplitude)', needsSelfInteraction: false },
    { view: 'pi', label: 'π (conjugate momentum)', needsSelfInteraction: false },
    { view: 'energyDensity', label: 'ε (energy density)', needsSelfInteraction: false },
    { view: 'wallDensity', label: 'V(φ) (wall density)', needsSelfInteraction: true },
  ] as const

  for (const { view, label, needsSelfInteraction } of fieldViews) {
    test(`field view ${label} renders at 3D`, async ({ page }) => {
      await gotoMode(page, 'freeScalarField', 3)
      await waitForRendererReady(page)
      await waitForShaderCompilation(page)

      // wallDensity requires self-interaction + kinkProfile for meaningful output
      if (needsSelfInteraction) {
        await setInitialCondition(page, 'kinkProfile')
      }
      await setFieldView(page, view)

      await waitForShaderCompilation(page)
      const fc = await getFrameCount(page)
      await waitForFrameAdvance(page, fc + 120)

      await assertPixels(page, `field view ${label}`)
    })
  }
})

// ─── C. Isosurface Mode ─────────────────────────────────────────────────────

test.describe('free scalar field: isosurface', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('isosurface + gaussianPacket 3D renders', async ({ page }) => {
    await gotoMode(page, 'freeScalarField', 3)
    await waitForFsfReady(page)
    await enableIsosurface(page)
    await waitForShaderCompilation(page)
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 120)
    await assertPixels(page, 'isosurface gaussian 3D')
  })

  test('isosurface + vacuumNoise 3D renders', async ({ page }) => {
    await gotoMode(page, 'freeScalarField', 3)
    await waitForFsfReady(page)
    await setInitialCondition(page, 'vacuumNoise')
    await enableIsosurface(page)
    await waitForShaderCompilation(page)
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 120)
    await assertPixels(page, 'isosurface vacuum 3D')
  })
})

// ─── C2. k-Space Occupation Map ──────────────────────────────────────────────
// kSpaceOccupation uses an async GPU readback → Web Worker FFT → texture
// upload pipeline. This multi-frame pipeline needs extra settle time.

test.describe('free scalar field: k-space occupation map', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('kSpaceOccupation unavailable for vacuumNoise (auto-switches away)', async ({ page }) => {
    // Exact vacuum has n_k = 0 for all modes (zero-point subtracted), so the
    // k-space occupation map is correctly but unhelpfully blank. The UI gates
    // this combination — verify the auto-switch works at runtime.
    await gotoMode(page, 'freeScalarField', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    // Set kSpaceOccupation first, then switch to vacuumNoise
    await setColorAlgorithm(page, 'kSpaceOccupation')
    await setInitialCondition(page, 'vacuumNoise')
    // The UI auto-effect should switch away from kSpaceOccupation
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 30)
    const algo = await page.evaluate(async () => {
      const mod = await import('/src/stores/appearanceStore.ts')
      return mod.useAppearanceStore.getState().colorAlgorithm
    })
    expect(algo, 'kSpaceOccupation should auto-switch away for vacuumNoise').not.toBe(
      'kSpaceOccupation'
    )
  })

  test('kSpaceOccupation + gaussianPacket 3D renders', async ({ page }) => {
    await gotoMode(page, 'freeScalarField', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await setColorAlgorithm(page, 'kSpaceOccupation')
    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 300)
    // Gaussian packet concentrates energy in fewer k-modes but output
    // depends on async FFT worker pipeline timing
    await assertPixels(page, 'kSpaceOccupation gaussian 3D', 1)
  })
})

// ─── D. Feature Toggles ─────────────────────────────────────────────────────

test.describe('free scalar field: feature toggles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('absorber disabled: periodic boundaries render', async ({ page }) => {
    await gotoMode(page, 'freeScalarField', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setFreeScalarAbsorberEnabled(false)
    })

    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 120)
    await assertPixels(page, 'absorber disabled')
  })

  test('autoScale disabled: renders without auto-normalization', async ({ page }) => {
    await gotoMode(page, 'freeScalarField', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setFreeScalarAutoScale(false)
    })

    const fc = await getFrameCount(page)
    await waitForFrameAdvance(page, fc + 120)
    await assertPixels(page, 'autoScale disabled')
  })
})

// ─── E. Animation ────────────────────────────────────────────────────────────

test.describe('free scalar field: animation', () => {
  test('field evolves over time (diagnostics differ between snapshots)', async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())

    await gotoMode(page, 'freeScalarField', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await enableDiagnostics(page)

    // Let the compute pass run with diagnostics enabled before checking
    const fc0 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc0 + 60)

    // Wait for first diagnostic readback
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'fsf')

    const snap1 = await readFsfDiagnostics(page)
    expect(snap1.hasData, 'first diagnostic snapshot must have data').toBe(true)
    const energy1 = snap1.totalEnergy
    const maxPhi1 = snap1.maxPhi

    // Let 100 more frames evolve
    const fc1 = await getFrameCount(page)
    await waitForFrameAdvance(page, fc1 + 100)

    const snap2 = await readFsfDiagnostics(page)
    expect(snap2.hasData, 'second diagnostic snapshot must have data').toBe(true)

    // Frame count must have advanced
    const fc = await getFrameCount(page)
    expect(fc, 'frames must advance').toBeGreaterThan(100)

    // The field must have evolved — either energy or maxPhi changed.
    // For a gaussianPacket with leapfrog integration, the packet moves
    // and spreads, so maxPhi decreases over time.
    const energyChanged = Math.abs(snap2.totalEnergy - energy1) > 1e-10
    const phiChanged = Math.abs(snap2.maxPhi - maxPhi1) > 1e-10
    expect(
      energyChanged || phiChanged,
      `field must evolve: energy ${energy1} → ${snap2.totalEnergy}, maxPhi ${maxPhi1} → ${snap2.maxPhi}`
    ).toBe(true)
  })
})

// ─── F. Physics Validation ───────────────────────────────────────────────────

test.describe('free scalar field: physics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('free field (no self-interaction): energy drift < 1.0 after 200 frames', async ({
    page,
  }) => {
    await gotoMode(page, 'freeScalarField', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // Ensure self-interaction is off (free Hamiltonian → symplectic integrator)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setFreeScalarSelfInteractionEnabled(false)
    })

    await enableDiagnostics(page)
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'fsf')
    await waitForSimulationFrames(page, 200)

    const diag = await readFsfDiagnostics(page)
    expect(diag.hasData).toBe(true)
    expect(Number.isFinite(diag.totalEnergy), 'energy must be finite').toBe(true)
    expect(diag.totalEnergy, 'energy must be positive').toBeGreaterThan(0)
    // Free (quadratic) Hamiltonian with leapfrog: energy is a symplectic invariant.
    // Drift should be very small — well under 1.0.
    expect(
      Math.abs(diag.energyDrift),
      `energy drift ${diag.energyDrift} must be < 1.0 for free field`
    ).toBeLessThan(1.0)
  })

  test('kink profile with self-interaction: stable after 200 frames', async ({ page }) => {
    await gotoMode(page, 'freeScalarField', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await setInitialCondition(page, 'kinkProfile')
    await enableDiagnostics(page)
    await waitForDiagnostics(page, '/src/stores/diagnosticsStore.ts', undefined, 'fsf')
    await waitForSimulationFrames(page, 200)

    const diag = await readFsfDiagnostics(page)
    expect(diag.hasData).toBe(true)
    expect(Number.isFinite(diag.totalEnergy), 'energy must be finite (no NaN blowup)').toBe(true)
    expect(diag.totalEnergy, 'energy must be positive').toBeGreaterThan(0)
    expect(Number.isFinite(diag.maxPhi), 'maxPhi must be finite').toBe(true)
    // Self-interaction can transfer energy between modes, but should not blow up.
    // Allow larger drift than free field but flag catastrophic instability.
    expect(
      Math.abs(diag.energyDrift),
      `energy drift ${diag.energyDrift} must be < 10.0 for kink profile`
    ).toBeLessThan(10.0)
  })
})

// ─── G. Dimension Switching ─────────────────────────────────────────────────

test.describe('free scalar field: dimension switching', () => {
  test('2D → 5D: renderer recovers and renders both', async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())

    // Start at 2D
    await gotoMode(page, 'freeScalarField', 2)
    await waitForFsfReady(page)
    await assertPixels(page, 'FSF 2D before switch')

    // Switch to 5D
    await gotoMode(page, 'freeScalarField', 5)
    await waitForFsfReady(page)
    await assertPixels(page, 'FSF 5D after switch')
  })
})
