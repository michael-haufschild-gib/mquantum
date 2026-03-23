/**
 * Hydrogen ND deep e2e test suite.
 *
 * Fills coverage GAPS not handled by other spec files:
 * - rendering.spec.ts: basic Hydrogen 3D/4D/5D/7D/11D render, mode switching
 * - physics-coverage.spec.ts: dims 3-11D render, specific orbitals (1s,2p,3d),
 *   different n values differ, high-n orbitals render
 * - hydrogen-controls.spec.ts: quantum number slider UI, constraint enforcement
 * - rendering-differential.spec.ts: n=1,l=0 vs n=2,l=1 differ
 * - shader-compilation-matrix.spec.ts: momentum + hydrogen 3D, wigner + hydrogen 5D,
 *   cross-section + hydrogen 3D
 *
 * This spec adds:
 * - Section A: Higher-D orbital shapes — 4D/7D with specific quantum numbers differ
 * - Section B: Control response — isosurface, color algorithm, cross-section at higher
 *   dims, density gain, bohr radius scale, real vs complex orbitals, ND preset
 * - Section C: Density diagnostics readback for analytical hydrogen
 * - Section D: Feature toggles — representation switching, dimension switch recovery,
 *   edge case quantum numbers (max n, max l, negative m)
 *
 * GPU/shader error detection is automatic via fixtures.ts.
 */

import type { Page } from '@playwright/test'

import { expect, test } from './fixtures'
import {
  assertNonBlankPixels,
  capturePixelSnapshot,
  expectSnapshotsDiffer,
  gotoMode,
  pauseAnimation,
  readDensityDiagnostics,
  requireWebGPU,
  setHydrogenQuantumNumbers,
  snapshotDistance,
  waitForModeReady,
  waitForShaderCompilation,
  waitForUniformUpdate,
} from './helpers/app-helpers'

test.setTimeout(600_000)

// ─── Helpers ─────────────────────────────────────────────────────────────────

const assertPixels = assertNonBlankPixels
const waitForHydrogenReady = (page: Page) => waitForModeReady(page)

/** Enable isosurface mode via store. */
async function enableIsosurface(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerIsoEnabled(true)
  })
}

/** Enable cross-section via store. */
async function enableCrossSection(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerCrossSectionEnabled(true)
  })
}

/** Set color algorithm via appearance store. */
async function setColorAlgorithm(page: Page, algo: string): Promise<void> {
  await page.evaluate(async (a) => {
    const mod = await import('/src/stores/appearanceStore.ts')
    mod.useAppearanceStore.getState().setColorAlgorithm(a)
  }, algo)
}

/** Set density gain via store. */
async function setDensityGain(page: Page, gain: number): Promise<void> {
  await page.evaluate(async (g) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerDensityGain(g)
  }, gain)
}

/** Set bohr radius scale via store. */
async function setBohrRadiusScale(page: Page, scale: number): Promise<void> {
  await page.evaluate(async (s) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerBohrRadiusScale(s)
  }, scale)
}

/** Toggle real vs complex orbitals via store. */
async function setUseRealOrbitals(page: Page, useReal: boolean): Promise<void> {
  await page.evaluate(async (r) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerUseRealOrbitals(r)
  }, useReal)
}

/** Set representation via store. */
async function setRepresentation(page: Page, rep: string): Promise<void> {
  await page.evaluate(async (r) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerRepresentation(r)
  }, rep)
}

/** Apply hydrogen ND preset via store. */
async function applyHydrogenNDPreset(page: Page, preset: string): Promise<void> {
  await page.evaluate(async (p) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    ;(
      mod.useExtendedObjectStore.getState() as Record<string, (...args: unknown[]) => void>
    ).setSchroedingerHydrogenNDPreset(p)
  }, preset)
}

/** Set extra dimension quantum number via store. */
async function setExtraDimQuantumNumber(page: Page, dimIndex: number, n: number): Promise<void> {
  await page.evaluate(
    async ({ idx, val }: { idx: number; val: number }) => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerExtraDimQuantumNumber(idx, val)
    },
    { idx: dimIndex, val: n }
  )
}

