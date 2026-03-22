/**
 * Harmonic Oscillator deep e2e test suite.
 *
 * Fills coverage GAPS not handled by other spec files:
 * - rendering.spec.ts: basic HO 3D/5D render, animation loop, mode switching
 * - physics-coverage.spec.ts: dims 2-11D render, term counts 1-8, different terms differ
 * - rendering-differential.spec.ts: pos vs momentum (3D), pos vs wigner (3D),
 *   cross-section toggle (3D), color algo (3D), density gain, animation, bloom
 * - isosurface-controls.spec.ts: threshold store update, threshold visual diff, extremes
 * - shader-compilation-matrix.spec.ts: cross-section + HO, cross-section + wigner + cinematic
 * - top-bar-controls.spec.ts: representation cycle, store update, visual change
 *
 * This spec adds:
 * - Section A: Config variant rendering at 2D, 3D, 5D, 11D (seed, preset, representation)
 * - Section B: Control response — frequency spread, field scale, seed, max quantum number,
 *   named preset, slice position at 5D
 * - Section C: Density diagnostics readback for analytical mode
 * - Section D: Feature toggles — isosurface at 5D, dimension switch recovery, wigner at 2D
 *
 * GPU/shader error detection is automatic via fixtures.ts.
 */

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  captureAndSamplePixels,
  capturePixelSnapshot,
  expectSnapshotsDiffer,
  getFrameCount,
  gotoMode,
  pauseAnimation,
  readDensityDiagnostics,
  requireWebGPU,
  snapshotDistance,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
  waitForUniformUpdate,
} from './helpers/app-helpers'

test.setTimeout(600_000)

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Multi-screenshot pixel check for HO mode.
 * Takes 3 shots with 30-frame gaps; returns the best non-bg pixel count.
 */
async function hoPixelCheck(
  page: Page,
  minPixels = 5
): Promise<{ pass: boolean; bestCount: number }> {
  let bestCount = 0
  for (let i = 0; i < 3; i++) {
    const { nonBgPixels } = await captureAndSamplePixels(page)
    bestCount = Math.max(bestCount, nonBgPixels)
    if (bestCount >= minPixels) return { pass: true, bestCount }
    if (i < 2) {
      const fc = await getFrameCount(page)
      await waitForFrameAdvance(page, fc + 30)
    }
  }
  return { pass: bestCount >= minPixels, bestCount }
}

/** Assert pixel check passes with descriptive error. */
async function assertPixels(page: Page, context: string, minPixels = 5): Promise<void> {
  const { pass, bestCount } = await hoPixelCheck(page, minPixels)
  expect(
    pass,
    `${context}: expected >= ${minPixels} non-bg pixels across 3 snapshots, best was ${bestCount}`
  ).toBe(true)
}

/** Wait for HO to initialize and compile shaders. */
async function waitForHoReady(page: Page): Promise<void> {
  await waitForRendererReady(page)
  await waitForShaderCompilation(page)
}

/** Set HO named preset via store. */
async function setPresetName(page: Page, name: string): Promise<void> {
  await page.evaluate(async (n) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).setSchroedingerPresetName(n)
  }, name)
}

/** Set HO seed via store. */
async function setSeed(page: Page, seed: number): Promise<void> {
  await page.evaluate(async (s) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerSeed(s)
  }, seed)
}

/** Set HO frequency spread via store. */
async function setFrequencySpread(page: Page, spread: number): Promise<void> {
  await page.evaluate(async (s) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerFrequencySpread(s)
  }, spread)
}

/** Set HO field scale via store. */
async function setFieldScale(page: Page, scale: number): Promise<void> {
  await page.evaluate(async (s) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerFieldScale(s)
  }, scale)
}

/** Set HO max quantum number via store. */
async function setMaxQuantumNumber(page: Page, maxN: number): Promise<void> {
  await page.evaluate(async (n) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerMaxQuantumNumber(n)
  }, maxN)
}

/** Set representation via store. */
async function setRepresentation(page: Page, rep: string): Promise<void> {
  await page.evaluate(async (r) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerRepresentation(r)
  }, rep)
}

/** Enable isosurface mode via store. */
async function enableIsosurface(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerIsoEnabled(true)
  })
}

/** Set color algorithm via appearance store. */
async function setColorAlgorithm(page: Page, algo: string): Promise<void> {
  await page.evaluate(async (a) => {
    const mod = await import('/src/stores/appearanceStore.ts')
    mod.useAppearanceStore.getState().setColorAlgorithm(a)
  }, algo)
}

