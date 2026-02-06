# NDTransformSource Architecture Design

**Status**: Proposed
**Author**: Copilot
**Date**: 2025-01-XX
**Related**: Phase 1/6 Rotation Migration, UniformManager Architecture

---

## Executive Summary

Design a centralized `NDTransformSource` to manage N-dimensional rotation computation and GPU uniform application for vertex-based renderers (Polytope, TubeWireframe, BlackHole), aligned with industry-standard render graph patterns from Unreal Engine, Frostbite, and Unity.

---

## Problem Statement

Two renderers (Polytope, TubeWireframe) duplicate 60-100 lines of rotation management code:
- Store subscriptions and state caching
- Version tracking for change detection
- `composeRotations()` + `matrixToGPUUniforms()` calls
- Pre-allocated GPU data structures

This violates DRY and the migration plan's goal: *"Replace per-renderer rotation caching with shared hook usage"*.

**Note**: BlackHole uses the **basis vector pattern** (`uBasisX`, `uBasisY`, `uBasisZ`) like raymarchers, NOT the GPU matrix pattern. It should migrate to `useRotationUpdates` instead.

---

## Industry Patterns Analysis

### Unreal Engine 5 - Render Dependency Graph

```
FPrimitiveSceneProxy (per-object)
    └── LocalToWorld transform
    └── DirtyFlag for GPU upload
    └── GetLocalToWorld() accessor

FScene
    └── Batches primitives by transform similarity
    └── GPU buffer updates only when dirty
```

**Key Insight**: Transform is computed once per primitive, cached, uploaded only when dirty.

### Frostbite - Frame Graph Resources

```
TransformBuffer (per-frame resource)
    └── Allocated from frame allocator
    └── Version-tracked for culling
    └── Bound to descriptor set once

RenderGraph::AddPass()
    └── Declares resource dependencies
    └── System resolves buffer bindings
```

**Key Insight**: Resources declared upfront, system manages lifetime and binding.

### Unity SRP - Shader Property Blocks

```
MaterialPropertyBlock (per-renderer override)
    └── SetMatrix("_LocalToWorld", matrix)
    └── Applied at draw time
    └── Batching respects property boundaries

CommandBuffer
    └── SetGlobalMatrix() for scene-wide
    └── SetPropertyBlock() for per-object
```

**Key Insight**: Separation of scene-wide vs per-object properties, batching-aware.

---

## Proposed Architecture

### Core Component: NDTransformSource

```typescript
/**
 * N-Dimensional Transform Uniform Source
 *
 * Manages N-D rotation matrix computation and GPU uniform application
 * for vertex-based renderers. Follows the render graph pattern of
 * lazy evaluation + version-tracked application.
 *
 * Analogous to:
 * - Unreal: FPrimitiveSceneProxy transform management
 * - Unity: MaterialPropertyBlock with transform override
 * - Frostbite: Frame-scoped transform buffer
 */
export class NDTransformSource extends BaseUniformSource {
  readonly id = 'ndTransform';

  // Pre-allocated GPU data (avoids per-frame allocation)
  private gpuData: NDTransformGPUData;

  // Uniforms struct for material application
  private uniforms: NDTransformUniforms;

  // Change detection cache
  private cachedDimension = 0;
  private cachedRotationVersion = -1;
  private cachedScales: number[] = [];
  private cachedProjectionDistance = 10;

  /**
   * Update from store state (lazy evaluation).
   * Only recomputes rotation matrix when version changes.
   */
  updateFromStore(config: NDTransformConfig): void;

  /**
   * Get all transform uniforms for material initialization.
   */
  getUniforms(): Record<string, IUniform>;

  /**
   * Apply transform uniforms to a material.
   * Only updates uniforms that exist on the material.
   */
  applyToMaterial(material: THREE.ShaderMaterial): void;
}
```

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Per-Frame Update Cycle                           │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┐     ┌──────────────────┐     ┌───────────────────┐
│RotationStore │────▶│  NDTransformSource│────▶│ ShaderMaterial    │
│  .rotations  │     │                  │     │   .uniforms       │
│  .version    │     │ ┌──────────────┐ │     │                   │
└──────────────┘     │ │composeRotations│     │ uRotationMatrix4D │
                     │ └──────┬───────┘ │     │ uExtraRotationCols│
