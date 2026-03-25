/**
 * Accessibility audit: WCAG 2.1 AA compliance via axe-core.
 *
 * Tests DOM accessibility of UI controls, panels, and overlays.
 * Does NOT test the WebGPU canvas (not meaningful for a11y).
 *
 * Imports from '@playwright/test' instead of './fixtures' because:
 * - Custom fixtures enforce GPU/shader error collection, which is irrelevant here
 * - This allows the spec to run in CI on ubuntu-latest without a real GPU
 *   (the React UI mounts regardless of WebGPU availability)
 */

import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const APP_LOAD_TIMEOUT = 15_000

/** Wait for the React tree to mount (top bar visible). */
async function waitForAppReady(page: import('@playwright/test').Page): Promise<void> {
  await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: APP_LOAD_TIMEOUT })
}

/**
 * Format axe violations for readable test failure output.
 * Shows rule ID, impact, affected node count, and help URL.
 */
function formatViolations(violations: import('axe-core').Result[]): string {
  return violations
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} node${v.nodes.length === 1 ? '' : 's'})\n` +
        `  Help: ${v.helpUrl}`
    )
    .join('\n\n')
}

test.describe('Accessibility — WCAG 2.1 AA', () => {
  test.setTimeout(30_000)

  test('no critical or serious violations on initial load', async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('canvas') // WebGPU canvas — not meaningful for a11y
      .analyze()

    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    )

    expect(serious, `Accessibility violations found:\n\n${formatViolations(serious)}`).toEqual([])
  })

  test('left panel controls pass accessibility audit', async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)

    // Ensure left panel is open
    const toggle = page.getByTestId('toggle-left-panel')
    const expanded = await toggle.getAttribute('aria-expanded')
    if (expanded === 'false') {
      await toggle.click()
      await expect(page.getByTestId('left-panel')).toBeVisible()
    }

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .include('[data-testid="left-panel"]')
      .analyze()

    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    )

    expect(serious, `Left panel a11y violations:\n\n${formatViolations(serious)}`).toEqual([])
  })

  test('right panel controls pass accessibility audit', async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)

    // Ensure right panel is open
    const toggle = page.getByTestId('toggle-right-panel')
    const expanded = await toggle.getAttribute('aria-expanded')
    if (expanded === 'false') {
      await toggle.click()
      await expect(page.getByTestId('right-panel')).toBeVisible()
    }

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .include('[data-testid="right-panel"]')
      .analyze()

    const serious = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    )

    expect(serious, `Right panel a11y violations:\n\n${formatViolations(serious)}`).toEqual([])
  })
})
