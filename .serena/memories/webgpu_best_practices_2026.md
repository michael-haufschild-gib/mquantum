# WebGPU Best Practices & Deprecated Patterns (2026)

## Removed APIs (DO NOT USE)

| Pattern | Removed In | Replacement |
|---------|------------|-------------|
| `adapter.requestAdapterInfo()` | Chrome 131 | `adapter.info` (sync property) |
| `adapter.isFallbackAdapter` | Chrome 140 | `adapter.info.isFallbackAdapter` |
| `requestAdapter({ compatibilityMode })` | Chrome 137 | Removed entirely |
| `maxInterStageShaderComponents` limit | Chrome 135 | Use `maxInterStageShaderVariables` |
| `bgra8unorm` for storage textures | Chrome 143 | Use `rgba8unorm` or `rgba16float` |

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

## Additional Removed APIs

| Pattern | Status | Replacement |
|---------|--------|-------------|
| `encoder.writeTimestamp()` | Removed | Use `timestampWrites` in `beginRenderPass()`/`beginComputePass()` |

Reason: Doesn't work on TBDR architectures (Apple Silicon). Timestamps can only be recorded at pass boundaries now.

## Sources
- https://developer.chrome.com/blog/new-in-webgpu-143
- https://toji.dev/webgpu-best-practices/
- https://developer.mozilla.org/en-US/docs/Web/API/GPUAdapter
