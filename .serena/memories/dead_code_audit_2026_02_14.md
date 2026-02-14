# Dead Code Audit Report - 2026-02-14

This audit systematically searched the mquantum codebase for unreferenced exports, functions, types, components, and store actions.

## Category 1: Dead Math Library Functions

### src/lib/math/projection.ts
- `clipLine` - exported but never imported/used anywhere
- `depthComparator` - exported but only defined, never used
- `projectVertices3D` - exported but never used
- `projectVertices4D` - exported but never used
- `projectVertices5D` - exported but never used
- `projectVerticesND` - exported but never used
- `calculateProjectionDistance` - exported but never used (conflicted with similar name in rotation)

### src/lib/math/transform.ts
- `createShearMatrix` - exported but never used (searched "createShearMatrix")
- `createUniformScaleMatrix` - exported but never used
- `fromHomogeneous` - exported but never used
- `toHomogeneous` - exported but never used
- `translateVector` - exported (in index) but never actually used

### src/lib/math/matrix.ts
- `getMinor` - defined but never exported or used
- `getAliasScratch` - defined but appears internal

### src/lib/math/trig.ts
- `fsinUnchecked` - exported but never used
- `fcosUnchecked` - exported but never used
- `normalizeAngle` - exported but only used in rotationStore.ts (internal use)

## Category 2: Dead Geometry/Extended Object Functions

### src/lib/geometry/extended/utils/
- `buildKnnEdges` - exported from extended/index.ts and geometry/index.ts but never used
- `buildShortEdges` - exported from extended/index.ts and geometry/index.ts but never used

### src/lib/geometry/extended/index.ts & src/lib/geometry/index.ts
- `generateExtendedObject` - exported from geometry/index.ts but never used
- `generateGeometry` - exported from geometry/index.ts but never used

## Category 3: Dead Animation Functions

### src/lib/animation/biasCalculation.ts
- `getAllPlaneMultipliers` - exported from animation/index.ts but never used
- `getAverageMultiplier` - exported from animation/index.ts but never used
- `PHASE_OFFSET` - constant defined but never exported or used

## Category 4: Dead WASM Bridge Functions

### src/lib/wasm/animation-wasm.ts (exported from index.ts)
These are exported from wasm/index.ts but only used/tested in math library internals:
- `composeRotationsIndexedWasm`
- `composeRotationsWasm`
- `projectVerticesWasm`
- `multiplyMatrixVectorWasm`
- `multiplyMatricesWasm`
- `dotProductWasm`
- `magnitudeWasm`
- `normalizeVectorWasm`
- `subtractVectorsWasm`
- `float64ToVector` - exported but only used internally (vector.ts)
- `matrixToFloat64` - exported from index.ts but only used internally (matrix.ts)
- `vectorToFloat64` - exported from index.ts but only used internally (vector.ts)
- `flattenVertices` - exported from index.ts but never used

## Category 5: Dead WebGPU Rendering Utilities

### src/rendering/webgpu/utils/color.ts
- `srgbToLinearChannel` - exported but never used
- `clamp01` - exported but never used

### src/rendering/renderers/base/ (legacy/dead code)
- `calculateSafeProjectionDistance` - exported but never used
- `useProjectionDistanceCache` - exported but never used
- Entire `projectionUtils.ts` functionality is dead

### src/rendering/renderers/base/types.ts & hooks
- `useQualityTracking` - exported but never used
- `applyRotationInPlace` - exported but never used  
- `createWorkingArrays` - exported but never used

## Category 6: Dead Hooks

### src/hooks/useKonamiCode.ts
- `useKonamiCode` - defined but never used/imported (only appears in test)
- `KONAMI_CODE` and `KONAMI_CODE_STRING` - constants for dead hook

### src/hooks/useSyncedDimension.ts
- `useSyncedDimension` - defined but never used/imported (only in tests)

## Category 7: Dead UI Components (Not Exported from Barrel)

The following UI components in src/components/ui/ are defined but:
1. Not exported from the barrel (src/components/ui/index.ts)
2. Rarely or never imported directly

Note: These are actually used, so NOT dead - they're just not barrel-exported:
- `ColorPicker`
- `Input`
- `Modal`
- `InputModal`
- `ConfirmModal`
- `NumberInput`
- `Tooltip`

Truly unused (not in barrel AND never imported):
- (None found - all UI components appear to be used)

## Category 8: Cache and Audio Utilities (Likely Dead)

### src/lib/cache/
- `IndexedDBCache` class - defined but usage unclear
- `IndexedDBCacheStore` - never used

### src/lib/audio/SoundManager.ts
- `SoundManager` class - exported but never instantiated/used
- `soundManager` instance - exported but never used

## Category 9: Export Utilities (Mostly Dead)

### src/lib/export/image.ts
- `findThreeCanvas` - exported but never used (legacy Three.js code)

## Category 10: Device/Platform Utilities

### src/lib/platform.ts
- All exports appear used: `getModifierKey`, `getModifierSymbols`, `getPlatformKeyLabel`, `isMac`

### src/lib/deviceCapabilities.ts
- Likely used; check usage

## Key Findings

**Truly Dead Exports** (high confidence):
1. Math: clipLine, depthComparator, projectVertices3D/4D/5D/ND, calculateProjectionDistance, createShearMatrix, createUniformScaleMatrix, fromHomogeneous, toHomogeneous, fsinUnchecked, fcosUnchecked
2. Geometry: buildKnnEdges, buildShortEdges, generateExtendedObject, generateGeometry
3. Animation: getAllPlaneMultipliers, getAverageMultiplier
4. WebGPU: srgbToLinearChannel, clamp01, calculateSafeProjectionDistance, useProjectionDistanceCache
5. Hooks: useKonamiCode, useSyncedDimension
6. Legacy base renderers: useQualityTracking, applyRotationInPlace, createWorkingArrays
7. Audio: SoundManager class and soundManager instance
8. WASM: Most WASM acceleration functions (no actual GPU object rendering uses them, only legacy/dead math code)

**Likely Legacy/Not Used**:
- src/rendering/renderers/base/ directory (all legacy - replaced by WebGPU)
- src/lib/export/image.ts:findThreeCanvas (Three.js legacy)
- WASM float64 conversions (internal helper usage only)
