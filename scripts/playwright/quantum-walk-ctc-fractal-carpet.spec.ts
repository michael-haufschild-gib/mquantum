import type { Page } from '@playwright/test'
import sharp from 'sharp'

import { expect, test } from './fixtures'
import {
  assertNonBlankPixels,
  capturePixelSnapshot,
  expectSnapshotsDiffer,
  getFrameCount,
  gotoMode,
  hasWebGPU,
  snapshotDistance,
  waitForFrameAdvance,
  waitForModeReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.setTimeout(180_000)

interface QwPresetExpectation {
  coinType: 'dft'
  coinBias: number
  coinInitial: 'real' | 'symmetric'
  stepsPerFrame: number
}

interface QwVisualMetrics {
  activeRatio: number
  brightRatio: number
  meanLum: number
  p99Lum: number
  samples: number[]
}

const PRESETS: Record<string, QwPresetExpectation> = {
  floquetCtcFractalCarpet: {
    coinType: 'dft',
    coinBias: 0.5,
    coinInitial: 'symmetric',
    stepsPerFrame: 1,
  },
  floquetCtcReturnWeb: {
    coinType: 'dft',
    coinBias: 0.5,
    coinInitial: 'real',
    stepsPerFrame: 1,
  },
}

async function requireWebGPUWithoutSkipping(page: Page): Promise<void> {
  const available = await hasWebGPU(page)
  expect(available, 'QW CTC fractal-carpet e2e requires WebGPU and must not skip').toBe(true)
}

async function applyPresetThroughSelector(
  page: Page,
  presetId: keyof typeof PRESETS
): Promise<void> {
  const selector = page.getByTestId('scenario-selector')
  await expect(selector).toBeVisible()
  await selector.selectOption(presetId)

  const expected = PRESETS[presetId]
  await page.waitForFunction(
    async ({ coinType, coinBias, coinInitial, stepsPerFrame }) => {
      const mod = await import('/src/stores/scene/extendedObjectStore.ts')
      const qw = mod.useExtendedObjectStore.getState().schroedinger.quantumWalk
      return (
        qw.fieldView === 'ctcFractalCarpet' &&
        qw.coinType === coinType &&
        qw.coinInitial === coinInitial &&
        Math.abs(qw.coinBias - coinBias) < 1e-6 &&
        qw.stepsPerFrame === stepsPerFrame &&
        qw.absorberEnabled === false &&
        qw.autoScale === true
      )
    },
    expected,
    { timeout: 5_000 }
  )

  await waitForShaderCompilation(page)
}

async function captureQwVisualMetrics(page: Page): Promise<QwVisualMetrics> {
  const canvas = page.locator('[data-testid="webgpu-canvas"]')
  const pngBuffer = await canvas.screenshot({ type: 'png' })
  const meta = await sharp(pngBuffer).metadata()
  const fullW = meta.width!
  const fullH = meta.height!
  const crop = {
    left: Math.floor(fullW * 0.27),
    top: Math.floor(fullH * 0.12),
    width: Math.floor(fullW * 0.46),
    height: Math.floor(fullH * 0.74),
  }
  const { data, info } = await sharp(pngBuffer)
    .extract(crop)
    .resize(96, 64, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const lums: number[] = []
  let active = 0
  let bright = 0
  let sum = 0
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!
    lums.push(lum)
    sum += lum
    if (lum > 32) active++
    if (lum > 72) bright++
  }
  lums.sort((a, b) => a - b)
  const total = info.width * info.height
  return {
    activeRatio: active / total,
    brightRatio: bright / total,
    meanLum: sum / total,
    p99Lum: lums[Math.floor(total * 0.99)] ?? 0,
    samples: lums,
  }
}

function visualMetricDistance(a: QwVisualMetrics, b: QwVisualMetrics): number {
  const count = Math.min(a.samples.length, b.samples.length)
  let total = 0
  for (let i = 0; i < count; i++) total += Math.abs(a.samples[i]! - b.samples[i]!)
  return total / Math.max(1, count)
}

function expectRenderableAndStable(
  before: QwVisualMetrics,
  after: QwVisualMetrics,
  label: string
): void {
  for (const metrics of [before, after]) {
    expect(metrics.activeRatio, `${label}: must not be blank`).toBeGreaterThan(0.003)
    expect(
      metrics.activeRatio,
      `${label}: must not fill the whole viewport with noise`
    ).toBeLessThan(0.35)
    expect(metrics.brightRatio, `${label}: bright coverage must stay structured`).toBeLessThan(0.28)
    expect(metrics.p99Lum, `${label}: visible ridge brightness`).toBeGreaterThan(32)
  }
  expect(
    Math.abs(before.activeRatio - after.activeRatio),
    `${label}: active pixel coverage should not flicker`
  ).toBeLessThan(0.2)
  expect(
    visualMetricDistance(before, after),
    `${label}: adjacent frames should not lurch`
  ).toBeLessThan(38)
}

test.describe('quantum walk CTC fractal-carpet presets', () => {
  test('Carpet and Return Web apply through the real app, render, and differ visually', async ({
    page,
  }) => {
    await requireWebGPUWithoutSkipping(page)
    await gotoMode(page, 'quantumWalk', 3)
    await waitForModeReady(page, 90)

    await applyPresetThroughSelector(page, 'floquetCtcFractalCarpet')
    await assertNonBlankPixels(page, 'QW Floquet CTC Fractal Carpet preset', 25)
    const carpetMetrics = await captureQwVisualMetrics(page)
    const carpet = await capturePixelSnapshot(page)
    await waitForFrameAdvance(page, await getFrameCount(page))
    const carpetNextMetrics = await captureQwVisualMetrics(page)
    const carpetNext = await capturePixelSnapshot(page)
    expectRenderableAndStable(
      carpetMetrics,
      carpetNextMetrics,
      'QW Floquet CTC Fractal Carpet preset'
    )
    expect(snapshotDistance(carpet, carpetNext)).toBeLessThan(35)

    await applyPresetThroughSelector(page, 'floquetCtcReturnWeb')
    await assertNonBlankPixels(page, 'QW Floquet CTC Return Web preset', 25)
    const webMetrics = await captureQwVisualMetrics(page)
    const web = await capturePixelSnapshot(page)
    await waitForFrameAdvance(page, await getFrameCount(page))
    const webNextMetrics = await captureQwVisualMetrics(page)
    const webNext = await capturePixelSnapshot(page)
    expectRenderableAndStable(webMetrics, webNextMetrics, 'QW Floquet CTC Return Web preset')
    expect(snapshotDistance(web, webNext)).toBeLessThan(35)

    expectSnapshotsDiffer(carpet, web, 'QW CTC Fractal Carpet vs Return Web presets', 0.5)
  })
})
