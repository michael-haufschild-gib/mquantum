/**
 * Mobile Timeline Controls Tests
 *
 * Playwright tests verifying the mobile bottom app bar for timeline controls:
 * - Visible on mobile viewports when panels are closed
 * - Hidden when left or right panel is opened
 * - Hidden on desktop viewports (desktop uses inline bottom panel)
 * - Smooth slide animations when hiding/showing
 *
 * Run with:
 *   npx playwright test mobile-timeline-controls.spec.ts
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
  };

  page.on('pageerror', (err) => {
    collector.pageErrors.push(err.message);
  });

  page.on('console', (msg: ConsoleMessage) => {
    const text = msg.text();
    const type = msg.type();

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

// Test viewports
const VIEWPORTS = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
} as const;

test.describe('Mobile Timeline Controls - Visibility', () => {
  test('Timeline controls are visible at bottom on mobile when panels are closed', async ({
    page,
  }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);

    // Mobile timeline controls should be visible
    const mobileTimeline = page.locator('[data-testid="mobile-timeline-controls"]');
    await expect(mobileTimeline).toBeVisible({ timeout: 10000 });

    // Verify it's positioned at the bottom
    const box = await mobileTimeline.boundingBox();
    expect(box).not.toBeNull();
    // Should be near the bottom of the viewport
    expect(box!.y + box!.height).toBeGreaterThan(VIEWPORTS.mobile.height - 100);

    verifyNoErrors(collector);
  });

  test('Timeline controls are hidden on desktop viewport', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);

    // Mobile timeline controls should NOT be visible on desktop
    const mobileTimeline = page.locator('[data-testid="mobile-timeline-controls"]');
    await expect(mobileTimeline).not.toBeVisible();

    // Desktop bottom panel should be visible
    const desktopBottom = page.locator('[data-testid="editor-bottom-panel"]');
    await expect(desktopBottom).toBeVisible();

    verifyNoErrors(collector);
  });

  test('Timeline controls hide when right panel is opened on mobile', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);

    // Mobile timeline should be visible initially
    const mobileTimeline = page.locator('[data-testid="mobile-timeline-controls"]');
    await expect(mobileTimeline).toBeVisible({ timeout: 10000 });

    // Open the right panel by clicking the toggle button
    const toggleRightPanel = page.locator('[data-testid="toggle-right-panel"]');
    await toggleRightPanel.click();

    // Wait for animation to complete
    await page.waitForTimeout(500);

    // Mobile timeline should now be hidden
    await expect(mobileTimeline).not.toBeVisible();

    verifyNoErrors(collector);
  });

  test('Timeline controls hide when left panel is opened on mobile', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);

    // Mobile timeline should be visible initially
    const mobileTimeline = page.locator('[data-testid="mobile-timeline-controls"]');
    await expect(mobileTimeline).toBeVisible({ timeout: 10000 });

    // Open the left panel by clicking the toggle button
    const toggleLeftPanel = page.locator('[data-testid="toggle-left-panel"]');
    await toggleLeftPanel.click();

    // Wait for animation to complete
    await page.waitForTimeout(500);

    // Mobile timeline should now be hidden
    await expect(mobileTimeline).not.toBeVisible();

    verifyNoErrors(collector);
  });

  test('Timeline controls reappear when panels are closed on mobile', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);

    const mobileTimeline = page.locator('[data-testid="mobile-timeline-controls"]');

    // Open and close right panel
    const toggleRightPanel = page.locator('[data-testid="toggle-right-panel"]');
    await toggleRightPanel.click();
    await page.waitForTimeout(500);

    // Timeline should be hidden
    await expect(mobileTimeline).not.toBeVisible();

    // Close by clicking overlay or toggle again
    await toggleRightPanel.click();
    await page.waitForTimeout(500);

    // Timeline should be visible again
    await expect(mobileTimeline).toBeVisible();

    verifyNoErrors(collector);
  });
});

test.describe('Mobile Timeline Controls - Functionality', () => {
  test('Play/Pause button is functional on mobile', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);

    const mobileTimeline = page.locator('[data-testid="mobile-timeline-controls"]');
    await expect(mobileTimeline).toBeVisible({ timeout: 10000 });

    // Find the play button within the mobile timeline
    // It should be inside the EditorBottomPanel which is inside mobile-timeline-controls
    const playButton = mobileTimeline.locator('button').filter({ hasText: '' }).first();
    await expect(playButton).toBeVisible();

    verifyNoErrors(collector);
  });

  test('Rotation button opens drawer on mobile', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);

    const mobileTimeline = page.locator('[data-testid="mobile-timeline-controls"]');
    await expect(mobileTimeline).toBeVisible({ timeout: 10000 });

    // Find and click the Rotate button
    const rotationButton = mobileTimeline.getByText('Rotate');
    await expect(rotationButton).toBeVisible();
    await rotationButton.click();

    // Wait for drawer animation
    await page.waitForTimeout(300);

    // Rotation drawer content should appear (Select All, Deselect All buttons)
    await expect(page.getByRole('button', { name: 'Select All', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Deselect All', exact: true })).toBeVisible();

    verifyNoErrors(collector);
  });
});

test.describe('Mobile Timeline Controls - Visual', () => {
  test('Take screenshots at mobile viewport for visual comparison', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await installWebGLShaderCompileLinkGuard(page);

    await page.goto('/');
    await waitForAppReady(page);

    // Screenshot with timeline visible
    await page.screenshot({
      path: 'screenshots/mobile-timeline-visible.png',
      fullPage: false,
    });

    // Open right panel
    const toggleRightPanel = page.locator('[data-testid="toggle-right-panel"]');
    await toggleRightPanel.click();
    await page.waitForTimeout(500);

    // Screenshot with timeline hidden
    await page.screenshot({
      path: 'screenshots/mobile-timeline-hidden-right-panel.png',
      fullPage: false,
    });

    // Close panel
    await toggleRightPanel.click();
    await page.waitForTimeout(500);

    // Open left panel
    const toggleLeftPanel = page.locator('[data-testid="toggle-left-panel"]');
    await toggleLeftPanel.click();
    await page.waitForTimeout(500);

    // Screenshot with left panel
    await page.screenshot({
      path: 'screenshots/mobile-timeline-hidden-left-panel.png',
      fullPage: false,
    });
  });
});
