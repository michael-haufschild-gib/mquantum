# Internal Interfaces & URL State Guide

**Purpose**: This document explains how to handle state serialization (URL) and internal data interfaces.

**Scope**: Since this is a client-side application, "API" refers to the URL schema and internal module boundaries.

---

## URL State Architecture
**Pattern**: The application state can be fully serialized to/from the URL query string. This allows users to share exact configurations.
**Location**: `src/lib/url/`

### 1. The Shareable State Interface
**File**: `src/lib/url/state-serializer.ts`
**Definition**:
```typescript
export interface ShareableState {
  d: number;      // dimension
  obj: string;    // objectType
  rot: string;    // rotation enabled/speed
  // ... other keys
}
```

### 2. How to Add a New State to URL
1.  **Update Interface**: Add optional key to `ShareableState` in `src/lib/url/state-serializer.ts`.
2.  **Update Serializer**: Modify `serializeState` to convert Store values to URL params.
3.  **Update Deserializer**: Modify `deserializeState` to parse URL params back to Store values.

**Template**:
```typescript
// In serializeState
if (store.myNewFeature) {
  params.set('nf', store.myNewFeature.toString());
}

// In deserializeState
const newFeature = params.get('nf');
if (newFeature) {
  state.myNewFeature = parseLogic(newFeature);
}
```

---

## Internal Module Interfaces

### Shader Interfaces (`src/rendering/webgpu/shaders/`)
**Contract**: WGSL shader blocks composed via `assembleShaderBlocks()`.
**Pattern**:
```typescript
// Shader blocks are template literal strings
export const myBlock = /* wgsl */ `
  fn myFunction(pos: vec3f) -> f32 {
    return length(pos);
  }
`

// Composed in a compose.ts file
const blocks: ShaderBlock[] = [
  { name: 'My Block', content: myBlock, condition: featureEnabled },
]
const { wgsl } = assembleShaderBlocks(blocks)
```

Uniforms are passed via GPU uniform buffers, not per-frame JS updates. See `docs/architecture.md` for bind group layout.

---

## Common Mistakes
❌ **Don't**: Store large binary data (like full vertex arrays) in the URL.
✅ **Do**: Store *parameters* (seed, dimension, type) to regenerate the data.

❌ **Don't**: Directly modify `window.location`.
✅ **Do**: Use `generateShareUrl()` helper or React Router if added later.
