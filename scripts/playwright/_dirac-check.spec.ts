import { expect, test } from '@playwright/test'

test('dirac ui full inspection', async ({ page }) => {
  await page.goto('/?t=schroedinger&d=3&qm=diracEquation', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid="right-panel"]', { state: 'visible', timeout: 10_000 })
  await page.getByTestId('tab-analysis').click({ force: true })
  await expect(page.getByTestId('right-panel')).toContainText('QUANTUM EFFECTS', {
    timeout: 10_000,
  })

  const full = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="right-panel"]')
    const text = (panel as HTMLElement)?.innerText ?? ''
    const hasNodal = text.includes('Nodal')
    const hasUnc = text.includes('Uncertainty')
    const hasPhaseMat = text.includes('Phase Materiality')
    const switchCount = panel ? panel.querySelectorAll('button[role="switch"]').length : 0
    const qeStart = text.indexOf('QUANTUM EFFECTS')
    const snippet = qeStart !== -1 ? text.slice(qeStart, qeStart + 400) : 'NOT FOUND'
    return { hasNodal, hasUnc, hasPhaseMat, switchCount, snippet }
  })

  expect(full.snippet).not.toBe('NOT FOUND')
  expect(full.switchCount).toBeGreaterThan(0)
  expect(full.hasNodal).toBe(true)
  expect(full.hasUnc).toBe(true)
  expect(full.hasPhaseMat).toBe(true)
})
