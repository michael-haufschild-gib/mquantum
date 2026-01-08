# TSL (Three Shading Language) Coding Instructions for AI Agents

> **Version**: Three.js r182+ (January 2025)
> **Purpose**: Mandatory rules for writing WebGPU/TSL shader code in this project

---

## CRITICAL: Read This First

You are writing TSL shaders for WebGPU. TSL compiles to WGSL, not GLSL. Many patterns from your training data are **OUTDATED** and will produce non-functional shaders or WebGPU pipeline errors.

**Top 5 Causes of WebGPU Failures** (ordered by frequency):

1. Creating `varying()` inside `Fn()` → "Invalid PipelineLayout"
2. GPU evaluates BOTH branches of `If()`/`select()` → NaN/Inf from unguarded operations
3. Creating texture nodes inside `Fn()` → "Invalid PipelineLayout"
4. Using `uniformArray.element(nodeIndex)` → "Invalid PipelineLayout"
5. Changing `material.transparent` at runtime → Pipeline recreation failure

---

## Part 1: Mandatory Placement Rules

### Rule 1.1: Varyings MUST Be Created OUTSIDE Fn()

**This is the #1 cause of WebGPU pipeline errors.**

```typescript
// ❌ WRONG - Causes "Invalid PipelineLayout" WebGPU error
const createShader = () => Fn(() => {
  const myVarying = varying(someNode, 'vMyValue')  // WRONG LOCATION!
  return myVarying
})

// ✅ CORRECT - Per Three.js webgpu_centroid_sampling example
const myVarying = varying(someNode, 'vMyValue')  // OUTSIDE Fn()

const createShader = () => Fn(() => {
  myVarying.setInterpolation('flat', 'first')    // Configure INSIDE is OK
  return texture(tex, myVarying).rgb
})
```

### Rule 1.2: Complex Nodes MUST Be Created OUTSIDE Fn()

Texture nodes, shadow samplers, multi-light nodes, and IBL nodes must be created OUTSIDE `Fn()` and referenced via closure.

**What to create OUTSIDE Fn():**
- `texture()` nodes for shadow maps, IBL, etc.
- Shadow sampler Fn() nodes (e.g., `sampleDirectionalSpotShadow()`)
- Multi-light Fn() nodes (e.g., `createMultiLightNode()`)
- IBL Fn() nodes (e.g., `computeIBL()`)
- SSS Fn() nodes (e.g., `createPolytopeSSSNode()`)

**What is OK INSIDE Fn():**
- Simple uniform references (`uniform.value`, `uniformArray.element()`)
- Math operations (`vec3()`, `float()`, `normalize()`, etc.)
- `setInterpolation()` calls on varyings
- Conditional branches (`If()`, `select()`)

```typescript
// ❌ WRONG - Causes "Invalid PipelineLayout" WebGPU error
const createShading = Fn(() => {
  const shadowSampler = sampleDirectionalSpotShadow(uniforms)  // WRONG!
  return litColor
})

// ✅ CORRECT - Complex nodes created OUTSIDE Fn()
const shadowSampler = sampleDirectionalSpotShadow(uniforms)      // OUTSIDE
const multiLightNode = createMultiLightNode(lightUniforms, ...)  // OUTSIDE

const createShading = Fn(() => {
  const lightResult = multiLightNode(pos, normal, view, ...)     // Reference via closure
  return litColor
})
```

---

## Part 2: GPU Branch Evaluation - Critical Difference from CPU

### Rule 2.1: GPU Executes ALL Branches

TSL `If()` and `select()` compile to GPU code where **both branches are always executed**. The GPU uses thread masking to select results, but ALL code runs.

Operations like `sqrt()`, `div()`, `log()` with invalid inputs produce NaN/Inf **even inside a "false" branch**.

```typescript
// ❌ WRONG - Division by zero happens even when condition is false
const result = vec3(0, 1, 0).toVar('result')
If(len.greaterThan(0.0001), () => {
  result.assign(vec.div(len))  // EXECUTES EVEN WHEN len <= 0.0001!
})

// ✅ CORRECT - Guard the divisor BEFORE the If() block
const safeLen = max(len, float(0.0001))
const result = vec3(0, 1, 0).toVar('result')
If(len.greaterThan(0.0001), () => {
  result.assign(vec.div(safeLen))  // Safe: safeLen always >= 0.0001
})
```

