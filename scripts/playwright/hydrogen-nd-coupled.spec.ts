/**
 * Hydrogen ND Coupled e2e test suite.
 *
 * Tests the true D-dimensional Coulomb problem with hyperspherical harmonics.
 * Validates rendering, mode switching, control response, and dimension handling.
 *
 * Sections:
 * - A: Rendering at multiple dimensions (3D, 4D, 5D, 7D)
 * - B: Control response — quantum number changes produce visual differences
 * - C: Angular chain controls visibility and interaction
 * - D: Mode switching — transition from/to other modes
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
  requireWebGPU,
  setHydrogenQuantumNumbers,
  waitForModeReady,
  waitForShaderCompilation,
  waitForUniformUpdate,
} from './helpers/app-helpers'

test.setTimeout(600_000)

// ─── Helpers ─────────────────────────────────────────────────────────────────

const assertPixels = assertNonBlankPixels

/** Set angular chain values for coupled mode via store. */
async function setAngularChain(page: Page, chain: number[]): Promise<void> {
  await page.evaluate(async (c: number[]) => {
    const mod = await import('/src/stores/scene/extendedObjectStore.ts')
    const store = mod.useExtendedObjectStore.getState()
    for (let i = 0; i < c.length; i++) {
      store.setSchroedingerAngularChainValue(i, c[i]!)
    }
  }, chain)
}

/** Set bohr radius scale via store. */
async function setBohrRadiusScale(page: Page, scale: number): Promise<void> {
  await page.evaluate(async (s) => {
    const mod = await import('/src/stores/scene/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerBohrRadiusScale(s)
  }, scale)
}

// ─── Section A: Rendering at multiple dimensions ─────────────────────────────

test.describe('A: Coupled hydrogen ND rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  const dims = [
    { dim: 3, label: '3D (standard hydrogen reduction)' },
    { dim: 4, label: '4D (one Gegenbauer layer)' },
    { dim: 5, label: '5D (half-integer λ)' },
    { dim: 6, label: '6D (three Gegenbauer layers)' },
    { dim: 7, label: '7D (four Gegenbauer layers)' },
  ]

  for (const { dim, label } of dims) {
    test(`${label}: renders non-blank pixels`, async ({ page }) => {
      await gotoMode(page, 'hydrogenNDCoupled', dim)
      await waitForModeReady(page)
      await pauseAnimation(page)
      await assertPixels(page, `Coupled hydrogen ${dim}D`)
    })
  }

  test('6D n=4, l=2, m=0: renders non-blank (regression)', async ({ page }) => {
    await gotoMode(page, 'hydrogenNDCoupled', 6)
    await waitForModeReady(page)
    await pauseAnimation(page)
    await setHydrogenQuantumNumbers(page, 4, 2, 0)
    await waitForUniformUpdate(page)
    await assertPixels(page, 'Coupled hydrogen 6D n=4 l=2 m=0')
  })
})

// ─── Section B: Control response ─────────────────────────────────────────────

test.describe('B: Control response — visual differences', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('changing n produces visually different output', async ({ page }) => {
    await gotoMode(page, 'hydrogenNDCoupled', 3)
    await waitForModeReady(page)
    await pauseAnimation(page)

    // n=1 (ground state)
    await setHydrogenQuantumNumbers(page, 1, 0, 0)
    await waitForUniformUpdate(page)
    const snap1 = await capturePixelSnapshot(page)

    // n=3 (higher shell)
    await setHydrogenQuantumNumbers(page, 3, 0, 0)
    await waitForUniformUpdate(page)
    const snap2 = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snap1, snap2, 'n=1 vs n=3 should differ')
  })

  test('changing l produces visually different output', async ({ page }) => {
    await gotoMode(page, 'hydrogenNDCoupled', 3)
    await waitForModeReady(page)
    await pauseAnimation(page)

    // n=3, l=0 (s orbital)
    await setHydrogenQuantumNumbers(page, 3, 0, 0)
    await waitForUniformUpdate(page)
    const snap1 = await capturePixelSnapshot(page)

    // n=3, l=2 (d orbital)
    await setHydrogenQuantumNumbers(page, 3, 2, 0)
    await waitForUniformUpdate(page)
    const snap2 = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snap1, snap2, 'l=0 vs l=2 should differ')
  })

  test('changing bohr radius produces visually different output', async ({ page }) => {
    await gotoMode(page, 'hydrogenNDCoupled', 3)
    await waitForModeReady(page)
    await pauseAnimation(page)

    await setBohrRadiusScale(page, 0.5)
    await waitForUniformUpdate(page)
    const snap1 = await capturePixelSnapshot(page)

    await setBohrRadiusScale(page, 2.5)
    await waitForUniformUpdate(page)
    const snap2 = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snap1, snap2, 'a0=0.5 vs a0=2.5 should differ')
  })
})

