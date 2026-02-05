# WebGPU Bind Group Architecture

## Consolidated Bind Group Layout (4-group limit)

All WebGPU renderers now use a consolidated bind group layout to stay within WebGPU's 4-group limit:

```
Group 0: Camera
  - @binding(0) camera: CameraUniforms

Group 1: Combined (Lighting + Material + Quality)
  - @binding(0) lighting: LightingUniforms
  - @binding(1) material: MaterialUniforms
  - @binding(2) quality: QualityUniforms

Group 2: Object (varies by renderer)
  - @binding(0) [object-specific uniforms]
  - @binding(1) basis: BasisVectors (for raymarched objects)

Group 3: IBL/Environment (optional)
  - @binding(0) iblUniforms: IBLUniforms
  - @binding(1) envMap: texture (2D for PMREM, cube for env)
  - @binding(2) sampler
```

## Shader Compose Files

All shaders must use `generateConsolidatedBindGroups()` NOT `generateStandardBindGroups()`:

```typescript
import { generateConsolidatedBindGroups } from '../shared/compose-helpers'

// In blocks array:
{ name: 'Standard Bind Groups', content: generateConsolidatedBindGroups() },
{
  name: 'Object Uniforms',
  content:
    objectUniformsBlock + '\n' +
    generateObjectBindGroup(2, 'ObjectUniforms', 'object', 0) + '\n' +
    generateObjectBindGroup(2, 'BasisVectors', 'basis', 1),
},
```

## Renderer Pattern

Renderers must create consolidated bind groups:

```typescript
// Group 0: Camera
const cameraBindGroupLayout = device.createBindGroupLayout({
  entries: [{ binding: 0, buffer: { type: 'uniform' } }]
})

// Group 1: Combined (Lighting + Material + Quality)
const combinedBindGroupLayout = device.createBindGroupLayout({
  entries: [
    { binding: 0, buffer: { type: 'uniform' } }, // Lighting
    { binding: 1, buffer: { type: 'uniform' } }, // Material
    { binding: 2, buffer: { type: 'uniform' } }, // Quality
  ]
})

// Group 2: Object
const objectBindGroupLayout = device.createBindGroupLayout({
  entries: [
    { binding: 0, buffer: { type: 'uniform' } }, // Object uniforms
    { binding: 1, buffer: { type: 'uniform' } }, // Basis vectors
  ]
})
```

## Execute Pattern

```typescript
passEncoder.setPipeline(this.renderPipeline)
passEncoder.setBindGroup(0, this.cameraBindGroup)
passEncoder.setBindGroup(1, this.lightingBindGroup) // Combined
passEncoder.setBindGroup(2, this.objectBindGroup)
// Optional: passEncoder.setBindGroup(3, this.iblBindGroup)
```

## Fixed Renderers (2026-01-31)

- WebGPUQuaternionJuliaRenderer (reference implementation)
- WebGPUMandelbulbRenderer
- WebGPUSchrodingerRenderer
- WebGPUBlackHoleRenderer
- WebGPUPolytopeRenderer

## Ground Plane Bind Group Layout (2026-02-05)

The ground plane uses a **non-consolidated** layout optimized for its unique needs:

```
Group 0: Vertex uniforms (dynamic offset per wall)
  - @binding(0) vertexUniforms: VertexUniforms (hasDynamicOffset=true)

Group 1: Material + Grid (consolidated)
  - @binding(0) groundPlaneUniforms: GroundPlaneUniforms
  - @binding(1) gridUniforms: GridUniforms

Group 2: Lighting
  - @binding(0) lighting: LightingUniforms

Group 3: IBL (optional, enabled by default)
  - @binding(0) iblUniforms: IBLUniforms
  - @binding(1) envMap: texture_2d<f32>
  - @binding(2) envMapSampler: sampler
```

Features added:
- MRT output: @location(0) color + @location(1) normal (for SSAO/SSR)
- Wall distance from bounding radius (matches WebGL calculateWallDistance)
- IBL environment reflections via shared PMREM sampling code