import { ConsoleMessage, expect, Page, test } from '@playwright/test';
import sharp from 'sharp';
import { installWebGLShaderCompileLinkGuard } from './webglShaderCompileLinkGuard';

test.setTimeout(120000);

interface ErrorCollector {
  errors: string[];
  warnings: string[];
  pageErrors: string[];
}

type TdseScenario = 'tunneling' | 'scattering' | 'driven';

function setupErrorCollection(page: Page): ErrorCollector {
  const collector: ErrorCollector = {
    errors: [],
    warnings: [],
    pageErrors: [],
  };

  page.on('pageerror', (err) => {
    collector.pageErrors.push(err.message);
  });

  page.on('console', (msg: ConsoleMessage) => {
    const text = msg.text();
    if (msg.type() === 'error') collector.errors.push(text);
    if (msg.type() === 'warning') collector.warnings.push(text);
  });

  return collector;
}

function verifyNoCriticalErrors(collector: ErrorCollector): void {
  if (collector.pageErrors.length > 0) {
    throw new Error(`Page errors detected:\n${collector.pageErrors.join('\n')}`);
  }

  const errorText = collector.errors
    .filter(
      (text) =>
        !text.includes('ResizeObserver') &&
        !text.includes('net::') &&
        !text.includes('favicon') &&
        !text.includes('Download the React DevTools')
    )
    .join('\n');
  if (/wgsl|gpuvalidationerror|rendergraph|graph compilation|cycle detected|shader|webgpu/i.test(errorText)) {
    throw new Error(`Critical console errors detected:\n${errorText}`);
  }
  if (errorText.length > 0) {
    throw new Error(`Unexpected console errors detected:\n${errorText}`);
  }

  const warningText = collector.warnings.join('\n');
  if (/rendergraph|graph compilation|cycle detected|invalid outputs|error executing pass|wgsl|webgpu/i.test(warningText)) {
    throw new Error(`Critical console warnings detected:\n${warningText}`);
  }
}

async function waitForAppReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 });

  try {
    const loadingOverlay = page.locator('[data-testid="loading-overlay"]');
    await loadingOverlay.waitFor({ state: 'hidden', timeout: 15000 });
  } catch {
    // Optional overlay; ignore if absent.
  }

  try {
    const shaderOverlay = page.locator('text=Shader compilation in progress');
    await shaderOverlay.waitFor({ state: 'hidden', timeout: 60000 });
  } catch {
    // Optional overlay; ignore if absent.
  }

  try {
    const buildingOverlay = page.locator('text=Building');
    await buildingOverlay.waitFor({ state: 'hidden', timeout: 60000 });
  } catch {
    // Optional overlay; ignore if absent.
  }

  await page.waitForTimeout(1500);
}

async function hasWebGPUCanvas(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('canvas')).some((c) => {
      try {
        return !!(c as HTMLCanvasElement).getContext('webgpu');
      } catch {
        return false;
      }
    });
  });
}