### Rule 2.2: Operations Requiring Guards

**ALWAYS guard these operations when used inside conditionals:**

| Operation | Risk | Guard Pattern |
|-----------|------|---------------|
| `div(a, b)` | Division by zero → Inf/NaN | `max(b, float(0.0001))` |
| `sqrt(x)` | Negative input → NaN | `max(x, float(0.0))` |
| `log(x)` | Zero/negative → -Inf/NaN | `max(x, float(1e-8))` |
| `pow(x, y)` | Negative base with fractional exp → NaN | `max(x, float(0.0))` |
| `inverseSqrt(x)` | Zero → Inf | `max(x, float(1e-8))` |
| `normalize(v)` | Zero vector → NaN | Check `dot(v, v) > threshold` |

```typescript
// Practical example from raymarching normals.ts:
const lenSq = dot(n, n)
const result = vec3(0, 1, 0).toVar('normalResult')

// CRITICAL: Guard sqrt BEFORE the If()
const safeLenSq = max(lenSq, float(1e-8))

If(lenSq.greaterThan(1e-8), () => {
  result.assign(n.div(sqrt(safeLenSq)))  // Safe: safeLenSq always >= 1e-8
})
```

---

## Part 3: uniformArray.element() Is BROKEN in WebGPU

### Rule 3.1: Never Use uniformArray.element() with TSL Node Index

`uniformArray.element(nodeIndex)` causes **"Invalid PipelineLayout"** errors. WebGPU bind group layouts require static resource declarations.

| Pattern | Example | Result |
|---------|---------|--------|
| Constant JS index | `matrix.element(0)` | ✅ Works |
| JS loop variable | `for (let i = 0; i < 4; i++) { arr.element(i) }` | ✅ Works (unrolled) |
| TSL node index | `arr.element(lightIndex)` where `lightIndex` is IntNode | ❌ Breaks |
| TSL expression | `arr.element(base.add(offset))` | ❌ Breaks |

### Rule 3.2: Use vec4 with select() Chain Instead

For small arrays (≤4 elements), use `vec4` uniform and access via select chain:

```typescript
// ❌ BROKEN - Causes "Invalid PipelineLayout"
const uLightCastsShadow = uniformArray([0, 0, 0, 0])
// Inside Fn():
const castsShadow = uLightCastsShadow.element(int(lightIndex)).greaterThan(0.5)

// ✅ WORKING - Use vec4 with select chain
import { uniform, select, int } from 'three/tsl'
import { Vector4 } from 'three'

const uLightCastsShadow = uniform(new Vector4(0, 0, 0, 0))

// Inside Fn():
const castsShadowValue = select(
  lightIndex.equal(0),
  uLightCastsShadow.x,
  select(
    lightIndex.equal(1),
    uLightCastsShadow.y,
    select(
      lightIndex.equal(2),
      uLightCastsShadow.z,
      uLightCastsShadow.w
    )
  )
)
```

---

## Part 4: Texture and Material Stability Rules

### Rule 4.1: Use Stable TextureNodes

TextureNodes must be created ONCE with a placeholder. Update `.value` at runtime instead of creating new `texture()` calls.

```typescript
// ❌ WRONG - Creates new texture node each frame
private getPassthroughMaterial(inputTexture: THREE.Texture | null): THREE.Material {
  const texNode = texture(inputTexture, uv())  // NEW node each call!
  nodeMaterial.outputNode = vec4(texNode.rgb, texNode.a)
  nodeMaterial.needsUpdate = true  // Forces recompilation!
  return material
}

// ✅ CORRECT - Stable texture node, update value only
private passthroughTextureNodes: Map<number, ReturnType<typeof texture>> = new Map()
private passthroughPlaceholder: THREE.DataTexture | null = null

private getPassthroughMaterial(inputTexture: THREE.Texture | null): THREE.Material {
  // Create placeholder once
  if (!this.passthroughPlaceholder) {
    const size = 4  // Use 4x4 for WebGPU compatibility
    const data = new Uint8Array(size * size * 4).fill(128)
    this.passthroughPlaceholder = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
    this.passthroughPlaceholder.needsUpdate = true
  }

  // Create stable TextureNode ONCE
  let texNode = this.passthroughTextureNodes.get(1)
  if (!texNode) {
    texNode = texture(this.passthroughPlaceholder, uv())
    this.passthroughTextureNodes.set(1, texNode)
    nodeMaterial.outputNode = vec4(texNode.rgb, texNode.a)
  }

  // Update texture VALUE at runtime (NOT the node)
  if (inputTexture) {
    (texNode as unknown as { value: THREE.Texture }).value = inputTexture
  }
  // NO needsUpdate = true after initial creation!
  return material
}
```

