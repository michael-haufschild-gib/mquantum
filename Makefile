.PHONY: setup dev build build-web test lint format type-check ci clean

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

## Run linter
lint:
	npx eslint .

## Format code with Prettier
format:
	npx prettier --write "src/**/*.{ts,tsx,json,css}"

## Check formatting without writing
format-check:
	npx prettier --check "src/**/*.{ts,tsx,json,css}"

## Run TypeScript type checker
type-check:
	npx tsc -b

## Run full CI pipeline: lint, type-check, test, build
ci: lint type-check test build-web

## Remove build artifacts
clean:
	rm -rf dist tsconfig.tsbuildinfo