┌──────────────┐     │        │         │     │ uDepthRowSums     │
│GeometryStore │────▶│ ┌──────▼───────┐ │     │ uDimension        │
│  .dimension  │     │ │matrixToGPU   │ │     │ uScale4D          │
└──────────────┘     │ │Uniforms      │ │     │ uProjectionDist   │
                     │ └──────┬───────┘ │     └───────────────────┘
┌──────────────┐     │        │         │
│TransformStore│────▶│ ┌──────▼───────┐ │
│  .perAxisScale    │ │ GPU Data Cache│ │
│  .uniformScale    │ └──────────────┘ │
└──────────────┘     │    (version N)   │
                     └──────────────────┘
                              │
                     ┌────────▼────────┐
                     │ hasChanges()?   │──No──▶ Skip apply
                     └────────┬────────┘
                              │ Yes
                     ┌────────▼────────┐
                     │applyToMaterial()│
                     └─────────────────┘
```

### Interface Definitions

```typescript
// src/rendering/uniforms/sources/NDTransformSource.ts

import type { Matrix4 } from 'three';

/**
 * Configuration for NDTransformSource updates.
 */
export interface NDTransformConfig {
  /** Current dimension (3-11) */
  dimension: number;

  /** Rotation angles from store */
  rotations: RotationMap;

  /** Store version for change detection */
  rotationVersion: number;

  /** Per-axis scale factors (optional, defaults to uniform 1.0) */
  scales?: number[];

  /** Uniform scale multiplier (optional, defaults to 1.0) */
  uniformScale?: number;

  /** Projection distance for N-D → 3D (optional, auto-calculated) */
  projectionDistance?: number;
}

/**
 * GPU-ready uniform data structure.
 * Pre-allocated to avoid per-frame allocation.
 */
export interface NDTransformGPUData {
  rotationMatrix4D: Matrix4;
  extraRotationData: Float32Array;  // For dims > 4
  extraRotationCols: Float32Array;  // Column vectors
  depthRowSums: Float32Array;       // Projection weights
  dimension: number;
}

/**
 * Uniform definitions for shader material.
 */
export interface NDTransformUniforms {
  uRotationMatrix4D: { value: Matrix4 };
  uExtraRotationCols: { value: Float32Array };
  uDepthRowSums: { value: Float32Array };
  uDimension: { value: number };
  uScale4D: { value: number[] };
  uExtraScales: { value: Float32Array };
  uProjectionDistance: { value: number };
}
```

### Companion Hook: useNDTransformUpdates

```typescript
// src/rendering/renderers/base/useNDTransformUpdates.ts

/**
 * Hook for applying N-D transform updates to a material.
 *
 * Handles:
 * - Store subscription optimization (ref-based caching)
 * - Automatic source updates in useFrame
 * - Version-tracked material application
 *
 * @example
 * ```tsx
 * function PolytopeScene() {
 *   const materialRef = useRef<ShaderMaterial>(null);
 *
 *   useNDTransformUpdates({
 *     materialRef,
 *     projectionDistance: calculatedDistance,
 *   });
 *
 *   return <mesh><shaderMaterial ref={materialRef} /></mesh>;
 * }
 * ```
 */