### Rule 4.2: Never Use null for Texture Uniforms

TSL's `uniform()` does not accept `null`. This causes `"Uniform 'null' not implemented"` errors.

```typescript
// ❌ WRONG - Causes compilation error
const uniforms = {
  uMyTexture: uniform(null as unknown as THREE.Texture),
}

// ✅ CORRECT - Use texture() with placeholder
function getPlaceholder(): THREE.DataTexture {
  const size = 4
  const data = new Uint8Array(size * size * 4).fill(0)
  const placeholder = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  placeholder.needsUpdate = true
  return placeholder
}

const uniforms = {
  uMyTexture: texture(getPlaceholder()),
}

// Update at runtime:
(uniforms.uMyTexture as unknown as { value: THREE.Texture }).value = actualTexture
```

### Rule 4.3: Never Change transparent or Call needsUpdate at Runtime

Changing `material.transparent` or calling `material.needsUpdate = true` after initial compilation causes "Invalid PipelineLayout" errors.

```typescript
// ❌ WRONG - Changing transparent triggers pipeline recreation
useFrame(() => {
  const isTransparent = opacity < 1
  if (material.transparent !== isTransparent) {
    material.transparent = isTransparent      // CAUSES PIPELINE RECREATION!
    material.needsUpdate = true               // FORCES RECOMPILATION!
  }
})

// ✅ CORRECT - Create with transparent: true, only change depthWrite
const material = useMemo(() => {
  return new MeshBasicNodeMaterial({
    transparent: true,  // Always true for WebGPU pipeline stability
    depthWrite: opacity >= 1,
  })
}, [])

useFrame(() => {
  const isOpaque = opacity >= 1
  if (material.depthWrite !== isOpaque) {
    material.depthWrite = isOpaque  // depthWrite change doesn't require pipeline recreation
  }
  // Do NOT call needsUpdate
})
```

---

## Part 5: NDC Depth Range Differences

### Rule 5.1: WebGPU Z is Already in [0,1]

| API | NDC Z Range | Depth Buffer |
|-----|-------------|--------------|
| **WebGL** | -1 to +1 | 0 to 1 |
| **WebGPU** | 0 to +1 | 0 to 1 |

```typescript
// ❌ WRONG for WebGPU - uses WebGL conversion
const depth = clipPos.z.div(clipW).mul(0.5).add(0.5)

// ✅ CORRECT for WebGPU - z/w is already in [0,1]
const depth = clamp(clipPos.z.div(clipW), float(0), float(1))
```

### Rule 5.2: Shadow Map Sampling

XY coordinates still need conversion (NDC XY is [-1,1] in both APIs), but Z does NOT:

```typescript
// ❌ WRONG for WebGPU - applies 0.5+0.5 to all xyz including Z
const projCoord = shadowCoord.xyz.div(w)
const texCoord = projCoord.mul(0.5).add(0.5)  // Z gets corrupted!

// ✅ CORRECT for WebGPU - convert XY only, keep Z as-is
const projCoord = shadowCoord.xyz.div(w)
const texCoordXY = projCoord.xy.mul(0.5).add(0.5)  // XY: NDC to texture
const currentDepth = clamp(projCoord.z, float(0), float(1))  // Z: already [0,1]
```

---

## Part 6: Variable Declaration Best Practices

### Rule 6.1: Prefer No toVar() or select() Over Named toVar()

