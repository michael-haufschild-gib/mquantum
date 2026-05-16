/**
 * Wigner phase-space rendering — verifies HO and Hydrogen ND Wigner views render.
 *
 * @module e2e/wigner-rendering
 */

import { test } from './fixtures'
import {
  expectCanvasNotBlank,
  gotoMode,
  requireWebGPU,
  waitForFirstFrame,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.describe('Wigner phase-space rendering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await requireWebGPU(page, test.info())
  })

  test('HO 3D Wigner renders non-blank', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    // Switch to Wigner representation
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerRepresentation('wigner')
    })

    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)
    await expectCanvasNotBlank(page)
  })

  test('Hydrogen ND 3D Wigner renders non-blank', async ({ page }) => {
    await gotoMode(page, 'hydrogenND', 3)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    // Switch to Wigner representation
    await page.evaluate(async () => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      mod.useExtendedObjectStore.getState().setSchroedingerRepresentation('wigner')
    })

    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)
    await expectCanvasNotBlank(page)
  })

  test('HO 5D Wigner renders non-blank', async ({ page }) => {
    await gotoMode(page, 'harmonicOscillator', 5)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    // Retry on context-destroyed — switching representation can trigger pipeline rebuild
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await page.evaluate(async () => {
          const mod = await import('/src/stores/scene/extendedObjectStore.ts')
          mod.useExtendedObjectStore.getState().setSchroedingerRepresentation('wigner')
        })
        break
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes('Execution context was destroyed') && attempt < 2) {
          await page.waitForTimeout(2000)
          continue
        }
        throw e
      }
    }

    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)
    await expectCanvasNotBlank(page)
  })
})
