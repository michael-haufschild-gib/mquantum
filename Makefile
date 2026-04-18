.PHONY: setup dev build build-web test test-coverage test-e2e lint lint-css format format-check type-check coverage-ratchet ci bundle-check clean

## Install dependencies
setup:
	pnpm install --frozen-lockfile

## Start dev server (port 3000)
dev:
	pnpm run dev

## Full build (WASM + TypeScript + Vite)
build:
	pnpm run build

## Web-only build (TypeScript + Vite, no WASM)
build-web:
	pnpm run build:web

## Run unit tests
test:
	pnpm exec vitest run

## Run unit tests with coverage report
test-coverage:
	pnpm exec vitest run --coverage

## Run Playwright e2e tests (requires running dev server)
test-e2e:
	pnpm exec playwright test

## Run linter (matches CI: zero warnings allowed)
lint:
	pnpm exec eslint . --max-warnings 0 --no-warn-ignored

## Run CSS linter
lint-css:
	pnpm exec stylelint "src/**/*.css" --max-warnings 0

## Format code with Prettier
format:
	pnpm exec prettier --write "src/**/*.{ts,tsx,json,css}"

## Check formatting without writing
format-check:
	pnpm exec prettier --check "src/**/*.{ts,tsx,json,css}"

## Run TypeScript type checker
type-check:
	pnpm exec tsc -b

## Check coverage ratchet (requires prior test-coverage run)
coverage-ratchet:
	node scripts/check-coverage-ratchet.js

## Run full CI pipeline (mirrors .github/workflows/ci.yml)
ci: format-check lint lint-css type-check test-coverage coverage-ratchet build-web

## Remove build artifacts
clean:
	rm -rf dist tsconfig.tsbuildinfo coverage