Named `toVar('name')` causes TSL warnings when `Fn()` is called multiple times. This indicates shader recompilation overhead.

| Priority | Pattern | When to Use |
|----------|---------|-------------|
| **1. Best** | No `toVar()` | Value is never reassigned |
| **2. Better** | `select()` | Simple conditional assignment |
| **3. Good** | Unnamed `toVar()` | Loop accumulators, complex mutations |
| **4. Avoid** | Named `toVar('x')` | Never in reusable `Fn()` |

```typescript
// 1. BEST - No toVar() when value isn't mutated
const halfVec = V.add(L).normalize()  // Just an expression

// 2. BETTER - select() instead of If/toVar/assign
// ✗ BAD:
const result = vec3(0, 1, 0).toVar('result')
If(condition, () => { result.assign(otherValue) })
// ✓ GOOD:
return condition.select(otherValue, vec3(0, 1, 0))

// 3. GOOD - Unnamed toVar() for loop accumulators
const accumulator = float(0).toVar()  // TSL auto-generates unique name
Loop(steps, () => {
  accumulator.addAssign(sample)
})

// 4. AVOID - Named toVar() in Fn() called multiple times
const t = float(0).toVar('t')  // ✗ Causes "Declaration name 't' already in use"
```

---

## Part 7: Render Graph and Post-Processing

### Rule 7.1: Always Call setSize() on Render Graphs

Render graph implementations default to 1×1 pixel dimensions. Missing `setSize()` causes single-pixel output stretched to fill screen.

```typescript
// ❌ WRONG - Missing setSize() call
const graph = new RenderGraphTSL()
graph.compile()
// Render targets are 1×1 pixels!

// ✅ CORRECT - Always call setSize() with DPR-adjusted dimensions
const graph = new RenderGraphTSL()
graph.compile()

const dpr = viewport.dpr
const nativeWidth = Math.floor(size.width * dpr)
const nativeHeight = Math.floor(size.height * dpr)
graph.setSize(nativeWidth, nativeHeight)
```

### Rule 7.2: WebGPU MRT Texture Naming

When creating single-texture render targets, **always set `target.texture.name = 'output'`**.

```typescript
// ✅ CORRECT
const target = new THREE.WebGLRenderTarget(width, height, options)
target.texture.name = 'output'

// ❌ WRONG - Material with mrtNode will fail to render
const target = new THREE.WebGLRenderTarget(width, height, options)
```

### Rule 7.3: Post-Processing TSL Pattern

All post-processing passes must use this pattern:

```typescript
import { MeshBasicNodeMaterial } from 'three/webgpu'
import { Fn, texture, screenUV, vec4 } from 'three/tsl'

// Create texture nodes OUTSIDE Fn()
const colorTexNode = texture(null)

// Create the shader function
const blurShader = Fn(() => {
  const color = colorTexNode.sample(screenUV)
  // ... TSL operations ...
  return vec4(color.rgb, color.a)
})

// Apply to material
this.material = new MeshBasicNodeMaterial()
this.material.colorNode = blurShader()
```

### Rule 7.4: Use Premultiplied Alpha for Compositing

For gravity lensing pipeline and separate object rendering, use premultiplied alpha:

```typescript
// Material outputs premultiplied color
const shadingColor = createShadingFn()
const opacityNode = uniforms.uOpacity
mat.outputNode = vec4(
  shadingColor.x.mul(opacityNode),
  shadingColor.y.mul(opacityNode),
  shadingColor.z.mul(opacityNode),
  opacityNode
)

// Composite shader uses premultiplied blend
// BEFORE (straight alpha):
const blendedColor = objColor.xyz.mul(objColor.w).add(envColor.xyz.mul(float(1).sub(objColor.w)))
// AFTER (premultiplied alpha):
const blendedColor = objColor.xyz.add(envColor.xyz.mul(float(1).sub(objColor.w)))
```

---

## Part 8: Import Paths and Function Syntax

### Rule 8.1: Use ES Module Imports Only

```typescript
// ❌ WRONG - CommonJS
const { varying } = require('three/tsl')

// ✅ CORRECT - ES modules
import { varying, Fn, float, vec3 } from 'three/tsl'
import { MeshBasicNodeMaterial } from 'three/webgpu'
```

