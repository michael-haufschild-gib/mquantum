# Development Guide for LLM Coding Agents

**Purpose**: Instructions for setup, running, building, and debugging this WebGPU quantum visualization project.

**Read this first**:
- `docs/architecture.md` for file placement rules and rendering architecture.
- `docs/testing.md` for test patterns and Playwright debugging.
- `docs/meta/styleguide.md` for mandatory engineering rules.

## Setup (One-time)

```bash
# Install dependencies (npm is the expected package manager)
npm install
```

### WASM prerequisite

The project includes a Rust WASM module. To build it you need:
- **Rust** + **wasm-pack** installed
- Build is automatic during `npm run build`, or run manually:

```bash
npm run wasm:build
```

This compiles `src/wasm/mdimension_core/` to WebAssembly and outputs to `src/wasm/mdimension_core/pkg/`.

## Run Locally (Dev Server)

```bash
# Starts Vite dev server on port 3000
npm run dev
```

- Dev URL: `http://localhost:3000`
- The server sets `COOP`/`COEP` headers for `SharedArrayBuffer` support.
- Port is fixed by the script. To change: `npm run dev -- --port 3001`

**Important**: The dev server is already running during agent sessions. Do **not** start it yourself.

## Key Commands

| Task | Command | Notes |
|---|---|---|
| Dev server | `npm run dev` | Port 3000, already running |
| Unit/integration tests | `npm test` | `vitest run`, maxWorkers: 4 |
| Full build | `npm run build` | wasm:build -> tsc -b -> vite build |
| Build (no WASM) | `npm run build:web` | tsc -b -> vite build |
| Vite build only | `npx vite build` | Skips tsc (useful when pre-existing TS errors exist) |
| TypeScript check | `npx tsc --noEmit` | Type check without emitting |
| Preview prod build | `npm run preview` | Serve `dist/` locally |
| Lint | `npm run lint` | ESLint |
| Lint Rust | `npm run lint:rust` | Clippy on WASM crate |
| Format | `npm run format` | Prettier on src/ |
| Format Rust | `npm run format:rust` | Cargo fmt on WASM crate |
| E2E tests | `npx playwright test` | Auto-starts dev server |

### Build chain explained

`npm run build` runs three steps in sequence:
1. **`wasm:build`**: Compiles Rust to WASM via wasm-pack
2. **`tsc -b`**: TypeScript type checking (fails on type errors)
3. **`vite build`**: Bundles the app to `dist/`

**Known issue**: There are 11 pre-existing WebGPU ArrayBuffer type mismatches (`GPUAllowSharedBufferSource`). These block `npm run build` but do **not** block `npx vite build`. Use `npx vite build` when you need to verify the bundle works despite these TS errors.

## Standard Workflow

### Before you start (fast sanity)

```bash
npm test
```

### While developing

- Keep `npm run dev` running for manual iteration.
- When debugging runtime issues, prefer **Playwright + console logs** (see `docs/testing.md`).

### Before you claim work is done (required)

```bash
npm test
npm run lint
npx vite build    # or npm run build if tsc passes
```

## Decision Tree: "What command should I run?"

- Changed TypeScript/React logic -> `npm test`
- Changed WGSL shaders or WebGPU passes -> `npm test` + `npx playwright test`
- Changed Rust WASM code -> `npm run wasm:build` + `npm test`
- Changed dependencies, config, or build pipeline -> `npm run build`
- Touched formatting/style -> `npm run lint` and `npm run format`

## Debugging Rules (Project-specific)

- **Never use fetch-based debugging**. Do not add "reporting endpoints" or send logs over HTTP.
- For runtime bugs:
  - Add `console.log` (temporarily) in the browser code.
  - Capture and assert logs via Playwright (`page.on('console', ...)`).
  - Remove noisy logs after resolving.

## Adding Dependencies

```bash
# Runtime dependency
npm install <pkg>

# Dev dependency
npm install -D <pkg>
```

Rules:
- Prefer small, tree-shakeable, maintained packages.
- Do not add UI component libraries -- this repo has `src/components/ui`.
- Do not add WebGL/Three.js rendering libraries -- rendering is pure WebGPU.

## Build Output

```bash
npx vite build
```

Build artifacts go to `dist/`. Treat `dist/` as output only.

Key output chunks (from Vite manual chunk splitting):
- `react-vendor` - React core
- `three-core` - Three.js (used by legacy hooks only)
- `r3f-fiber`, `r3f-drei` - React Three Fiber (legacy)
- `zustand` - State management
- `motion` - Animation library
- `mdimension_core` - WASM module
- `index` - Main application bundle

## Troubleshooting

### Dev server won't start

- Check if port 3000 is already in use.
- Try: `npm run dev -- --port 3001`

### Tests hang or system gets sluggish

```bash
killall -9 node
npx vitest run src/tests/path/to/test.test.ts  # Isolate
```

### `npm run build` fails on tsc

- Check if failures are the 11 known WebGPU type errors (`GPUAllowSharedBufferSource`).
- If so, use `npx vite build` to verify the bundle works.
- New type errors from your changes must be fixed.

### Playwright fails to launch

- Playwright expects `http://localhost:3000` and auto-starts the dev server.
- If you already have a server running, Playwright will reuse it.

### WASM build fails

- Ensure `wasm-pack` is installed: `cargo install wasm-pack`
- Ensure Rust nightly/stable has the `wasm32-unknown-unknown` target: `rustup target add wasm32-unknown-unknown`

## Directory Rules (Keep the repo root clean)

| Activity | Required directory |
|---|---|
| Playwright tests | `scripts/playwright/` |
| Utility scripts | `scripts/tools/` |
| Screenshots/visual artifacts | `screenshots/` |
| Docs | `docs/` |
| Temporary experiments | `src/dev-tools/` |

## Common Mistakes

- **Don't**: Run `vitest` watch mode in automation or scripts.
  **Do**: Use `npm test` (`vitest run`) for CI-safe runs.

- **Don't**: Debug with fetch calls, remote log collectors, or "debug endpoints".
  **Do**: Use Playwright and inspect/capture console logs.

- **Don't**: Put scripts, scratch docs, or screenshots in the repo root.
  **Do**: Use `scripts/tools/`, `docs/`, and `screenshots/`.

- **Don't**: Skip `npx vite build` after pipeline-level changes.
  **Do**: Always verify the build before claiming the change is complete.

- **Don't**: Start the dev server (it's already running).
  **Do**: Use `http://localhost:3000` directly.

- **Don't**: Assume `npm run build` will pass if only `npx vite build` passes.
  **Do**: Know that `npm run build` also runs `tsc -b` which catches type errors.
