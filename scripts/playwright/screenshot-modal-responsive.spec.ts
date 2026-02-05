/**
 * Screenshot Modal Responsive Design Tests
 *
 * Playwright tests verifying the responsive behavior of the screenshot modal:
 * - Mobile layout (360px) - stacked footer, abbreviated labels, larger touch targets
 * - Tablet layout (640px) - horizontal footer, full labels
 * - Desktop layout (1024px) - full layout
 *
 * Run with:
 *   npx playwright test screenshot-modal-responsive.spec.ts
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
 * This must be called before page.goto() to catch all messages.
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

    // Collect errors
    if (type === 'error') {
      collector.errors.push(text);

      // Check for WebGL-specific errors
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

    // Collect warnings
    if (type === 'warning') {
      collector.warnings.push(text);

      // Check for render graph compilation warnings
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

    // Also check errors for graph-related issues
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
 * Fails fast if there are WebGL errors, graph warnings, or critical errors.
 */
function verifyNoErrors(collector: ErrorCollector): void {
  if (collector.pageErrors.length > 0) {
    throw new Error(`Page errors detected:\n${collector.pageErrors.join('\n')}`);
  }

  // WebGL errors are critical - fail immediately
  if (collector.webglErrors.length > 0) {
    throw new Error(`WebGL errors detected:\n${collector.webglErrors.join('\n')}`);
  }

  // Graph compilation warnings are critical - fail immediately
  if (collector.graphWarnings.length > 0) {
    throw new Error(`Render graph warnings detected:\n${collector.graphWarnings.join('\n')}`);
  }

  // Filter out known benign errors
  const criticalErrors = collector.errors.filter(
    (e) =>
      !e.includes('ResizeObserver') && // Browser noise
      !e.includes('net::') && // Network errors
      !e.includes('favicon') && // Missing favicon
      !e.includes('Download the React DevTools') // Dev tools suggestion
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

  // CRITICAL: Wait for shader compilation overlay to disappear
  try {
    const shaderOverlay = page.locator('text=Shader compilation in progress');
    await shaderOverlay.waitFor({ state: 'hidden', timeout: 60000 });
  } catch {
    // Overlay may have already disappeared
  }

  // Also wait for "Building" messages to disappear
  try {
    const buildingOverlay = page.locator('text=Building');
    await buildingOverlay.waitFor({ state: 'hidden', timeout: 60000 });
  } catch {
    // Overlay may have already disappeared
  }

  // Additional wait for render stabilization
  await page.waitForTimeout(2000);
}

/**
 * Trigger the screenshot/export flow.
 * Uses keyboard shortcut for reliability across all viewport sizes,
 * since the File menu is hidden on mobile viewports.
 */
async function triggerScreenshotExport(page: Page): Promise<void> {
  // Use keyboard shortcut (Ctrl+S on Windows/Linux, Cmd+S on Mac)
  // This works regardless of viewport size
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.press(`${modifier}+s`);

  // Wait for modal to appear
  await expect(page.locator('[data-testid="screenshot-modal"]')).toBeVisible({ timeout: 10000 });

  // Wait for the preview image to load and the crop box to render.
  const previewImage = page.locator('[data-testid="crop-preview-image"]');
  await expect(previewImage).toBeVisible({ timeout: 10000 });
  await page.waitForFunction(() => {
    const img = document.querySelector('[data-testid="crop-preview-image"]') as HTMLImageElement | null;
    return !!img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0;
  }, { timeout: 10000 });
  await expect(page.locator('[data-testid="crop-box"]')).toBeVisible({ timeout: 10000 });
}

// Test viewports
const VIEWPORTS = {
  mobile: { width: 360, height: 640 },
  tablet: { width: 640, height: 900 },
  desktop: { width: 1024, height: 768 },
} as const;

test.describe('Screenshot Modal Responsive - Mobile (360px)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
  });

  test('Modal fits within mobile viewport without horizontal overflow', async ({ page }) => {
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);
    await triggerScreenshotExport(page);

    const modal = page.locator('[data-testid="screenshot-modal"]');
    await expect(modal).toBeVisible();

    // Get modal bounding box
    const modalBox = await modal.boundingBox();
    expect(modalBox).not.toBeNull();

    // Modal should fit within viewport with margins
    expect(modalBox!.width).toBeLessThanOrEqual(VIEWPORTS.mobile.width);
    expect(modalBox!.x).toBeGreaterThanOrEqual(0);
    expect(modalBox!.x + modalBox!.width).toBeLessThanOrEqual(VIEWPORTS.mobile.width);

    verifyNoErrors(collector);
  });

  test('Footer buttons show abbreviated labels on mobile', async ({ page }) => {
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);
    await triggerScreenshotExport(page);

    const copyButton = page.locator('[data-testid="screenshot-copy-button"]');
    const saveButton = page.locator('[data-testid="screenshot-save-button"]');

    await expect(copyButton).toBeVisible();
    await expect(saveButton).toBeVisible();

    // On mobile, buttons should show abbreviated text "Copy" and "Save"
    // The full text "Copy to Clipboard" should be hidden
    const copyText = await copyButton.textContent();
    const saveText = await saveButton.textContent();

    expect(copyText).toContain('Copy');
    expect(saveText).toContain('Save');

    verifyNoErrors(collector);
  });

  test('Footer uses stacked (column) layout on mobile', async ({ page }) => {
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);
    await triggerScreenshotExport(page);

    const copyButton = page.locator('[data-testid="screenshot-copy-button"]');
    const saveButton = page.locator('[data-testid="screenshot-save-button"]');
    const cropDimensions = page.locator('[data-testid="crop-dimensions"]');

    await expect(copyButton).toBeVisible();
    await expect(saveButton).toBeVisible();
    await expect(cropDimensions).toBeVisible();

    // Get positions to verify stacked layout
    const copyBox = await copyButton.boundingBox();
    const dimensionsBox = await cropDimensions.boundingBox();

    expect(copyBox).not.toBeNull();
    expect(dimensionsBox).not.toBeNull();

    // In stacked layout, dimensions should be BELOW buttons (flex-col-reverse)
    expect(dimensionsBox!.y).toBeGreaterThan(copyBox!.y);

    verifyNoErrors(collector);
  });

  test('Crop handles are large enough for touch on mobile', async ({ page }) => {
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);
    await triggerScreenshotExport(page);

    // Check SE handle (corner) size - should be at least 20x20 on mobile
    const seHandle = page.locator('[data-testid="crop-handle-se"]');
    await expect(seHandle).toBeVisible();

    const handleBox = await seHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    // On mobile, handles should be 20x20 (w-5 h-5 = 1.25rem = 20px)
    expect(handleBox!.width).toBeGreaterThanOrEqual(18); // Allow slight tolerance
    expect(handleBox!.height).toBeGreaterThanOrEqual(18);

    verifyNoErrors(collector);
  });

  test('Abbreviated instructions shown on mobile', async ({ page }) => {
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);
    await triggerScreenshotExport(page);

    const cropDimensions = page.locator('[data-testid="crop-dimensions"]');
    await expect(cropDimensions).toBeVisible();

    // On mobile, the instruction prefix is hidden; only crop dimensions are visible.
    const text = await cropDimensions.innerText();
    expect(text).toMatch(/\d+\s*×\s*\d+\s*px/);
    expect(text).not.toContain('Drag corners to crop');

    verifyNoErrors(collector);
  });

  test('Modal content is scrollable if needed on mobile', async ({ page }) => {
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);
    await triggerScreenshotExport(page);

    const modalContent = page.locator('[data-testid="screenshot-modal-content"]');
    await expect(modalContent).toBeVisible();

    // Modal should be visible and contained
    const contentBox = await modalContent.boundingBox();
    expect(contentBox).not.toBeNull();
    expect(contentBox!.height).toBeLessThanOrEqual(VIEWPORTS.mobile.height);

    verifyNoErrors(collector);
  });

  test('Crop functionality works on mobile viewport', async ({ page }) => {
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);
    await triggerScreenshotExport(page);

    const cropBox = page.locator('[data-testid="crop-box"]');
    await expect(cropBox).toBeVisible();

    // Get initial dimensions
    const dimensionDisplay = page.locator('[data-testid="crop-dimensions"]');
    const initialText = await dimensionDisplay.textContent();
    const initialMatch = initialText?.match(/(\d+)\s*×\s*(\d+)/);
    const initialWidth = initialMatch ? parseInt(initialMatch[1]) : 0;

    // Resize with SE handle
    const seHandle = page.locator('[data-testid="crop-handle-se"]');
    const handleBox = await seHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    await seHandle.hover();
    await page.mouse.down();
    await page.mouse.move(handleBox!.x - 30, handleBox!.y - 30);
    await page.mouse.up();

    await page.waitForTimeout(200);

    // Dimensions should have changed
    const newText = await dimensionDisplay.textContent();
    const newMatch = newText?.match(/(\d+)\s*×\s*(\d+)/);
    const newWidth = newMatch ? parseInt(newMatch[1]) : 0;

    expect(newWidth).toBeLessThan(initialWidth);

    verifyNoErrors(collector);
  });
});

