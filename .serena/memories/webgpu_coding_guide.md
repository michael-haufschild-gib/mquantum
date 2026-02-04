# WebGPU Best Practices & Common Pitfalls

_Last updated: 2026-01-24_

## Removed APIs (DO NOT USE)

| Pattern | Removed In | Replacement |
|---------|------------|-------------|
| `adapter.requestAdapterInfo()` | Chrome 131 | `adapter.info` (sync property) |
| `adapter.isFallbackAdapter` | Chrome 140 | `adapter.info.isFallbackAdapter` |
| `requestAdapter({ compatibilityMode })` | Chrome 137 | Removed entirely |
| `maxInterStageShaderComponents` limit | Chrome 135 | Use `maxInterStageShaderVariables` |
| `bgra8unorm` for storage textures | Chrome 143 | Use `rgba8unorm` or `rgba16float` |
| `encoder.writeTimestamp()` | Removed | Use `timestampWrites` in `beginRenderPass()`/`beginComputePass()` |

---

## WGSL Shader Pitfalls

### 1. Non-Uniform Control Flow with textureSample

**Problem**: WGSL requires `textureSample` to be called only from uniform control flow. If you sample a texture and use the result to decide whether to sample again, the shader fails.

**Error**: `'textureSample' must only be called from uniform control flow`

```wgsl
// ❌ BAD - non-uniform control flow
fn isHorizonPixel(uv: vec2f) -> bool {
  let color = textureSample(tex, sampler, uv);
  return color.a > 0.9;
}
if (isHorizonPixel(uv)) { ... }  // Result controls later texture samples

// ✅ GOOD - use textureLoad (no uniform control flow requirement)
let texCoord = vec2i(uv * vec2f(textureDimensions(tex)));
let color = textureLoad(tex, texCoord, 0);
```

### 2. Unfilterable-Float Textures Can't Use textureSample

**Problem**: Depth textures bound as `unfilterable-float` cannot use `textureSample` with a filtering sampler.

**Error**: `TextureSampleType::UnfilterableFloat but used statically with a sampler that's SamplerBindingType::Filtering`

```wgsl
// ❌ BAD - depth bound as unfilterable-float
let depth = textureSample(depthTex, sampler, uv).r;

// ✅ GOOD - use textureLoad
let texDims = textureDimensions(depthTex);
let coord = vec2i(uv * vec2f(texDims));
let depth = textureLoad(depthTex, coord, 0).r;
```

### 3. Maximum 4 Bind Groups (0-3)

**Problem**: WebGPU limits pipelines to 4 bind groups. Using `@group(4)` or higher fails.

**Error**: `bindGroupLayoutCount (5) is larger than the maximum allowed (4)`

```wgsl
// ❌ BAD - exceeds limit
@group(4) @binding(0) var<uniform> extra: ExtraData;

// ✅ GOOD - use group 3 or consolidate
@group(3) @binding(0) var<uniform> extra: ExtraData;
```

### 4. Entry Point Naming Mismatch

**Problem**: Pipeline expects specific entry point names. Mismatch causes failure.

**Error**: `Entry point "main" doesn't exist in the shader module`

```wgsl
// ✅ Match entry point name to pipeline configuration
@fragment
fn main(input: VertexOutput) -> @location(0) vec4f { ... }
```

### 5. Struct Types Must Be Defined Before Use

**Problem**: WGSL requires structs defined in the same shader module where used.

**Error**: `unresolved type 'BasisVectors'`

**Solution**: Include struct definitions in each shader that uses them.

---

## Anti-Patterns to Avoid

### 1. `layout: 'auto'` on Pipelines
```typescript
// ❌ BAD - prevents bind group reuse
device.createRenderPipeline({ layout: 'auto', ... })

// ✅ GOOD - explicit layout enables reuse
const layout = device.createPipelineLayout({ bindGroupLayouts: [...] })
device.createRenderPipeline({ layout, ... })
```

### 2. Missing Device Loss Handler
```typescript
// ✅ REQUIRED
device.lost.then((info) => {
  console.error('Device lost:', info.message, info.reason)
  // Attempt recovery or notify user
})
```

### 3. Async Code in Error Scopes
```typescript
// ❌ BAD - scope pops before GPU work
device.pushErrorScope('validation')
await fetch(...)  // async breaks scope
device.popErrorScope()

// ✅ GOOD - scope only around sync GPU calls
const data = await fetch(...)
device.pushErrorScope('validation')
createBuffer(data)  // sync only
device.popErrorScope().then(handleError)
```

---

## Best Practices

### Bind Group Organization (by update frequency)
- **Group 0**: Per-frame data (camera, time) - rarely changes
- **Group 1**: Per-material data (textures, samplers) - changes with material
- **Group 2**: Per-object data (transforms) - changes every draw
- **Group 3**: Dynamic/misc data

