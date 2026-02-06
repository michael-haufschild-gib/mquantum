# Testing Guide for LLM Coding Agents

**Purpose**: Instructions for writing, placing, and running tests in this WebGPU quantum visualization project (Vitest + Playwright).

**Non-negotiable**:
- Maintain **100% test coverage** for new functionality.
- Do **not** "fix" failing tests by weakening assertions. Fix the code.
- Do **not** use fetch-based debugging. For runtime debugging use **Playwright + console logs**.

## Test Stack

- **Unit + integration + component tests**: Vitest (`npm test`) with `happy-dom`
- **E2E/acceptance**: Playwright (`@playwright/test`) in `scripts/playwright/`
- **React assertions**: Testing Library (`@testing-library/react`, `@testing-library/user-event`)

## Where Tests Live (Placement Rules)

- Vitest tests: `src/tests/**`
- Playwright tests: `scripts/playwright/**/*.spec.ts`
- Test-only mocks: `src/tests/__mocks__/`

### Decision tree: where does this test go?

| If you changed... | Put tests in... |
|---|---|
| Pure math/geometry `src/lib/...` | `src/tests/lib/...` |
| Zustand store `src/stores/...` | `src/tests/stores/...` |
| Hook `src/hooks/...` | `src/tests/hooks/...` |
| UI primitive `src/components/ui/...` | `src/tests/components/ui/...` |
| WebGPU rendering `src/rendering/webgpu/...` | `src/tests/rendering/webgpu/...` |
| WGSL shader logic (string composition) | `src/tests/rendering/webgpu/...` |
| Visual correctness / WebGPU errors / render issues | `scripts/playwright/*.spec.ts` |

## What the Test Environment Already Provides (Do not re-implement)

Vitest is configured with `src/tests/setup.ts` which already:
- Calls `cleanup()` after each test.
- Mocks `ResizeObserver` and `matchMedia`.
- Provides in-memory `localStorage`/`sessionStorage` (for Zustand persist).
- Suppresses known benign R3F warnings.
- Mocks the WASM module via alias:
  - `mdimension-core` is aliased to `src/tests/__mocks__/mdimension-core.ts`

**Important**: WebGPU APIs (`GPUDevice`, `GPUAdapter`, etc.) are **not** available in the happy-dom test environment. Test WebGPU passes by:
- Testing shader string composition (WGSL output correctness)
- Testing store logic and uniform value computation
- Testing pass configuration (enabled/disabled logic)
- Using Playwright for actual GPU rendering validation

## How to Run Tests (Commands)

```bash
# All Vitest tests (CI-safe)
npm test

# Single Vitest file
npx vitest run src/tests/path/to/test.test.ts

# Tests matching a name/pattern
npx vitest run -t "Render graph"

# Playwright E2E (auto-starts dev server via playwright.config.ts)
npx playwright test

# Single Playwright spec file
npx playwright test scripts/playwright/object-types-rendering.spec.ts
```

### Watch mode rule

- **Never** run watch mode in automation.
- For local interactive debugging only: `npm run test:watch` (human-authorized).

## Templates (Copy/Paste)

### Template: unit test (pure logic)

Create: `src/tests/lib/<area>/<thing>.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { <FUNCTION> } from '@/lib/<area>/<module>'

describe('<FUNCTION>', () => {
  it('returns expected output for a simple case', () => {
    expect(<FUNCTION>(/* input */)).toEqual(/* expected */)
  })

  it('throws on invalid input', () => {
    expect(() => <FUNCTION>(/* invalid */)).toThrow()
  })
})
```

### Template: Zustand store test

Create: `src/tests/stores/<store>.test.ts`

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { use<Domain>Store } from '@/stores/<domain>Store'

describe('use<Domain>Store', () => {
  beforeEach(() => {
    use<Domain>Store.getState().reset?.()
  })

  it('has correct initial state', () => {
    const s = use<Domain>Store.getState()
    expect(s.value).toBe(DEFAULT_VALUE)
  })

  it('updates state via an action', () => {
    use<Domain>Store.getState().setValue(123)
    expect(use<Domain>Store.getState().value).toBe(123)
  })
})
```

### Template: UI component test (Testing Library)

Create: `src/tests/components/ui/<Component>.test.tsx`

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { <Component> } from '@/components/ui/<Component>'

describe('<Component>', () => {
  it('renders', () => {
    render(<<Component> />)
    expect(screen.getByTestId('<test-id>')).toBeInTheDocument()
  })

  it('fires callbacks', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    render(<<Component> onClick={onClick} data-testid="<test-id>" />)
    await user.click(screen.getByTestId('<test-id>'))

    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
```

