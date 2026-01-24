# Suggested Commands

## Development

```bash
# Start dev server on port 3000
npm run dev

# Build for production (includes WASM build)
npm run build

# Build web only (no WASM)
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
npx playwright test scripts/playwright/object-types-rendering.spec.ts
```

## Code Quality

```bash
# Lint TypeScript/JavaScript
npm run lint

# Lint Rust (if WASM module exists)
npm run lint:rust

# Format code with Prettier
npm run format

# Format Rust
npm run format:rust
```

## WASM (Optional)

```bash
# Build WASM module
npm run wasm:build
```

## Git

```bash
# Standard git commands work (Darwin/macOS)
git status
git diff
git log --oneline -10
git add <files>
git commit -m "message"
git push
```

## File System (Darwin/macOS)

```bash
# List files
ls -la

# Find files
find . -name "*.ts" -type f

# Search in files
grep -r "pattern" src/

# Navigate
cd /path/to/dir
pwd
```

## Important Notes

- **Never run Vitest in watch mode in automation**
- **Max 4 test workers** (memory safety)
- **Tests in `src/tests/`**, Playwright specs in `scripts/playwright/`
- **Screenshots go in `screenshots/`**, never project root
