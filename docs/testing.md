# Testing Guide for LLM Coding Agents

**Purpose**: Test infrastructure, placement rules, and templates.
**Read This When**: Writing or running tests.
**Stack**: Vitest 4 (happy-dom) + Playwright 1.57

## Test Infrastructure

| Tool | Purpose | Config |
|------|---------|--------|
| Vitest | Unit + integration tests | `vitest.config.ts` |
| happy-dom | DOM environment | Set in vitest config |
| Playwright | E2E with GPU rendering | `playwright.config.ts` |
| `@testing-library/react` | Component test utilities | Available globally |

## Commands

| Command | Purpose |
|---------|---------|
| `pnpm exec vitest run` | Run all unit tests |
| `pnpm exec vitest run src/tests/path/to/test.test.ts` | Run specific test file |
| `pnpm exec vitest run -t "pattern"` | Run tests matching pattern |
| `pnpm exec playwright test` | Run all E2E tests |
| `pnpm exec playwright test scripts/playwright/spec.spec.ts` | Run specific E2E test |

## Test Placement

```
Is it a unit/integration test?
  └── src/tests/{mirrors-src-path}/*.test.ts(x)
      Example: src/lib/math/transform.ts → src/tests/lib/math/transform.test.ts

Is it an E2E test?
  └── scripts/playwright/*.spec.ts
```

Existing test directories:
- `src/tests/stores/` — Store tests
- `src/tests/components/` — Component tests
- `src/tests/hooks/` — Hook tests
- `src/tests/lib/` — Library tests
- `src/tests/rendering/` — Rendering tests
- `src/tests/integration/` — Integration tests
- `src/tests/wasm/` — WASM tests

## Constraints

| Rule | Detail |
|------|--------|
| Max 4 workers | `maxWorkers: 4` in vitest config — never change |
| No watch mode in automation | Hangs CI and subagent processes |
| Deterministic seeds | Use fixed seeds for any randomization |
| WASM mocked | `mdimension-core` aliased to `src/tests/__mocks__/mdimension-core.ts` |
| `@/` aliases available | Same path aliases as production code |

## Template: Unit Test

```typescript
// src/tests/lib/{domain}/{name}.test.ts
import { describe, it, expect } from 'vitest'
import { myFunction } from '@/lib/{domain}/{name}'

describe('myFunction', () => {
  it('computes correct result for valid input', () => {
    const result = myFunction(input)
    expect(result).toEqual(expectedOutput)
  })

  it('handles edge case', () => {
    expect(() => myFunction(invalidInput)).toThrow()
  })
})
```

## Template: Component Test

```tsx
// src/tests/components/{name}.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MyComponent } from '@/components/{path}/MyComponent'

describe('MyComponent', () => {
  it('renders with initial state', () => {
    render(<MyComponent />)
    expect(screen.getByText('Expected Text')).toBeInTheDocument()
  })

  it('responds to user interaction', async () => {
    const user = userEvent.setup()
    render(<MyComponent />)
    await user.click(screen.getByRole('button', { name: 'Click me' }))
    expect(screen.getByText('Updated')).toBeInTheDocument()
  })
})
```

## Template: Store Test

```typescript
// src/tests/stores/{name}Store.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useSomeStore } from '@/stores/someStore'

describe('someStore', () => {
  beforeEach(() => {
    useSomeStore.setState(useSomeStore.getInitialState())
  })

  it('updates value correctly', () => {
    useSomeStore.getState().setValue(42)
    expect(useSomeStore.getState().value).toBe(42)
  })
})
```

## Assertion Quality Rules

Every assertion must answer: "What specific bug would make this test fail?"

| Forbidden | Why | Do Instead |
|-----------|-----|-----------|
| `expect(result).toBeDefined()` | Passes for any non-undefined value | Assert the specific expected value |
| `expect(config.timeout).toBe(3000)` | Tests a default, not behavior | Test the behavior that depends on the config |
| `expect(typeof fn).toBe('function')` | Tests existence, not functionality | Call the function, assert the output |

