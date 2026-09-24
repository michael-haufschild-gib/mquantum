/**
 * Regression: the plaquette vortex counter had no vacuum cut, so round-off
 * phases in the empty halo of a vortex-free Thomas-Fermi ground state were
 * counted as ~2.5·10⁴ vortices. With the four-corner vacuum floor the ground
 * state reads 0 and a charge-1 imprint reads one +1 plaquette per z-layer of
 * the dense cloud (≈ 44 on the default 64³ lattice) with no −1 windings.
 */
import { expect, test } from './fixtures'
import {
  gotoMode,
  readBecDiagnostics,
  requireWebGPU,
  waitForRendererReady,
  waitForStoreBridge,
} from './helpers/app-helpers'

async function seed(page: import('@playwright/test').Page, initialCondition: string) {
  await page.goto('/')
  await requireWebGPU(page, test.info())
  await gotoMode(page, 'becDynamics', 3)
  await waitForRendererReady(page)
  await waitForStoreBridge(page)
  await page.evaluate((ic) => {
    const s = window.__EXTENDED_OBJECT_STORE__!.getState()
    s.setBecInteractionStrength(500)
    s.setBecVortexCharge(1)
    s.setBecInitialCondition(ic as 'thomasFermi')
    s.resetBecField()
  }, initialCondition)
  await expect
    .poll(async () => (await readBecDiagnostics(page)).hasData, { timeout: 30_000 })
    .toBe(true)
}

test('vortex-free Thomas-Fermi ground state counts no vortices', async ({ page }) => {
  await seed(page, 'thomasFermi')
  // Sample across ~1 s of evolution: the breathing TF edge must not register
  // halo windings either.
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 200))))
    const d = await readBecDiagnostics(page)
    expect(d.vortexPlaquettes, `sample ${i}`).toBe(0)
  }
})

test('charge-1 imprint counts one +1 winding per dense z-layer', async ({ page }) => {
  await seed(page, 'vortexImprint')
  await expect
    .poll(async () => (await readBecDiagnostics(page)).vortexPositiveCharge, { timeout: 30_000 })
    .toBeGreaterThan(20)
  const d = await readBecDiagnostics(page)
  // The TF cloud spans 2·R_TF/dx ≈ 48 layers; the vacuum floor trims the
  // lowest-density caps.
  expect(d.vortexPositiveCharge).toBeLessThanOrEqual(64)
  expect(d.vortexNegativeCharge).toBe(0)
})