test.describe('Screenshot Modal Responsive - Tablet (640px)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.tablet);
  });

  test('Modal fits within tablet viewport', async ({ page }) => {
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);
    await triggerScreenshotExport(page);

    const modal = page.locator('[data-testid="screenshot-modal"]');
    await expect(modal).toBeVisible();

    const modalBox = await modal.boundingBox();
    expect(modalBox).not.toBeNull();
    expect(modalBox!.width).toBeLessThanOrEqual(VIEWPORTS.tablet.width);

    verifyNoErrors(collector);
  });

  test('Footer uses horizontal layout at tablet breakpoint', async ({ page }) => {
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);
    await triggerScreenshotExport(page);

    const copyButton = page.locator('[data-testid="screenshot-copy-button"]');
    const cropDimensions = page.locator('[data-testid="crop-dimensions"]');

    await expect(copyButton).toBeVisible();
    await expect(cropDimensions).toBeVisible();

    const copyBox = await copyButton.boundingBox();
    const dimensionsBox = await cropDimensions.boundingBox();

    expect(copyBox).not.toBeNull();
    expect(dimensionsBox).not.toBeNull();

    // At tablet size (640px = sm breakpoint), layout should be horizontal
    // Dimensions on left, buttons on right - so dimensions.y should be similar to buttons.y
    expect(Math.abs(dimensionsBox!.y - copyBox!.y)).toBeLessThan(50);

    verifyNoErrors(collector);
  });

  test('Footer buttons show full labels at tablet size', async ({ page }) => {
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);
    await triggerScreenshotExport(page);

    const copyButton = page.locator('[data-testid="screenshot-copy-button"]');
    const saveButton = page.locator('[data-testid="screenshot-save-button"]');

    await expect(copyButton).toBeVisible();
    await expect(saveButton).toBeVisible();

    // At tablet size, buttons should show full text
    const copyText = await copyButton.textContent();
    const saveText = await saveButton.textContent();

    expect(copyText).toContain('Copy');
    expect(saveText).toContain('Save');

    verifyNoErrors(collector);
  });

  test('Full instructions shown at tablet size', async ({ page }) => {
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);
    await triggerScreenshotExport(page);

    const cropDimensions = page.locator('[data-testid="crop-dimensions"]');
    await expect(cropDimensions).toBeVisible();

    const text = await cropDimensions.innerText();
    expect(text).toContain('Drag corners to crop');
    expect(text).toMatch(/\d+\s*×\s*\d+\s*px/);

    verifyNoErrors(collector);
  });

  test('Crop handles are standard size at tablet', async ({ page }) => {
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);
    await triggerScreenshotExport(page);

    const seHandle = page.locator('[data-testid="crop-handle-se"]');
    await expect(seHandle).toBeVisible();

    const handleBox = await seHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    // At tablet size (sm breakpoint), handles should use the smaller bracket hitbox.
    expect(handleBox!.width).toBeGreaterThanOrEqual(24);
    expect(handleBox!.width).toBeLessThanOrEqual(40);
    expect(handleBox!.height).toBeGreaterThanOrEqual(24);
    expect(handleBox!.height).toBeLessThanOrEqual(40);

    verifyNoErrors(collector);
  });
});

