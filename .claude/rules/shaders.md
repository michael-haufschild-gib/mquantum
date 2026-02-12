---
paths:
  - "src/rendering/webgpu/shaders/**/*.wgsl.ts"
  - "src/rendering/webgpu/shaders/**/compose.ts"
---

# WGSL Shader Rules

## File Convention

- Format: `.wgsl.ts` TypeScript files exporting template literal strings
- Location: `src/rendering/webgpu/shaders/<category>/<name>.wgsl.ts`
- Syntax prefix: `/* wgsl */` before template literal for editor highlighting
- Composition: `assembleShaderBlocks()` from `shared/compose-helpers.ts`
- Conditional inclusion: set `ShaderBlock.condition = false` to skip a block

## Block Dependency Order (must follow this sequence)

1. Vertex input structs
2. Defines / constants
3. Uniforms (core)
4. Bind group declarations
5. Math utilities (complex, hermite)
6. Color system (HSL, oklab, cosine palette)
7. Lighting (GGX PBR — isosurface only)
8. Volume rendering (absorption, emission, integration)
9. Geometry (sphere intersection, SDF)
10. Features (temporal, cross-section)
11. Fragment output structs (MRT)
12. Main shader

## Bind Groups (max 4)

| Group | Purpose | Content |
|-------|---------|---------|
| 0 | Camera (per-frame) | `CameraUniforms` |
| 1 | Combined rendering (per-material) | lighting, material, quality |
| 2 | Object-specific (per-object) | object uniforms, `BasisVectors` |
| 3 | IBL / Environment (optional) | iblUniforms, envMap, sampler |

Generate with `generateConsolidatedBindGroups()` (G0-G1) and `generateObjectBindGroup()` (G2).

## Critical WGSL Rules

| Rule | Detail |
|------|--------|
| `vec3f` alignment | **16 bytes**, not 12. Always pad after `vec3f` in structs. |
| `textureSample` | Uniform control flow only. Use `textureLoad` for depth textures and inside conditionals. |
| Entry point names | Must be `main` (required by `createFullscreenPipeline()`). |
| Pipeline format | Must match render target: canvas=`bgra8unorm`, HDR=`rgba16float`, LDR=`rgba8unorm`, AO=`r8unorm`. |
| GPU labels | All GPU objects require descriptive `label` properties. |

## Checklist Before Submitting Shader Changes

- [ ] All `textureSample` calls in uniform control flow
- [ ] Depth/unfilterable textures use `textureLoad`
- [ ] At most 4 bind groups (0-3)
- [ ] Entry points named `main`
- [ ] All struct types defined before use
- [ ] `vec3f` padding accounted for
- [ ] Pipeline format matches render target