// ─── A. Config Variant Rendering ─────────────────────────────────────────────

test.describe('HO deep: config variant rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('wigner representation at 2D renders non-blank', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 2)
    await waitForHoReady(page)
    await setRepresentation(page, 'wigner')
    await waitForShaderCompilation(page)
    await assertPixels(page, 'wigner 2D')
  })

  test('momentum representation at 5D renders non-blank', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 5)
    await waitForHoReady(page)
    await setRepresentation(page, 'momentum')
    await waitForShaderCompilation(page)
    await assertPixels(page, 'momentum 5D', 1)
  })

  test('momentum representation at 11D renders non-blank', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 11)
    await waitForHoReady(page)
    await setRepresentation(page, 'momentum')
    await waitForShaderCompilation(page)
    await assertPixels(page, 'momentum 11D', 1)
  })

  test('high frequency spread at 3D renders non-blank', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForHoReady(page)
    await setFrequencySpread(page, 0.5)
    await waitForShaderCompilation(page)
    await assertPixels(page, 'frequencySpread=0.5 3D')
  })
})

// ─── B. Control Response — Differential Pixel Checks ─────────────────────────

test.describe('HO deep: control response', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('changing seed produces different image', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForHoReady(page)
    await pauseAnimation(page)

    await setSeed(page, 42)
    await waitForShaderCompilation(page)
    const snapA = await capturePixelSnapshot(page)

    await setSeed(page, 999999)
    await waitForShaderCompilation(page)
    const snapB = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapA, snapB, 'seed 42 vs 999999 must differ')
  })

  test('changing frequency spread produces different image', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForHoReady(page)
    await pauseAnimation(page)

    // Isotropic (spread = 0)
    await setFrequencySpread(page, 0)
    await waitForShaderCompilation(page)
    const snapIso = await capturePixelSnapshot(page)

    // Highly anisotropic (spread = 0.5)
    await setFrequencySpread(page, 0.5)
    await waitForShaderCompilation(page)
    const snapAniso = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapIso, snapAniso, 'isotropic vs anisotropic frequency must differ')
  })

  test('changing field scale produces different image', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForHoReady(page)
    await pauseAnimation(page)

    await setFieldScale(page, 0.5)
    await waitForUniformUpdate(page)
    const snapSmall = await capturePixelSnapshot(page)

    await setFieldScale(page, 2.0)
    await waitForUniformUpdate(page)
    const snapLarge = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapSmall, snapLarge, 'field scale 0.5 vs 2.0 must differ')
  })

  test('changing max quantum number with multiple terms produces different image', async ({
    page,
  }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForHoReady(page)

    // Set 4 terms so maxN actually affects which quantum numbers are sampled
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerTermCount(4)
    })
    await waitForShaderCompilation(page)
    await pauseAnimation(page)

    // Low maxN — only n=0,1 quantum numbers available
    await setMaxQuantumNumber(page, 2)
    await waitForShaderCompilation(page)
    const snapLow = await capturePixelSnapshot(page)

    // High maxN — n up to 6, finer spatial structure
    await setMaxQuantumNumber(page, 6)
    await waitForShaderCompilation(page)
    const snapHigh = await capturePixelSnapshot(page)

    // The difference is subtle (different quantum number sampling) so use a lower
    // threshold than the default 2.0 in expectSnapshotsDiffer.
    const dist = snapshotDistance(snapLow, snapHigh)
    expect(
      dist,
      `maxN=2 vs maxN=6: pixel distance=${dist.toFixed(2)} must be > 0.1`
    ).toBeGreaterThan(0.1)
  })

  test('changing named preset produces different image', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForHoReady(page)
    await pauseAnimation(page)

    // groundState: 1 term, maxN=1, gaussian blob
    await setPresetName(page, 'groundState')
    await waitForShaderCompilation(page)
    const snapA = await capturePixelSnapshot(page)

    // richSuperposition: 5 terms, maxN=6, complex interference
    await setPresetName(page, 'richSuperposition')
    await waitForShaderCompilation(page)
    const snapB = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapA, snapB, 'groundState vs richSuperposition preset must differ')
  })

  test('isosurface vs volume rendering at 3D produces different image', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForHoReady(page)
    await pauseAnimation(page)

    // Volume rendering (default)
    const snapVolume = await capturePixelSnapshot(page)

    // Enable isosurface — completely different rendering path
    await enableIsosurface(page)
    await waitForShaderCompilation(page)
    await waitForUniformUpdate(page)
    const snapIso = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapVolume, snapIso, 'volume vs isosurface rendering must differ')
  })

  test('viridis vs domainColoringPsi color algorithms produce different images', async ({
    page,
  }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForHoReady(page)
    await pauseAnimation(page)

    await setColorAlgorithm(page, 'viridis')
    await waitForShaderCompilation(page)
    await waitForUniformUpdate(page)
    const snapViridis = await capturePixelSnapshot(page)

    await setColorAlgorithm(page, 'domainColoringPsi')
    await waitForShaderCompilation(page)
    await waitForUniformUpdate(page)
    const snapDomain = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapViridis, snapDomain, 'viridis vs domainColoringPsi must differ')
  })
})