## E2E Test Infrastructure (Playwright)

### Testability Attributes

The following `data-*` and `aria-*` attributes are added to production components specifically for e2e test automation. Do not remove them.

| Attribute | Element | Purpose |
|-----------|---------|---------|
| `data-testid="webgpu-canvas"` | `<canvas>` in WebGPUCanvas | Locate the main render canvas |
| `data-testid="webgpu-container"` | Container `<div>` in WebGPUCanvas | Locate the renderer wrapper |
| `data-renderer-state` | `webgpu-container` | Values: `initializing`, `ready`, `error`. Tests wait for `ready` instead of polling. |
| `data-renderer-error` | `webgpu-container` (error state only) | Contains the init error message |
| `data-frame-count` | `webgpu-canvas` | Incremented each rendered frame. Tests wait for `> 0` to confirm first frame rendered. Written sparsely (first 10 frames + every 60th) to avoid DOM thrashing. |
| `data-testid="left-panel"` | Left panel `<m.div>` in EditorLayout | Locate the left panel wrapper |
| `data-testid="right-panel"` | Right panel `<m.div>` in EditorLayout | Locate the right panel wrapper |
| `aria-expanded` | `toggle-left-panel` button | Reflects `showLeftPanel` store state |
| `aria-expanded` | `toggle-right-panel` button | Reflects right panel open state |

### E2E Test Patterns

**Wait for renderer ready** — never use arbitrary `waitForTimeout`:
```typescript
// Wait for WebGPU init to complete
await expect(
  page.locator('[data-testid="webgpu-container"][data-renderer-state="ready"]')
).toBeVisible({ timeout: 15_000 })

// Wait for first frame
await page.waitForFunction(() => {
  const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
  return parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10) > 0
}, { timeout: 20_000 })
```

**Check panel state** — use `aria-expanded`, not child element visibility:
```typescript
const toggle = page.getByTestId('toggle-left-panel')
await expect(toggle).toHaveAttribute('aria-expanded', 'true')
```

**Read store state** — use `page.evaluate` with dynamic import:
```typescript
const dim = await page.evaluate(async () => {
  const mod = await import('/src/stores/geometryStore.ts')
  return mod.useGeometryStore.getState().dimension
})
```

**Animated elements** — Motion/Framer animations cause DOM instability during panel entrance. Use `{ force: true }` for tab clicks inside animated panels, or wait for the animation to complete via a stable child element.

### E2E Spec Files

| File | What it tests |
|------|---------------|
| `app-loads.spec.ts` | App loads, canvas visible, no fatal GPU errors |
| `panels.spec.ts` | Left/right panel toggle via aria-expanded |
| `keyboard.spec.ts` | Arrow keys, cinematic mode, shortcuts overlay |
| `rendering.spec.ts` | All quantum modes render frames + pixels |
| `screenshot-export.spec.ts` | File > Export → preview → crop → download |
| `url-state.spec.ts` | URL params → store, reload persistence, invalid params |

### Playwright Constraints

| Rule | Detail |
|------|--------|
| Workers | `--workers=1` recommended locally (GPU contention) |
| GPU skip | Tests that need rendering skip when `navigator.gpu` unavailable or adapter request fails |
| Tab clicks in animated panels | Use `{ force: true }` — Motion panel entrance animation causes element instability |
| No `waitForTimeout` | Wait for conditions: `data-renderer-state="ready"`, `data-frame-count > 0`, `aria-expanded`, `toBeVisible` |

## Quality Gate

Before claiming tests pass:
- [ ] Actually ran the tests (do not assume)
- [ ] All tests pass (no skipped failures)
- [ ] New tests would fail if the code under test were broken
- [ ] No flaky timing dependencies

## On-Demand References

| Domain | Serena Memory |
|--------|---------------|
| Task completion checklist | `task_completion_checklist` |
| Suggested commands | `suggested_commands` |
