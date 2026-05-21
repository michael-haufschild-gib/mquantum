#!/usr/bin/env node
/**
 * One-off baseline screenshot script for the overnight UI overhaul.
 * Not a permanent test; lives under scripts/ for the duration of the loop.
 *
 * Usage:
 *   node scripts/ui-overhaul-baseline.mjs <outDir>
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const outDir = resolve(process.argv[2] || 'screenshots/ui-overhaul-baseline')
await mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-webgpu'] })
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
})
const page = await ctx.newPage()

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`)
})

async function waitRendererReady() {
  await page
    .locator('[data-testid="webgpu-container"][data-renderer-state="ready"]')
    .waitFor({ timeout: 20000 })
  await page.waitForFunction(
    () => {
      const c = document.querySelector('[data-testid="webgpu-canvas"]')
      return parseInt(c?.getAttribute('data-frame-count') ?? '0', 10) > 0
    },
    { timeout: 20000 }
  )
}

async function shot(name) {
  await page.waitForTimeout(400) // settle for animations
  await page.screenshot({ path: `${outDir}/${name}`, fullPage: false })
  console.log(`  saved ${name}`)
}

const results = []
async function step(name, fn) {
  try {
    await fn()
    results.push(`OK ${name}`)
  } catch (e) {
    results.push(`FAIL ${name}: ${e.message}`)
  }
}

console.log(`Saving to ${outDir}`)

await step('01-default-load', async () => {
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' })
  await waitRendererReady()
  await shot('01-default-load.png')
})

await step('02-right-panel-object', async () => {
  // Object tab is default. Click each section header to expand.
  await page.getByTestId('right-panel-tabs').waitFor()
  // ensure on object tab
  await page.getByRole('tab', { name: /Object/i }).click({ force: true })
  await page.waitForTimeout(250)
  await shot('02-right-panel-object.png')
})

await step('03-right-panel-analysis', async () => {
  await page.getByRole('tab', { name: /Analysis/i }).click({ force: true })
  await page.waitForTimeout(350)
  await shot('03a-right-panel-analysis-top.png')
  // scroll the right panel content
  await page.evaluate(() => {
    const el = document.querySelector('#inspector-panel [class*="overflow-y-auto"]')
    if (el) el.scrollTop = 400
  })
  await page.waitForTimeout(200)
  await shot('03b-right-panel-analysis-mid.png')
  await page.evaluate(() => {
    const el = document.querySelector('#inspector-panel [class*="overflow-y-auto"]')
    if (el) el.scrollTop = el.scrollHeight
  })
  await page.waitForTimeout(200)
  await shot('03c-right-panel-analysis-bottom.png')
})

await step('04-right-panel-scene', async () => {
  await page.getByRole('tab', { name: /Scene/i }).click({ force: true })
  await page.waitForTimeout(300)
  await shot('04-right-panel-scene.png')
})

await step('05-right-panel-system', async () => {
  await page.getByRole('tab', { name: /System/i }).click({ force: true })
  await page.waitForTimeout(300)
  await shot('05-right-panel-system.png')
})

await step('06-left-panel-type', async () => {
  await page.getByTestId('left-panel-tabs').waitFor()
  await page
    .locator('[data-testid="left-panel-tabs"] [role="tab"]', { hasText: /Type/i })
    .click({ force: true })
  await page.waitForTimeout(300)
  await shot('06-left-panel-type.png')
})

await step('07-left-panel-geometry', async () => {
  await page
    .locator('[data-testid="left-panel-tabs"] [role="tab"]', { hasText: /Geometry/i })
    .click({ force: true })
  await page.waitForTimeout(350)
  await shot('07-left-panel-geometry.png')
})

await step('08-timeline-effects', async () => {
  const effects = page.getByRole('button', { name: /toggle animations drawer/i })
  if ((await effects.count()) > 0) {
    await effects.first().click({ force: true })
    await page.waitForTimeout(450)
  }
  await shot('08-timeline-effects.png')
  if ((await effects.count()) > 0) await effects.first().click({ force: true })
})

await step('09-timeline-rotate', async () => {
  const rot = page.getByRole('button', { name: /toggle rotation drawer/i })
  if ((await rot.count()) > 0) {
    await rot.first().click({ force: true })
    await page.waitForTimeout(450)
  }
  await shot('09-timeline-rotate.png')
  if ((await rot.count()) > 0) await rot.first().click({ force: true })
})

await step('10-top-bar-file-menu', async () => {
  await page.getByTestId('menu-file').click({ force: true })
  await page.waitForTimeout(250)
  await shot('10-top-bar-file-menu.png')
  await page.keyboard.press('Escape')
})

await step('11-shortcuts-overlay', async () => {
  // Open Shortcuts overlay via View menu
  await page.getByTestId('menu-view').click({ force: true })
  await page.waitForTimeout(150)
  const shortcutsItem = page.getByRole('menuitem', { name: /shortcuts/i })
  if ((await shortcutsItem.count()) > 0) {
    await shortcutsItem.first().click({ force: true })
    await page.waitForTimeout(400)
    await shot('11-shortcuts-overlay.png')
    await page.keyboard.press('Escape')
  }
})

await step('12-scene-manager-modal', async () => {
  await page.getByTestId('menu-scenes').click({ force: true })
  await page.waitForTimeout(150)
  const manageItem = page.getByRole('menuitem', { name: /manage scenes/i })
  if ((await manageItem.count()) > 0) {
    await manageItem.first().click({ force: true })
    await page.waitForTimeout(450)
    await shot('12-scene-manager-modal.png')
    await page.keyboard.press('Escape')
  } else {
    await page.keyboard.press('Escape')
  }
})

await step('13-command-palette', async () => {
  await page.keyboard.press('Meta+k')
  await page.waitForTimeout(450)
  await shot('13-command-palette.png')
  await page.keyboard.press('Escape')
})

await step('14-light-mode', async () => {
  // Switch to light mode via the theme store; the View menu has a
  // "Switch Mode" command in the command palette.
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-mode', 'light')
  })
  await page.waitForTimeout(450)
  await shot('14-light-mode.png')
  // restore
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-mode', 'dark')
  })
})

console.log('\nResults:')
results.forEach((r) => console.log('  ' + r))
console.log(`\nerrors (filtered): ${errors.filter((e) => !/favicon|deprecated/.test(e)).length}`)
errors.slice(0, 10).forEach((e) => console.log('  ' + e))

await browser.close()
process.exit(0)
