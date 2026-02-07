/**
 * WebGPU Multi-Light (Spot Rotation) Smoke Test
 *
 * Verifies that WebGPU mode initializes and that spotlight rotation (stored as Euler angles)
 * affects lighting output. This directly guards against regressions where WebGPU lighting
 * uniform packing ignores the store's `rotation` field (leading to "ambient-only" lighting).
 */

import { ConsoleMessage, expect, Page, test } from '@playwright/test'
import sharp from 'sharp'

// Extended timeout for WebGPU initialization + shader compilation
test.setTimeout(120000)

interface ErrorCollector {
  errors: string[]
  warnings: string[]
  pageErrors: string[]
}

function setupErrorCollection(page: Page): ErrorCollector {
  const collector: ErrorCollector = {
    errors: [],
    warnings: [],
    pageErrors: [],
  }

  page.on('pageerror', (err) => {
    collector.pageErrors.push(err.message)
  })

  page.on('console', (msg: ConsoleMessage) => {
    const text = msg.text()
    if (msg.type() === 'error') collector.errors.push(text)
    if (msg.type() === 'warning') collector.warnings.push(text)
  })

  return collector
}

function verifyNoCriticalErrors(collector: ErrorCollector): void {
  if (collector.pageErrors.length > 0) {
    throw new Error(`Page errors detected:\n${collector.pageErrors.join('\n')}`)
  }

  const errorText = collector.errors.join('\n')
  if (/wgsl|gpuvalidationerror|rendergraph|graph compilation|cycle detected|shader/i.test(errorText)) {
    throw new Error(`Critical console errors detected:\n${errorText}`)
  }

  const warningText = collector.warnings.join('\n')
  if (/rendergraph|graph compilation|cycle detected|invalid outputs|error executing pass/i.test(warningText)) {
    throw new Error(`Critical console warnings detected:\n${warningText}`)
  }
}

async function waitForCanvasVisible(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded')
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
}

async function hasWebGPUCanvas(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('canvas')).some((c) => {
      try {
        return !!(c as HTMLCanvasElement).getContext('webgpu')
      } catch {
        return false
      }
    })
  })
}

async function sampleCanvasCenterLuma(page: Page): Promise<number> {
  const canvas = page.locator('canvas').first()
  const png = await canvas.screenshot({ type: 'png' })
  const image = sharp(png)
  const meta = await image.metadata()

  if (!meta.width || !meta.height) {
    throw new Error('Failed to read canvas screenshot metadata')
  }

  const sampleSize = 5
  const left = Math.max(0, Math.floor(meta.width / 2 - sampleSize / 2))
  const top = Math.max(0, Math.floor(meta.height / 2 - sampleSize / 2))

  const raw = await image
    .extract({ left, top, width: sampleSize, height: sampleSize })
    .ensureAlpha()
    .raw()
    .toBuffer()

  let sum = 0
  for (let i = 0; i < raw.length; i += 4) {
    const r = raw[i] ?? 0
    const g = raw[i + 1] ?? 0
    const b = raw[i + 2] ?? 0
    // ITU-R BT.709 luminance
    sum += 0.2126 * r + 0.7152 * g + 0.0722 * b
  }

  const pixels = raw.length / 4
  return sum / (255 * pixels)
}

async function waitForLumaStable(
  page: Page,
  options: { timeoutMs?: number; intervalMs?: number; tolerance?: number } = {}
): Promise<number> {
  const { timeoutMs = 15000, intervalMs = 250, tolerance = 0.002 } = options
  const start = Date.now()

  let prev = await sampleCanvasCenterLuma(page)
  for (;;) {
    await page.waitForTimeout(intervalMs)
    const next = await sampleCanvasCenterLuma(page)
    if (Math.abs(next - prev) <= tolerance) return next
    prev = next

    if (Date.now() - start > timeoutMs) {
      return next
    }
  }
}

async function waitForLuma(
  page: Page,
  predicate: (luma: number) => boolean,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<number> {
  const { timeoutMs = 15000, intervalMs = 250 } = options
  const start = Date.now()

  for (;;) {
    const luma = await sampleCanvasCenterLuma(page)
    if (predicate(luma)) return luma
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for canvas luma predicate')
    }
    await page.waitForTimeout(intervalMs)
  }
}

test('spot light rotation changes WebGPU lighting output', async ({ page }) => {
  const collector = setupErrorCollection(page)

  // Prefer WebGPU for this test (rendererStore reads localStorage on init)
  await page.addInitScript(() => {
    localStorage.setItem('mdim_preferred_renderer', 'webgpu')
  })

  // Use schroedinger: stable, centered, and strongly lit when a spotlight hits it
  await page.goto('/?t=schroedinger')
  await waitForCanvasVisible(page)

  const webgpuAvailable = await page.evaluate(() => !!navigator.gpu)
  test.skip(!webgpuAvailable, 'WebGPU is not available in this Playwright browser')

  const webgpuCanvas = await hasWebGPUCanvas(page)
  test.skip(!webgpuCanvas, 'App did not initialize a WebGPU canvas (fallback likely occurred)')

  // Configure stores: ambient off, single spotlight at (5,5,5), initially pointing away.
  await page.evaluate(async () => {
    const { useEnvironmentStore } = await import('/src/stores/environmentStore.ts')
    const { usePostProcessingStore } = await import('/src/stores/postProcessingStore.ts')
    const { useLightingStore } = await import('/src/stores/lightingStore.ts')

    // Reduce visual variability for the pixel gate.
    useEnvironmentStore.setState({ skyboxEnabled: false, groundEnabled: false })
    usePostProcessingStore.setState({ bloomEnabled: false })

    const lighting = useLightingStore.getState()
    lighting.reset()

    lighting.setAmbientEnabled(false)
    lighting.setAmbientIntensity(0)
    lighting.setAmbientColor('#000000')

    const firstId = lighting.lights[0]?.id
    if (!firstId) {
      throw new Error('Expected at least one default light')
    }

    lighting.updateLight(firstId, {
      name: 'Test Spot',
      type: 'spot',
      enabled: true,
      position: [5, 5, 5],
      rotation: [0, 0, 0], // points along -Z (misses origin from this position)
      color: '#ffffff',
      intensity: 3.0,
      range: 0, // infinite, no distance falloff
      decay: 2.0,
      coneAngle: 30,
      penumbra: 0.2,
    })
  })

  const lumaBefore = await waitForLumaStable(page)

  // Rotate spotlight to point toward origin: direction ~= normalize(-pos)
  // For pos (5,5,5): rx ≈ asin(-0.577) = -0.61548, ry ≈ atan2(0.577, 0.577) = 0.785398
  await page.evaluate(async () => {
    const { useLightingStore } = await import('/src/stores/lightingStore.ts')
    const lighting = useLightingStore.getState()
    const firstId = lighting.lights[0]?.id
    if (!firstId) throw new Error('Expected default light id')

    lighting.updateLight(firstId, {
      rotation: [-0.6154797, 0.7853982, 0],
    })
  })

  const lumaAfter = await waitForLuma(page, (luma) => luma > 0.02 && luma > lumaBefore + 0.02)

  // With ambient off, the center pixel should brighten noticeably when the spotlight hits the object.
  expect(lumaAfter).toBeGreaterThan(0.02)
  expect(lumaAfter).toBeGreaterThan(lumaBefore + 0.02)

  verifyNoCriticalErrors(collector)
})
