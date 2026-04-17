# Getting Started

Developer onboarding for the mquantum codebase. This guide gets you from `git clone` to productive in under 10 minutes.

## Prerequisites

| Requirement | Version | Check |
|-------------|---------|-------|
| Node.js | >= 24 | `node --version` |
| pnpm | >= 10 | `pnpm --version` |
| Chrome/Chromium | >= 113 with WebGPU | `chrome://gpu` shows "WebGPU: Hardware accelerated" |
| Rust + wasm-pack | Latest stable | Only needed for WASM rebuilds; pre-built binary is committed |

Safari is not supported (WGSL compiler hangs on deep nested loops).

## First Run

```bash
pnpm install --frozen-lockfile   # Install dependencies (uses lockfile)
pnpm run dev                     # Starts Vite dev server on http://localhost:3000
```

The app opens in your default browser. You should see a rotating 3D quantum wavefunction.

## Project Layout

```
src/
  components/         React UI (Button, Slider, Select, ... in ui/)
  stores/             Zustand state (geometryStore, appearanceStore, ...)
  lib/                Pure logic: physics, math, geometry, URL serialization
  rendering/webgpu/   Custom WebGPU renderer (no Three.js, no WebGL)
  tests/              Vitest tests (mirrors src/ structure)
  wasm/               Rust/WASM bridge for animation math
scripts/playwright/   E2E test specs + page objects
docs/                 Architecture, testing, physics documentation
```

For detailed file placement rules, see [architecture.md](architecture.md).

## Common Tasks

### Run tests

```bash
pnpm exec vitest run                          # All unit tests (~6300 tests)
pnpm exec vitest run src/tests/stores/        # Tests for a specific directory
pnpm exec vitest run -t "hermite"             # Tests matching a pattern
pnpm exec playwright test                     # E2E tests (needs GPU)
```

### Check code quality

```bash
pnpm run lint                                 # ESLint (zero warnings tolerance)
pnpm run lint:css                             # Stylelint (oklch colors, logical properties)
pnpm exec tsc -b --noEmit                     # TypeScript strict check
```

### Build for production

```bash
pnpm run build                                # Full: WASM + tsc + Vite + bundle checks
pnpm run build:web                            # Web only: tsc + Vite + bundle checks (skips WASM)
```

The build pipeline includes chunk cycle detection and bundle size budget enforcement.

## Key Patterns to Know

### Store access in components

```tsx
// Single value
const dimension = useGeometryStore((s) => s.dimension)

// Multiple values (useShallow prevents unnecessary re-renders)
import { useShallow } from 'zustand/react/shallow'
const { dimension, objectType } = useGeometryStore(
  useShallow((s) => ({ dimension: s.dimension, objectType: s.objectType }))
)
```

### Store access in render passes

```typescript
// Passes access stores via the frame context, never via direct imports
const appearance = getStore(ctx, 'appearance')
```

### WGSL shaders

Shaders are TypeScript template literals in `.wgsl.ts` files, composed at runtime:

```typescript
export const myBlock = /* wgsl */ `
  fn myFunction(x: f32) -> f32 {
    return x * x;
  }
`
```

Composed via `assembleShaderBlocks()` from `shared/compose-helpers.ts`.

## Detailed Guides

| Guide | When to read |
|-------|-------------|
| [Architecture](architecture.md) | Creating new files, understanding structure |
| [Frontend](frontend.md) | Building UI features, adding controls |
| [Testing](testing.md) | Writing tests, running test suites |
| [Style Guide](meta/styleguide.md) | Code style rules (TypeScript, CSS, WGSL) |
| [ADRs](decisions.md) | Understanding why specific design decisions were made |
| [Physics Docs](physics/) | Mode-specific physics and validation methodology |
