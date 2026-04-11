/**
 * Skybox E2E Tests
 *
 * Verifies:
 * 1. All skybox option thumbnails/gradients are visible in the UI grid
 * 2. Selecting each skybox option produces no console errors or GPU warnings
 * 3. Classic KTX2 skyboxes render visible pixels on the canvas
 *
 * Console error detection is automatic — the `page` fixture from fixtures.ts
 * captures all console.error and GPU-pattern warnings, failing the test if any appear.
 */

import { expect, test } from './fixtures'
import {
  captureAndSamplePixels,
  getFrameCount,
  hideQuantumObject,
  requireWebGPU,
  waitForFirstFrame,
  waitForFrameAdvance,
  waitForRendererReady,
  waitForShaderCompilation,
} from './helpers/app-helpers'
import { RightPanel } from './pages/RightPanel'
import { TopBar } from './pages/TopBar'

test.use({ actionTimeout: 10_000 })

// All skybox option IDs from SkyboxControls.tsx — must stay in sync
const ALL_SKYBOX_IDS = [
  'none',
  'space_blue',
  'space_lightblue',
  'space_red',
  'procedural_aurora',
  'procedural_nebula',
  'procedural_crystalline',
  'procedural_horizon',
  'procedural_ocean',
  'procedural_twilight',
] as const

const CLASSIC_SKYBOX_IDS = ['space_blue', 'space_lightblue', 'space_red'] as const
const PROCEDURAL_SKYBOX_IDS = [
  'procedural_aurora',
  'procedural_nebula',
  'procedural_crystalline',
  'procedural_horizon',
  'procedural_ocean',
  'procedural_twilight',
] as const

/** Open the right panel Scene tab, expand Environment section, and ensure skybox grid is visible. */
async function openSkyboxSection(page: import('@playwright/test').Page): Promise<void> {
  const topBar = new TopBar(page)
  await topBar.openRightPanel()
  const rightPanel = new RightPanel(page)
  await rightPanel.waitForVisible()
  await rightPanel.switchTab('Scene')

  // The Environment section starts collapsed — click its header to expand
  const sectionHeader = page.getByTestId('section-environment-header')
  const isExpanded = await sectionHeader.getAttribute('aria-expanded').catch(() => null)
  if (isExpanded !== 'true') {
    await sectionHeader.click()
  }

  // Switch from the default "Color" sub-tab to the "Skybox" sub-tab
  const skyboxTab = page.getByRole('tab', { name: 'Skybox' })
  await skyboxTab.click()

  // Wait for the first skybox option to be visible (proves grid rendered)
  await expect(page.getByTestId('skybox-option-none')).toBeVisible({ timeout: 5_000 })
}

test.describe('skybox: thumbnail grid', () => {
  test('hardcoded ALL_SKYBOX_IDS matches the UI options', async ({ appPage: page }) => {
    // Regression guard for the hardcoded `ALL_SKYBOX_IDS` array above.
    // Without this test, adding a new skybox to `SkyboxControls.tsx` but
    // forgetting to update the list would silently leave the new option
    // with zero test coverage (the hardcoded iteration just wouldn't run
    // for it). Conversely, removing a skybox without updating the list
    // would fail `getByTestId` deeper in the suite with a cryptic error.
    // This test surfaces the mismatch early with a clear symmetric diff.
    await openSkyboxSection(page)

    const uiIds = await page.$$eval('[data-testid^="skybox-option-"]', (els) =>
      els
        .map((el) => el.getAttribute('data-testid')?.replace(/^skybox-option-/, '') ?? null)
        .filter((id): id is string => id !== null)
    )
    const uiSet = new Set(uiIds)
    const listSet = new Set(ALL_SKYBOX_IDS)

    const missingFromList = uiIds.filter(
      (id) => !listSet.has(id as (typeof ALL_SKYBOX_IDS)[number])
    )
    const missingFromUi = ALL_SKYBOX_IDS.filter((id) => !uiSet.has(id))

    expect(
      missingFromList,
      `ALL_SKYBOX_IDS is missing UI options: ${missingFromList.join(', ')}`
    ).toEqual([])
    expect(
      missingFromUi,
      `ALL_SKYBOX_IDS has orphan entries not in UI: ${missingFromUi.join(', ')}`
    ).toEqual([])
  })

  test('all skybox option thumbnails are visible', async ({ appPage: page }) => {
    await openSkyboxSection(page)

    for (const id of ALL_SKYBOX_IDS) {
      const option = page.getByTestId(`skybox-option-${id}`)
      await option.scrollIntoViewIfNeeded()
      await expect(option, `skybox option "${id}" should be visible`).toBeVisible({
        timeout: 5_000,
      })

      // Verify visual content: classic skyboxes have <img>, procedurals have gradient <div>
      const img = option.locator('img')
      const hasImg = await img.count()

      if (hasImg > 0) {
        // Classic skybox: verify image loaded successfully (not broken)
        const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth)
        expect(
          naturalWidth,
          `thumbnail image for "${id}" must load (naturalWidth > 0)`
        ).toBeGreaterThan(0)
      }
      // Procedural and 'none' options use CSS gradient backgrounds — visibility check is sufficient
    }
  })
})