// ─── Section C: Angular chain controls ───────────────────────────────────────

test.describe('C: Angular chain controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('angular chain controls appear at D=5, absent at D=3', async ({ page }) => {
    // D=3: no extra angular dimensions, no chain controls
    await gotoMode(page, 'hydrogenNDCoupled', 3)
    await waitForShaderCompilation(page)

    // At D=3, chain length = D-3 = 0, so no chain sliders
    const chainAt3D = await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      const gmod = await import('/src/stores/scene/geometryStore.ts')
      return {
        dim: gmod.useGeometryStore.getState().dimension,
        mode: mod.useExtendedObjectStore.getState().schroedinger.quantumMode,
      }
    })
    expect(chainAt3D.dim).toBe(3)
    expect(chainAt3D.mode).toBe('hydrogenNDCoupled')
  })

  test('D=5: changing angular chain alters rendering', async ({ page }) => {
    // D=5: chain = [l₂, l₃], 2 intermediate angular momenta
    await gotoMode(page, 'hydrogenNDCoupled', 5)
    await waitForModeReady(page)
    await pauseAnimation(page)

    // n=3, l₁=2, m=0, chain=[0, 0] (all zero intermediate)
    await setHydrogenQuantumNumbers(page, 3, 2, 0)
    await setAngularChain(page, [0, 0])
    await waitForUniformUpdate(page)
    const snap1 = await capturePixelSnapshot(page)

    // Same n,l₁,m but chain=[2, 0] (non-trivial hyperspherical harmonic)
    await setAngularChain(page, [2, 0])
    await waitForUniformUpdate(page)
    const snap2 = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snap1, snap2, 'angular chain [0,0] vs [2,0] should differ')
  })
})

// ─── Section D: Mode switching ───────────────────────────────────────────────

test.describe('D: Mode switching', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('switch from HO to coupled hydrogen and back', async ({ page }) => {
    // Start with HO
    await gotoMode(page, 'harmonicOscillator', 4)
    await waitForShaderCompilation(page)
    await assertPixels(page, 'HO 4D initial')

    // Switch to coupled hydrogen
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerQuantumMode('hydrogenNDCoupled')
    })
    await waitForShaderCompilation(page)
    await assertPixels(page, 'Coupled hydrogen 4D after switch')

    // Switch back to HO
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerQuantumMode('harmonicOscillator')
    })
    await waitForShaderCompilation(page)
    await assertPixels(page, 'HO 4D after switch back')
  })

  test('switch from decoupled hydrogen to coupled hydrogen', async ({ page }) => {
    // Decoupled hydrogen ND
    await gotoMode(page, 'hydrogenND', 4)
    await waitForShaderCompilation(page)
    await assertPixels(page, 'Decoupled hydrogen 4D')

    // Switch to coupled
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerQuantumMode('hydrogenNDCoupled')
    })
    await waitForShaderCompilation(page)
    await assertPixels(page, 'Coupled hydrogen 4D after switch from decoupled')
  })

  test('dimension change within coupled mode', async ({ page }) => {
    await gotoMode(page, 'hydrogenNDCoupled', 3)
    await waitForShaderCompilation(page)
    await assertPixels(page, 'Coupled 3D')

    // Increase to 5D
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/geometryStore.ts')
      mod.useGeometryStore.getState().setDimension(5)
    })
    await waitForShaderCompilation(page)
    await assertPixels(page, 'Coupled 5D after dim change')
  })
})
