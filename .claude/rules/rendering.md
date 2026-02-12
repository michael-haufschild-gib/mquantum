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
| Base class | All render passes extend `WebGPUBasePass` |
| Declaration | Passes declare inputs/outputs/enabled in static `declare()` method |
| Ordering | Render graph uses topological sort — pass order is automatic |
| Store access | Use `getStore(ctx, 'storeName')` — never import stores directly |
| GPU labels | All GPU objects (`GPUBuffer`, `GPUTexture`, `GPUPipeline`) must have descriptive `label` properties |

## Creating a New Pass

1. Create `src/rendering/webgpu/passes/{Name}Pass.ts`
2. Extend `WebGPUBasePass`
3. Implement static `declare()` with inputs/outputs/enabled
4. Implement `render(ctx, encoder)`
5. Register in `WebGPUScene.tsx` → `setupRenderPasses()`

## Bounding Radius

`SchroedingerUniforms.boundingRadius` is computed dynamically per quantum state (physics-based). It is NOT a hardcoded constant. The cube geometry resizes when bounding radius changes.
