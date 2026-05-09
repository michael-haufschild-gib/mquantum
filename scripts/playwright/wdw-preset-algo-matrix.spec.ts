/**
 * WdW preset × color-algorithm verification matrix.
 *
 * For each of the six curated Wheeler-DeWitt scenario presets, cycles through
 * a representative sample of color algorithms (shader indices 4, 5, 8, 19, 20,
 * 22) and captures pixel statistics over the canvas center crop.
 *
 * Verifies (after Phase-1 H1/H2 landing):
 *   1. Renderer does not go to error state for any (preset, algo) pair.
 *   2. Canvas produces non-trivial density contrast — not uniform black, not
 *      saturated white. Uses per-channel standard deviation on the center
 *      30% crop; a flat image has sigma~0.
 *   3. No non-benign page / GPU errors.
 *
 * Saves one PNG per combo under screenshots/wdw-matrix/ for visual review.
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

test.setTimeout(600_000)

const PRESETS = [
  'noBoundaryBaseline',
  'vilenkinTunneling',
  'deWittOrigin',
  'inflationHighMass',
  'deSitterLargeLambda',
  'antiDeSitterContracting',
] as const

/** Shader-index → ColorAlgorithm string. Mirrors COLOR_ALGORITHM_MAP. */
const ALGO_BY_INDEX: Record<number, string> = {
  4: 'mixed',
  5: 'blackbody',
  8: 'domainColoringPsi',
  19: 'viridis',
  20: 'inferno',
  22: 'phaseDensity',
}

const ALGO_INDICES = [4, 5, 8, 19, 20, 22] as const

const READABLE_WDW_EXPOSURE = {
  densityGain: 5.0,
  densityContrast: 1.0,
  renderDynamicRange: 1,
} as const
const MIN_NON_BG_PIXELS = 500

interface PixelStats {
  meanR: number
  meanG: number
  meanB: number
  sigmaR: number
  sigmaG: number
  sigmaB: number
  minR: number
  maxR: number
  minG: number
  maxG: number
  minB: number
  maxB: number
  nonBgPixels: number
  totalPixels: number
  nonBgFraction: number
}

