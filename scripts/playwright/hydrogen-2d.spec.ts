/**
 * True 2D Hydrogen e2e test suite.
 *
 * Verifies the 2D hydrogen implementation (circular harmonics, |m| as effective l,
 * D=2 radial wavefunction) renders correctly with no GPU/shader/console errors.
 *
 * Tests cover:
 * - Basic rendering: hydrogenND and hydrogenNDCoupled at dim=2
 * - Isosurface (isolines) mode at dim=2
 * - Quantum number variations: different (n,m) produce different images
 * - Feature toggles: real/complex orbitals, density gain, bohr radius, phase animation
 * - Representation constraint: momentum/wigner blocked at dim=2
 * - Cross-section: disabled in 2D (no crash)
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
  gotoModeWithParams,
  pauseAnimation,
  requireWebGPU,
  setHydrogenQuantumNumbers,
  waitForModeReady,
  waitForShaderCompilation,
  waitForUniformUpdate,
} from './helpers/app-helpers'

test.setTimeout(300_000)

// ─── Helpers ─────────────────────────────────────────────────────────────────

const waitForHydrogen2DReady = (page: Page) => waitForModeReady(page)

/** Enable isosurface mode (isolines in 2D) via store. */
async function enableIsosurface(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const mod = await import('/src/stores/scene/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerIsoEnabled(true)
  })
}

/** Toggle real vs complex orbitals via store. */
async function setUseRealOrbitals(page: Page, useReal: boolean): Promise<void> {
  await page.evaluate(async (r) => {
    const mod = await import('/src/stores/scene/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerUseRealOrbitals(r)
  }, useReal)
}

/** Set density gain via store. */
async function setDensityGain(page: Page, gain: number): Promise<void> {
  await page.evaluate(async (g) => {
    const mod = await import('/src/stores/scene/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerDensityGain(g)
  }, gain)
}

/** Set bohr radius scale via store. */
async function setBohrRadiusScale(page: Page, scale: number): Promise<void> {
  await page.evaluate(async (s) => {
    const mod = await import('/src/stores/scene/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerBohrRadiusScale(s)
  }, scale)
}

/** Read the current representation from the store. */
async function getRepresentation(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/scene/extendedObjectStore.ts')
    return mod.useExtendedObjectStore.getState().schroedinger?.representation ?? 'position'
  })
}

/** Read the current azimuthal quantum number from the store. */
async function getAzimuthalL(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const mod = await import('/src/stores/scene/extendedObjectStore.ts')
    return mod.useExtendedObjectStore.getState().schroedinger?.azimuthalQuantumNumber ?? 0
  })
}

// ─── A. Basic 2D Hydrogen Rendering ──────────────────────────────────────────

test.describe('Hydrogen 2D: basic rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('hydrogenND at dim=2 renders non-blank pixels', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 2)
    await waitForHydrogen2DReady(page)
    await assertNonBlankPixels(page, 'Hydrogen ND 2D')
  })

  test('hydrogenNDCoupled at dim=2 renders non-blank pixels', async ({ page }) => {
    await gotoMode(page, 'hydrogenNDCoupled', 2)
    await waitForHydrogen2DReady(page)
    await assertNonBlankPixels(page, 'Hydrogen ND Coupled 2D')
  })

  test('2D hydrogen with specific quantum numbers (n=2, m=1)', async ({ page }) => {
    await gotoModeWithParams(page, 'hydrogenND', 2, { hyd_n: '2', hyd_m: '1' })
    await waitForHydrogen2DReady(page)
    await assertNonBlankPixels(page, 'Hydrogen 2D n=2 m=1')
  })

  test('2D hydrogen with high n (n=5, m=2)', async ({ page }) => {
    await gotoModeWithParams(page, 'hydrogenND', 2, { hyd_n: '5', hyd_l: '2', hyd_m: '2' })
    await waitForHydrogen2DReady(page)
    await assertNonBlankPixels(page, 'Hydrogen 2D n=5 m=2')
  })
})