test.describe('skybox: selection without errors', () => {
  // The page fixture automatically captures console.error and GPU warnings.
  // If any skybox option triggers errors, the test fails via the fixture's
  // afterEach assertion — no explicit error checking needed in the test body.

  for (const id of ALL_SKYBOX_IDS) {
    test(`selecting "${id}" produces no console errors`, async ({ appPage: page }, testInfo) => {
      await requireWebGPU(page, testInfo)
      await waitForRendererReady(page)
      await waitForFirstFrame(page)
      await openSkyboxSection(page)

      // Select this skybox option (scroll into view for options near grid bottom)
      const option = page.getByTestId(`skybox-option-${id}`)
      await option.scrollIntoViewIfNeeded()
      await option.click()

      // Verify store updated
      await expect(async () => {
        const selection = await page.evaluate(async () => {
          const mod = await import('/src/stores/environmentStore.ts')
          return mod.useEnvironmentStore.getState().skyboxSelection
        })
        expect(selection).toBe(id)
      }).toPass({ timeout: 3_000 })

      // Wait for the skybox to render several frames — any errors from KTX2
      // loading, shader compilation, or GPU pipeline will be caught by the
      // fixture's console error collector.
      const fc = await getFrameCount(page)
      await waitForFrameAdvance(page, fc + 30)
    })
  }
})

test.describe('skybox: KTX2 classic skyboxes render pixels', () => {
  for (const id of CLASSIC_SKYBOX_IDS) {
    test(`"${id}" renders visible skybox pixels`, async ({ appPage: page }, testInfo) => {
      await requireWebGPU(page, testInfo)
      await waitForRendererReady(page)
      await waitForFirstFrame(page)

      // Hide the quantum object so only the skybox is visible
      await hideQuantumObject(page)

      // Open skybox section and select the classic skybox
      await openSkyboxSection(page)
      const option = page.getByTestId(`skybox-option-${id}`)
      await option.scrollIntoViewIfNeeded()
      await option.click()

      // Wait for KTX2 to load + shader swap + settle
      await waitForShaderCompilation(page)
      const fc = await getFrameCount(page)
      await waitForFrameAdvance(page, fc + 60)

      // Verify the skybox rendered non-black pixels
      const { nonBgPixels, totalPixels } = await captureAndSamplePixels(page)
      expect(
        nonBgPixels,
        `"${id}" skybox must render visible pixels (got ${nonBgPixels}/${totalPixels})`
      ).toBeGreaterThanOrEqual(5)
    })
  }
})

test.describe('skybox: procedural skyboxes render pixels', () => {
  for (const id of PROCEDURAL_SKYBOX_IDS) {
    test(`"${id}" renders visible skybox pixels`, async ({ appPage: page }, testInfo) => {
      await requireWebGPU(page, testInfo)
      await waitForRendererReady(page)
      await waitForFirstFrame(page)

      // Hide the quantum object so only the skybox is visible
      await hideQuantumObject(page)

      // Open skybox section and select the procedural skybox
      await openSkyboxSection(page)
      const option = page.getByTestId(`skybox-option-${id}`)
      await option.scrollIntoViewIfNeeded()
      await option.click()

      // Wait for shader compilation + settle
      await waitForShaderCompilation(page)
      const fc = await getFrameCount(page)
      await waitForFrameAdvance(page, fc + 60)

      // Verify the skybox rendered non-black pixels
      const { nonBgPixels, totalPixels } = await captureAndSamplePixels(page)
      expect(
        nonBgPixels,
        `"${id}" skybox must render visible pixels (got ${nonBgPixels}/${totalPixels})`
      ).toBeGreaterThanOrEqual(5)
    })
  }
})