async function computePixelStats(pngBuffer: Buffer): Promise<PixelStats> {
  const meta = await sharp(pngBuffer).metadata()
  const fullW = meta.width!
  const fullH = meta.height!
  const cropW = Math.floor(fullW * 0.3)
  const cropH = Math.floor(fullH * 0.3)

  const { data, info } = await sharp(pngBuffer)
    .extract({
      left: Math.floor((fullW - cropW) / 2),
      top: Math.floor((fullH - cropH) / 2),
      width: cropW,
      height: cropH,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const n = info.width * info.height
  let sumR = 0
  let sumG = 0
  let sumB = 0
  let sumRR = 0
  let sumGG = 0
  let sumBB = 0
  let minR = 255
  let minG = 255
  let minB = 255
  let maxR = 0
  let maxG = 0
  let maxB = 0
  let nonBg = 0
  const DARK = 25
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!
    sumR += r
    sumG += g
    sumB += b
    sumRR += r * r
    sumGG += g * g
    sumBB += b * b
    if (r < minR) minR = r
    if (g < minG) minG = g
    if (b < minB) minB = b
    if (r > maxR) maxR = r
    if (g > maxG) maxG = g
    if (b > maxB) maxB = b
    if (r > DARK || g > DARK || b > DARK) nonBg++
  }
  const meanR = sumR / n
  const meanG = sumG / n
  const meanB = sumB / n
  const sigmaR = Math.sqrt(Math.max(0, sumRR / n - meanR * meanR))
  const sigmaG = Math.sqrt(Math.max(0, sumGG / n - meanG * meanG))
  const sigmaB = Math.sqrt(Math.max(0, sumBB / n - meanB * meanB))
  return {
    meanR,
    meanG,
    meanB,
    sigmaR,
    sigmaG,
    sigmaB,
    minR,
    maxR,
    minG,
    maxG,
    minB,
    maxB,
    nonBgPixels: nonBg,
    totalPixels: n,
    nonBgFraction: nonBg / n,
  }
}

function maxChannelSigma(stats: PixelStats): number {
  return Math.max(stats.sigmaR, stats.sigmaG, stats.sigmaB)
}

async function applyPresetAndAlgo(
  page: import('@playwright/test').Page,
  presetId: string,
  algoName: string
) {
  await page.evaluate(
    async ([pid, algo, exposure]: [string, string, typeof READABLE_WDW_EXPOSURE]) => {
      const extStore = window.__EXTENDED_OBJECT_STORE__
      const appearanceStore = window.__APPEARANCE_STORE__
      if (!extStore) throw new Error('__EXTENDED_OBJECT_STORE__ bridge missing')
      if (!appearanceStore) throw new Error('__APPEARANCE_STORE__ bridge missing')
      // Apply WdW preset (physics fields)
      const s = extStore.getState() as Record<string, unknown>
      const apply = s.applyWheelerDeWittPreset as ((id: string) => Promise<void>) | undefined
      if (!apply) throw new Error('applyWheelerDeWittPreset setter not on store')
      await apply(pid)
      // Keep browser screenshots readable across sparse WdW presets.
      // These are render-only exposure controls; they do not change preset physics.
      const setDensityGain = s.setSchroedingerDensityGain as ((gain: number) => void) | undefined
      const setDensityContrast = s.setSchroedingerDensityContrast as
        | ((contrast: number) => void)
        | undefined
      const setRenderDynamicRange = s.setWdwRenderDynamicRange as
        | ((range: number) => void)
        | undefined
      if (!setDensityGain) throw new Error('setSchroedingerDensityGain setter not on store')
      if (!setDensityContrast) throw new Error('setSchroedingerDensityContrast setter not on store')
      if (!setRenderDynamicRange) throw new Error('setWdwRenderDynamicRange setter not on store')
      setDensityGain(exposure.densityGain)
      setDensityContrast(exposure.densityContrast)
      setRenderDynamicRange(exposure.renderDynamicRange)
      // Set color algorithm
      const setAlgo = (appearanceStore.getState() as Record<string, unknown>).setColorAlgorithm as
        | ((a: string) => void)
        | undefined
      if (!setAlgo) throw new Error('setColorAlgorithm setter not on appearance store')
      setAlgo(algo)
    },
    [presetId, algoName, READABLE_WDW_EXPOSURE]
  )
}

interface ComboResult {
  preset: string
  algoIdx: number
  algoName: string
  stats: PixelStats
  frameDelta: number
  errors: string[]
}

test.describe('WdW preset × color-algorithm matrix', () => {
  test('every preset renders non-trivial density for every sampled algo', async ({
    page,
  }, testInfo) => {
    const pageErrors = collectPageErrors(page)

    await page.goto('/')
    await requireWebGPU(page, testInfo)

    // Enter WdW mode with defaults; solver spins up once.
    await gotoModeWithParams(page, 'wheelerDeWitt', 3, {})
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    const outDir = path.resolve(testInfo.project.testDir, '..', '..', 'screenshots', 'wdw-matrix')
    await fs.mkdir(outDir, { recursive: true })

    const results: ComboResult[] = []

    for (const preset of PRESETS) {
      for (const idx of ALGO_INDICES) {
        const algoName = ALGO_BY_INDEX[idx]!
        const comboLabel = `${preset}-${idx}-${algoName}`

        const beforeErrors = pageErrors.length
        const beforeFrame = await getFrameCount(page)

        await applyPresetAndAlgo(page, preset, algoName)

        // Preset → physics re-solve (CPU); algo change may trigger shader swap.
        await waitForShaderCompilation(page)
        await waitForFrameAdvance(page, beforeFrame + 60, 30_000)

        const canvas = page.locator('[data-testid="webgpu-canvas"]')
        const pngBuffer = await canvas.screenshot({ type: 'png' })

        const outPath = path.join(outDir, `${comboLabel}.png`)
        await fs.writeFile(outPath, pngBuffer)

        const stats = await computePixelStats(pngBuffer)
        const afterFrame = await getFrameCount(page)
        const frameDelta = afterFrame - beforeFrame

        const newErrors = pageErrors.slice(beforeErrors)

        results.push({
          preset,
          algoIdx: idx,
          algoName,
          stats,
          frameDelta,
          errors: filterBenignErrors(newErrors),
        })
      }
    }

    // Write CSV-style report alongside screenshots.
    const report = [
      'preset,algoIdx,algoName,frameDelta,meanR,meanG,meanB,sigmaR,sigmaG,sigmaB,minR,maxR,minG,maxG,minB,maxB,nonBgFraction,errors',
      ...results.map(
        (r) =>
          `${r.preset},${r.algoIdx},${r.algoName},${r.frameDelta},${r.stats.meanR.toFixed(2)},${r.stats.meanG.toFixed(2)},${r.stats.meanB.toFixed(2)},${r.stats.sigmaR.toFixed(2)},${r.stats.sigmaG.toFixed(2)},${r.stats.sigmaB.toFixed(2)},${r.stats.minR},${r.stats.maxR},${r.stats.minG},${r.stats.maxG},${r.stats.minB},${r.stats.maxB},${r.stats.nonBgFraction.toFixed(3)},${r.errors.length}`
      ),
    ].join('\n')
    await fs.writeFile(path.join(outDir, 'report.csv'), report)

    for (const r of results) {
      console.log(
        `[wdw-matrix] ${r.preset.padEnd(30)} algo=${String(r.algoIdx).padStart(2)} ${r.algoName.padEnd(20)} ` +
          `mean=(${r.stats.meanR.toFixed(1)},${r.stats.meanG.toFixed(1)},${r.stats.meanB.toFixed(1)}) ` +
          `sigma=(${r.stats.sigmaR.toFixed(1)},${r.stats.sigmaG.toFixed(1)},${r.stats.sigmaB.toFixed(1)}) ` +
          `range=[${r.stats.minR}-${r.stats.maxR},${r.stats.minG}-${r.stats.maxG},${r.stats.minB}-${r.stats.maxB}] ` +
          `nonBg=${(r.stats.nonBgFraction * 100).toFixed(1)}% ` +
          `errs=${r.errors.length}`
      )
    }

    // ─── Assertions ────────────────────────────────────────────────────────

    // 1. No fatal page errors for any combo.
    const totalErrors = results.flatMap((r) => r.errors)
    expect(
      totalErrors,
      `Page errors across matrix:\n${totalErrors.map((e) => `  • ${e}`).join('\n')}`
    ).toEqual([])

    // 2. Every combo produced at least some non-background content.
    //    Use absolute pixels rather than the old 5% coverage gate: valid WdW
    //    presets can be compact inside the center crop.
    for (const r of results) {
      expect(
        r.stats.nonBgPixels,
        `[${r.preset} / ${r.algoName}] center crop mostly black — ` +
          `nonBgPixels=${r.stats.nonBgPixels}/${r.stats.totalPixels}, ` +
          `nonBgFraction=${r.stats.nonBgFraction.toFixed(3)}`
      ).toBeGreaterThanOrEqual(MIN_NON_BG_PIXELS)
    }

    // 3. Every combo shows per-channel variance — not uniform saturation.
    //    Threshold 3.0 is conservative: a flat color gives sigma ~ 0; any
    //    physical gradient across 30% of canvas produces sigma > 5 in at
    //    least one channel.
    for (const r of results) {
      const maxSigma = maxChannelSigma(r.stats)
      expect(
        maxSigma,
        `[${r.preset} / ${r.algoName}] no visible contrast — maxSigma=${maxSigma.toFixed(2)}`
      ).toBeGreaterThan(3.0)
    }
  })
})