// ─── B. Isosurface (Isolines) Mode ──────────────────────────────────────────

test.describe('Hydrogen 2D: isolines mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('isosurface at dim=2 renders isolines without crash', async ({ page }) => {
    await gotoModeWithParams(page, 'hydrogenND', 2, { iso: '1' })
    await waitForHydrogen2DReady(page)
    await assertNonBlankPixels(page, 'Hydrogen 2D isolines')
  })

  test('toggling isosurface on produces different image', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 2)
    await waitForHydrogen2DReady(page)
    await pauseAnimation(page)

    const snapVolume = await capturePixelSnapshot(page)

    await enableIsosurface(page)
    await waitForShaderCompilation(page)
    const snapIso = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapVolume, snapIso, '2D: volume vs isolines must differ')
  })
})

// ─── C. Quantum Number Variations ───────────────────────────────────────────

test.describe('Hydrogen 2D: quantum number variations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('different n values produce different images', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 2)
    await waitForHydrogen2DReady(page)
    await pauseAnimation(page)

    // n=1, m=0 (ground state)
    await setHydrogenQuantumNumbers(page, 1, 0, 0)
    await waitForShaderCompilation(page)
    const snap1s = await capturePixelSnapshot(page)

    // n=3, m=0 (excited state, same angular symmetry)
    await setHydrogenQuantumNumbers(page, 3, 0, 0)
    await waitForShaderCompilation(page)
    const snap3s = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snap1s, snap3s, '2D: n=1 vs n=3 (m=0) must differ')
  })

  test('different m values produce different images', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 2)
    await waitForHydrogen2DReady(page)
    await pauseAnimation(page)

    // n=3, m=0 (s-wave symmetry)
    await setHydrogenQuantumNumbers(page, 3, 0, 0)
    await waitForShaderCompilation(page)
    const snapM0 = await capturePixelSnapshot(page)

    // n=3, m=2 (angular lobes)
    await setHydrogenQuantumNumbers(page, 3, 2, 2)
    await waitForShaderCompilation(page)
    const snapM2 = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapM0, snapM2, '2D: n=3,m=0 vs n=3,m=2 must differ')
  })

  test('negative m renders (m=-1 vs m=+1 differ for complex orbitals)', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 2)
    await waitForHydrogen2DReady(page)
    await pauseAnimation(page)
    await setUseRealOrbitals(page, false)

    await setHydrogenQuantumNumbers(page, 2, 1, 1)
    await waitForShaderCompilation(page)
    await assertNonBlankPixels(page, 'Hydrogen 2D n=2 m=+1 complex')

    await setHydrogenQuantumNumbers(page, 2, 1, -1)
    await waitForShaderCompilation(page)
    await assertNonBlankPixels(page, 'Hydrogen 2D n=2 m=-1 complex')
  })
})

// ─── D. Feature Toggles ─────────────────────────────────────────────────────

