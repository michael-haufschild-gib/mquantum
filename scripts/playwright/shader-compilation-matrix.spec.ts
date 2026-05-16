/**
 * Shader compilation matrix — systematic verification of every shader-affecting toggle.
 *
 * Each test enables a feature that changes the compiled shader (representation mode,
 * post-processing pass, rendering variant) and verifies:
 * 1. No WGSL compilation errors or GPU validation errors
 * 2. Shader compilation completes (data-pipeline-gen increments)
 * 3. Canvas renders non-blank pixels (GPU buffer readback)
 *
 * This catches bugs where a shader variant compiles in isolation but fails when
 * combined with the active quantum mode, or where a feature toggle path is dead
 * (store updates but never reaches the shader).
 *
 * Bugs this catches that other specs don't:
 * - Momentum representation shader has unresolved WGSL symbol
 * - Wigner representation shader fails with non-3D dimension
 * - SMAA pass shader has bind group mismatch after refactor
 * - Paper texture shader uses removed uniform field
 * - Cross-section shader variant doesn't compile with hydrogen mode
 * - Open quantum shader blocks have syntax error in Lindblad operator
 * - Temporal accumulation path has stale bind group layout
 *
 * Run: pnpm exec playwright test scripts/playwright/shader-compilation-matrix.spec.ts --workers=1
 */

import { test } from './fixtures'
import {
  expectCanvasNotBlank,
  gotoMode,
  requireWebGPU,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

// Force serial — GPU tests must not overlap.
test.describe.configure({ mode: 'serial' })

// Shader compilation can take 10-30s per variant; total budget for all tests.
test.setTimeout(180_000)

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Toggle a feature via store injection, wait for recompilation, verify health. */
async function verifyShaderPath(
  page: import('@playwright/test').Page,
  label: string,
  toggleFn: () => Promise<void>
): Promise<void> {
  await toggleFn()
  await waitForShaderCompilation(page)
  await expectCanvasNotBlank(page)
}

// ─── Representation Modes ─────────────────────────────────────────────────────

test.describe('representation mode shader paths', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('momentum representation: compiles and renders (HO 3D)', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await verifyShaderPath(page, 'momentum', async () => {
      await page.evaluate(async () => {
        const mod = await import('/src/stores/scene/extendedObjectStore.ts')
        mod.useExtendedObjectStore.getState().setSchroedingerRepresentation('momentum')
      })
    })
  })

  test('wigner representation: compiles and renders (HO 3D)', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await verifyShaderPath(page, 'wigner', async () => {
      await page.evaluate(async () => {
        const mod = await import('/src/stores/scene/extendedObjectStore.ts')
        mod.useExtendedObjectStore.getState().setSchroedingerRepresentation('wigner')
      })
    })
  })

  test('momentum representation: compiles with hydrogen 3D', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await verifyShaderPath(page, 'hydrogen momentum', async () => {
      await page.evaluate(async () => {
        const mod = await import('/src/stores/scene/extendedObjectStore.ts')
        mod.useExtendedObjectStore.getState().setSchroedingerRepresentation('momentum')
      })
    })
  })

  test('wigner representation: compiles with hydrogen 5D', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 5)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await verifyShaderPath(page, 'hydrogen 5D wigner', async () => {
      await page.evaluate(async () => {
        const mod = await import('/src/stores/scene/extendedObjectStore.ts')
        mod.useExtendedObjectStore.getState().setSchroedingerRepresentation('wigner')
      })
    })
  })
})

// ─── Post-Processing Passes ───────────────────────────────────────────────────

test.describe('post-processing shader paths', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
  })

  test('SMAA anti-aliasing: compiles and renders', async ({ page }) => {
    await verifyShaderPath(page, 'SMAA', async () => {
      await page.evaluate(async () => {
        const mod = await import('/src/stores/scene/postProcessingStore.ts')
        mod.usePostProcessingStore.getState().setAntiAliasingMethod('smaa')
      })
    })
  })

  test('FXAA anti-aliasing: compiles and renders', async ({ page }) => {
    await verifyShaderPath(page, 'FXAA', async () => {
      await page.evaluate(async () => {
        const mod = await import('/src/stores/scene/postProcessingStore.ts')
        mod.usePostProcessingStore.getState().setAntiAliasingMethod('fxaa')
      })
    })
  })

  test('cinematic effects: compiles and renders', async ({ page }) => {
    await verifyShaderPath(page, 'cinematic', async () => {
      await page.evaluate(async () => {
        const mod = await import('/src/stores/scene/postProcessingStore.ts')
        const store = mod.usePostProcessingStore.getState()
        store.setCinematicEnabled(true)
        store.setCinematicAberration(0.5)
        store.setCinematicVignette(0.5)
        store.setCinematicGrain(0.3)
      })
    })
  })

  test('paper texture: compiles and renders', async ({ page }) => {
    await verifyShaderPath(page, 'paper texture', async () => {
      await page.evaluate(async () => {
        const mod = await import('/src/stores/scene/postProcessingStore.ts')
        mod.usePostProcessingStore.getState().setPaperEnabled(true)
      })
    })
  })

  test('tone mapping enabled: compiles and renders', async ({ page }) => {
    await verifyShaderPath(page, 'tone mapping', async () => {
      await page.evaluate(async () => {
        const mod = await import('/src/stores/scene/lightingStore.ts')
        mod.useLightingStore.getState().setToneMappingEnabled(true)
      })
    })
  })

  test('frame blending enabled: compiles and renders', async ({ page }) => {
    await verifyShaderPath(page, 'frame blending', async () => {
      await page.evaluate(async () => {
        const mod = await import('/src/stores/scene/postProcessingStore.ts')
        mod.usePostProcessingStore.getState().setFrameBlendingEnabled(true)
      })
    })
  })
})

