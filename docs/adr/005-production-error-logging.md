# ADR-005: Production error logging via logger.error

**Status**: Accepted
**Date**: 2026-03-24
**Deciders**: Project maintainer

## Context

The structured logger (`src/lib/logger.ts`) was initially designed to strip all logging in production via `import.meta.env.DEV` guards. This makes debug and info messages tree-shakeable, reducing bundle size. However, it also silenced `logger.error()` calls in production, making GPU failures invisible to users and developers.

Critical error paths affected:
- WebGPU device lost events (`WebGPUCanvas.tsx:146`)
- WebGPU initialization failures (`WebGPUCanvas.tsx:166`)
- Shader compilation errors (`WebGPUScene.ts:420`)
- Pass setup failures
- Preset import/export errors

Users experiencing GPU failures in production had no diagnostic output in the browser console.

## Decision

Split logger behavior by level:
- `logger.log()`, `logger.warn()`: remain DEV-only (tree-shaken in production)
- `logger.error()`: always emits to `console.error` in both development and production

This is the minimum viable change for production diagnosability. Errors represent conditions that should never be silent.

## Alternatives Considered

1. **Keep all logging DEV-only**: Simple but makes production failures undiagnosable. Rejected.
2. **External error reporting service (Sentry, LogRocket, etc.)**: Permanently rejected. This is a fully client-side app deployed on Vercel with zero backend infrastructure. Integrating an error reporting service would introduce: (a) GDPR obligations for processing user telemetry data, (b) recurring server/SaaS costs with no revenue to offset them, (c) a third-party dependency that requires ongoing maintenance. The project will not send any data anywhere. Console.error provides sufficient diagnostics for users who report issues — they can share DevTools output.
3. **User-visible error UI only**: The app already shows error states in the UI (via ErrorBoundary, renderer state), but the console provides the technical detail needed to diagnose the cause. Both are needed.
4. **Make all levels production-safe**: Would eliminate the tree-shaking benefit for debug/info logging. The bundle size impact is ~0 for error-only, but would be measurable for all levels.

## Consequences

**Positive**:
- GPU failures, shader errors, and initialization problems are visible in production console
- Zero bundle size impact (logger.error was already bundled; only the DEV guard was removed)
- No API change for callers — existing `logger.error()` calls just work

**Negative**:
- Production users see error messages in the console. This is intentional: the alternative (silent failure) is worse.

**Ratchets**:
- `no-console` ESLint rule prevents raw `console.*` calls. All error logging flows through the logger.
- ErrorBoundary files are separately exempt for crash reporting.
