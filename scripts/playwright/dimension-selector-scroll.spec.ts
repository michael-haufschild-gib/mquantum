/**
 * Dimension Selector Scroll Button Tests
 *
 * Playwright tests verifying that clicking on the scroll caret buttons
 * in the DimensionSelector does NOT trigger dimension changes on the
 * buttons positioned below the carets.
 *
 * Run with:
 *   npx playwright test dimension-selector-scroll.spec.ts
 */

import { ConsoleMessage, expect, Page, test } from '@playwright/test';
import { installWebGLShaderCompileLinkGuard } from './webglShaderCompileLinkGuard';

// Extended timeout for complex operations
test.setTimeout(120000);

/** Collected console messages for verification */
interface ErrorCollector {
  errors: string[];
  webglErrors: string[];
  graphWarnings: string[];
  warnings: string[];
  pageErrors: string[];
  dimensionChangeLogs: string[];
}

/**
 * Set up console error and warning collection BEFORE navigation.
 */
function setupErrorCollection(page: Page): ErrorCollector {
  const collector: ErrorCollector = {
    errors: [],
    webglErrors: [],
    graphWarnings: [],
    warnings: [],
    pageErrors: [],
    dimensionChangeLogs: [],
  };

  page.on('pageerror', (err) => {
    collector.pageErrors.push(err.message);
  });

  page.on('console', (msg: ConsoleMessage) => {
    const text = msg.text();
    const type = msg.type();

    // Capture dimension change logs for verification
    if (text.includes('[DIM-CHANGE]')) {
      collector.dimensionChangeLogs.push(text);
    }

    if (type === 'error') {
      collector.errors.push(text);

      if (
        text.includes('WebGL') ||
        text.includes('GL_') ||
        text.includes('shader') ||
        text.includes('GLSL') ||
        text.includes('GL ERROR') ||
        text.includes('INVALID_OPERATION') ||
        text.includes('INVALID_VALUE') ||
        text.includes('INVALID_ENUM')
      ) {
        collector.webglErrors.push(text);
      }
    }

    if (type === 'warning') {
      collector.warnings.push(text);

      if (
        text.includes('Graph compilation') ||
        text.includes('RenderGraph') ||
        text.includes('render graph') ||
        text.includes('Resource') ||
        text.includes('Cycle detected') ||
        text.includes('Unused resource') ||
        text.includes('Missing resource') ||
        text.includes('pass dependency') ||
        text.includes('not found')
      ) {
        collector.graphWarnings.push(text);
      }
    }

    if (type === 'error') {
      if (
        text.includes('Graph compilation') ||
        text.includes('RenderGraph') ||
        text.includes('render graph') ||
        text.includes('Cycle detected') ||
        text.includes('pass dependency')
      ) {
        collector.graphWarnings.push(text);
      }
    }
  });

  return collector;
}

/**
 * Verify no critical errors occurred.
 */
function verifyNoErrors(collector: ErrorCollector): void {
  if (collector.pageErrors.length > 0) {
    throw new Error(`Page errors detected:\n${collector.pageErrors.join('\n')}`);
  }

  if (collector.webglErrors.length > 0) {
    throw new Error(`WebGL errors detected:\n${collector.webglErrors.join('\n')}`);
  }

  if (collector.graphWarnings.length > 0) {
    throw new Error(`Render graph warnings detected:\n${collector.graphWarnings.join('\n')}`);
  }

  const criticalErrors = collector.errors.filter(
    (e) =>
      !e.includes('ResizeObserver') &&
      !e.includes('net::') &&
      !e.includes('favicon') &&
      !e.includes('Download the React DevTools')
  );

  if (criticalErrors.length > 0) {
    throw new Error(`Console errors detected:\n${criticalErrors.join('\n')}`);
  }
}

/**
 * Wait for the application to fully load including shader compilation
 */
async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');

  // Wait for a visible canvas element (WebGL renderer)
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 });

  // Wait for any loading overlays to disappear
  try {
    const loadingOverlay = page.locator('[data-testid="loading-overlay"]');
    await loadingOverlay.waitFor({ state: 'hidden', timeout: 10000 });
  } catch {
    // Overlay may not exist - that's fine
  }

  // Wait for shader compilation overlay to disappear
  try {
    const shaderOverlay = page.locator('text=Shader compilation in progress');
    await shaderOverlay.waitFor({ state: 'hidden', timeout: 60000 });
  } catch {
    // Overlay may have already disappeared
  }

  // Wait for "Building" messages to disappear
  try {
    const buildingOverlay = page.locator('text=Building');
    await buildingOverlay.waitFor({ state: 'hidden', timeout: 60000 });
  } catch {
    // Overlay may have already disappeared
  }

  // Additional wait for render stabilization
  await page.waitForTimeout(2000);
}

// Test viewport that should trigger scroll buttons in dimension selector
const VIEWPORT = { width: 320, height: 568 }; // Narrow mobile viewport