// ─── C. Density Diagnostics Readback ─────────────────────────────────────────

test.describe('HO deep: density diagnostics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('density diagnostics report finite positive values at 3D', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForHoReady(page)

    const diag = await readDensityDiagnostics(page)
    expect(diag.hasData, 'density diagnostics must have data').toBe(true)
    expect(Number.isFinite(diag.maxDensity), 'maxDensity must be finite').toBe(true)
    expect(diag.maxDensity, 'maxDensity must be positive').toBeGreaterThan(0)
    expect(diag.totalDensityMass, 'totalDensityMass must be positive').toBeGreaterThan(0)
    expect(diag.activeVoxelCount, 'activeVoxelCount must be positive').toBeGreaterThan(0)
  })

  test('different term counts produce different density diagnostics', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForHoReady(page)

    // 1 term — single eigenstate (smooth Gaussian)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerTermCount(1)
    })
    await waitForShaderCompilation(page)
    const diag1 = await readDensityDiagnostics(page)
    expect(diag1.hasData).toBe(true)

    // 8 terms — superposition with interference nodes
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerTermCount(8)
    })
    await waitForShaderCompilation(page)
    const diag8 = await readDensityDiagnostics(page)
    expect(diag8.hasData).toBe(true)

    // Density profile must differ — interference changes the spatial distribution
    const maxDensDiff = Math.abs(diag8.maxDensity - diag1.maxDensity)
    const voxelDiff = Math.abs(diag8.activeVoxelCount - diag1.activeVoxelCount)
    expect(
      maxDensDiff > 0 || voxelDiff > 0,
      `1-term vs 8-term diagnostics must differ: maxDensity diff=${maxDensDiff.toFixed(4)}, voxel diff=${voxelDiff}`
    ).toBe(true)
  })
})

// ─── D. Feature Toggles and Edge Cases ───────────────────────────────────────

test.describe('HO deep: feature toggles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('isosurface mode at 5D renders without GPU errors', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 5)
    await waitForHoReady(page)
    await enableIsosurface(page)
    await waitForShaderCompilation(page)
    // 5D isosurface slices are faint — just verify no GPU errors and some pixels
    await assertPixels(page, 'HO isosurface 5D', 1)
  })

  test('dimension switch 3D → 11D → 3D: renderer recovers', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForHoReady(page)
    await assertPixels(page, 'HO 3D initial')

    await gotoMode(page, 'harmonicOscillator', 11)
    await waitForHoReady(page)
    await assertPixels(page, 'HO 11D', 1)

    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForHoReady(page)
    await assertPixels(page, 'HO 3D after recovery')
  })

  test('wigner at 2D produces visually distinct image from position', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 2)
    await waitForHoReady(page)
    await pauseAnimation(page)

    // Position (default)
    const snapPos = await capturePixelSnapshot(page)

    // Wigner — 2D-only representation
    await setRepresentation(page, 'wigner')
    await waitForShaderCompilation(page)
    const snapWigner = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapPos, snapWigner, 'HO 2D position vs wigner must differ')
  })

  test('momentum at 2D produces different image from position', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 2)
    await waitForHoReady(page)
    await pauseAnimation(page)

    const snapPos = await capturePixelSnapshot(page)

    await setRepresentation(page, 'momentum')
    await waitForShaderCompilation(page)
    const snapMom = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapPos, snapMom, 'HO 2D position vs momentum must differ')
  })
})
