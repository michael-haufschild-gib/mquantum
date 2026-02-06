# Suggested Commands

## Development

```bash
# Start dev server on port 3000
npm run dev

# Build for production (includes WASM build)
npm run build

# Build web only (no WASM rebuild)
npm run build:web

# Preview production build
npm run preview
```

## Testing

```bash
# Run all Vitest tests (CI-safe, max 4 workers)
npm test

# Run single test file
npx vitest run src/tests/path/to/test.test.ts

# Run tests matching pattern
npx vitest run -t "Render graph"

# Watch mode (human-authorized only, never in automation)
npm run test:watch

# Playwright E2E tests
npx playwright test

# Single Playwright spec
npx playwright test scripts/playwright/spec-name.spec.ts
```

## Code Quality

```bash
# Lint TypeScript/JavaScript
npm run lint

# Format code with Prettier
npm run format
```

## WASM

```bash
# Build WASM module (animation math: rotation, projection, matrix/vector)
npm run wasm:build
```

## Important Notes

- **Never run Vitest in watch mode in automation**
- **Max 4 test workers** (memory safety)
- **Tests in `src/tests/`**, Playwright specs in `scripts/playwright/`
- **Screenshots go in `screenshots/`**, never project root
- **No WebGL/GLSL** - all rendering is WebGPU/WGSL only