test.describe('Dimension Selector - Scroll Button Event Isolation', () => {
  test('Clicking scroll caret buttons should NOT change dimension selection', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORT);
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);

    // Open left panel to access dimension selector
    const toggleLeftPanel = page.locator('[data-testid="toggle-left-panel"]');
    await toggleLeftPanel.click();
    await page.waitForTimeout(500);

    // Find the dimension selector
    const dimensionSelector = page.locator('[data-testid="dimension-selector"]');
    await expect(dimensionSelector).toBeVisible({ timeout: 10000 });

    // Get the initially selected dimension button
    const selectedButton = dimensionSelector.locator('button[aria-checked="true"]');
    const initialDimensionText = await selectedButton.textContent();
    expect(initialDimensionText).toBeTruthy();

    // Find scroll buttons by their aria-labels
    const scrollLeftButton = page.locator('button[aria-label="Scroll left"]');
    const scrollRightButton = page.locator('button[aria-label="Scroll right"]');

    // Check if scroll right button is visible (likely to be visible on narrow viewport)
    const scrollRightVisible = await scrollRightButton.isVisible();

    if (scrollRightVisible) {
      // Click the scroll right button multiple times
      await scrollRightButton.click();
      await page.waitForTimeout(300);
      await scrollRightButton.click();
      await page.waitForTimeout(300);

      // Verify dimension didn't change
      const afterRightScrollDimension = await dimensionSelector
        .locator('button[aria-checked="true"]')
        .textContent();
      expect(afterRightScrollDimension).toBe(initialDimensionText);
    }

    // Check if scroll left button becomes visible after scrolling
    const scrollLeftVisible = await scrollLeftButton.isVisible();

    if (scrollLeftVisible) {
      // Click the scroll left button multiple times
      await scrollLeftButton.click();
      await page.waitForTimeout(300);
      await scrollLeftButton.click();
      await page.waitForTimeout(300);

      // Verify dimension didn't change
      const afterLeftScrollDimension = await dimensionSelector
        .locator('button[aria-checked="true"]')
        .textContent();
      expect(afterLeftScrollDimension).toBe(initialDimensionText);
    }

    verifyNoErrors(collector);
  });

  test('Clicking on dimension buttons directly should still change selection', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 }); // Wider viewport
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);

    // Find the dimension selector (should be visible on desktop)
    const dimensionSelector = page.locator('[data-testid="dimension-selector"]');
    await expect(dimensionSelector).toBeVisible({ timeout: 10000 });

    // Get the initially selected dimension
    const selectedButton = dimensionSelector.locator('button[aria-checked="true"]');
    const initialDimensionText = await selectedButton.textContent();

    // Find and click on a different dimension button (e.g., 5D)
    const fiveDButton = dimensionSelector.locator('button:has-text("5D")');
    if (await fiveDButton.isVisible()) {
      await fiveDButton.click();
      await page.waitForTimeout(300);

      // Verify dimension changed to 5D
      const newSelectedButton = dimensionSelector.locator('button[aria-checked="true"]');
      const newDimensionText = await newSelectedButton.textContent();

      if (initialDimensionText !== '5D') {
        expect(newDimensionText).toBe('5D');
      }
    }

    verifyNoErrors(collector);
  });

  test('Scroll buttons should actually scroll the dimension list', async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);

    // Open left panel to access dimension selector
    const toggleLeftPanel = page.locator('[data-testid="toggle-left-panel"]');
    await toggleLeftPanel.click();
    await page.waitForTimeout(500);

    // Find the dimension selector
    const dimensionSelector = page.locator('[data-testid="dimension-selector"]');
    await expect(dimensionSelector).toBeVisible({ timeout: 10000 });

    // Find the scrollable container (parent of dimension-selector)
    const scrollContainer = dimensionSelector.locator('xpath=..');

    // Get initial scroll position
    const initialScrollLeft = await scrollContainer.evaluate((el) => el.scrollLeft);

    // Find scroll right button
    const scrollRightButton = page.locator('button[aria-label="Scroll right"]');

    if (await scrollRightButton.isVisible()) {
      await scrollRightButton.click();
      await page.waitForTimeout(500); // Wait for smooth scroll animation

      // Verify scroll position changed
      const newScrollLeft = await scrollContainer.evaluate((el) => el.scrollLeft);
      expect(newScrollLeft).toBeGreaterThan(initialScrollLeft);
    }

    verifyNoErrors(collector);
  });

  test('Take screenshot of dimension selector with scroll buttons', async ({ page }) => {
    await page.setViewportSize(VIEWPORT);
    await installWebGLShaderCompileLinkGuard(page);

    await page.goto('/');
    await waitForAppReady(page);

    // Open left panel to access dimension selector
    const toggleLeftPanel = page.locator('[data-testid="toggle-left-panel"]');
    await toggleLeftPanel.click();
    await page.waitForTimeout(500);

    // Take screenshot
    await page.screenshot({
      path: 'screenshots/dimension-selector-narrow-viewport.png',
      fullPage: false,
    });
  });
});







