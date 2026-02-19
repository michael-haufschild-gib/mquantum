import { test } from '@playwright/test';

test('capture free scalar initial state', async ({ page }) => {
  const consoleMessages: { type: string; text: string }[] = [];
  const pageErrors: { message: string; stack?: string }[] = [];

  page.on('console', (msg) => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
  });

  page.on('pageerror', (err) => {
    pageErrors.push({ message: err.message, stack: err.stack });
  });

  await page.goto('/', { waitUntil: 'networkidle', timeout: 15000 });

  // Try to wait for canvas, but don't fail if it doesn't appear
  try {
    await page.waitForSelector('canvas', { state: 'visible', timeout: 8000 });
    console.log('Canvas found and visible');
  } catch {
    console.log('Canvas NOT found or not visible within 8s');
  }

  // Wait for rendering
  await page.waitForTimeout(4000);

  // Take screenshot regardless
  await page.screenshot({ path: '/tmp/free_scalar_initial.png', fullPage: false });

  // Dump the page HTML structure to understand what's rendered
  const bodyHTML = await page.evaluate(() => {
    const body = document.body;
    const walker = (el: Element, depth: number): string => {
      const tag = el.tagName.toLowerCase();
      const id = el.id ? `#${el.id}` : '';
      const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ').slice(0, 3).join('.')}` : '';
      const indent = '  '.repeat(depth);
      let result = `${indent}<${tag}${id}${cls}>`;
      if (el.children.length > 0 && depth < 4) {
        result += '\n';
        for (const child of el.children) {
          result += walker(child, depth + 1) + '\n';
        }
        result += `${indent}</${tag}>`;
      } else {
        const childCount = el.children.length;
        if (childCount > 0) {
          result += ` (${childCount} children)`;
        }
        result += `</${tag}>`;
      }
      return result;
    };
    return walker(body, 0);
  });
  console.log('=== PAGE STRUCTURE ===');
  console.log(bodyHTML);

  // Print all console messages
  console.log('=== ALL CONSOLE MESSAGES (' + consoleMessages.length + ') ===');
  for (const msg of consoleMessages) {
    console.log('[' + msg.type.toUpperCase() + '] ' + msg.text);
  }

  console.log('=== PAGE ERRORS (' + pageErrors.length + ') ===');
  for (const err of pageErrors) {
    console.log('[PAGEERROR] ' + err.message);
    if (err.stack) {
      console.log('  STACK: ' + err.stack.split('\n').slice(0, 5).join('\n  '));
    }
  }

  const errors = consoleMessages.filter(m => m.type === 'error');
  const warnings = consoleMessages.filter(m => m.type === 'warning');
  const webgpuRelated = consoleMessages.filter(m =>
    /webgpu|wgsl|shader|render.?graph|pipeline|bind.?group|compute|gpu|uniform|pass/i.test(m.text)
  );
  const freeScalarRelated = consoleMessages.filter(m =>
    /free.?scalar|scalar.?field|field.?mode|freeScalar/i.test(m.text)
  );

  console.log('=== SUMMARY ===');
  console.log('Total messages: ' + consoleMessages.length);
  console.log('Errors: ' + errors.length);
  console.log('Warnings: ' + warnings.length);
  console.log('WebGPU/Shader/Pass related: ' + webgpuRelated.length);
  console.log('Free scalar related: ' + freeScalarRelated.length);
  console.log('Page errors: ' + pageErrors.length);

  if (errors.length > 0) {
    console.log('=== ERROR MESSAGES ===');
    for (const m of errors) {
      console.log('[ERROR] ' + m.text);
    }
  }

  if (warnings.length > 0) {
    console.log('=== WARNING MESSAGES ===');
    for (const m of warnings) {
      console.log('[WARNING] ' + m.text);
    }
  }

  if (webgpuRelated.length > 0) {
    console.log('=== WEBGPU/SHADER/PASS DETAIL ===');
    for (const m of webgpuRelated) {
      console.log('[' + m.type.toUpperCase() + '] ' + m.text);
    }
  }

  if (freeScalarRelated.length > 0) {
    console.log('=== FREE SCALAR DETAIL ===');
    for (const m of freeScalarRelated) {
      console.log('[' + m.type.toUpperCase() + '] ' + m.text);
    }
  }
});
