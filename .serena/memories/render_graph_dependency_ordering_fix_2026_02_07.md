# Render Graph Dependency Ordering Fix (2026-02-07)

## Problem
Paper post-processing could execute before Tonemapping despite consuming `ldr-color` produced by Tonemapping.

## Root Cause
`WebGPURenderGraph.compile()` performed DFS-style dependency traversal but then globally resorted `sorted` by `priority` (`sorted.sort(...)`), which can violate producer->consumer edges.

- File: `src/rendering/webgpu/graph/WebGPURenderGraph.ts` (old logic around compile ordering)
- Example conflict:
  - `TonemappingPass` priority 900, outputs `ldr-color`
  - `PaperTexturePass` priority 195, inputs `ldr-color`
  - Global priority sort placed paper before tonemap.

## Fix
Replaced ordering logic with Kahn topological sort and priority tie-break only among ready/independent nodes.

- Build `outputToPass` map
- Build dependency graph (`dependents`, `indegree`)
- Process zero-indegree queue sorted by priority
- Preserve dependency constraints; deterministic order for independent passes
- Add cycle fallback: append remaining passes by priority with explicit error log

## Regression Test
Added `src/tests/rendering/webgpu/WebGPURenderGraph.compileOrder.test.ts`:
1. Verifies producer (`tonemap`) remains before consumer (`paper-texture`) even when consumer has lower numeric priority.
2. Verifies independent passes still follow priority ordering.

## Verification
Executed:
- `npx vitest run src/tests/rendering/webgpu/WebGPURenderGraph.compileOrder.test.ts`
- `npx vitest run src/tests/rendering/webgpu/WebGPURenderGraph.timestampWrites.test.ts src/tests/rendering/webgpu/WebGPUScene.temporal.test.ts src/tests/rendering/webgpu/WebGPURenderGraph.compileOrder.test.ts`

All passed after fix.