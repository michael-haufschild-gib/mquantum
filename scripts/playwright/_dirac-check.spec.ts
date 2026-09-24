import { expect, test } from '@playwright/test'

test('dirac ui full inspection', async ({ page }) => {
  await page.goto('/?t=schroedinger&d=3&qm=diracEquation', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="right-panel"]', { state: 'visible', timeout: 10_000 })
  // Tabs build `${testId}-tab-${value}`; the bare 'tab-analysis' id never existed.
  await page.getByTestId('right-panel-tabs-tab-analysis').click({ force: true })
  // Section titles are uppercased by CSS only; textContent keeps "Quantum Effects".
  await expect(page.getByTestId('right-panel')).toContainText(/quantum effects/i, {
    timeout: 10_000,
  })

  const full = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="right-panel"]')
    const text = (panel as HTMLElement)?.innerText ?? ''
    const hasNodal = text.includes('Nodal')
    const hasUnc = text.includes('Uncertainty')
    const hasPhaseMat = text.includes('Phase Materiality')
    // The Switch primitive renders <input role="switch">, not a <button>.
    const switchCount = panel ? panel.querySelectorAll('[role="switch"]').length : 0
    const qeStart = text.search(/quantum effects/i)
    const snippet = qeStart !== -1 ? text.slice(qeStart, qeStart + 400) : 'NOT FOUND'
    return { hasNodal, hasUnc, hasPhaseMat, switchCount, snippet }
  })

  expect(full.snippet).not.toBe('NOT FOUND')
  expect(full.switchCount).toBeGreaterThan(0)
  // Dirac is a compute mode: Nodal Surfaces, Uncertainty Boundary and Phase
  // Materiality are analytic-only and deliberately hidden (isComputeMode gates
  // in SchroedingerQuantumEffectsSection / SchroedingerSpacetimeLensControls);
  // backreaction lensing still runs on the density-grid raymarcher.
  expect(full.hasNodal).toBe(false)
  expect(full.hasUnc).toBe(false)
  expect(full.hasPhaseMat).toBe(false)
})
