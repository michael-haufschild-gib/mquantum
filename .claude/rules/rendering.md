---
paths:
  - "src/rendering/**/*.ts"
  - "src/rendering/**/*.tsx"
---

# WebGPU Rendering Rules

## Renderer Identity

This project uses a **custom WebGPU renderer** built on raw `GPUDevice` / `GPUCommandEncoder` APIs. There is NO WebGL, NO Three.js, NO GLSL anywhere in this codebase.

## Pass Architecture

| Concept | Implementation |
|---------|---------------|
| Base class | All render and compute passes extend `WebGPUBasePass` (or `WebGPUBaseComputePass` for compute) |
| Declaration | Passes declare `id`, `priority`, `inputs`, and `outputs` via the `super({...})` call in their constructor |
| Ordering | Render graph uses topological sort + priority — pass order is automatic |
| Store access | Use `getStore(ctx, 'storeName')` — never import stores directly |
| GPU labels | All GPU objects (`GPUBuffer`, `GPUTexture`, `GPUPipeline`) must have descriptive `label` properties |

## Creating a New Pass

1. Create `src/rendering/webgpu/passes/{Name}Pass.ts`.
2. Extend `WebGPUBasePass`.
3. In the constructor, call `super({ id, priority, inputs, outputs })` — `inputs` and `outputs` each take an array of `{ resourceId, access, binding }` entries.
4. Implement `protected async createPipeline(ctx)` to build the pipeline and bind groups.
5. Implement `execute(ctx)` to encode the pass each frame.
6. Wire the pass through `scenePassConstruction.ts` (post-processing) or `scenePassSetup.ts` (Schroedinger family). `WebGPUScene.ts` only triggers the setup task.

## Bounding Radius

`SchroedingerUniforms.boundingRadius` is computed dynamically per quantum state (physics-based). It is NOT a hardcoded constant. The cube geometry resizes when bounding radius changes.
