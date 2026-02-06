# Task Completion Checklist

When completing a coding task, perform these steps:

## 1. Code Quality Checks

```bash
# Lint the code
npm run lint

# Format the code
npm run format
```

## 2. Run Tests

```bash
# Run all tests (REQUIRED before completing)
npm test
```

- **Fix any failing tests** - do not weaken assertions
- **Maintain 100% test coverage** for new functionality
- **Max 4 workers** - never modify `maxWorkers` in vitest.config.ts

## 3. Verify WGSL Compliance

If you modified shaders:
- All shaders use WGSL syntax in `.wgsl.ts` files
- Entry points named `main` (matches `WebGPUBasePass.createFullscreenPipeline()`)
- Maximum 4 bind groups (0-3)
- `textureSample` only in uniform control flow
- Struct definitions included in each shader that uses them

## 4. Verify Zustand Usage

If you modified store subscriptions:
- Use individual selectors or `useShallow`
- Never subscribe to entire store object
- `useShallow` called outside hook call, not inside

## 5. Test Placement

Ensure tests are in correct locations:
- Unit/integration tests: `src/tests/**/*.test.ts(x)`
- Playwright E2E: `scripts/playwright/**/*.spec.ts`

## 6. File Placement

- No files in project root (except config files)
- Screenshots: `screenshots/`
- Playwright scripts: `scripts/playwright/`
- Utilities: `scripts/tools/`

## 7. Visual Verification (if rendering changed)

For changes affecting visual output:
- Run Playwright E2E tests
- Check for WebGPU/shader/render-graph errors in console

## 8. Documentation

- Update JSDoc for new/modified exports
- Update `docs/` if architectural changes

## Common Issues to Check

- [ ] No `any` types
- [ ] No raw HTML controls (use `src/components/ui/*`)
- [ ] No hardcoded colors (use Tailwind tokens)
- [ ] No inline `useShallow` calls
- [ ] WGSL shaders only (no GLSL)
- [ ] Uniform buffer sizes match WGSL struct alignment