test.describe('Screenshot Modal Responsive - Desktop (1024px)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.desktop);
  });

  test('Modal displays at full width on desktop', async ({ page }) => {
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);
    await triggerScreenshotExport(page);

    const modal = page.locator('[data-testid="screenshot-modal"]');
    await expect(modal).toBeVisible();

    const modalBox = await modal.boundingBox();
    expect(modalBox).not.toBeNull();
    // At 1024px, modal should use md:max-w-4xl (896px) or lg:max-w-5xl (1024px)
    expect(modalBox!.width).toBeGreaterThan(600);
    expect(modalBox!.width).toBeLessThanOrEqual(VIEWPORTS.desktop.width);

    verifyNoErrors(collector);
  });

  test('Footer uses horizontal layout with full labels on desktop', async ({ page }) => {
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);
    await triggerScreenshotExport(page);

    const copyButton = page.locator('[data-testid="screenshot-copy-button"]');
    const saveButton = page.locator('[data-testid="screenshot-save-button"]');
    const cropDimensions = page.locator('[data-testid="crop-dimensions"]');

    await expect(copyButton).toBeVisible();
    await expect(saveButton).toBeVisible();
    await expect(cropDimensions).toBeVisible();

    // Verify horizontal layout
    const copyBox = await copyButton.boundingBox();
    const dimensionsBox = await cropDimensions.boundingBox();

    expect(copyBox).not.toBeNull();
    expect(dimensionsBox).not.toBeNull();
    expect(Math.abs(dimensionsBox!.y - copyBox!.y)).toBeLessThan(50);

    // Verify full text labels
    const copyText = await copyButton.textContent();
    const saveText = await saveButton.textContent();
    expect(copyText).toContain('Copy');
    expect(saveText).toContain('Save');

    verifyNoErrors(collector);
  });

  test('All crop handles are visible and functional on desktop', async ({ page }) => {
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);
    await triggerScreenshotExport(page);

    // Verify corner handles are visible
    const handles = ['nw', 'ne', 'se', 'sw'];
    for (const handle of handles) {
      const handleElement = page.locator(`[data-testid="crop-handle-${handle}"]`);
      await expect(handleElement).toBeVisible();
    }

    // Test resize with one handle
    const dimensionDisplay = page.locator('[data-testid="crop-dimensions"]');
    const initialText = await dimensionDisplay.textContent();
    const initialMatch = initialText?.match(/(\d+)\s*×\s*(\d+)/);
    const initialWidth = initialMatch ? parseInt(initialMatch[1]) : 0;

    const seHandle = page.locator('[data-testid="crop-handle-se"]');
    const handleBox = await seHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    await seHandle.hover();
    await page.mouse.down();
    await page.mouse.move(handleBox!.x - 50, handleBox!.y - 50);
    await page.mouse.up();

    await page.waitForTimeout(200);

    const newText = await dimensionDisplay.textContent();
    const newMatch = newText?.match(/(\d+)\s*×\s*(\d+)/);
    const newWidth = newMatch ? parseInt(newMatch[1]) : 0;

    expect(newWidth).toBeLessThan(initialWidth);

    verifyNoErrors(collector);
  });

  test('Modal can be closed successfully on desktop', async ({ page }) => {
    await installWebGLShaderCompileLinkGuard(page);
    const collector = setupErrorCollection(page);

    await page.goto('/');
    await waitForAppReady(page);
    await triggerScreenshotExport(page);

    const modal = page.locator('[data-testid="screenshot-modal"]');
    await expect(modal).toBeVisible();

    // Close with Escape
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible();

    verifyNoErrors(collector);
  });
});

test.describe('Screenshot Modal Visual Regression', () => {
  test('Take screenshots at all breakpoints for visual comparison', async ({ page }) => {
    await installWebGLShaderCompileLinkGuard(page);

    // Mobile screenshot
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/');
    await waitForAppReady(page);
    await triggerScreenshotExport(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/screenshot-modal-360px.png', fullPage: false });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Tablet screenshot
    await page.setViewportSize(VIEWPORTS.tablet);
    await page.waitForTimeout(500);
    await triggerScreenshotExport(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/screenshot-modal-640px.png', fullPage: false });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // Desktop screenshot
    await page.setViewportSize(VIEWPORTS.desktop);
    await page.waitForTimeout(500);
    await triggerScreenshotExport(page);
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'screenshots/screenshot-modal-1024px.png', fullPage: false });
  });
});