### Uniform Buffer Sizes (CRITICAL)

Calculate struct sizes using WGSL alignment rules:
- `mat4x4f`: 16-byte align, 64 bytes
- `vec3f`: 16-byte align, 12 bytes (padding follows)
- `vec2f`: 8-byte align, 8 bytes
- `f32/i32/u32`: 4-byte align, 4 bytes

**CameraUniforms**: **384 bytes** (368 actual + padding)
**LightingUniforms**: **576 bytes** (560 actual + padding)

⚠️ NEVER use 256 for camera or 512 for lighting buffers - these overflow!

### Buffer Uploads
- Use `writeBuffer()` as default (simple, optimized by browser)
- Use `mappedAtCreation: true` for static buffers
- Consider staging buffer ring for high-frequency updates

### Debugging
- Add `label` to ALL GPU objects (buffers, textures, pipelines, bind groups)
- Use `pushDebugGroup()`/`popDebugGroup()` for render pass organization
- Use error scopes around risky operations (shader compilation, resource creation)

### Error Types
- `validation`: Invalid inputs (predictable, catch during development)
- `out-of-memory`: Resource exhaustion (unpredictable, handle gracefully)
- `internal`: Implementation failures (may work on different hardware)

---

## Shader Writing Checklist

- [ ] All `textureSample` calls are in uniform control flow
- [ ] Depth/unfilterable textures use `textureLoad`, not `textureSample`
- [ ] Using at most 4 bind groups (0-3)
- [ ] Entry point names match pipeline configuration
- [ ] All referenced struct types are defined in the shader
- [ ] Fragment shaders don't declare bind groups they don't use
- [ ] All GPU objects have descriptive `label` properties

---

## Render Graph Architecture Pitfalls

### 1. Renderer Output Resources Must Be Registered

**Problem**: When a renderer declares outputs (e.g., `temporal: true` expects `quarter-color`), those resources MUST be registered in `setupRenderPasses`. Missing resources cause silent failures.

**Error**: `[WebGPU Renderer] Missing color render target`

```typescript
// ❌ BAD - renderer expects resources that don't exist
new WebGPUSchrodingerRenderer({ temporal: true })  // Expects quarter-color, quarter-position
// But setupRenderPasses never registers these!

// ✅ GOOD - disable feature until full pipeline exists
new WebGPUSchrodingerRenderer({ temporal: false })

// OR register the resources:
graph.addResource('quarter-color', { type: 'texture', format: 'rgba16float', ... })
graph.addResource('quarter-position', { type: 'texture', format: 'rgba16float', ... })
// AND add the pass that consumes them
```

**Rule**: A renderer feature requiring custom resources needs BOTH resource registration AND any consuming pass (e.g., `WebGPUTemporalCloudPass`).

### 2. Store Getters Run Many Times Per Frame

**Problem**: `graph.setStoreGetter()` callbacks run multiple times per frame. Expensive operations inside cause severe FPS drops.

```typescript
// ❌ BAD - 0-1 FPS, animation jumping
graph.setStoreGetter('extended', () => {
  const { basisX, basisY, basisZ } = rotation.getBasisVectors(true)  // Forces recomputation!
  return { ...state, basisX: new Float32Array(basisX) }  // Allocates memory!
})

// ✅ GOOD - 60 FPS
// 1. Compute in render loop, cache in ref
const basisCacheRef = useRef({ basisX: new Float32Array(11), ... })

// In render loop:
const { basisX, changed } = rotation.getBasisVectors(false)  // Uses version tracking
if (changed) basisCacheRef.current.basisX.set(basisX)

// 2. Store getter returns cached ref (no computation, no allocation)
graph.setStoreGetter('extended', () => ({
  ...state,
  basisX: basisCacheRef.current.basisX,  // Direct ref, no copy
}))
```

**Rules**:
- Never call computation functions in store getters
- Never allocate (new Array, new Float32Array) in store getters  
- Cache expensive results in refs, update in render loop
- Use version-based dirty tracking to skip unchanged data

---

## Pipeline Format Must Match Render Target (CRITICAL)

**Problem**: When creating a render pipeline, the `colorFormat` must exactly match the texture format being rendered to. Using `ctx.format` (canvas format, typically `bgra8unorm`) when rendering to HDR textures (`rgba16float`) causes validation errors.

**Error**: `Attachment state of [RenderPipeline] is not compatible with [RenderPassEncoder]`

```typescript
// ❌ BAD - pipeline format doesn't match target
protected async createPipeline(ctx: WebGPUSetupContext) {
  const { device, format } = ctx  // format = bgra8unorm (canvas)
  
  this.pipeline = this.createFullscreenPipeline(
    device, shader, [bindGroupLayout],
    format,  // ← Wrong! Renders to rgba16float texture
    { label: 'my-pass' }
  )
}

// ✅ GOOD - use explicit format matching target texture
this.pipeline = this.createFullscreenPipeline(
  device, shader, [bindGroupLayout],
  'rgba16float',  // ← Matches HDR texture resource
  { label: 'my-pass' }
)
```

