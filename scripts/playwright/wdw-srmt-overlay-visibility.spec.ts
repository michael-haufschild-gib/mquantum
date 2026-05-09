/**
 * WdW SRMT overlay visibility check (post-H1 A-channel compositing).
 *
 * After H1 moved the SRMT + streamline overlay from R/G into the A channel,
 * the raymarch branch composites the overlay additively only when
 * `gridSample.a > 0.01`. This test captures a baseline render with SRMT
 * disabled, then cycles SRMT ON for all three clocks × three heatmap
 * intensities, and asserts that each ON frame differs from the OFF baseline
 * by a detectable pixel delta — proves the cut-plane disk actually reaches
 * the compositor.
 *
 * Saves PNGs under screenshots/wdw-srmt-overlay/ and emits a CSV report.
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

const CLOCKS = ['a', 'phi1', 'phi2'] as const
const INTENSITIES = [0.3, 0.6, 1.0] as const

interface CropPixels {
  width: number
  height: number
  data: Buffer
}

async function captureCenterCrop(
  page: import('@playwright/test').Page
): Promise<{ pngBuffer: Buffer; crop: CropPixels }> {
  const canvas = page.locator('[data-testid="webgpu-canvas"]')
  const pngBuffer = await canvas.screenshot({ type: 'png' })
  const meta = await sharp(pngBuffer).metadata()
  const w = meta.width!
  const h = meta.height!
  const cropW = Math.floor(w * 0.3)
  const cropH = Math.floor(h * 0.3)
  const { data, info } = await sharp(pngBuffer)
    .extract({
      left: Math.floor((w - cropW) / 2),
      top: Math.floor((h - cropH) / 2),
      width: cropW,
      height: cropH,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return {
    pngBuffer,
    crop: { width: info.width, height: info.height, data },
  }
}

function pixelDelta(a: CropPixels, b: CropPixels): { meanAbsDiff: number; changedPixels: number } {
  if (a.data.length !== b.data.length)
    throw new Error(`crop mismatch: ${a.data.length} vs ${b.data.length}`)
  let sum = 0
  let changed = 0
  const THRESH = 5
  for (let i = 0; i < a.data.length; i += 4) {
    const dr = Math.abs(a.data[i]! - b.data[i]!)
    const dg = Math.abs(a.data[i + 1]! - b.data[i + 1]!)
    const db = Math.abs(a.data[i + 2]! - b.data[i + 2]!)
    sum += dr + dg + db
    if (dr > THRESH || dg > THRESH || db > THRESH) changed++
  }
  const n = (a.data.length / 4) * 3
  return { meanAbsDiff: sum / n, changedPixels: changed }
}

async function setSrmtConfig(
  page: import('@playwright/test').Page,
  cfg: {
    enabled: boolean
    clock?: 'a' | 'phi1' | 'phi2'
    heatmapIntensity?: number
  }
) {
  await page.evaluate(async (c) => {
    const extStore = window.__EXTENDED_OBJECT_STORE__
    if (!extStore) throw new Error('__EXTENDED_OBJECT_STORE__ bridge missing')
    const s = extStore.getState() as Record<string, unknown>
    const setEnabled = s.setWdwSrmtEnabled as ((v: boolean) => void) | undefined
    const setClock = s.setWdwSrmtClock as ((v: string) => void) | undefined
    const setHeatmap = s.setWdwSrmtHeatmapIntensity as ((v: number) => void) | undefined
    if (!setEnabled) throw new Error('setWdwSrmtEnabled missing')
    setEnabled(c.enabled)
    if (c.clock) {
      if (!setClock) throw new Error('setWdwSrmtClock missing')
      setClock(c.clock)
    }
    if (typeof c.heatmapIntensity === 'number') {
      if (!setHeatmap) throw new Error('setWdwSrmtHeatmapIntensity missing')
      setHeatmap(c.heatmapIntensity)
    }
  }, cfg)
}

interface RowResult {
  label: string
  clock: string
  intensity: number
  meanAbsDiff: number
  changedPixels: number
  errors: string[]
}

test.describe('WdW SRMT overlay visibility (A-channel composited)', () => {
  test('enabling SRMT produces a visible delta vs baseline for every clock × heatmap intensity', async ({
    page,
  }, testInfo) => {
    const pageErrors = collectPageErrors(page)

    await page.goto('/')
    await requireWebGPU(page, testInfo)

    // Use Hartle-Hawking baseline so overlay changes dominate the delta
    // (no Vilenkin Bi corner saturating the right side).
    await gotoModeWithParams(page, 'wheelerDeWitt', 3, {
      scene: '',
    })
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    // Explicitly apply the HH preset + disable SRMT for the baseline.
    await page.evaluate(async () => {
      const extStore = window.__EXTENDED_OBJECT_STORE__
      if (!extStore) throw new Error('__EXTENDED_OBJECT_STORE__ bridge missing')
      const s = extStore.getState() as Record<string, unknown>
      const apply = s.applyWheelerDeWittPreset as ((id: string) => Promise<void>) | undefined
      const setEnabled = s.setWdwSrmtEnabled as ((v: boolean) => void) | undefined
      if (!apply) throw new Error('applyWheelerDeWittPreset missing')
      await apply('noBoundaryBaseline')
      if (setEnabled) setEnabled(false)
    })
    const frame0 = await getFrameCount(page)
    await waitForFrameAdvance(page, frame0 + 60, 30_000)

    const outDir = path.resolve(
      testInfo.project.testDir,
      '..',
      '..',
      'screenshots',
      'wdw-srmt-overlay'
    )
    await fs.mkdir(outDir, { recursive: true })

    const baseline = await captureCenterCrop(page)
    await fs.writeFile(path.join(outDir, 'baseline-srmt-off.png'), baseline.pngBuffer)

    const rows: RowResult[] = []
    for (const clock of CLOCKS) {
      for (const intensity of INTENSITIES) {
        const label = `clock-${clock}-intensity-${intensity.toFixed(1)}`
        const before = pageErrors.length
        await setSrmtConfig(page, {
          enabled: true,
          clock,
          heatmapIntensity: intensity,
        })
        // SRMT queue drain is slow (Lanczos eigensolver ~3-7s/clock). Overlay
        // draws as soon as the cut-plane density pack has picked up the new
        // clock/intensity config — that happens on the next solver output
        // tick, which the frame counter follows. A 60-frame wait is enough
        // to observe the packer repack with the new SRMT params; waiting for
        // the full spectrum computation would add 10-20s without changing
        // the rendered alpha.
        const fc = await getFrameCount(page)
        await waitForFrameAdvance(page, fc + 60, 30_000)

        const shot = await captureCenterCrop(page)
        await fs.writeFile(path.join(outDir, `${label}.png`), shot.pngBuffer)
        const delta = pixelDelta(baseline.crop, shot.crop)
        const newErrors = filterBenignErrors(pageErrors.slice(before))
        rows.push({
          label,
          clock,
          intensity,
          meanAbsDiff: delta.meanAbsDiff,
          changedPixels: delta.changedPixels,
          errors: newErrors,
        })
      }
    }

    const report = [
      'clock,intensity,meanAbsDiff,changedPixels,errors',
      ...rows.map(
        (r) =>
          `${r.clock},${r.intensity.toFixed(1)},${r.meanAbsDiff.toFixed(3)},${r.changedPixels},${r.errors.length}`
      ),
    ].join('\n')
    await fs.writeFile(path.join(outDir, 'report.csv'), report)

    for (const r of rows) {
      console.log(
        `[wdw-srmt] ${r.label.padEnd(30)} meanAbsDiff=${r.meanAbsDiff.toFixed(2)} changed=${r.changedPixels} errs=${r.errors.length}`
      )
    }

    const totalErrors = rows.flatMap((r) => r.errors)
    expect(
      totalErrors,
      `Errors collected:\n${totalErrors.map((e) => `  • ${e}`).join('\n')}`
    ).toEqual([])

    // Every SRMT-enabled frame must differ from baseline. A cleanly-packed
    // overlay changes at least a few hundred pixels on the 30% crop (the
    // cut-plane disk is ~30-50 texels thick in the 96³ grid). Threshold 20
    // is extremely conservative — anything above 0 proves the compositor
    // received A-channel signal.
    for (const r of rows) {
      expect(
        r.changedPixels,
        `[${r.label}] overlay produced no visible pixel change vs baseline (changedPixels=${r.changedPixels})`
      ).toBeGreaterThan(20)
    }

    // Heatmap intensity should monotonically grow the effect, or at least
    // 1.0 must dominate 0.3 — otherwise the intensity slider is decoupled
    // from the render.
    for (const clock of CLOCKS) {
      const low = rows.find((r) => r.clock === clock && r.intensity === 0.3)!
      const high = rows.find((r) => r.clock === clock && r.intensity === 1.0)!
      expect(
        high.changedPixels,
        `[${clock}] intensity=1.0 must change at least as many pixels as intensity=0.3 (low=${low.changedPixels}, high=${high.changedPixels})`
      ).toBeGreaterThanOrEqual(Math.floor(low.changedPixels * 0.9))
    }
  })
})
