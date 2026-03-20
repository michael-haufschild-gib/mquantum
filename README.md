# mquantum

An N-dimensional quantum physics visualizer running entirely in the browser via WebGPU.

**Live demo**: https://mquantum.vercel.app/

## Honest Disclaimer

This is a vibecoded project. I have no real understanding of the quantum mechanics math behind it. I don't know whether the rendered wavefunctions or the values displayed in the UI are physically correct. It looks cool, and that's about as far as my confidence goes.

The project exists as an experiment in pushing the limits of vibecoding with Claude Code (Opus 4.5 / 4.6). The entire codebase — ~600 source files, 83 WGSL shaders, Rust/WASM math, 2000+ tests, and this README — was written by Claude across ~400 commits. I described what I wanted, Claude wrote the code.

## What It Does

- Renders quantum wavefunctions in 2 to 11 dimensions
- Quantum modes: harmonic oscillator, hydrogen orbital, hydrogen N-dimensional, TDSE dynamics, Dirac equation, Pauli spinor, BEC dynamics, free scalar field
- Raymarches volumetric probability densities on the GPU via custom WebGPU shaders
- Post-processing pipeline: bloom, tonemapping, temporal reprojection, paper texture, FXAA/SMAA
- Interactive orbit camera, N-dimensional rotation controls, animation
- Scene and style preset system

## Tech Stack

- **Rendering**: Custom WebGPU renderer (raw `GPUDevice` / `GPUCommandEncoder`)
- **Shaders**: WGSL (83 shader modules, composed via `assembleShaderBlocks()`)
- **Frontend**: React 19 + TypeScript 5 + Vite 7
- **State**: Zustand 5
- **Styling**: Tailwind CSS 4
- **Math**: Rust/WASM for rotation and projection math
- **Testing**: Vitest (2000+ tests) + Playwright E2E

## Prerequisites

- Node.js 22+
- npm 10+
- A browser with WebGPU support (Chrome/Edge 113+, Firefox Nightly)
- (Optional) Rust toolchain + wasm-pack for WASM builds

## Getting Started

```bash
# Install dependencies
npm ci

# Start dev server on port 3000
npm run dev
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

Or use npm directly:

```bash
npm run dev        # Dev server
npm run build      # Full build (wasm + tsc + vite)
npm run build:web  # Web-only build (tsc + vite)
npx vitest run     # Unit tests
npx eslint .       # Lint
npx tsc -b         # Type check
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

## CI/CD

GitHub Actions runs on every push/PR to `main`: format check, lint, type check, test, build. See `.github/workflows/ci.yml`.

## License

MIT
