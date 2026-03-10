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
| `npx vitest run` | Run all unit tests |
| `npx vitest run src/tests/path/to/test.test.ts` | Run specific test file |
| `npx vitest run -t "pattern"` | Run tests matching pattern |
| `npx playwright test` | Run all E2E tests |
| `npx playwright test scripts/playwright/spec.spec.ts` | Run specific E2E test |

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