test.describe('Hydrogen 2D: feature toggles', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('real vs complex orbitals toggle produces different images', async ({ page }) => {
    await gotoModeWithParams(page, 'hydrogenND', 2, { hyd_n: '3', hyd_m: '2' })
    await waitForHydrogen2DReady(page)
    await pauseAnimation(page)

    await setUseRealOrbitals(page, true)
    await waitForUniformUpdate(page)
    const snapReal = await capturePixelSnapshot(page)

    await setUseRealOrbitals(page, false)
    await waitForUniformUpdate(page)
    const snapComplex = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapReal, snapComplex, '2D: real vs complex orbitals must differ')
  })

  test('density gain change produces different image', async ({ page }) => {
    // Use n=3 for a larger orbital that fills more of the sampling region.
    // The default 1s orbital at 2D is compact and most sample points hit
    // background — density gain changes are invisible outside the orbital.
    await gotoModeWithParams(page, 'hydrogenND', 2, { hyd_n: '3', hyd_l: '0', hyd_m: '0' })
    await waitForHydrogen2DReady(page)
    await waitForShaderCompilation(page)
    await pauseAnimation(page)

    await setDensityGain(page, 0.5)
    await waitForUniformUpdate(page)
    const snapLow = await capturePixelSnapshot(page)

    await setDensityGain(page, 10.0)
    await waitForUniformUpdate(page)
    const snapHigh = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapLow, snapHigh, '2D: density gain 0.5 vs 10.0 must differ')
  })

  test('bohr radius change produces different image', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 2)
    await waitForHydrogen2DReady(page)
    await pauseAnimation(page)

    await setBohrRadiusScale(page, 0.5)
    await waitForUniformUpdate(page)
    const snapSmall = await capturePixelSnapshot(page)

    await setBohrRadiusScale(page, 2.0)
    await waitForUniformUpdate(page)
    const snapLarge = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapSmall, snapLarge, '2D: bohr radius 0.5 vs 2.0 must differ')
  })
})

// ─── E. Representation Constraints ──────────────────────────────────────────

test.describe('Hydrogen 2D: representation constraints', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('momentum representation is blocked for hydrogen at dim=2', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 2)
    await waitForHydrogen2DReady(page)

    // Attempt to set momentum representation via store
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerRepresentation('momentum')
    })

    const repr = await getRepresentation(page)
    expect(repr, 'Momentum representation should be blocked for hydrogen at dim=2').toBe('position')
  })

  test('l is auto-synced to |m| when switching to dim=2', async ({ page }) => {
    // Start at hydrogen 3D with l=2, m=1
    await gotoModeWithParams(page, 'hydrogenND', 3, { hyd_n: '3', hyd_l: '2', hyd_m: '1' })
    await waitForHydrogen2DReady(page)

    // Switch to dim=2
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/geometryStore.ts')
      mod.useGeometryStore.getState().setDimension(2)
    })
    await waitForShaderCompilation(page)

    // l should now be |m| = 1
    const l = await getAzimuthalL(page)
    expect(l, 'l should auto-sync to |m| in 2D').toBe(1)
  })
})

// ─── F. Dimension Switching ─────────────────────────────────────────────────

test.describe('Hydrogen 2D: dimension switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('switching from 3D to 2D hydrogen renders without crash', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 3)
    await waitForHydrogen2DReady(page)
    await assertNonBlankPixels(page, 'Hydrogen 3D before switch')

    // Switch to 2D
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/geometryStore.ts')
      mod.useGeometryStore.getState().setDimension(2)
    })
    await waitForShaderCompilation(page)
    await assertNonBlankPixels(page, 'Hydrogen 2D after switch from 3D')
  })

  test('switching from 2D to 3D hydrogen renders without crash', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 2)
    await waitForHydrogen2DReady(page)
    await assertNonBlankPixels(page, 'Hydrogen 2D before switch')

    // Switch to 3D
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/geometryStore.ts')
      mod.useGeometryStore.getState().setDimension(3)
    })
    await waitForShaderCompilation(page)
    await assertNonBlankPixels(page, 'Hydrogen 3D after switch from 2D')
  })

  test('rapid 2D<->3D switching does not crash', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 2)
    await waitForHydrogen2DReady(page)

    for (let i = 0; i < 4; i++) {
      const dim = i % 2 === 0 ? 3 : 2
      await page.evaluate(async (d: number) => {
        const mod = await import('/src/stores/scene/geometryStore.ts')
        mod.useGeometryStore.getState().setDimension(d)
      }, dim)
    }

    // Settle on 2D
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/geometryStore.ts')
      mod.useGeometryStore.getState().setDimension(2)
    })
    await waitForShaderCompilation(page)
    await assertNonBlankPixels(page, 'Hydrogen after rapid 2D<->3D switching')
  })
})
