/**
 * Differential rendering tests.
 *
 * These tests verify that configuration changes actually affect the rendered
 * output by capturing pixel snapshots before and after a change and asserting
 * they differ. This catches the class of bugs where a UI control updates the
 * store but the value never reaches the GPU shader.
 *
 * Every test answers: "If I change X, does the rendered image change?"
 *
 * Bugs caught:
 * - Mode switch silently fails — old pipeline keeps rendering
 * - Dimension change doesn't propagate to shader uniforms
 * - Quantum number slider updates store but uniform buffer is stale
 * - Post-processing pass wired to graph but never executes
 * - Animation time uniform not advancing (frozen frame)
 * - Cross-section toggle not reaching the shader
 */

import { expect, test } from '@playwright/test'

import {
  capturePixelSnapshot,
  expectSnapshotsDiffer,
  gotoMode,
  requireWebGPU,
  snapshotDistance,
  waitForAppLoaded,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.setTimeout(120_000)

test.describe('differential rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('different quantum modes produce different images', async ({ page }) => {
    // HO 3D
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    const hoSnap = await capturePixelSnapshot(page)

    // Hydrogen 3D
    await gotoMode(page, 'hydrogenND', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    const hydrogenSnap = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(hoSnap, hydrogenSnap, 'HO vs Hydrogen must differ')
  })

  test('different dimensions produce different images', async ({ page }) => {
    // HO 3D
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    const snap3D = await capturePixelSnapshot(page)

    // HO 7D
    await gotoMode(page, 'harmonicOscillator', 7)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    const snap7D = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snap3D, snap7D, '3D vs 7D must differ')
  })

  test('hydrogen quantum numbers change the rendered orbital', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // Set n=1, l=0 (1s orbital — spherical)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const store = mod.useExtendedObjectStore.getState()
      store.setSchroedingerPrincipalQuantumNumber(1)
      store.setSchroedingerAzimuthalQuantumNumber(0)
    })
    await waitForShaderCompilation(page)
    const snap1s = await capturePixelSnapshot(page)

    // Set n=3, l=2 (3d orbital — clover shape)
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      const store = mod.useExtendedObjectStore.getState()
      store.setSchroedingerPrincipalQuantumNumber(3)
      store.setSchroedingerAzimuthalQuantumNumber(2)
      store.setSchroedingerMagneticQuantumNumber(0)
    })
    await waitForShaderCompilation(page)
    const snap3d = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snap1s, snap3d, '1s vs 3d orbital must differ')
  })

  test('animation produces frame-to-frame pixel change', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // Ensure animation is playing at max speed for visible change
    await page.evaluate(async () => {
      const mod = await import('/src/stores/animationStore.ts')
      const store = mod.useAnimationStore.getState()
      if (!store.isPlaying) store.toggle()
      store.setSpeed(5.0) // fast animation
    })

    const snapA = await capturePixelSnapshot(page)

    // Wait many frames for animation to produce a visually distinct state
    await page.waitForFunction(
      (startCount: number) => {
        const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
        const count = parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10)
        return count > startCount + 30
      },
      await page.evaluate(() => {
        const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
        return parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10)
      }),
      { timeout: 15_000 }
    )

    const snapB = await capturePixelSnapshot(page)

    // Animation changes are subtle (phase oscillation). Any measurable
    // pixel difference proves the time uniform is advancing.
    const dist = snapshotDistance(snapA, snapB)
    expect(
      dist,
      `Animation must produce pixel change (distance=${dist.toFixed(2)})`
    ).toBeGreaterThan(0.1)
  })

  test('bloom toggle changes the rendered image', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // Pause animation to isolate bloom effect
    await page.evaluate(async () => {
      const mod = await import('/src/stores/animationStore.ts')
      if (mod.useAnimationStore.getState().isPlaying) mod.useAnimationStore.getState().toggle()
    })

    // Disable bloom completely
    await page.evaluate(async () => {
      const mod = await import('/src/stores/postProcessingStore.ts')
      mod.usePostProcessingStore.getState().setBloomEnabled(false)
    })
    await waitForShaderCompilation(page)
    const snapNoBloom = await capturePixelSnapshot(page)

    // Enable bloom with extreme gain + low threshold for maximum visual difference
    await page.evaluate(async () => {
      const mod = await import('/src/stores/postProcessingStore.ts')
      const store = mod.usePostProcessingStore.getState()
      store.setBloomEnabled(true)
      store.setBloomGain(5.0)
      store.setBloomThreshold(0.1)
      store.setBloomRadius(1.0)
    })
    await waitForShaderCompilation(page)
    const snapBloom = await capturePixelSnapshot(page)

    // Bloom is a post-processing glow — can be subtle depending on the scene.
    // Use a lower threshold since the effect adds soft light around bright areas.
    const dist = snapshotDistance(snapNoBloom, snapBloom)
    expect(
      dist,
      `Bloom on vs off must produce pixel change (distance=${dist.toFixed(2)})`
    ).toBeGreaterThan(0.05)
  })

  test('cross-section toggle changes the rendered image', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // Pause animation
    await page.evaluate(async () => {
      const mod = await import('/src/stores/animationStore.ts')
      if (mod.useAnimationStore.getState().isPlaying) mod.useAnimationStore.getState().toggle()
    })

    // Disable cross-section
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerCrossSectionEnabled(false)
    })
    await waitForShaderCompilation(page)
    const snapNoCross = await capturePixelSnapshot(page)

    // Enable cross-section
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerCrossSectionEnabled(true)
    })
    await waitForShaderCompilation(page)
    const snapCross = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(snapNoCross, snapCross, 'Cross-section on vs off must differ')
  })

  test('TDSE vs BEC produce different images at same dimension', async ({ page }) => {
    // TDSE 3D
    await gotoMode(page, 'tdseDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    const tdseSnap = await capturePixelSnapshot(page)

    // BEC 3D
    await gotoMode(page, 'becDynamics', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    const becSnap = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(tdseSnap, becSnap, 'TDSE vs BEC must differ')
  })

  test('position vs momentum representation produce different images', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // Pause animation for deterministic snapshots
    await page.evaluate(async () => {
      const mod = await import('/src/stores/animationStore.ts')
      if (mod.useAnimationStore.getState().isPlaying) mod.useAnimationStore.getState().toggle()
    })

    // Position (default)
    const positionSnap = await capturePixelSnapshot(page)

    // Switch to momentum
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerRepresentation('momentum')
    })
    await waitForShaderCompilation(page)
    const momentumSnap = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(positionSnap, momentumSnap, 'Position vs Momentum must differ')
  })

  test('position vs wigner representation produce different images', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // Pause animation for deterministic snapshots
    await page.evaluate(async () => {
      const mod = await import('/src/stores/animationStore.ts')
      if (mod.useAnimationStore.getState().isPlaying) mod.useAnimationStore.getState().toggle()
    })

    // Position (default)
    const positionSnap = await capturePixelSnapshot(page)

    // Switch to wigner
    await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerRepresentation('wigner')
    })
    await waitForShaderCompilation(page)
    const wignerSnap = await capturePixelSnapshot(page)

    expectSnapshotsDiffer(positionSnap, wignerSnap, 'Position vs Wigner must differ')
  })
})