**Format Guidelines**:
| Render Target | Pipeline Format |
|---------------|-----------------|
| Canvas | `format` from ctx (`bgra8unorm`) |
| HDR textures (scene, bloom, jets, etc.) | `'rgba16float'` |
| LDR textures (ldr-color, final-color) | `'rgba8unorm'` |
| AO buffer | `'r8unorm'` |
| Edge detection (SMAA) | `'rg8unorm'` |

---

## Texture Usage Flags for Copy Operations

**Problem**: Using `copyTextureToTexture()` requires the source texture to have `COPY_SRC` usage flag.

**Error**: `usage doesn't include TextureUsage::CopySrc`

```typescript
// ❌ BAD - can't copy from this texture
graph.addResource('frame-blend-output', {
  type: 'texture',
  format: 'rgba16float',
  usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
})

// ✅ GOOD - add COPY_SRC for copy operations
graph.addResource('frame-blend-output', {
  type: 'texture',
  format: 'rgba16float',
  usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
})
```

---

## WGSL Struct Size Calculation (CRITICAL)

**Problem**: WGSL alignment rules often make structs larger than expected. `vec3f` aligns to 16 bytes, not 12. Buffer size must be >= actual struct size.

**Error**: `Buffer bound with size X is too small. Pipeline requires at least Y bytes.`

```wgsl
// This struct is 48 bytes, NOT 32!
struct FXAAUniforms {
  resolution: vec2f,      // offset 0,  8 bytes
  subpixelQuality: f32,   // offset 8,  4 bytes
  edgeThreshold: f32,     // offset 12, 4 bytes
  edgeThresholdMin: f32,  // offset 16, 4 bytes
  // implicit padding      // offset 20, 12 bytes (to align vec3f to 16)
  _padding: vec3f,        // offset 32, 12 bytes
  // struct padding         // offset 44, 4 bytes (round to 16)
}                          // total: 48 bytes
```

**Quick Size Reference**:
| Type | Size | Alignment |
|------|------|-----------|
| f32, i32, u32 | 4 | 4 |
| vec2f | 8 | 8 |
| vec3f | 12 | **16** ← Common pitfall! |
| vec4f | 16 | 16 |
| mat4x4f | 64 | 16 |
| Struct total | rounds up to largest member alignment |

---

## Non-Uniform Control Flow: The select() Solution

**Problem**: Early returns before `textureSample` calls create non-uniform control flow.

```wgsl
// ❌ BAD - early return breaks uniform control flow
@fragment fn main(input: VertexOutput) -> @location(0) vec4f {
  let colorC = textureSample(tex, samp, input.uv);
  
  if (shouldSkip(colorC)) {
    return vec4f(colorC, 1.0);  // Early return!
  }
  
  // These fail - some threads returned, some didn't
  let colorN = textureSample(tex, samp, input.uv + offset);  // ← Error!
  ...
}

// ✅ GOOD - sample ALL textures first, use select() for result
@fragment fn main(input: VertexOutput) -> @location(0) vec4f {
  // All samples BEFORE any conditionals
  let colorC = textureSample(tex, samp, input.uv);
  let colorN = textureSample(tex, samp, input.uv + offset);
  let colorS = textureSample(tex, samp, input.uv - offset);
  
  let skipProcessing = shouldSkip(colorC);
  
  // Compute result unconditionally
  let processedColor = doExpensiveProcessing(colorC, colorN, colorS);
  
  // Use select() instead of if/else
  return vec4f(select(processedColor, colorC.rgb, skipProcessing), 1.0);
}
```

---

## Base Class Entry Point Convention

The `WebGPUBasePass.createFullscreenPipeline()` uses `entryPoint: 'main'` for both vertex and fragment shaders. Always name your entry points `main`:

```wgsl
// ❌ BAD - won't match pipeline
@vertex fn vertexMain(...) -> VertexOutput { ... }
@fragment fn fragmentMain(...) -> @location(0) vec4f { ... }

// ✅ GOOD - matches createFullscreenPipeline expectations
@vertex fn main(...) -> VertexOutput { ... }
@fragment fn main(...) -> @location(0) vec4f { ... }
```

Note: The base class creates its own vertex shader, so only the fragment entry point matters for passes using `createFullscreenPipeline()`.

---

## Sources
- https://developer.chrome.com/blog/new-in-webgpu-143
- https://toji.dev/webgpu-best-practices/
- https://developer.mozilla.org/en-US/docs/Web/API/GPUAdapter