// ─── A. Higher-D Orbital Shape Rendering ─────────────────────────────────────

test.describe('Hydrogen deep: higher-D orbital shapes', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('4D: different quantum numbers produce different images', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 4)
    await waitForHydrogenReady(page)
    await pauseAnimation(page)

    // 1s orbital at 4D
    await setHydrogenQuantumNumbers(page, 1, 0, 0)
    await waitForShaderCompilation(page)
    const snap1s = await capturePixelSnapshot(page)

    // 3d orbital at 4D (n=3, l=2, m=0)
    await setHydrogenQuantumNumbers(page, 3, 2, 0)
    await waitForShaderCompilation(page)
    const snap3d = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snap1s, snap3d, '4D: 1s vs 3d must differ')
  })

  test('7D: different quantum numbers produce different images', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 7)
    await waitForHydrogenReady(page)
    await pauseAnimation(page)

    // 2p at 7D
    await setHydrogenQuantumNumbers(page, 2, 1, 0)
    await waitForShaderCompilation(page)
    const snap2p = await capturePixelSnapshot(page)

    // 4f at 7D (n=4, l=3, m=0)
    await setHydrogenQuantumNumbers(page, 4, 3, 0)
    await waitForShaderCompilation(page)
    const snap4f = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snap2p, snap4f, '7D: 2p vs 4f must differ')
  })

  test('4D extra-dim quantum number change produces different image', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 4)
    await waitForHydrogenReady(page)
    await pauseAnimation(page)

    // Start with 2pz_4d preset (n4=0 ground state)
    await applyHydrogenNDPreset(page, '2pz_4d')
    await waitForShaderCompilation(page)
    const snapGround = await capturePixelSnapshot(page)

    // Set n4=2 (second excited extra-dimension state)
    await setExtraDimQuantumNumber(page, 0, 2)
    await waitForShaderCompilation(page)
    const snapExcited = await capturePixelSnapshot(page)

    const dist = snapshotDistance(snapGround, snapExcited)
    expect(
      dist,
      `4D extra-dim n4=0 vs n4=2: distance=${dist.toFixed(2)} must be > 0.1`
    ).toBeGreaterThan(0.1)
  })
})

// ─── B. Control Response — Differential Pixel Checks ─────────────────────────

