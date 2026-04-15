import { test } from '@playwright/test'

test('dirac ui full inspection', async ({ page }) => {
  await page.goto('/?t=schroedinger&d=3&qm=diracEquation', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  await page.getByTestId('tab-analysis').click({ force: true })
  await page.waitForTimeout(500)

  // Check every container that mentions a quantum-effects-related term
  const full = await page.evaluate(() => {
    const panel = document.querySelector('[data-testid="right-panel"]')
    const text = (panel as HTMLElement)?.innerText ?? ''
    const hasNodal = text.includes('Nodal')
    const hasUnc = text.includes('Uncertainty')
    const hasPhaseMat = text.includes('Phase Materiality')
    const hasSwitch = Array.from(document.querySelectorAll('button[role="switch"]')).length
    // Snippets
    const qeStart = text.indexOf('QUANTUM EFFECTS')
    const snippet = qeStart !== -1 ? text.slice(qeStart, qeStart + 400) : 'NOT FOUND'
    return { hasNodal, hasUnc, hasPhaseMat, switchCount: hasSwitch, snippet }
  })
  console.log('FULL:', JSON.stringify(full, null, 2))
})
