# Suggested Commands

## Development

```bash
# Start dev server on port 3000
pnpm run dev

# Build for production (includes WASM build)
pnpm run build

# Build web only (no WASM rebuild)
pnpm run build:web

# Preview production build
pnpm run preview
```

## Testing

```bash
# Run all Vitest tests (CI-safe, max 4 workers)
pnpm test

# Run single test file
pnpm exec vitest run src/tests/path/to/test.test.ts

# Run tests matching pattern
pnpm exec vitest run -t "Render graph"

# Watch mode (human-authorized only, never in automation)
pnpm run test:watch

# Playwright E2E tests
pnpm exec playwright test

# Single Playwright spec
pnpm exec playwright test scripts/playwright/spec-name.spec.ts
```

## Code Quality

```bash
# Lint TypeScript/JavaScript
pnpm run lint

# Format code with Prettier
pnpm run format
```

## WASM

```bash
# Build WASM module (animation math: rotation, projection, matrix/vector)
pnpm run wasm:build
```

## Important Notes

- **Never run Vitest in watch mode in automation**
- **Max 4 test workers** (memory safety)
- **Tests in `src/tests/`**, Playwright specs in `scripts/playwright/`
- **Screenshots go in `screenshots/`**, never project root
- **No WebGL/GLSL** - all rendering is WebGPU/WGSL only
- **Package manager is pnpm** (>= 10). Never run `npm`/`npx`.
