import { test, expect, type Locator, type Page } from '@playwright/test';

async function openVideoExportModal(page: Page): Promise<Locator> {
  // Open File Menu
  await page.getByTestId('menu-file').click();

  // Click Export Video
  await page.getByTestId('menu-export-video').click();

  // Check Modal Visibility and wait for animation
  const dialog = page.getByRole('dialog', { name: 'Video Export Studio' });
  await expect(dialog).toBeVisible();
  await page.waitForTimeout(300);

  return dialog;
}

test.describe('Video Export UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to load
    await expect(page.getByTestId('top-bar')).toBeVisible();
  });

  test('should open export modal and show all tabs', async ({ page }) => {
    const dialog = await openVideoExportModal(page);

    // Check Tabs exist
    const presetsTab = dialog.getByRole('tab', { name: 'Presets' });
    await expect(presetsTab).toBeVisible();

    // Check default tab (Presets) content
    await expect(dialog.getByRole('button', { name: /Instagram/i })).toBeVisible();

    // Switch to Settings
    // Use force: true to bypass potential animation blocking or slight overlays during transition
    await dialog.getByRole('tab', { name: 'Settings' }).click({ force: true });
    
    // Wait for content
    await expect(dialog.getByText('Output Format')).toBeVisible({ timeout: 10000 });
    await expect(dialog.getByText('Resolution')).toBeVisible();

    // Switch to Text
    await dialog.getByRole('tab', { name: 'Text' }).click({ force: true });
    await expect(dialog.getByText('Enable Overlay')).toBeVisible({ timeout: 10000 });

    // Switch to Advanced
    await dialog.getByRole('tab', { name: 'Advanced' }).click({ force: true });
    await expect(dialog.getByText('Target Bitrate')).toBeVisible({ timeout: 10000 });
  });

  test('should show processing mode and quick stats', async ({ page }) => {
    const dialog = await openVideoExportModal(page);

    // The label appears in both desktop and mobile layouts; assert at least one instance is visible.
    await expect(dialog.getByText('Processing Mode', { exact: true }).first()).toBeVisible();

    // Quick stats (desktop left panel or mobile header)
    await expect(dialog.getByText('Res', { exact: true }).first()).toBeVisible();
    await expect(dialog.getByText('FPS', { exact: true }).first()).toBeVisible();
    await expect(dialog.getByText('Dur', { exact: true }).first()).toBeVisible();

    // Footer action should be visible and actionable
    await expect(
      dialog.getByRole('button', { name: /Start Rendering|Select File & Start/i })
    ).toBeVisible();
  });

  test('should toggle crop mode', async ({ page }) => {
    const dialog = await openVideoExportModal(page);
    
    // Switch to Settings
    await dialog.getByRole('tab', { name: 'Settings' }).click({ force: true });

    // Wait for content
    await expect(dialog.getByText('Output Format')).toBeVisible();

    // Toggle crop
    // The text "Crop Frame" should be visible in the card
    await expect(dialog.getByText('Crop Frame')).toBeVisible();
    
    // Click the "Crop Frame" text (part of the card)
    await dialog.getByText('Crop Frame').click({ force: true });
    
    // Verify "Custom area active" text appears
    await expect(dialog.getByText('Custom area active')).toBeVisible();
  });
});
