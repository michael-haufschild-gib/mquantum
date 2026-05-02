# Contributing

Guidelines for contributing to mquantum.

## Development Setup

See [docs/getting-started.md](docs/getting-started.md) for prerequisites and first-run instructions.

## Code Style

All style rules are enforced automatically via ESLint, Stylelint, and Prettier. Run `pnpm run lint` before committing. The pre-commit hook (Husky + lint-staged) runs linting automatically on staged files.

Key rules:
- **TypeScript**: strict mode, no `any` types, `@/` path aliases
- **CSS**: oklch colors only (no hex/rgb/hsl), logical properties only (no margin-left), container queries (no breakpoint media queries)
- **Components**: use `src/components/ui/*` primitives, never raw HTML `<input>`, `<select>`, `<button>`
- **Stores**: `useShallow` for multi-value selectors, `getStore(ctx, 'name')` in render passes
- **WGSL**: `.wgsl.ts` files, `assembleShaderBlocks()` composition, `main` entry points
- **Logging**: use `logger.log/warn/error` from `@/lib/logger`, never `console.*`

Full details: [docs/meta/styleguide.md](docs/meta/styleguide.md).

## File Placement

Follow the decision tree in [docs/architecture.md](docs/architecture.md). New files go in the directory matching their domain. Use the templates provided in the architecture guide.

## Testing

Every change must pass the existing test suite:

```bash
pnpm exec vitest run        # Must pass: 9000+ tests
pnpm exec tsc -b            # Must pass: zero type errors
pnpm run lint               # Must pass: zero warnings
```

### Test quality rules

- No `toBeDefined`, `toBeTruthy`, `toBeFalsy` -- assert specific values
- No `expect(typeof x)` -- assert the computed result
- No DOM traversal in tests -- use testing-library queries
- No `test.skip` or `it.skip` -- fix or remove the test

These are enforced by custom ESLint rules. See [docs/testing.md](docs/testing.md).

## Commit Messages

Use conventional commit format:

```
feat(rendering): add quantum carpet visualization
fix(tdse): correct FFT normalization for non-power-of-2 grids
test(stores): add edge case tests for dimension clamping
docs(physics): document BEC chemical potential calculation
```

## Architecture Decisions

Significant design changes should be documented as an ADR in `docs/adr/`. See [docs/decisions.md](docs/decisions.md) for the existing records and format.

## What Not to Do

- Do not start a dev server in automation (port conflicts)
- Do not add WebGL, Three.js, or GLSL code -- this is WebGPU-only
- Do not import stores directly in render passes -- use `getStore(ctx, 'name')`
- Do not use `tailwind.config.js` -- use CSS `@theme` directive in `src/index.css`
- Do not hardcode bounding radius -- it is computed dynamically per quantum state
