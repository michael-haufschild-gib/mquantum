/**
 * Regression: the TDSE / BEC / Pauli drift renormalization (which runs only
 * with the PML absorber off) rescaled ψ to the norm latched at init. After
 * the absorber had removed probability, switching it off re-inflated the
 * surviving wave to the pre-absorption norm — absorbed probability
 * "reappeared". The target is now re-latched at the on → off transition.
 */
import { expect, test } from './fixtures'
import {
  gotoModeWithParams,
  gotoPauli,
  readDiracDiagnostics,
  readPauliDiagnostics,
  readTdseDiagnostics,
  requireWebGPU,
  waitForRendererReady,
  waitForSimulationFrames,
  waitForStoreBridge,
} from './helpers/app-helpers'

test.setTimeout(180_000)

test('TDSE: switching the absorber off keeps the absorbed norm', async ({ page }) => {
  await page.goto('/')
  await requireWebGPU(page, test.info())
  // Free packet (p = 5) with the PML absorber on: it reaches the boundary
  // within ~0.6 time units and is mostly absorbed by t ≈ 1.
  await gotoModeWithParams(page, 'tdseDynamics', 3, { diag: '1', pot: 'free', abs: '1' })
  await waitForRendererReady(page)
  await waitForStoreBridge(page)

  // First real readback (the store's placeholder totalNorm is 1 before data).
  let initialNorm = 0
  await expect
    .poll(
      async () => {
        const d = await readTdseDiagnostics(page)
        if (d.hasData && d.simTime > 0 && initialNorm === 0) initialNorm = d.totalNorm
        return initialNorm
      },
      { timeout: 30_000, intervals: [16] }
    )
    .toBeGreaterThan(0)

  // Genuine absorption before switching the absorber off.
  let absorbedNorm = Infinity
  await expect
    .poll(
      async () => {
        absorbedNorm = (await readTdseDiagnostics(page)).totalNorm
        return absorbedNorm
      },
      { timeout: 30_000 }
    )
    .toBeLessThan(0.5 * initialNorm)

  await page.evaluate(() =>
    window.__EXTENDED_OBJECT_STORE__!.getState().setTdseAbsorberEnabled(false)
  )
  await waitForSimulationFrames(page, 180)
  const after = (await readTdseDiagnostics(page)).totalNorm

  // The absorber keeps damping until the toggle lands, then evolution is
  // unitary: the norm must stay at (or below) the absorbed level sampled
  // before the switch, not climb back to the initial norm.
  expect(after, `after=${after} absorbed=${absorbedNorm} initial=${initialNorm}`).toBeLessThan(
    absorbedNorm * 1.02
  )
  expect(after).toBeGreaterThan(0)
})

test('Dirac: switching the absorber off keeps the absorbed norm', async ({ page }) => {
  await page.goto('/')
  await requireWebGPU(page, test.info())
  // Default Dirac packet (k₀ = 5 along x from x = −1.5) with the PML on.
  await gotoModeWithParams(page, 'diracEquation', 3, {})
  await waitForRendererReady(page)
  await waitForStoreBridge(page)
  await page.evaluate(() =>
    window.__EXTENDED_OBJECT_STORE__!.getState().setDiracAbsorberEnabled(true)
  )

  let initialNorm = 0
  await expect
    .poll(
      async () => {
        const d = await readDiracDiagnostics(page)
        if (d.hasData && initialNorm === 0) initialNorm = d.totalNorm
        return initialNorm
      },
      { timeout: 30_000, intervals: [16] }
    )
    .toBeGreaterThan(0)

  let absorbedNorm = Infinity
  await expect
    .poll(
      async () => {
        absorbedNorm = (await readDiracDiagnostics(page)).totalNorm
        return absorbedNorm
      },
      { timeout: 60_000 }
    )
    .toBeLessThan(0.5 * initialNorm)

  await page.evaluate(() =>
    window.__EXTENDED_OBJECT_STORE__!.getState().setDiracAbsorberEnabled(false)
  )
  await waitForSimulationFrames(page, 180)
  const after = (await readDiracDiagnostics(page)).totalNorm

  expect(after, `after=${after} absorbed=${absorbedNorm} initial=${initialNorm}`).toBeLessThan(
    absorbedNorm * 1.02
  )
  expect(after).toBeGreaterThan(0)
})

test('Pauli: switching the absorber off keeps the absorbed norm', async ({ page }) => {
  await page.goto('/')
  await requireWebGPU(page, test.info())
  await gotoPauli(page, 3)
  await waitForStoreBridge(page)
  // Boost the packet (k₀ = 5 along x) so it reaches the PML quickly.
  await page.evaluate(() => {
    const s = window.__EXTENDED_OBJECT_STORE__!.getState()
    s.setPauliAbsorberEnabled(true)
    s.setPauliPacketMomentum(0, 5)
  })
  await waitForSimulationFrames(page, 10)

  let initialNorm = 0
  await expect
    .poll(
      async () => {
        const d = await readPauliDiagnostics(page)
        if (d.hasData && initialNorm === 0) initialNorm = d.totalNorm
        return initialNorm
      },
      { timeout: 30_000, intervals: [16] }
    )
    .toBeGreaterThan(0)

  let absorbedNorm = Infinity
  await expect
    .poll(
      async () => {
        absorbedNorm = (await readPauliDiagnostics(page)).totalNorm
        return absorbedNorm
      },
      { timeout: 60_000 }
    )
    .toBeLessThan(0.5 * initialNorm)

  await page.evaluate(() =>
    window.__EXTENDED_OBJECT_STORE__!.getState().setPauliAbsorberEnabled(false)
  )
  await waitForSimulationFrames(page, 180)
  const after = (await readPauliDiagnostics(page)).totalNorm

  expect(after, `after=${after} absorbed=${absorbedNorm} initial=${initialNorm}`).toBeLessThan(
    absorbedNorm * 1.02
  )
  expect(after).toBeGreaterThan(0)
})