// ─── Rendering Variants ───────────────────────────────────────────────────────

test.describe('rendering variant shader paths', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('cross-section enabled: compiles and renders (HO 3D)', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await verifyShaderPath(page, 'cross-section HO', async () => {
      await page.evaluate(async () => {
        const mod = await import('/src/stores/scene/extendedObjectStore.ts')
        mod.useExtendedObjectStore.getState().setSchroedingerCrossSectionEnabled(true)
      })
    })
  })

  test('cross-section enabled: compiles and renders (hydrogen 3D)', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await verifyShaderPath(page, 'cross-section hydrogen', async () => {
      await page.evaluate(async () => {
        const mod = await import('/src/stores/scene/extendedObjectStore.ts')
        mod.useExtendedObjectStore.getState().setSchroedingerCrossSectionEnabled(true)
      })
    })
  })

  test('open quantum (decoherence) enabled: compiles and renders (HO 3D)', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await verifyShaderPath(page, 'open quantum', async () => {
      await page.evaluate(async () => {
        const mod = await import('/src/stores/scene/extendedObjectStore.ts')
        mod.useExtendedObjectStore.getState().setOpenQuantumEnabled(true)
      })
    })
  })

  test('temporal reprojection enabled: compiles and renders', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await verifyShaderPath(page, 'temporal reprojection', async () => {
      await page.evaluate(async () => {
        const mod = await import('/src/stores/runtime/performanceStore.ts')
        mod.usePerformanceStore.getState().setTemporalReprojectionEnabled(true)
      })
    })
  })
})

// ─── Combined Paths (highest risk for shader conflicts) ───────────────────────

test.describe('combined shader paths', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('momentum + bloom + SMAA: all compile together', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await page.evaluate(async () => {
      const extMod = await import('/src/stores/scene/extendedObjectStore.ts')
      extMod.useExtendedObjectStore.getState().setSchroedingerRepresentation('momentum')

      const ppMod = await import('/src/stores/scene/postProcessingStore.ts')
      const ppStore = ppMod.usePostProcessingStore.getState()
      ppStore.setBloomEnabled(true)
      ppStore.setAntiAliasingMethod('smaa')
    })
    await waitForShaderCompilation(page)

    await expectCanvasNotBlank(page)
  })

  test('cross-section + wigner + cinematic: all compile together', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await page.evaluate(async () => {
      const extMod = await import('/src/stores/scene/extendedObjectStore.ts')
      const extStore = extMod.useExtendedObjectStore.getState()
      extStore.setSchroedingerRepresentation('wigner')
      extStore.setSchroedingerCrossSectionEnabled(true)

      const ppMod = await import('/src/stores/scene/postProcessingStore.ts')
      const ppStore = ppMod.usePostProcessingStore.getState()
      ppStore.setCinematicEnabled(true)
      ppStore.setCinematicAberration(0.3)
    })
    await waitForShaderCompilation(page)

    await expectCanvasNotBlank(page)
  })

  test('open quantum + paper texture: compile together', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await page.evaluate(async () => {
      const extMod = await import('/src/stores/scene/extendedObjectStore.ts')
      extMod.useExtendedObjectStore.getState().setOpenQuantumEnabled(true)

      const ppMod = await import('/src/stores/scene/postProcessingStore.ts')
      ppMod.usePostProcessingStore.getState().setPaperEnabled(true)
    })
    await waitForShaderCompilation(page)

    await expectCanvasNotBlank(page)
  })

  test('high-dimension + temporal + bloom: compile together (HO 9D)', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 9)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    await page.evaluate(async () => {
      const perfMod = await import('/src/stores/runtime/performanceStore.ts')
      perfMod.usePerformanceStore.getState().setTemporalReprojectionEnabled(true)

      const ppMod = await import('/src/stores/scene/postProcessingStore.ts')
      ppMod.usePostProcessingStore.getState().setBloomEnabled(true)
    })
    await waitForShaderCompilation(page)

    await expectCanvasNotBlank(page)
  })

  test('kitchen sink: all post-processing enabled simultaneously', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // Enable every toggleable post-processing feature at once.
    // This exercises maximum bind group pressure, resource allocation,
    // and pass graph complexity — the highest-risk configuration.
    await page.evaluate(async () => {
      const extMod = await import('/src/stores/scene/extendedObjectStore.ts')
      const extStore = extMod.useExtendedObjectStore.getState()
      extStore.setSchroedingerRepresentation('momentum')
      extStore.setSchroedingerCrossSectionEnabled(true)
      extStore.setOpenQuantumEnabled(true)

      const ppMod = await import('/src/stores/scene/postProcessingStore.ts')
      const ppStore = ppMod.usePostProcessingStore.getState()
      ppStore.setBloomEnabled(true)
      ppStore.setAntiAliasingMethod('smaa')
      ppStore.setCinematicEnabled(true)
      ppStore.setCinematicAberration(0.5)
      ppStore.setCinematicVignette(0.5)
      ppStore.setCinematicGrain(0.3)
      ppStore.setPaperEnabled(true)
      ppStore.setFrameBlendingEnabled(true)

      const lightMod = await import('/src/stores/scene/lightingStore.ts')
      lightMod.useLightingStore.getState().setToneMappingEnabled(true)

      const perfMod = await import('/src/stores/runtime/performanceStore.ts')
      perfMod.usePerformanceStore.getState().setTemporalReprojectionEnabled(true)
    })
    await waitForShaderCompilation(page)

    await expectCanvasNotBlank(page)
  })
})
