/**
 * Comprehensive physics rendering coverage.
 *
 * Systematically exercises quantum modes × dimensions × quantum numbers
 * to verify that the GPU shader produces non-blank, physically distinct
 * output for every valid parameter combination.
 *
 * This is NOT a pixel-perfect golden-image test. It verifies:
 * 1. The shader compiles and renders (no WGSL errors, no blank frames)
 * 2. Different quantum states produce visually different output
 * 3. Higher dimensions don't crash or produce degenerate output
 * 4. Edge-case quantum numbers (l=0, l=n-1, m=±l) render correctly
 *
 * Run: npx playwright test scripts/playwright/physics-coverage.spec.ts --workers=1
 */

import { expect, test } from '@playwright/test'

import {
  collectFatalGpuErrors,
  expectCanvasNotBlank,
  capturePixelSnapshot,
  expectSnapshotsDiffer,
  gotoMode,
  hasWebGPU,
  waitForRendererReady,
  waitForShaderCompilation,
  waitForUniformUpdate,
} from './helpers/app-helpers'

test.setTimeout(180_000)

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Set hydrogen quantum numbers via store injection. */
async function setHydrogenQuantumNumbers(
  page: import('@playwright/test').Page,
  n: number,
  l: number,
  m: number
) {
  await page.evaluate(
    async ({ n, l, m }: { n: number; l: number; m: number }) => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const store = mod.useExtendedObjectStore.getState()
      store.setSchroedingerPrincipalQuantumNumber(n)
      store.setSchroedingerAzimuthalQuantumNumber(l)
      store.setSchroedingerMagneticQuantumNumber(m)
    },
    { n, l, m }
  )
}

/** Set HO superposition term count via store injection. */
async function setTermCount(page: import('@playwright/test').Page, count: number) {
  await page.evaluate(async (tc: number) => {
    const mod = await import('/src/stores/extendedObjectStore.ts')
    mod.useExtendedObjectStore.getState().setSchroedingerTermCount(tc)
  }, count)
}

/** Pause animation to get deterministic snapshots. */
async function pauseAnimation(page: import('@playwright/test').Page) {
  await page.evaluate(async () => {
    const mod = await import('/src/stores/animationStore.ts')
    const store = mod.useAnimationStore.getState()
    if (store.isPlaying) store.toggle()
  })
}

/** Navigate to mode, wait for render, pause animation, verify non-blank. */
async function setupMode(
  page: import('@playwright/test').Page,
  mode: string,
  dim: number,
  gpuErrors: string[]
) {
  await gotoMode(page, mode, dim)
  await waitForRendererReady(page)
  await waitForShaderCompilation(page)
  await pauseAnimation(page)
  await expectCanvasNotBlank(page)
  expect(gpuErrors, `${mode} ${dim}D: no fatal GPU errors after setup`).toEqual([])
}

// ─── HO Mode: Dimension Gap Coverage ────────────────────────────────────────
// rendering.spec.ts covers HO 3D, 5D, 11D. Fill the gaps.

test.describe('HO mode: dimension gap coverage', () => {
  const dimensions = [2, 4, 6, 7, 8, 9, 10]

  for (const dim of dimensions) {
    test(`HO ${dim}D: renders non-blank with no GPU errors`, async ({ page }) => {
      await page.goto('/')
      test.skip(!(await hasWebGPU(page)), 'WebGPU not available')
      const gpuErrors = collectFatalGpuErrors(page)

      await setupMode(page, 'harmonicOscillator', dim, gpuErrors)
    })
  }
})

// ─── HO Mode: Superposition Terms ───────────────────────────────────────────

test.describe('HO mode: superposition terms', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    test.skip(!(await hasWebGPU(page)), 'WebGPU not available')
  })

  const termCounts = [1, 2, 4, 8]

  for (const tc of termCounts) {
    test(`HO 3D with ${tc} superposition terms renders non-blank`, async ({ page }) => {
      const gpuErrors = collectFatalGpuErrors(page)
      await setupMode(page, 'harmonicOscillator', 3, gpuErrors)
      await setTermCount(page, tc)
      // Term count change doesn't trigger shader recompilation in all cases,
      // but the uniform is updated. Wait a few frames for the new state to render.
      await waitForUniformUpdate(page)
      await expectCanvasNotBlank(page)
      expect(gpuErrors).toEqual([])
    })
  }

  test('different term counts produce different images', async ({ page }) => {
    const gpuErrors = collectFatalGpuErrors(page)
    await setupMode(page, 'harmonicOscillator', 3, gpuErrors)

    await setTermCount(page, 1)
    await waitForUniformUpdate(page)
    const snap1 = await capturePixelSnapshot(page)

    await setTermCount(page, 4)
    await waitForUniformUpdate(page)
    const snap4 = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snap1, snap4, '1 term vs 4 terms must differ')
    expect(gpuErrors).toEqual([])
  })
})