async function sampleCanvasCenterLuma(page: Page): Promise<number> {
  const canvas = page.locator('canvas').first();
  const png = await canvas.screenshot({ type: 'png' });
  const image = sharp(png);
  const meta = await image.metadata();

  if (!meta.width || !meta.height) {
    throw new Error('Failed to read canvas screenshot metadata');
  }

  const sampleSize = 7;
  const left = Math.max(0, Math.floor(meta.width / 2 - sampleSize / 2));
  const top = Math.max(0, Math.floor(meta.height / 2 - sampleSize / 2));
  const raw = await image
    .extract({ left, top, width: sampleSize, height: sampleSize })
    .ensureAlpha()
    .raw()
    .toBuffer();

  let sum = 0;
  for (let i = 0; i < raw.length; i += 4) {
    const r = raw[i] ?? 0;
    const g = raw[i + 1] ?? 0;
    const b = raw[i + 2] ?? 0;
    sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  const pixels = raw.length / 4;
  return sum / (255 * pixels);
}

async function waitForLuma(
  page: Page,
  predicate: (luma: number) => boolean,
  options: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<number> {
  const { timeoutMs = 15000, intervalMs = 300 } = options;
  const start = Date.now();

  for (;;) {
    const luma = await sampleCanvasCenterLuma(page);
    if (predicate(luma)) return luma;
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for canvas luma predicate');
    }
    await page.waitForTimeout(intervalMs);
  }
}

async function assertScenarioVisibleAndStable(page: Page, label: string): Promise<void> {
  const lumaA = await waitForLuma(page, (luma) => luma > 0.01, { timeoutMs: 20000, intervalMs: 400 });
  await page.waitForTimeout(800);
  const lumaB = await sampleCanvasCenterLuma(page);

  expect(lumaA, `${label} should produce a visible non-black frame`).toBeGreaterThan(0.01);
  expect(lumaB, `${label} should remain visible across consecutive samples`).toBeGreaterThan(0.008);
  expect(Math.abs(lumaB - lumaA), `${label} should not exhibit unstable luma spikes`).toBeLessThan(0.35);
}

async function configureTdseScenario(page: Page, scenario: TdseScenario): Promise<void> {
  await page.evaluate(async (selectedScenario: TdseScenario) => {
    const { useExtendedObjectStore } = await import('/src/stores/extendedObjectStore.ts');
    const store = useExtendedObjectStore.getState();

    store.setSchroedingerQuantumMode('tdseDynamics');
    store.setTdseLatticeDim(3);
    store.setTdseStepsPerFrame(4);
    store.setTdseFieldView('density');
    store.setTdseAutoScale(true);
    store.setTdsePacketCenter([-0.5, 0, 0]);
    store.setTdsePacketWidth(0.22);
    store.setTdsePacketAmplitude(1.0);
    store.setTdseDiagnosticsEnabled(true);
    store.setTdseDiagnosticsInterval(8);

    if (selectedScenario === 'tunneling') {
      store.setTdseInitialCondition('gaussianPacket');
      store.setTdsePacketMomentum([6.5, 0, 0]);
      store.setTdsePotentialType('barrier');
      store.setTdseBarrierCenter(0);
      store.setTdseBarrierWidth(0.18);
      store.setTdseBarrierHeight(8.0);
      store.setTdseDriveEnabled(false);
      return;
    }

    if (selectedScenario === 'scattering') {
      store.setTdseInitialCondition('planeWave');
      store.setTdsePacketMomentum([4.5, 1.5, 0]);
      store.setTdsePotentialType('step');
      store.setTdseStepHeight(3.5);
      store.setTdseDriveEnabled(false);
      return;
    }

    store.setTdseInitialCondition('gaussianPacket');
    store.setTdsePacketMomentum([3.2, 0, 0]);
    store.setTdsePotentialType('driven');
    store.setTdseDriveEnabled(true);
    store.setTdseDriveWaveform('sine');
    store.setTdseDriveFrequency(1.8);
    store.setTdseDriveAmplitude(2.2);
  }, scenario);
}

async function configureFreeScalarBaseline(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { useExtendedObjectStore } = await import('/src/stores/extendedObjectStore.ts');
    const store = useExtendedObjectStore.getState();
    store.setSchroedingerQuantumMode('freeScalarField');
    store.setFreeScalarLatticeDim(3);
    store.setFreeScalarFieldView('energyDensity');
    store.setFreeScalarInitialCondition('gaussianPacket');
    store.setFreeScalarPacketWidth(0.25);
    store.setFreeScalarPacketAmplitude(1.0);
  });
}

test.describe('Compute Mode Runtime Coverage', () => {
  test.beforeEach(async ({ page }) => {
    await installWebGLShaderCompileLinkGuard(page);
    await page.addInitScript(() => {
      localStorage.setItem('mdim_preferred_renderer', 'webgpu');
    });
  });

  test('free scalar baseline renders with no critical runtime errors', async ({ page }) => {
    const collector = setupErrorCollection(page);
    await page.goto('/?t=schroedinger&d=3&qm=freeScalarField');
    await waitForAppReady(page);

    const webgpuAvailable = await page.evaluate(() => !!navigator.gpu);
    test.skip(!webgpuAvailable, 'WebGPU is not available in this Playwright browser');

    const webgpuCanvas = await hasWebGPUCanvas(page);
    test.skip(!webgpuCanvas, 'App did not initialize a WebGPU canvas (fallback likely occurred)');

    await configureFreeScalarBaseline(page);
    await page.waitForTimeout(1600);
    await assertScenarioVisibleAndStable(page, 'freeScalarField baseline');
    verifyNoCriticalErrors(collector);
  });

  test('tdse scenarios render with stable non-black output and no runtime errors', async ({ page }) => {
    const collector = setupErrorCollection(page);
    await page.goto('/?t=schroedinger&d=3&qm=tdseDynamics');
    await waitForAppReady(page);

    const webgpuAvailable = await page.evaluate(() => !!navigator.gpu);
    test.skip(!webgpuAvailable, 'WebGPU is not available in this Playwright browser');

    const webgpuCanvas = await hasWebGPUCanvas(page);
    test.skip(!webgpuCanvas, 'App did not initialize a WebGPU canvas (fallback likely occurred)');

    const scenarios: TdseScenario[] = ['tunneling', 'scattering', 'driven'];
    for (const scenario of scenarios) {
      await configureTdseScenario(page, scenario);
      await page.waitForTimeout(2200);
      await assertScenarioVisibleAndStable(page, `tdse ${scenario}`);
    }

    verifyNoCriticalErrors(collector);
  });
});
