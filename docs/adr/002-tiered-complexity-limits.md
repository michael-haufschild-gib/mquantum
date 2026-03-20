# ADR-002: Tiered cyclomatic complexity limits

**Status**: Accepted
**Date**: 2026-03-20
**Deciders**: Project maintainer

## Context

The ESLint `complexity` rule was set to a single limit of 40. This was too permissive — 87 functions exceeded 20, and 25 exceeded 30. However, the high-complexity functions fell into distinct categories with different reduction potential:

- **GPU pipeline code** (uniform packing, compute pass setup, render graph execution): Complexity from branching on quantum modes, representation types, and feature flags. Linear sequences of conditional setup, not deeply nested. Extracting helpers would scatter related pipeline configuration across multiple functions, reducing locality without improving understanding.
- **UI form components**: Complexity from conditional rendering of quantum-mode-specific controls. Inherent to the number of configuration combinations.
- **Store normalization/validation code**: Complexity from repetitive validate-clamp-or-delete patterns. Reducible via helper extraction.

## Decision

Three-tier complexity limits:

| Tier | Limit | Scope | Rationale |
|-|-|-|-|
| Base | 30 | All code | Default for new code |
| UI/orchestration | 35 | Complex forms, keyboard shortcuts, video export, scene load | Conditional rendering for 6+ quantum modes |
| GPU pipeline | 40 | Render passes, uniform packing, render graph, renderers | WebGPU pipeline configuration is inherently branchy |

Applied via ESLint flat config overrides. `eslintGuard.test.ts` enforces that exactly 3 `complexity:` definitions exist — prevents adding new per-file exemptions without updating the guard.

## Alternatives Considered

1. **Single limit at 25**: Would require refactoring 54 functions, many in GPU code where decomposition hurts locality.
2. **Single limit at 30 with per-file overrides**: Same effect but without the principled tier structure — encourages ad-hoc exemptions.
3. **Keep at 40**: No improvement for non-GPU code.

## Consequences

- Non-GPU, non-UI code has a 30 ceiling (was 40)
- Refactored `normalizeLightingLoadData`, `normalizeAppearanceObjects`, and `exportStore.updateSettings` to use extracted helpers, reducing their complexity below 30
- GPU code retains 40 ceiling — acknowledged as inherent, not aspirational
- New code defaults to 30, creating pressure toward simpler functions
