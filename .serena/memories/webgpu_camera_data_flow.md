# WebGPU Camera Data Flow Investigation

## Summary
The WebGPU camera data **IS properly populated** and flows correctly from WebGPUCamera through the render graph to renderers. The architecture uses a direct Matrix-based approach rather than relying on the WebGL cameraStore.

## 1. Camera Data Population Source

### WebGPUCamera (NOT a Zustand store)
**File**: `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/core/WebGPUCamera.ts`

- **Purpose**: Standalone camera class that computes view/projection matrices independently
- **Does NOT use Zustand**: This is intentional - WebGPU doesn't rely on the WebGL cameraStore
- **Initialization** (WebGPUScene.tsx, lines 324-333):
  ```typescript
  const cameraRef = useRef<WebGPUCamera | null>(null)
  if (!cameraRef.current) {
    cameraRef.current = new WebGPUCamera({
      position: [0, 3.125, 7.5],    // Match WebGL default camera position
      target: [0, 0, 0],
      fov: 60,                        // Match WebGL camera fov
      near: 0.1,
      far: 1000,
      aspect: size.width / size.height || 1,
    })
  }
  ```

### Camera Control Flow (WebGPUScene.tsx, lines 340-382)
1. **Mouse Down** (line 341-344): Initiates orbit interaction
2. **Mouse Move** (line 350-360): Updates camera via `cameraRef.current.orbit()`
3. **Mouse Wheel** (line 368-374): Updates camera via `cameraRef.current.zoom()`

Matrix computations happen lazily:
- Camera stores dirty flag when position/target changes
- Matrices computed on-demand when `getMatrices()` called (WebGPUCamera.ts line 334-339)

---

## 2. Camera Store Getter Registration

**File**: `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/WebGPUScene.tsx` (lines 539-553)

```typescript
graph.setStoreGetter('camera', () => {
  if (!cameraRef.current) return null
  const matrices = cameraRef.current.getMatrices()
  return {
    viewMatrix: { elements: Array.from(matrices.viewMatrix) },
    projectionMatrix: { elements: Array.from(matrices.projectionMatrix) },
    viewProjectionMatrix: { elements: Array.from(matrices.viewProjectionMatrix) },
    inverseViewMatrix: { elements: Array.from(matrices.inverseViewMatrix) },
    inverseProjectionMatrix: { elements: Array.from(matrices.inverseProjectionMatrix) },
    position: matrices.cameraPosition,
    near: matrices.cameraNear,
    far: matrices.cameraFar,
    fov: matrices.fov,
  }
})
```

**Key Points**:
- Called during frame execution (captured in `WebGPURenderGraph.captureFrameContext()`)
- Returns object with `elements` property for matrices (compatible with shader struct packing)
- Provides 5 essential matrices + camera parameters

---

## 3. Frame Context Capture

**File**: `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/graph/WebGPURenderGraph.ts` (lines 414-431)

```typescript
private captureFrameContext(delta: number): WebGPUFrameContext {
  const stores: Record<string, unknown> = {}
  for (const [key, getter] of this.storeGetters) {
    try {
      stores[key] = getter()  // <-- Calls camera getter
    } catch (e) {
      console.error(`Failed to capture store '${key}':`, e)
    }
  }

  return {
    frameNumber: this.frameNumber,
    delta,
    time: this.elapsedTime,
    size: { width: this.width, height: this.height },
    stores,  // <-- Contains camera data
  }
}
```

Called each frame in `execute()` (line 450):
```typescript
this.frameContext = this.captureFrameContext(delta)
```

---

## 4. What Properties Camera Store Should Have

Based on WebGPUQuaternionJuliaRenderer.updateCameraUniforms() (lines 789-882):

```typescript
interface CameraStore {
  // Matrices (as objects with .elements array)
  viewMatrix?: { elements: Float32Array | number[] }
  projectionMatrix?: { elements: Float32Array | number[] }
  viewProjectionMatrix?: { elements: Float32Array | number[] }
  inverseViewMatrix?: { elements: Float32Array | number[] }
  inverseProjectionMatrix?: { elements: Float32Array | number[] }

  // Camera parameters
  position?: { x: number; y: number; z: number }
  near?: number
  far?: number
  fov?: number
}
```

**All properties are read correctly** in updateCameraUniforms():
- Lines 820-844: Each matrix checked for `.elements` property
- Lines 861-866: Position extracted as `.x/.y/.z`
- Lines 866, 869-870: near/far/fov read directly

---

## 5. Uniform Buffer Layout

**File**: WebGPUQuaternionJuliaRenderer.ts (lines 804-881)

Camera uniforms packed into 512-byte buffer as **128 Float32 values**:

| Offset (floats) | Size | Field | Usage |
|---|---|---|---|
| 0-15 | 16 | viewMatrix | mat4x4f |
| 16-31 | 16 | projectionMatrix | mat4x4f |
| 32-47 | 16 | viewProjectionMatrix | mat4x4f |
| 48-63 | 16 | inverseViewMatrix | mat4x4f |
| 64-79 | 16 | inverseProjectionMatrix | mat4x4f |
| 80-95 | 16 | modelMatrix | Scale matrix from extended store |
| 96-111 | 16 | inverseModelMatrix | Inverse scale |
| 112-114 | 3 | cameraPosition | vec3f |
| 115 | 1 | cameraNear | f32 |
| 116 | 1 | cameraFar | f32 |
| 117 | 1 | fov | f32 |
| 118 | 1 | screenWidth | f32 |
| 119 | 1 | screenHeight | f32 |
| 120 | 1 | aspectRatio | f32 |
| 121 | 1 | animationTime | f32 |
| 122 | 1 | deltaTime | f32 |
| 123 | 1 | frameNumber | u32 |