// ─── Hydrogen Mode: Dimension Gap Coverage ──────────────────────────────────
// rendering.spec.ts covers Hydrogen 3D, 4D, 5D, 7D, 11D. Fill the gaps.

test.describe('hydrogen mode: dimension gap coverage', () => {
  const dimensions = [6, 8, 9, 10]

  for (const dim of dimensions) {
    test(`Hydrogen ${dim}D: renders non-blank with no GPU errors`, async ({ page }) => {
      await page.goto('/')
      test.skip(!(await hasWebGPU(page)), 'WebGPU not available')
      const gpuErrors = collectFatalGpuErrors(page)

      await setupMode(page, 'hydrogenND', dim, gpuErrors)
    })
  }
})

// ─── Hydrogen Mode: Quantum Number Coverage ─────────────────────────────────

test.describe('hydrogen mode: quantum number coverage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    test.skip(!(await hasWebGPU(page)), 'WebGPU not available')
  })

  // Test representative (n, l, m) combinations covering:
  // - s orbital (l=0): spherically symmetric
  // - p orbitals (l=1): three orientations
  // - d orbitals (l=2): five orientations
  // - f orbitals (l=3): seven orientations
  // - Edge case: l=n-1 (maximum angular momentum)
  // - Edge case: m=±l (maximum magnetic quantum number)
  // - High n (n=5,6,7): more radial nodes, larger orbital extent
  const quantumNumbers = [
    // s orbitals
    { n: 1, l: 0, m: 0, label: '1s' },
    { n: 2, l: 0, m: 0, label: '2s' },
    { n: 3, l: 0, m: 0, label: '3s' },
    // p orbitals
    { n: 2, l: 1, m: 0, label: '2p (m=0)' },
    { n: 2, l: 1, m: 1, label: '2p (m=+1)' },
    { n: 2, l: 1, m: -1, label: '2p (m=-1)' },
    { n: 3, l: 1, m: 0, label: '3p' },
    // d orbitals
    { n: 3, l: 2, m: 0, label: '3d (m=0)' },
    { n: 3, l: 2, m: 2, label: '3d (m=+2, edge)' },
    { n: 3, l: 2, m: -2, label: '3d (m=-2, edge)' },
    // f orbital
    { n: 4, l: 3, m: 0, label: '4f (m=0)' },
    { n: 4, l: 3, m: 3, label: '4f (m=+3, edge)' },
    // High n — stresses normalization, radial polynomial degree
    { n: 5, l: 0, m: 0, label: '5s (high n)' },
    { n: 5, l: 4, m: 0, label: '5g (l=n-1, max angular momentum)' },
    { n: 6, l: 2, m: 1, label: '6d (high n, mid l)' },
    { n: 7, l: 0, m: 0, label: '7s (max n, s orbital)' },
    { n: 7, l: 6, m: 0, label: '7i (max n, max l)' },
    { n: 7, l: 6, m: 6, label: '7i (max n, max l, max m)' },
    { n: 7, l: 6, m: -6, label: '7i (max n, max l, min m)' },
  ]

  for (const { n, l, m, label } of quantumNumbers) {
    test(`Hydrogen 3D ${label} (n=${n},l=${l},m=${m}): renders non-blank`, async ({ page }) => {
      const gpuErrors = collectFatalGpuErrors(page)
      await setupMode(page, 'hydrogenND', 3, gpuErrors)
      await setHydrogenQuantumNumbers(page, n, l, m)
      await waitForUniformUpdate(page)
      await expectCanvasNotBlank(page)
      expect(gpuErrors).toEqual([])
    })
  }

  // Verify that different orbitals look different
  test('1s vs 2p vs 3d produce visually distinct orbitals', async ({ page }) => {
    const gpuErrors = collectFatalGpuErrors(page)
    await setupMode(page, 'hydrogenND', 3, gpuErrors)

    await setHydrogenQuantumNumbers(page, 1, 0, 0)
    await waitForUniformUpdate(page)
    const snap1s = await capturePixelSnapshot(page)

    await setHydrogenQuantumNumbers(page, 2, 1, 0)
    await waitForUniformUpdate(page)
    const snap2p = await capturePixelSnapshot(page)

    await setHydrogenQuantumNumbers(page, 3, 2, 0)
    await waitForUniformUpdate(page)
    const snap3d = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snap1s, snap2p, '1s vs 2p must differ')
    expectSnapshotsDiffer(snap2p, snap3d, '2p vs 3d must differ')
    expectSnapshotsDiffer(snap1s, snap3d, '1s vs 3d must differ')
    expect(gpuErrors).toEqual([])
  })
})

