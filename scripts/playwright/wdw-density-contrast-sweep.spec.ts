/**
 * WdW densityGain + densityContrast behavioural sweep (post-H1 logRho
 * convention).
 *
 * Under H1: R channel = `|χ|²/maxRho_render ∈ [0, 1]`, `cachedPeakDensity = 1.0`.
 * The shader `applyDensityContrast` runs `smoothstep(0, 1/contrast, R) · 1.0`,
 * so `contrast ∈ [1, 4]` shapes the density curve on `[0, 1/contrast]`.
 *
 * This test confirms both knobs still shift the rendered output meaningfully
 * under the new convention, for all six curated presets. "Meaningful" is
 * defined as changing the center-crop pixel distribution by > 200 pixels
 * between contrast=1 and contrast=3 (same densityGain), and similarly
 * between gain=0.5 and gain=3.0 (same contrast).
 */

import fs from 'node:fs/promises'
import path from 'node:path'

import sharp from 'sharp'

import { expect, test } from './fixtures'
import {
  collectPageErrors,
  filterBenignErrors,
  getFrameCount,
  gotoModeWithParams,
  requireWebGPU,
  waitForFirstFrame,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'

test.setTimeout(300_000)

const PRESETS = [
  'noBoundaryBaseline',
  'vilenkinTunneling',
  'deWittOrigin',
  'inflationHighMass',
  'deSitterLargeLambda',
  'antiDeSitterContracting',
] as const

interface Crop {
  data: Buffer
}

async function centerCrop(page: import('@playwright/test').Page): Promise<{
  pngBuffer: Buffer
  crop: Crop
}> {
  const canvas = page.locator('[data-testid="webgpu-canvas"]')
  const pngBuffer = await canvas.screenshot({ type: 'png' })
  const meta = await sharp(pngBuffer).metadata()
  const cropW = Math.floor(meta.width! * 0.3)
  const cropH = Math.floor(meta.height! * 0.3)
  const { data } = await sharp(pngBuffer)
    .extract({
      left: Math.floor((meta.width! - cropW) / 2),
      top: Math.floor((meta.height! - cropH) / 2),
      width: cropW,
      height: cropH,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { pngBuffer, crop: { data } }
}

function delta(a: Crop, b: Crop) {
  if (a.data.length !== b.data.length) throw new Error('mismatch')
  let changed = 0
  const THRESH = 5
  for (let i = 0; i < a.data.length; i += 4) {
    const dr = Math.abs(a.data[i]! - b.data[i]!)
    const dg = Math.abs(a.data[i + 1]! - b.data[i + 1]!)
    const db = Math.abs(a.data[i + 2]! - b.data[i + 2]!)
    if (dr > THRESH || dg > THRESH || db > THRESH) changed++
  }
  return { changed }
}

async function applyPreset(page: import('@playwright/test').Page, presetId: string) {
  await page.evaluate(async (id) => {
    const extStore = window.__EXTENDED_OBJECT_STORE__!
    const s = extStore.getState() as Record<string, unknown>
    await (s.applyWheelerDeWittPreset as (i: string) => Promise<void>)(id)
  }, presetId)
}

async function setGainContrast(
  page: import('@playwright/test').Page,
  gain: number,
  contrast: number
) {
  await page.evaluate(
    ([g, c]) => {
      const ext = window.__EXTENDED_OBJECT_STORE__!
      const s = ext.getState() as Record<string, unknown>
      ;(s.setSchroedingerDensityGain as (v: number) => void)(g)
      ;(s.setSchroedingerDensityContrast as (v: number) => void)(c)
    },
    [gain, contrast]
  )
}

async function capAfter(page: import('@playwright/test').Page, frames: number) {
  const fc = await getFrameCount(page)
  await waitForFrameAdvance(page, fc + frames, 30_000)
  return (await centerCrop(page)).crop
}

interface Row {
  preset: string
  contrastDelta: number // pixels changed between contrast=1 and contrast=3
  gainDelta: number // pixels changed between gain=0.5 and gain=3.0
  errors: string[]
}

test.describe('WdW density gain + contrast meaningful under logRho', () => {
  test('contrast and gain sweeps both shift rendered output per preset', async ({
    page,
  }, testInfo) => {
    const pageErrors = collectPageErrors(page)

    await page.goto('/')
    await requireWebGPU(page, testInfo)
    await gotoModeWithParams(page, 'wheelerDeWitt', 3, {})
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    // Set viridis so the palette shows a wide luminance gradient — contrast
    // changes are visible as a color-band shift, not a brightness roundoff.
    await page.evaluate(() => {
      const app = window.__APPEARANCE_STORE__!
      ;(app.getState().setColorAlgorithm as (a: string) => void)('viridis')
    })

    const outDir = path.resolve(
      testInfo.project.testDir,
      '..',
      '..',
      'screenshots',
      'wdw-density-sweep'
    )
    await fs.mkdir(outDir, { recursive: true })

    const rows: Row[] = []

    for (const preset of PRESETS) {
      const before = pageErrors.length
      await applyPreset(page, preset)
      await waitForShaderCompilation(page)
      await capAfter(page, 60)

      // Contrast sweep (gain held at 2.0).
      await setGainContrast(page, 2.0, 1.0)
      await waitForShaderCompilation(page)
      const contrast1 = await capAfter(page, 30)
      const shotC1 = await page.locator('[data-testid="webgpu-canvas"]').screenshot({ type: 'png' })
      await fs.writeFile(path.join(outDir, `${preset}-contrast-1.0.png`), shotC1)

      await setGainContrast(page, 2.0, 3.0)
      await waitForShaderCompilation(page)
      const contrast3 = await capAfter(page, 30)
      const shotC3 = await page.locator('[data-testid="webgpu-canvas"]').screenshot({ type: 'png' })
      await fs.writeFile(path.join(outDir, `${preset}-contrast-3.0.png`), shotC3)

      const contrastDelta = delta(contrast1, contrast3).changed

      // Gain sweep (contrast held at 1.8).
      await setGainContrast(page, 0.5, 1.8)
      await waitForShaderCompilation(page)
      const gainLow = await capAfter(page, 30)
      await setGainContrast(page, 3.0, 1.8)
      await waitForShaderCompilation(page)
      const gainHigh = await capAfter(page, 30)
      const gainDelta = delta(gainLow, gainHigh).changed

      rows.push({
        preset,
        contrastDelta,
        gainDelta,
        errors: filterBenignErrors(pageErrors.slice(before)),
      })
    }

    await fs.writeFile(
      path.join(outDir, 'report.csv'),
      ['preset,contrastDelta,gainDelta,errors']
        .concat(rows.map((r) => `${r.preset},${r.contrastDelta},${r.gainDelta},${r.errors.length}`))
        .join('\n')
    )

    for (const r of rows) {
      console.log(
        `[wdw-density] ${r.preset.padEnd(30)} contrastDelta=${r.contrastDelta} gainDelta=${r.gainDelta} errs=${r.errors.length}`
      )
    }

    const allErrors = rows.flatMap((r) => r.errors)
    expect(allErrors).toEqual([])

    for (const r of rows) {
      expect(
        r.contrastDelta,
        `[${r.preset}] densityContrast 1→3 failed to shift rendered output (changed=${r.contrastDelta})`
      ).toBeGreaterThan(200)
      expect(
        r.gainDelta,
        `[${r.preset}] densityGain 0.5→3.0 failed to shift rendered output (changed=${r.gainDelta})`
      ).toBeGreaterThan(200)
    }
  })
})