### Rule 8.2: Standard Import Pattern

```typescript
// WebGPU renderer and node materials
import {
  WebGPURenderer,
  MeshBasicNodeMaterial,
  MeshStandardNodeMaterial,
  MeshPhysicalNodeMaterial,
  PostProcessing
} from 'three/webgpu'

// TSL functions and nodes
import {
  Fn, If, Loop, Break, Continue, Return, Discard,
  float, int, vec2, vec3, vec4, mat3, mat4,
  uniform, uniformArray, attribute, varying,
  texture, cubeTexture,
  positionWorld, positionLocal, positionView,
  normalWorld, normalLocal, normalView,
  cameraPosition, time, deltaTime,
  add, sub, mul, div, mod, pow, sqrt, abs,
  sin, cos, tan, asin, acos, atan,
  min, max, clamp, mix, step, smoothstep,
  dot, cross, normalize, length, distance, reflect, refract,
  dFdx, dFdy, fwidth,
  screenUV, viewportUV, resolution,
  type Node, type UniformNode
} from 'three/tsl'
```

### Rule 8.3: texture3D Special Import

`texture3D` is not exported from `three/tsl`. Use direct source import:

```typescript
import { texture3D } from 'three/src/nodes/accessors/Texture3DNode.js'
```

---

## Part 9: TSL Syntax Rules

### Rule 9.1: Use Method Chaining, Not JavaScript Operators

TSL uses method chaining. JavaScript operators do not work on nodes.

```typescript
// ❌ WRONG
const result = a * 2 + b

// ✅ CORRECT
const result = a.mul(2).add(b)
// or
const result = add(mul(a, 2), b)
```

### Rule 9.2: Use TSL Math Functions, Not JavaScript Math

```typescript
// ❌ WRONG - Returns NaN or black screen
const wave = Math.sin(time)

// ✅ CORRECT
const wave = sin(time)
// or
const wave = time.sin()
```

### Rule 9.3: Fn() Is Required for Stack Operations

`Fn()` creates the controlled environment for `If()`, `assign()`, `Discard()`, and loops.

```typescript
// ❌ WRONG - Error: "Cannot read properties of null (reading 'If')"
const myShader = () => {
  If(condition, () => { /* ... */ })  // FAILS!
}

// ✅ CORRECT
const myShader = Fn(() => {
  If(condition, () => { /* ... */ })  // WORKS
})
```

### Rule 9.4: If() Has No .Else() Method

TSL `If()` returns `void`. Use separate blocks or `select()`:

```typescript
// ❌ WRONG
If(cond, () => { a.assign(x) }).Else(() => { a.assign(y) })

// ✅ CORRECT
If(cond, () => { a.assign(x) })
If(cond.not(), () => { a.assign(y) })

// ✅ PREFERRED
const result = select(cond, x, y)
```

### Rule 9.5: Texture Sampling

```typescript
// ❌ OLD (deprecated)
const color = textureNode.uv(uvCoords)

// ✅ CORRECT (r172+)
const color = textureNode.sample(uvCoords)
// or
const color = texture(myTexture, uvCoords)
```

---

## Part 10: Function and Property Renames (r170-r182)

**Use the NEW names. The old names are deprecated.**

| Old Name (Deprecated) | New Name | Since |
|-----------------------|----------|-------|
| `atan2(y, x)` | `atan(y, x)` | r172 |
| `varying(node, name)` | `node.toVarying(name)` | r173 |
| `vertexStage(node)` | `node.toVertexStage()` | r173 |
| `PI2` | `TWO_PI` | r175 |
| `equals(x, y)` | `equal(x, y)` | r175 |
| `modInt(a, b)` | `mod(a, b)` | r175 |
| `cache(node)` | `isolate(node)` | r176 |
| `append()` | `Stack` | r176 |
| `label()` | `setName()` | r178 |
| `transformedNormalView` | `normalView` | r178 |
| `transformedNormalWorld` | `normalWorld` | r178 |
| `uniforms()` | `uniformArray()` | r170 |
| `viewportTopLeft` | `viewportUV` | r170 |
| `storageObject()` | `storage().setPBO(true)` | r170 |
| `densityFog(color, density)` | `fog(color, densityFogFactor(density))` | r171 |
| `rangeFog(color, near, far)` | `fog(color, rangeFogFactor(near, far))` | r171 |
| `renderAsync()` | `renderer.render()` | r182 |
| `passNode.setResolution()` | `passNode.setResolutionScale()` | r181 |
| `resolution` (Vector2 on passes) | `resolutionScale` (scalar) | r180 |

