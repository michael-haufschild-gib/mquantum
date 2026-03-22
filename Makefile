.PHONY: setup dev build build-web test lint lint-css format format-check type-check ci bundle-check clean

## Install dependencies
setup:
	npm ci

## Start dev server (port 3000)
dev:
	npm run dev

## Full build (WASM + TypeScript + Vite)
build:
	npm run build

## Web-only build (TypeScript + Vite, no WASM)
build-web:
	npm run build:web

## Run unit tests
test:
	npx vitest run

## Run linter (matches CI: zero warnings allowed)
lint:
	npx eslint . --max-warnings 0 --no-warn-ignored

## Run CSS linter
lint-css:
	npx stylelint "src/**/*.css" --max-warnings 0

## Format code with Prettier
format:
	npx prettier --write "src/**/*.{ts,tsx,json,css}"

## Check formatting without writing
format-check:
	npx prettier --check "src/**/*.{ts,tsx,json,css}"

## Run TypeScript type checker
type-check:
	npx tsc -b

## Check bundle size budget (requires prior build)
bundle-check:
	node scripts/check-bundle-size.js

## Run full CI pipeline (mirrors .github/workflows/ci.yml)
ci: format-check lint lint-css type-check test build-web bundle-check

## Remove build artifacts
clean:
	rm -rf dist tsconfig.tsbuildinfo
