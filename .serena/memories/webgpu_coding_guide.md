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

## Sources
- https://developer.chrome.com/blog/new-in-webgpu-143
- https://toji.dev/webgpu-best-practices/
- https://developer.mozilla.org/en-US/docs/Web/API/GPUAdapter