### Template: hook test

Create: `src/tests/hooks/<hook>.test.ts(x)`

```ts
import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { use<Hook> } from '@/hooks/use<Hook>'

describe('use<Hook>', () => {
  it('returns a stable shape', () => {
    const { result } = renderHook(() => use<Hook>())
    expect(result.current).toBeDefined()
  })
})
```

### Template: WGSL shader composition test

Create: `src/tests/rendering/webgpu/<shader>.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { <shaderBlock> } from '@/rendering/webgpu/shaders/<category>/<module>'

describe('<shader> WGSL', () => {
  it('contains required function declarations', () => {
    expect(<shaderBlock>).toContain('fn <functionName>')
  })

  it('declares correct uniform bindings', () => {
    expect(<shaderBlock>).toContain('@group(0) @binding(0)')
  })
})
```

### Template: WebGPU pass configuration test

Create: `src/tests/rendering/webgpu/<pass>.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { <Pass>Pass } from '@/rendering/webgpu/passes/<Pass>Pass'

describe('<Pass>Pass', () => {
  it('declares correct inputs and outputs', () => {
    const decl = <Pass>Pass.declare()
    expect(decl.inputs).toContain('hdr-color')
    expect(decl.outputs).toContain('<pass>-output')
  })

  it('is disabled when feature is off', () => {
    const ctx = { stores: { postProcessing: { <pass>Enabled: false } } }
    expect(<Pass>Pass.declare().enabled(ctx)).toBe(false)
  })
})
```

## Playwright Patterns

### When to use Playwright (decision tree)

- If the change can cause **WebGPU errors**, **shader compile issues**, **render graph warnings**, or "canvas is black" -> write/extend a Playwright test.
- If you need to debug runtime behavior: use **Playwright + page console collection**, not fetch.

### Template: Playwright acceptance test with console collection

Create: `scripts/playwright/<feature>.spec.ts`

```ts
import { ConsoleMessage, expect, test } from '@playwright/test'

test('<feature> does not emit WebGPU or render graph errors', async ({ page }) => {
  const errors: string[] = []
  const warnings: string[] = []

  page.on('pageerror', (err) => errors.push(err.message))
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errors.push(msg.text())
    if (msg.type() === 'warning') warnings.push(msg.text())
  })

  // IMPORTANT: set listeners BEFORE navigation to catch early errors
  await page.goto('/')

  await page.waitForSelector('canvas', { state: 'visible' })
  await page.waitForTimeout(1500)

  // Fast "gate": fail on hard errors
  expect(errors.join('\n')).not.toMatch(/WebGPU|WGSL|shader|RenderGraph|Graph compilation/i)
})
```

### Recommended "gates" (order by cost)

1. **Console gate**: fail fast on WebGPU/shader/render-graph errors.
2. **Center pixel gate**: sample a small canvas region to detect "all black" renders.
3. **Full screenshot analysis**: only when necessary (most expensive).

## Memory-Safe Testing Rules (Do not break these)

- Do **not** increase Vitest workers. Keep `maxWorkers: 4` and `pool: 'threads'` in `vitest.config.ts`.
- Keep tests small: avoid huge arrays; batch in chunks of 100.
- Always clean up timers/listeners you create in tests.

## Common Mistakes

- **Don't**: Write tests outside `src/tests/` or Playwright specs outside `scripts/playwright/`.
  **Do**: Follow the placement rules and mirror source structure.

- **Don't**: Try to instantiate WebGPU APIs (`GPUDevice`, `GPUAdapter`) in Vitest.
  **Do**: Test shader string composition and store logic in Vitest; use Playwright for GPU validation.

- **Don't**: Use fetch-based debugging or remote logging in tests.
  **Do**: Use Playwright console capture (`page.on('console')`) and assert on collected logs.

- **Don't**: Run Vitest watch mode in automation.
  **Do**: Use `npm test` (`vitest run`) for CI-safe execution.

- **Don't**: Forget store resets (test pollution).
  **Do**: Reset stores in `beforeEach` (or `setState` to initial state).

- **Don't**: Change `maxWorkers`/pool config to "make tests faster".
  **Do**: Keep worker limits stable to prevent memory exhaustion.

- **Don't**: Test WebGPU internals (exact buffer contents, pipeline state) in Vitest.
  **Do**: Test your own inputs/outputs and use Playwright for visual/rendering validation.