---

## 6. Is Camera Data Actually Being Populated?

### YES - Confirmed in Multiple Ways:

#### 1. WebGPUCamera.getMatrices() Computes All Matrices
- viewMatrix: Created via `createLookAtMatrix()` (lines 60-122)
- projectionMatrix: Created via `createPerspectiveMatrix()` (lines 133-173)
- viewProjectionMatrix: Multiplied as `Projection * View` (lines 361-364)
- inverseViewMatrix: Inverted via `invertMat4()` (lines 367)
- inverseProjectionMatrix: Inverted via `invertMat4()` (line 368)
- Camera position: Extracted from state (lines 371-375)
- near/far/fov: Stored in state (lines 376-378)

#### 2. Store Getter Returns Populated Data
WebGPUScene.tsx lines 539-553: Getter converts Float32Arrays to objects with `.elements` property

#### 3. updateCameraUniforms() Accesses Data Correctly
All renderers (Julia, Mandelbulb, Schrodinger, BlackHole, Polytope, TubeWireframe):
- Line ~790: Access `ctx.frame?.stores?.['camera']`
- Line ~820-840: Unpack matrices using `.elements` property (all safe with null-coalescing)
- Line ~860-870: Extract position/near/far/fov (all safe)
- Line ~880: Write populated data to GPU buffer

#### 4. Camera Interactions Update State
WebGPUScene.tsx lines 350-374:
- `cameraRef.current.orbit()` (line 359) - Updates position, sets dirty flag
- `cameraRef.current.zoom()` (line 374) - Updates position, sets dirty flag
- Matrices recomputed on next `getMatrices()` call

---

## 7. Comparison to WebGL

### WebGL Approach (for reference)
- Uses `useCameraStore` (stores/cameraStore.ts) - manages OrbitControls state
- Only stores position/target pairs
- Matrices computed in rendering passes or shaders

### WebGPU Approach (current implementation)
- Uses standalone `WebGPUCamera` class
- Computes matrices directly in camera
- Matrices pre-computed and cached
- Store getter converts matrices to GPU-compatible format
- **No dependency on WebGL cameraStore** ✓

---

## 8. Verified Data Flow Chain

```
┌─────────────────────────────────────────────────────────────────┐
│ User Interaction (Mouse/Scroll)                                 │
│ WebGPUScene: handleMouseMove, handleWheel                       │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ WebGPUCamera State Update                                       │
│ - setPosition() / orbit() / zoom()                              │
│ - Sets dirty flag                                              │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼ (on-demand, lazy)
┌─────────────────────────────────────────────────────────────────┐
│ WebGPUCamera.getMatrices()                                      │
│ - Recomputes matrices if dirty                                 │
│ - Returns WebGPUCameraMatrices                                 │
└─────────────────────┬───────────────────────────────────────────┘
                      │ (captured each frame)
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ WebGPURenderGraph.captureFrameContext()                         │
│ - Calls graph.setStoreGetter('camera')                         │
│ - Converts matrices to { elements: [...] } format              │
│ - Creates WebGPUFrameContext.stores.camera                     │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼ (passed to every renderer)
┌─────────────────────────────────────────────────────────────────┐
│ Renderer.execute(ctx)                                           │
│ - Calls updateCameraUniforms(ctx)                              │
│ - Reads ctx.frame.stores.camera                                │
│ - Unpacks matrices from .elements property                     │
│ - Packs into GPU uniform buffer (512 bytes)                    │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│ GPU Shader (WGSL)                                               │
│ @group(0) @binding(0) var<uniform> camera: CameraUniforms;     │
│ Access: camera.viewMatrix, camera.projectionMatrix, etc        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Summary of Findings

| Aspect | Status | Details |
|--------|--------|---------|
| **Camera data populated?** | ✓ YES | WebGPUCamera computes all matrices, store getter returns them |
| **Properties correct?** | ✓ YES | All 5 matrices + 4 camera params available |
| **Data flow complete?** | ✓ YES | Traced from user interaction → GPU uniform buffer |
| **Null safety** | ✓ YES | Renderers use null-coalescing operators for matrix access |
| **Fallbacks** | ✓ YES | inverseViewMatrix/inverseProjectionMatrix fallback to identity if needed |
| **Performance** | ✓ GOOD | Lazy matrix computation with dirty flag, cached per frame |

---

## Files Involved

- `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/core/WebGPUCamera.ts` - Matrix computation
- `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/WebGPUScene.tsx` - Camera setup & store getter
- `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/graph/WebGPURenderGraph.ts` - Frame context capture
- `/Users/Spare/Documents/code/mdimension/src/rendering/webgpu/renderers/*.ts` - Uniform unpacking (6 renderer types)
- `/Users/Spare/Documents/code/mdimension/src/stores/cameraStore.ts` - WebGL only (not used by WebGPU)