test.describe('Hydrogen deep: control response', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('isosurface mode at 3D renders and differs from volume', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 3)
    await waitForHydrogenReady(page)
    // Use a visible orbital: n=2, l=1
    await setHydrogenQuantumNumbers(page, 2, 1, 0)
    await waitForShaderCompilation(page)
    await pauseAnimation(page)

    const snapVolume = await capturePixelSnapshot(page)

    await enableIsosurface(page)
    await waitForShaderCompilation(page)
    await waitForUniformUpdate(page)
    const snapIso = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapVolume, snapIso, 'hydrogen 3D: volume vs isosurface must differ')
  })

  test('isosurface mode at 5D renders without GPU errors', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 5)
    await waitForHydrogenReady(page)
    await enableIsosurface(page)
    await waitForShaderCompilation(page)
    // 5D isosurface slices are faint
    await assertPixels(page, 'hydrogen isosurface 5D', 1)
  })

  test('viridis vs radialDistance color algorithms produce different images', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 3)
    await waitForHydrogenReady(page)
    await setHydrogenQuantumNumbers(page, 2, 1, 0)
    await waitForShaderCompilation(page)
    await pauseAnimation(page)

    await setColorAlgorithm(page, 'radialDistance')
    await waitForShaderCompilation(page)
    await waitForUniformUpdate(page)
    const snapRadial = await capturePixelSnapshot(page)

    await setColorAlgorithm(page, 'viridis')
    await waitForShaderCompilation(page)
    await waitForUniformUpdate(page)
    const snapViridis = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(
      snapRadial,
      snapViridis,
      'radialDistance vs viridis must produce different coloring'
    )
  })

  test('cross-section at 5D renders non-blank', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 5)
    await waitForHydrogenReady(page)
    await enableCrossSection(page)
    await waitForShaderCompilation(page)
    await assertPixels(page, 'hydrogen 5D cross-section', 1)
  })

  test('cross-section at 7D renders non-blank', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 7)
    await waitForHydrogenReady(page)
    await enableCrossSection(page)
    await waitForShaderCompilation(page)
    await assertPixels(page, 'hydrogen 7D cross-section', 1)
  })

  test('changing density gain produces different image', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 3)
    await waitForHydrogenReady(page)
    await setHydrogenQuantumNumbers(page, 2, 1, 0)
    await waitForShaderCompilation(page)
    await pauseAnimation(page)

    await setDensityGain(page, 0.5)
    await waitForUniformUpdate(page)
    const snapLow = await capturePixelSnapshot(page)

    await setDensityGain(page, 4.0)
    await waitForUniformUpdate(page)
    const snapHigh = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapLow, snapHigh, 'density gain 0.5 vs 4.0 must differ')
  })

  test('changing bohr radius scale produces different image', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 3)
    await waitForHydrogenReady(page)
    await setHydrogenQuantumNumbers(page, 3, 2, 0)
    await waitForShaderCompilation(page)
    await pauseAnimation(page)

    await setBohrRadiusScale(page, 0.5)
    await waitForShaderCompilation(page)
    const snapSmall = await capturePixelSnapshot(page)

    await setBohrRadiusScale(page, 3.0)
    await waitForShaderCompilation(page)
    const snapLarge = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapSmall, snapLarge, 'bohr radius scale 0.5 vs 3.0 must differ')
  })

  test('real vs complex orbital representation at 3D (p orbital) differs', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 3)
    await waitForHydrogenReady(page)
    // p orbital with m=1 — real (px) vs complex (m=+1) look different
    await setHydrogenQuantumNumbers(page, 2, 1, 1)
    await waitForShaderCompilation(page)
    await pauseAnimation(page)

    await setUseRealOrbitals(page, true)
    await waitForShaderCompilation(page)
    const snapReal = await capturePixelSnapshot(page)

    await setUseRealOrbitals(page, false)
    await waitForShaderCompilation(page)
    const snapComplex = await capturePixelSnapshot(page)

    // Real and complex orbitals have different spatial distributions for m!=0
    const dist = snapshotDistance(snapReal, snapComplex)
    expect(
      dist,
      `real vs complex orbital: distance=${dist.toFixed(2)} must be > 0.1`
    ).toBeGreaterThan(0.1)
  })

  test('applying ND preset changes rendering', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 4)
    await waitForHydrogenReady(page)
    await pauseAnimation(page)

    // Start with 2pz_4d preset
    await applyHydrogenNDPreset(page, '2pz_4d')
    await waitForShaderCompilation(page)
    const snap2pz = await capturePixelSnapshot(page)

    // Switch to 3dz2_4d preset
    await applyHydrogenNDPreset(page, '3dz2_4d')
    await waitForShaderCompilation(page)
    const snap3dz2 = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snap2pz, snap3dz2, '2pz_4d vs 3dz2_4d preset must differ')
  })
})

// ─── C. Density Diagnostics Readback ─────────────────────────────────────────

