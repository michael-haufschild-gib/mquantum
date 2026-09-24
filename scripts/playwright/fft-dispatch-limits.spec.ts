/**
 * Regression: the shared-memory FFT used one workgroup per pencil, so default
 * high-D grids dispatched more than the 65535 workgroups per dimension the
 * device allows (TDSE/BEC 9D 4⁹ → 65536, Pauli 7D 8⁷ → 262144) and every
 * Strang-step command buffer was rejected. The fixtures fail the test on any
 * GPU validation message; the norm checks confirm the steps ran unitarily.
 */
import { expect, test } from './fixtures'
import {
  gotoModeWithParams,
  readPauliDiagnostics,
  readTdseDiagnostics,
  requireWebGPU,
  waitForAppLoaded,
  waitForRendererReady,
  waitForStoreBridge,
} from './helpers/app-helpers'

test('9D TDSE (default 4^9 grid) steps without GPU validation errors', async ({ page }) => {
  await requireWebGPU(page, test)
  await gotoModeWithParams(page, 'tdseDynamics', 9, { diag: '1', abs: '0' })
  await waitForRendererReady(page)
  await waitForStoreBridge(page)
  await page.evaluate(() => window.__EXTENDED_OBJECT_STORE__!.getState().setTdseLatticeDim(9))
  const grid = await page.evaluate(
    () => window.__EXTENDED_OBJECT_STORE__!.getState().schroedinger.tdse.gridSize
  )
  expect(grid.slice(0, 9)).toEqual([4, 4, 4, 4, 4, 4, 4, 4, 4])
  await expect
    .poll(async () => (await readTdseDiagnostics(page)).simTime, { timeout: 30_000 })
    .toBeGreaterThan(0)
  const a = await readTdseDiagnostics(page)
  await expect
    .poll(async () => (await readTdseDiagnostics(page)).simTime, { timeout: 30_000 })
    .toBeGreaterThan(a.simTime)
  const b = await readTdseDiagnostics(page)
  expect(Math.abs(b.normDrift)).toBeLessThan(0.01)
})

test('7D Pauli (default 8^7 grid) steps without GPU validation errors', async ({ page }) => {
  await requireWebGPU(page, test)
  await page.goto('/?t=pauliSpinor&d=7')
  await waitForAppLoaded(page)
  await waitForRendererReady(page)
  await waitForStoreBridge(page)
  await expect
    .poll(async () => (await readPauliDiagnostics(page)).hasData, { timeout: 30_000 })
    .toBe(true)
  const d = await readPauliDiagnostics(page)
  expect(Math.abs(d.normDrift)).toBeLessThan(0.01)
})