export function useNDTransformUpdates(options: {
  materialRef: RefObject<ShaderMaterial | null>;
  /** Override projection distance (optional) */
  projectionDistance?: number;
  /** Additional materials to update (optional) */
  additionalMaterials?: RefObject<ShaderMaterial | null>[];
}): void;
```

---

## Migration Plan

### Phase 1: Create Infrastructure (No breaking changes)

1. **Create `NDTransformSource.ts`**
   - Implement full UniformSource interface
   - Include comprehensive JSDoc
   - Add unit tests

2. **Create `useNDTransformUpdates.ts`**
   - Store subscription optimization
   - useFrame integration
   - Multi-material support

3. **Register with UniformManager**
   - Export from `sources/index.ts`
   - Add to manager initialization

### Phase 2: Migrate Renderers (Incremental)

1. **TubeWireframe** (simplest)
   - Single material
   - No complex interactions
   - ~80 lines removed

2. **PolytopeScene** (medium complexity)
   - Multiple materials (face + edge)
   - Scale calculations
   - ~100 lines removed

### Phase 3: Migrate BlackHole to useRotationUpdates

**Separate Track**: BlackHole uses basis vectors like raymarchers:
- Uses `uBasisX`, `uBasisY`, `uBasisZ`, `uOrigin`
- Should migrate to `useRotationUpdates` hook
- ~60 lines removed

### Phase 3: Cleanup

1. Remove duplicated helper functions
2. Update documentation
3. Verify all tests pass

---

## Uniform Mapping

| Renderer | Current Uniforms | Source Uniforms | Notes |
|----------|-----------------|-----------------|-------|
| Polytope | uRotationMatrix4D | ✓ Same | Direct map |
| | uExtraRotationCols | ✓ Same | Direct map |
| | uDepthRowSums | ✓ Same | Direct map |
| | uDimension | ✓ Same | Direct map |
| | uScale4D | ✓ Same | Direct map |
| | uExtraScales | ✓ Same | Direct map |
| | uProjectionDistance | ✓ Same | Direct map |
| TubeWireframe | uRotationMatrix4D | ✓ Same | Direct map |
| | uExtraRotationCols | ✓ Same | Direct map |
| | uDepthRowSums | ✓ Same | Direct map |
| | uDimension | ✓ Same | Direct map |
| | uScale4D | ✓ Same | Direct map |
| | uExtraScales | ✓ Same | Direct map |
| | uProjectionDistance | ✓ Same | Direct map |
| **BlackHole** | **uBasisX/Y/Z, uOrigin** | **N/A** | **Uses basis vector pattern - migrate to useRotationUpdates instead** |

---

## Performance Considerations

### Memory

- Pre-allocated Float32Arrays: ~500 bytes per source
- Single instance shared across renderers
- WeakMap for material version cache (auto-cleanup)

### CPU

- `composeRotations()`: O(d²) where d = dimension
- `matrixToGPUUniforms()`: O(d²)
- Only computed when version changes (typically once per user interaction)

### GPU

- Uniform upload only when changed
- No additional draw calls
- Same shader complexity

---

## Testing Strategy

### Unit Tests

```typescript
describe('NDTransformSource', () => {
  it('should not recompute when version unchanged');
  it('should increment version when rotation changes');
  it('should handle dimension changes correctly');
  it('should apply all uniforms to material');
  it('should skip missing uniforms gracefully');
});
```

### Integration Tests

```typescript
describe('useNDTransformUpdates', () => {
  it('should update material on rotation store change');
  it('should handle multiple materials');
  it('should respect frame priority');
});
```

### Visual Regression

- Polytope rotation behavior unchanged
- TubeWireframe rotation behavior unchanged
- BlackHole rotation behavior unchanged

---

## Open Questions

1. **Scale Ownership**: Should scales be part of NDTransformSource or a separate TransformSource?

2. **Projection Distance**: Should auto-calculation be in the source or remain in renderers?

---

## References

- [Unreal Engine Render Dependency Graph](https://docs.unrealengine.com/5.0/en-US/render-dependency-graph-in-unreal-engine/)
- [Frostbite Frame Graph](https://www.gdcvault.com/play/1024612/FrameGraph-Extensible-Rendering-Architecture-in)
- [Unity SRP Batcher](https://blog.unity.com/technology/srp-batcher-speed-up-your-rendering)
- Phase 1/6 Migration Plan (internal doc)