---

## Part 11: Material Node Properties Reference

### MeshBasicNodeMaterial

```typescript
material.colorNode      // vec3 - Final color output
material.opacityNode    // float - Opacity
material.positionNode   // vec3 - Vertex displacement
material.outputNode     // vec4 - Override final output
material.fragmentNode   // Custom fragment shader
```

### MeshStandardNodeMaterial / MeshPhysicalNodeMaterial

```typescript
// All of MeshBasicNodeMaterial plus:
material.normalNode           // vec3 - Normal modification
material.emissiveNode         // vec3 - Emission color
material.roughnessNode        // float - PBR roughness
material.metalnessNode        // float - PBR metalness

// MeshPhysicalNodeMaterial additional:
material.clearcoatNode        // float
material.clearcoatRoughnessNode
material.transmissionNode     // float - Glass/transmission
material.thicknessNode
material.sheenNode
material.iridescenceNode
```

### Screen Space Properties

```typescript
screenUV           // vec2 - Normalized [0,1] screen coordinates
screenCoordinate   // vec2 - Physical pixel coordinates
screenSize         // vec2 - Screen resolution in pixels
screenDPR          // float - Device pixel ratio

viewportUV         // vec2 - Normalized viewport coordinates
viewportCoordinate // vec2 - Viewport pixel coordinates
viewportSize       // vec2 - Viewport resolution
```

---

## Part 12: Control Flow Syntax

```typescript
const myShader = Fn(() => {
  const result = vec3(0).toVar('result')

  // Conditionals
  If(condition, () => {
    result.assign(vec3(1, 0, 0))
  })
  If(condition.not().and(otherCondition), () => {
    result.assign(vec3(0, 1, 0))
  })
  If(condition.not().and(otherCondition.not()), () => {
    result.assign(vec3(0, 0, 1))
  })

  // Loops
  Loop(10, ({ i }) => {
    result.addAssign(vec3(0.1))
    If(i.greaterThan(5), () => {
      Break()
    })
  })

  // Discard fragment
  If(result.x.lessThan(0.1), () => {
    Discard()
  })

  return result
})
```

---

## Part 13: Depth Conversion Utilities

```typescript
// Convert depth buffer value to view-space Z
const viewZ = perspectiveDepthToViewZ(depthValue, cameraNear, cameraFar)

// Convert view-space Z back to depth buffer value
const depth = viewZToPerspectiveDepth(viewZ, cameraNear, cameraFar)

// For orthographic cameras
const viewZ = orthographicDepthToViewZ(depthValue, cameraNear, cameraFar)
```

---

## Part 14: Performance Guidelines

### Rule 14.1: Use toVertexStage() for Heavy Computations

Move expensive calculations from fragment to vertex shader:

```typescript
const expensiveCalc = someHeavyMath(input).toVertexStage()
```

### Rule 14.2: Use toVar() for Repeated Expressions

```typescript
const expensive = complexCalculation().toVar('cached')
// Use 'expensive' multiple times without recomputation
```

### Rule 14.3: Share Uniforms Across Materials

```typescript
const sharedTime = uniform(0)
materialA.colorNode = sin(sharedTime)
materialB.colorNode = cos(sharedTime)
// Update once: sharedTime.value = elapsedTime
```

### Rule 14.4: Avoid Complex Fn() in Loops

Complex `Fn()` called N times per pixel creates N× node graph copies. Volumetric loops with multi-light emission cause 30-60s compilation or crashes.

**Rule**: Inner loop functions must be O(1) complexity. Move complex lighting outside loops.

### Rule 14.5: Use Precomputed Textures for Complex Math

When inline computation creates too many nodes:

