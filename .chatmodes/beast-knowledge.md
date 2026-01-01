# Knowledge - Trivial Test Removal

## Assumptions
- "Trivial tests" include:
    - "Renders without crashing" tests with no assertions or only checking for existence of a container.
    - Tests for simple constants or re-exports.
    - Tests that purely verify TypeScript types (redundant).
    - Tests for standard library-like utility functions that are extremely simple (e.g., `add(a, b)`).
- 100% test coverage is still a goal, so "trivial" tests that are the *only* coverage for a piece of logic should be replaced by more meaningful integration or behavioral tests rather than just deleted, OR the logic should be deemed so trivial it doesn't need a dedicated unit test if covered by integration tests.

## Decisions
- Focus on removing `.test.ts` or `.test.tsx` files that don't add value beyond "it exists".
- Prefer behavioral tests over implementation detail tests.

## Context Notes
- The project uses Vitest and React Testing Library.
- CIB-001/002 mandates 100% coverage. This is a strict constraint.
