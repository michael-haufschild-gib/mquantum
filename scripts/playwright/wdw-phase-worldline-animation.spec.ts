/**
 * WdW phase rotation + worldline pulse animation verification.
 *
 * Confirms (with the solver playing):
 *   1. `wdwPhaseRotationEnabled + speed > 0` produces temporal pixel drift
 *      on every WdW-selectable phase-keyed color algorithm. The hue ring
 *      should cycle as `phaseOffset = speed · t` advances.
 *   2. `wdwWorldlineEnabled + speed > 0` produces temporal pixel drift on
 *      a density-keyed algorithm (e.g. inferno). The worldline pulse
 *      traces the streamline over time, so successive frames differ.
 *   3. With both features disabled and animation paused, frames are
 *      stable (delta < noise floor).
 *
 * Uses Hartle-Hawking baseline to keep the scene clean of Vilenkin's
 * headroom-capped Euclidean saturation. Saves PNGs under
 * screenshots/wdw-animation/.
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

interface Crop {
  width: number
  height: number
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
  const { data, info } = await sharp(pngBuffer)
    .extract({
      left: Math.floor((meta.width! - cropW) / 2),
      top: Math.floor((meta.height! - cropH) / 2),
      width: cropW,
      height: cropH,
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { pngBuffer, crop: { width: info.width, height: info.height, data } }
}

function delta(a: Crop, b: Crop) {
  if (a.data.length !== b.data.length) throw new Error('crop mismatch')
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
  return {
    meanAbsDiff: sum / ((a.data.length / 4) * 3),
    changedPixels: changed,
  }
}

async function configureScene(
  page: import('@playwright/test').Page,
  cfg: {
    algo: string
    phaseRotation: boolean
    phaseRotationSpeed: number
    worldline: boolean
    worldlineSpeed: number
    play: boolean
  }
) {
  await page.evaluate(async (c) => {
    const extStore = window.__EXTENDED_OBJECT_STORE__
    const appearance = window.__APPEARANCE_STORE__
    const anim = window.__ANIMATION_STORE__
    if (!extStore) throw new Error('__EXTENDED_OBJECT_STORE__ missing')
    if (!appearance) throw new Error('__APPEARANCE_STORE__ missing')
    if (!anim) throw new Error('__ANIMATION_STORE__ missing')
    const ext = extStore.getState() as Record<string, unknown>
    const app = appearance.getState() as Record<string, unknown>
    const animS = anim.getState() as Record<string, unknown>
    const apply = ext.applyWheelerDeWittPreset as ((id: string) => Promise<void>) | undefined
    if (!apply) throw new Error('applyWheelerDeWittPreset missing')
    await apply('noBoundaryBaseline')
    ;(app.setColorAlgorithm as (a: string) => void)(c.algo)
    ;(ext.setWdwPhaseRotationEnabled as (v: boolean) => void)(c.phaseRotation)
    ;(ext.setWdwPhaseRotationSpeed as (v: number) => void)(c.phaseRotationSpeed)
    ;(ext.setWdwWorldlineEnabled as (v: boolean) => void)(c.worldline)
    ;(ext.setWdwWorldlineSpeed as (v: number) => void)(c.worldlineSpeed)
    if (c.play) (animS.play as () => void)()
    else (animS.pause as () => void)()
  }, cfg)
}

async function captureAfter(page: import('@playwright/test').Page, frames: number): Promise<Crop> {
  const fc = await getFrameCount(page)
  await waitForFrameAdvance(page, fc + frames, 30_000)
  return (await centerCrop(page)).crop
}

interface Row {
  label: string
  changedPixels: number
  meanAbsDiff: number
  errors: string[]
}

const WDW_PHASE_ROTATION_ALGORITHMS = [
  'phase',
  'mixed',
  'phaseCyclicUniform',
  'phaseDiverging',
  'domainColoringPsi',
  'diverging',
  'phaseDensity',
] as const

test.describe('WdW phase rotation + worldline pulse (animated)', () => {
  test('phase rotation and worldline pulse both produce temporal frame deltas', async ({
    page,
  }, testInfo) => {
    const pageErrors = collectPageErrors(page)

    await page.goto('/')
    await requireWebGPU(page, testInfo)
    await gotoModeWithParams(page, 'wheelerDeWitt', 3, {})
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)
    await waitForFirstFrame(page)

    const outDir = path.resolve(
      testInfo.project.testDir,
      '..',
      '..',
      'screenshots',
      'wdw-animation'
    )
    await fs.mkdir(outDir, { recursive: true })

    const rows: Row[] = []

    // ─── Control: paused, no rotation, no worldline — frames must be stable.
    {
      await configureScene(page, {
        algo: 'inferno',
        phaseRotation: false,
        phaseRotationSpeed: 0,
        worldline: false,
        worldlineSpeed: 0,
        play: false,
      })
      await waitForShaderCompilation(page)
      await captureAfter(page, 40) // settle
      const before = pageErrors.length
      const a = await captureAfter(page, 30)
      const b = await captureAfter(page, 30)
      const d = delta(a, b)
      rows.push({
        label: 'control-paused-inferno',
        changedPixels: d.changedPixels,
        meanAbsDiff: d.meanAbsDiff,
        errors: filterBenignErrors(pageErrors.slice(before)),
      })
    }

    // ─── Phase rotation ON, playing, phase-keyed algo — frames should drift.
    for (const algo of WDW_PHASE_ROTATION_ALGORITHMS) {
      await configureScene(page, {
        algo,
        phaseRotation: true,
        phaseRotationSpeed: 1.5,
        worldline: false,
        worldlineSpeed: 0,
        play: true,
      })
      await waitForShaderCompilation(page)
      await captureAfter(page, 20) // settle
      const before = pageErrors.length
      const a = await captureAfter(page, 10)
      const b = await captureAfter(page, 30) // let phase rotate
      const d = delta(a, b)
      const shot = await page.locator('[data-testid="webgpu-canvas"]').screenshot({ type: 'png' })
      await fs.writeFile(path.join(outDir, `phaseRotation-${algo}.png`), shot)
      rows.push({
        label: `phaseRotation-${algo}`,
        changedPixels: d.changedPixels,
        meanAbsDiff: d.meanAbsDiff,
        errors: filterBenignErrors(pageErrors.slice(before)),
      })
    }

    // ─── Worldline pulse ON, playing, density algo — frames should drift as
    //    pulse walks the streamline.
    {
      await configureScene(page, {
        algo: 'inferno',
        phaseRotation: false,
        phaseRotationSpeed: 0,
        worldline: true,
        worldlineSpeed: 1.0,
        play: true,
      })
      await waitForShaderCompilation(page)
      await captureAfter(page, 20)
      const before = pageErrors.length
      const a = await captureAfter(page, 10)
      const b = await captureAfter(page, 60)
      const d = delta(a, b)
      const shot = await page.locator('[data-testid="webgpu-canvas"]').screenshot({ type: 'png' })
      await fs.writeFile(path.join(outDir, 'worldline-inferno.png'), shot)
      rows.push({
        label: 'worldline-inferno',
        changedPixels: d.changedPixels,
        meanAbsDiff: d.meanAbsDiff,
        errors: filterBenignErrors(pageErrors.slice(before)),
      })
    }

    await fs.writeFile(
      path.join(outDir, 'report.csv'),
      ['label,meanAbsDiff,changedPixels,errors']
        .concat(
          rows.map(
            (r) => `${r.label},${r.meanAbsDiff.toFixed(3)},${r.changedPixels},${r.errors.length}`
          )
        )
        .join('\n')
    )

    for (const r of rows) {
      console.log(
        `[wdw-anim] ${r.label.padEnd(32)} meanAbsDiff=${r.meanAbsDiff.toFixed(2)} changed=${r.changedPixels} errs=${r.errors.length}`
      )
    }

    const allErrors = rows.flatMap((r) => r.errors)
    expect(allErrors, `Errors:\n${allErrors.map((e) => `  • ${e}`).join('\n')}`).toEqual([])

    // Control row: paused + no animation must be stable.
    const control = rows.find((r) => r.label === 'control-paused-inferno')!
    expect(
      control.changedPixels,
      `Paused + no animation should be stable — got changedPixels=${control.changedPixels}`
    ).toBeLessThan(200)

    // Every phase-rotation row must have distinctly more drift than the
    // paused control — at least 5× noise floor.
    for (const algo of WDW_PHASE_ROTATION_ALGORITHMS) {
      const row = rows.find((r) => r.label === `phaseRotation-${algo}`)!
      expect(
        row.changedPixels,
        `[${algo}] phase rotation should cause temporal drift — got ${row.changedPixels}, control=${control.changedPixels}`
      ).toBeGreaterThan(Math.max(control.changedPixels * 5, 200))
    }

    // Worldline pulse should also drift.
    const worldline = rows.find((r) => r.label === 'worldline-inferno')!
    expect(
      worldline.changedPixels,
      `worldline pulse should cause temporal drift — got ${worldline.changedPixels}, control=${control.changedPixels}`
    ).toBeGreaterThan(Math.max(control.changedPixels * 5, 200))
  })
})