```typescript
// CPU: Generate 3D texture with function values
const data = new Float32Array(res * res * res)
for (let z = 0; z < res; z++)
  for (let y = 0; y < res; y++)
    for (let x = 0; x < res; x++)
      data[z * res * res + y * res + x] = expensiveFunction(x, y, z)

// GPU: O(1) texture lookup replaces O(n) computation
const value = texture3D(precomputedTexture).sample(normalizedCoord).x
```

---

## Part 15: Fog (Modern Pattern)

```typescript
// ❌ OLD (deprecated r171)
scene.fog = densityFog(color, density)

// ✅ CORRECT (r171+)
scene.fogNode = fog(vec3(fogColor), densityFogFactor(density))

// Range fog
scene.fogNode = fog(vec3(fogColor), rangeFogFactor(near, far))
```

---

## Part 16: Post-Processing Chain

```typescript
import { PostProcessing } from 'three/webgpu'
import { pass, fxaa, bloom } from 'three/tsl'

const postProcessing = new PostProcessing(renderer)

// Create scene pass
const scenePass = pass(scene, camera)

// Chain effects (functional style, not method chaining)
const withFXAA = fxaa(scenePass)
const withBloom = bloom(withFXAA, 1.0, 0.4, 0.85)

postProcessing.outputNode = withBloom
```

---

## Part 17: Debugging

```typescript
// Log node value during shader compilation
debug(myNode, (value) => console.log('Node value:', value))

// Inspect node in dev tools
inspector(myNode, 'myNodeName')
```

---

## Part 18: GLSL to TSL Transpiler

Three.js includes a built-in transpiler at: https://threejs.org/examples/webgpu_tsl_transpiler.html

### Key Transformations

| GLSL | TSL |
|------|-----|
| `texture(tex, uv)` | `tex.sample(uv)` |
| `col += value` | `col.addAssign(value)` |
| `col *= value` | `col.mulAssign(value)` |
| `a + b * c` | `a.add(b.mul(c))` |
| `for (int i = 0; i < 10; i++)` | `Loop({ start: 0, end: 10 }, ({ i }) => {...})` |
| `if (cond) {...} else {...}` | `If(cond, () => {...})` then `If(cond.not(), () => {...})` |
| `uniform float x` | `const x = uniform('float')` |

### Limitations

1. Requires manual cleanup for texture uniform definitions and imports
2. Complex constructs like preprocessor directives need manual adjustment
3. Context requirements: `uniform sampler2D` needs actual `texture(myTexture)` call

---

## Quick Reference: Error → Fix

| Error Message | Cause | Fix |
|---------------|-------|-----|
| `Invalid PipelineLayout` | varying/texture inside Fn() | Move to OUTSIDE Fn() |
| `Invalid PipelineLayout` | uniformArray.element(nodeIndex) | Use vec4 + select chain |
| `Invalid PipelineLayout` | Changing transparent at runtime | Create with transparent: true |
| `Uniform "null" not implemented` | null texture uniform | Use texture(placeholder) |
| `Declaration name 'X' already in use` | Named toVar() in reused Fn() | Use unnamed toVar() |
| `Cannot read properties of null (reading 'If')` | If() outside Fn() | Wrap in Fn() |
| NaN/black output | Unguarded sqrt/div/log | Add max() guards |
| Single color output | Missing setSize() on render graph | Call setSize() after compile() |
| `Color target has no corresponding fragment stage output` | Missing texture.name | Set target.texture.name = 'output' |

---

## Sources

- [Three.js Migration Guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)
- [Three.js Shading Language Wiki](https://github.com/mrdoob/three.js/wiki/Three.js-Shading-Language)
- [TSL Official Documentation](https://threejs.org/docs/pages/TSL.html)
- [VaryingNode Documentation](https://threejs.org/docs/pages/VaryingNode.html)
- [PR #30582 - VaryingNode setInterpolation](https://github.com/mrdoob/three.js/pull/30582)
- [WGSL Specification - select()](https://www.w3.org/TR/WGSL/#select-builtin)
- [GPU Branch Divergence](https://aschrein.github.io/jekyll/update/2019/06/13/whatsup-with-my-branches-on-gpu.html)


