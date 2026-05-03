# mquantum

An N-dimensional quantum physics visualizer running entirely in the browser via WebGPU.

**Live demo**: https://mquantum.vercel.app/

## Honest Disclaimer

This project was developed via "vibecoding" with Claude Code (Opus 4.5 / 4.6): the maintainer described intent and Claude produced ~1500 source files, 149 WGSL shaders, Rust/WASM math, 9200+ tests, and this README across ~1100 commits.

Whether the rendered values are physically correct varies by mode. See [Physics Validation Status](docs/physics/validation-status.md) for a per-mode matrix of what has analytical / reference-data / property / convergence evidence behind it, and what does not. Some modes (harmonic oscillator, hydrogen, AdS) have strong analytical oracles; others (Pauli spinor) have only regression-fixture coverage. Modes with weaker evidence are explicitly flagged.

If you are evaluating this for research use, read the validation-status doc first.

## What It Does

- Renders quantum wavefunctions in 2 to 11 dimensions
- Quantum modes: harmonic oscillator, hydrogen orbital, hydrogen N-dimensional, TDSE dynamics, Dirac equation, Pauli spinor, BEC dynamics, free scalar field
- Raymarches volumetric probability densities on the GPU via custom WebGPU shaders
- Post-processing pipeline: bloom, tonemapping, temporal reprojection, paper texture, FXAA/SMAA
- Interactive orbit camera, N-dimensional rotation controls, animation
- Scene and style preset system

## Tech Stack

- **Rendering**: Custom WebGPU renderer (raw `GPUDevice` / `GPUCommandEncoder`)
- **Shaders**: WGSL (149 shader modules, composed via `assembleShaderBlocks()`)
- **Frontend**: React 19 + TypeScript 5 + Vite 7
- **State**: Zustand 5
- **Styling**: Tailwind CSS 4
- **Math**: Rust/WASM for rotation and projection math
- **Testing**: Vitest (9200+ tests) + Playwright E2E (103 specs) + Stryker mutation testing

## Prerequisites

- Node.js 24+
- pnpm 10+
- A browser with WebGPU support (Chrome/Edge 113+, Firefox Nightly)
- (Optional) Rust toolchain + wasm-pack for WASM builds

## Getting Started

```bash
# Install dependencies
pnpm install --frozen-lockfile

# Start dev server on port 3000
pnpm run dev
```

Opens at `http://localhost:3000`.

## Commands

| Command | Purpose |
|---------|---------|
| `make setup` | Install dependencies |
| `make dev` | Start dev server |
| `make build` | Full build (WASM + TypeScript + Vite) |
| `make build-web` | Web-only build (TypeScript + Vite) |
| `make test` | Run unit tests |
| `make lint` | Run ESLint |
| `make format` | Format code with Prettier |
| `make type-check` | Run TypeScript type checker |
| `make ci` | Run full CI pipeline (lint + type-check + test + build) |

Or use pnpm directly:

```bash
pnpm run dev          # Dev server
pnpm run build        # Full build (wasm + tsc + vite)
pnpm run build:web    # Web-only build (tsc + vite)
pnpm exec vitest run  # Unit tests
pnpm exec eslint .    # Lint
pnpm exec tsc -b      # Type check
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for detailed file placement rules, naming conventions, and code templates.

### Dependency Flow

```
  UI Components  -->  Zustand Stores  -->  Rendering Pipeline
  (React/TSX)        (stores/)             (rendering/webgpu/)
       |                  |                       |
       v                  v                       v
    lib/             lib/physics/         shaders/ (WGSL)
  (pure logic)     (quantum math)       (GPU programs)
```

Presentation depends on state depends on computation. Never the reverse. Render passes access stores via `getStore(ctx, 'storeName')` frame context, never through React hooks.

### Project Structure

```
src/
  components/       # React UI components
    ui/             # Reusable primitives (Button, Slider, etc.)
    layout/         # Layout frames and panels
    sections/       # Sidebar control sections
  stores/           # Zustand state management
    slices/         # Store slices by domain
    utils/          # Preset serialization, merge helpers
    defaults/       # Default values
  lib/              # Pure logic (no React)
    math/           # N-dimensional math utilities
    physics/        # Quantum physics computation
    geometry/       # Object type registry
  rendering/
    webgpu/         # Custom WebGPU renderer
      core/         # Device, Camera, BasePass, UniformBuffer
      graph/        # Declarative render graph
      renderers/    # Schroedinger renderer, Skybox renderer
      passes/       # Render and compute passes
      shaders/      # WGSL shader modules (.wgsl.ts)
  hooks/            # React hooks
  constants/        # Shared constants (dimension limits, z-index)
  tests/            # Vitest tests (mirrors src/ structure)
  wasm/             # Rust/WASM bridge (animation math)
```

## Documentation

| Document | Purpose |
|----------|---------|
| [Architecture Guide](docs/architecture.md) | File placement, naming conventions, code templates |
| [Frontend Guide](docs/frontend.md) | UI components, stores, hooks, state management |
| [Testing Guide](docs/testing.md) | Test infrastructure, patterns, quality rules |
| [Style Guide](docs/meta/styleguide.md) | TypeScript, CSS (Tailwind 4), WGSL, JSDoc rules |
| [Getting Started](docs/getting-started.md) | Developer onboarding walkthrough |
| [ADRs](docs/decisions.md) | Architecture decision records |
| [Physics Docs](docs/physics/) | Per-mode physics documentation and validation |

## Quality Gates

- **TypeScript strict mode**: `noUncheckedIndexedAccess`, `strictNullChecks`, zero `any` types
- **ESLint**: 10 custom project rules (no shallow test matchers, no hardcoded colors, no raw HTML controls, no DOM traversal in tests, ...)
- **Stylelint**: oklch-only colors, logical properties, no breakpoint media queries
- **Coverage ratchet**: thresholds auto-raise, can never regress (`scripts/check-coverage-ratchet.js`)
- **Bundle size budgets**: per-chunk gzip limits enforced at build time (`scripts/check-bundle-size.js` + `scripts/bundle-size-budgets.json`)
- **Chunk cycle detection**: circular dependency prevention (value imports only)
- **Mutation testing**: Stryker on pure logic and state management

## Physics Validation

The quantum math implementations are validated by an extensive automated test suite:

- **Hermite polynomials**: Orthogonality, recurrence relations, normalization for harmonic oscillator basis functions
- **Hydrogen wavefunctions**: Quantum number constraints, radial node counts, angular momentum coupling
- **Colormaps**: Phase-to-color mapping continuity, domain coloring accuracy
- **Cross-store interactions**: Quantum mode transitions preserve physical constraints (e.g., `0 <= l < n`, `-l <= m <= l`)
- **TDSE dynamics**: Energy conservation, probability normalization, potential evaluation
- **BEC/Dirac/Pauli**: Mode-specific diagnostics and state evolution correctness

Run `pnpm exec vitest run` to execute the full suite (9000+ tests, 580+ test files).

## CI/CD

GitHub Actions runs on every push/PR to `main`: format check, lint, type check, test, build. See `.github/workflows/ci.yml`.

## License

MIT