// ─── Hydrogen ND: Quantum Numbers in Higher Dimensions ──────────────────────

test.describe('hydrogen ND: quantum numbers in higher dimensions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    test.skip(!(await hasWebGPU(page)), 'WebGPU not available')
  })

  // Higher dimensions shift the effective angular momentum:
  //   λ = l + (D-3)/2, nEff = n + (D-3)/2
  // This changes normalization and radial extent. Test that the shader handles
  // all valid combinations without NaN/Inf or blank output.
  const hdScenarios = [
    // Even dimensions (integer lambda)
    { dim: 4, n: 2, l: 1, m: 0, label: '4D n=2,l=1 (λ=1.5)' },
    { dim: 4, n: 3, l: 2, m: 0, label: '4D n=3,l=2 (λ=2.5)' },
    { dim: 6, n: 3, l: 0, m: 0, label: '6D n=3,l=0 (λ=1.5)' },
    { dim: 6, n: 5, l: 4, m: 0, label: '6D n=5,l=4 (λ=5.5)' },
    // Odd dimensions (half-integer lambda, uses pow instead of iterative mul)
    { dim: 5, n: 2, l: 1, m: 0, label: '5D n=2,l=1 (λ=2, int)' },
    { dim: 5, n: 4, l: 3, m: 0, label: '5D n=4,l=3 (λ=4, int)' },
    { dim: 7, n: 3, l: 2, m: 1, label: '7D n=3,l=2 (λ=4, int)' },
    { dim: 7, n: 7, l: 6, m: 0, label: '7D n=7,l=6 (λ=8, max stress)' },
    // Max dimension
    { dim: 9, n: 3, l: 1, m: 0, label: '9D n=3,l=1' },
    { dim: 11, n: 2, l: 1, m: 0, label: '11D n=2,l=1' },
    { dim: 11, n: 5, l: 3, m: 2, label: '11D n=5,l=3,m=2 (heavy extra-dim HO)' },
    { dim: 11, n: 7, l: 6, m: 6, label: '11D n=7,l=6,m=6 (max everything)' },
  ]

  for (const { dim, n, l, m, label } of hdScenarios) {
    test(`Hydrogen ${label}: renders non-blank`, async ({ page }) => {
      const gpuErrors = collectFatalGpuErrors(page)
      await setupMode(page, 'hydrogenND', dim, gpuErrors)
      await setHydrogenQuantumNumbers(page, n, l, m)
      await waitForUniformUpdate(page)
      await expectCanvasNotBlank(page)
      expect(gpuErrors).toEqual([])
    })
  }

  test('Hydrogen 5D: different n values produce different images', async ({ page }) => {
    const gpuErrors = collectFatalGpuErrors(page)
    await setupMode(page, 'hydrogenND', 5, gpuErrors)

    await setHydrogenQuantumNumbers(page, 1, 0, 0)
    await waitForUniformUpdate(page)
    const snapN1 = await capturePixelSnapshot(page)

    await setHydrogenQuantumNumbers(page, 3, 0, 0)
    await waitForUniformUpdate(page)
    const snapN3 = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapN1, snapN3, '5D n=1 vs n=3 must differ')
    expect(gpuErrors).toEqual([])
  })
})

// ─── HO Mode: Max Dimension with Superposition ──────────────────────────────

test.describe('HO mode: extreme configurations', () => {
  test('HO 11D with 4 superposition terms renders non-blank', async ({ page }) => {
    await page.goto('/')
    test.skip(!(await hasWebGPU(page)), 'WebGPU not available')
    const gpuErrors = collectFatalGpuErrors(page)
    await setupMode(page, 'harmonicOscillator', 11, gpuErrors)
    await setTermCount(page, 4)
    await waitForUniformUpdate(page)
    await expectCanvasNotBlank(page)
    expect(gpuErrors).toEqual([])
  })
})