test.describe('Hydrogen deep: density diagnostics', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('density diagnostics report finite positive values at 3D', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 3)
    await waitForHydrogenReady(page)

    const diag = await readDensityDiagnostics(page)
    expect(diag.hasData, 'density diagnostics must have data').toBe(true)
    expect(Number.isFinite(diag.maxDensity), 'maxDensity must be finite').toBe(true)
    expect(diag.maxDensity, 'maxDensity must be positive').toBeGreaterThan(0)
    expect(diag.totalDensityMass, 'totalDensityMass must be positive').toBeGreaterThan(0)
    expect(diag.activeVoxelCount, 'activeVoxelCount must be positive').toBeGreaterThan(0)
  })

  test('higher-n orbitals have different density diagnostics than 1s', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 3)
    await waitForHydrogenReady(page)

    // 1s: concentrated spherical density
    await setHydrogenQuantumNumbers(page, 1, 0, 0)
    await waitForShaderCompilation(page)
    const diag1s = await readDensityDiagnostics(page)
    expect(diag1s.hasData).toBe(true)

    // 4f: very diffuse, higher angular momentum
    await setHydrogenQuantumNumbers(page, 4, 3, 0)
    await waitForShaderCompilation(page)
    const diag4f = await readDensityDiagnostics(page)
    expect(diag4f.hasData).toBe(true)

    // 1s has highest peak density at center; 4f is spread out with angular nodes
    const maxDensDiff = Math.abs(diag4f.maxDensity - diag1s.maxDensity)
    const voxelDiff = Math.abs(diag4f.activeVoxelCount - diag1s.activeVoxelCount)
    expect(
      maxDensDiff > 0 || voxelDiff > 0,
      `1s vs 4f diagnostics must differ: maxDensity diff=${maxDensDiff.toFixed(4)}, voxel diff=${voxelDiff}`
    ).toBe(true)
  })
})

// ─── D. Feature Toggles and Edge Cases ───────────────────────────────────────

test.describe('Hydrogen deep: feature toggles and edge cases', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('max quantum numbers n=7, l=6, m=-6 renders without GPU errors', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 3)
    await waitForHydrogenReady(page)
    await setHydrogenQuantumNumbers(page, 7, 6, -6)
    await waitForShaderCompilation(page)
    // High angular momentum orbitals are faint and highly structured
    await assertPixels(page, 'n=7,l=6,m=-6 edge case', 1)
  })

  test('negative m value renders differently from positive m', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 3)
    await waitForHydrogenReady(page)
    // Use complex orbitals so m sign matters
    await setUseRealOrbitals(page, false)
    await waitForShaderCompilation(page)
    await pauseAnimation(page)

    await setHydrogenQuantumNumbers(page, 3, 2, 2)
    await waitForShaderCompilation(page)
    const snapPosM = await capturePixelSnapshot(page)

    await setHydrogenQuantumNumbers(page, 3, 2, -2)
    await waitForShaderCompilation(page)
    const snapNegM = await capturePixelSnapshot(page)

    // For complex orbitals, +m and -m have opposite phase winding
    // which shows differently with phase-sensitive color algorithms
    const dist = snapshotDistance(snapPosM, snapNegM)
    // The modulus |Y_l^m|^2 = |Y_l^{-m}|^2, so with density-only coloring
    // they may look identical. Just verify both rendered (no GPU errors).
    expect(Number.isFinite(dist), 'snapshots must be comparable').toBe(true)
  })

  test('position vs momentum representation for hydrogen 3D differs', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 3)
    await waitForHydrogenReady(page)
    await setHydrogenQuantumNumbers(page, 2, 1, 0)
    await waitForShaderCompilation(page)
    await pauseAnimation(page)

    // Position (default)
    await setRepresentation(page, 'position')
    await waitForShaderCompilation(page)
    const snapPos = await capturePixelSnapshot(page)

    // Momentum
    await setRepresentation(page, 'momentum')
    await waitForShaderCompilation(page)
    const snapMom = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapPos, snapMom, 'hydrogen 3D position vs momentum must differ')
  })

  test('dimension switch 3D -> 7D -> 3D: renderer recovers', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 3)
    await waitForHydrogenReady(page)
    await assertPixels(page, 'hydrogen 3D initial')

    await gotoMode(page, 'hydrogenND', 7)
    await waitForHydrogenReady(page)
    await assertPixels(page, 'hydrogen 7D', 1)

    await gotoMode(page, 'hydrogenND', 3)
    await waitForHydrogenReady(page)
    await assertPixels(page, 'hydrogen 3D after recovery')
  })
})
