# WebGPU Gap Analysis vs WebGL

_Last updated: 2026-01-24_

## Executive Summary

| Category | WebGL | WebGPU | Gap Severity |
|----------|-------|--------|--------------|
| Object Renderers | 6/6 | 6/6 | ✅ None |
| Post-Processing Passes | 32/32 active | 32 exist, ~10 active | 🟡 Medium |
| Shader Features | 100% | ~95% | 🟢 Minor |
| Store Connections | 14 stores | 5 stores (partial) | 🔴 Critical |
| UI Option Coverage | ~100% | ~20% | 🔴 Critical |

---

## 1. STORE CONNECTION GAPS (Critical)

### Completely Missing (0% coverage)

| Store | Purpose | Impact |
|-------|---------|--------|
| **extendedObjectStore** | Fractal params (power, julia const, quantum modes, BH physics) | ALL object controls broken |
| **rotationStore** | N-D rotation planes | No rotation works |
| **transformStore** | Scale (uniform + per-axis) | No scaling works |
| **pbrStore** | Roughness, metallic, specular (face/edge/ground) | Materials broken |

### Partial Coverage (<30%)

| Store | Fields Used | Fields Missing |
|-------|-------------|----------------|
| **lightingStore** | Getter only | All light uniforms, shadows, ambient, tone mapping |
| **appearanceStore** | colorAlgorithm, cosineCoefficients | visibility, faceColor, edgeColor, fresnel, SSS |
| **postProcessingStore** | bloomEnabled, bloomIntensity, aoEnabled, ssrEnabled | 20+ other fields |
| **environmentStore** | skyboxEnabled, skyboxMode, groundEnabled | IBL, grid, walls, procedural settings |
| **performanceStore** | renderResolutionScale, antialiasing | temporal, debug, quality multiplier |

---

## 2. POST-PROCESSING PASS GAPS

### Not Integrated in WebGPU Pipeline

| Pass | File Exists | Integrated |
|------|-------------|------------|
| CinematicPass | ✅ | ❌ |
| SMAAPass | ✅ | ❌ |
| BokehPass | ✅ | ❌ |
| RefractionPass | ✅ | ❌ |
| GravitationalLensingPass | ✅ | ❌ |
| ScreenSpaceLensingPass | ✅ | ❌ |
| PaperTexturePass | ✅ | ❌ |
| FrameBlendingPass | ✅ | ❌ |

### Integrated but Parameters Not Read

| Pass | Toggle Works | Parameters Read |
|------|--------------|-----------------|
| BloomPass | ✅ | ❌ threshold, radius, smoothing, levels |
| GTAOPass | ✅ | ❌ intensity, quality, radius |
| SSRPass | ✅ | ❌ intensity, distance, thickness, fade, quality |

---

## 3. SHADER FEATURE GAPS

### Per-Object Uniform Count

| Object | WebGL | WebGPU | Missing |
|--------|-------|--------|---------|
| Mandelbulb | 30+ | 15+ | ~15 |
| Julia | 30+ | 15+ | ~15 |
| Schrödinger | 40+ | 20+ | ~20 |
| Black Hole | 80+ | 25+ | ~55 (incl. 28 optimizations) |

### Color Algorithms

| ID | Algorithm | WebGL | WebGPU |
|----|-----------|-------|--------|
| 0-10 | Core algorithms | ✅ | ✅ |
| 11 | Accretion gradient | ✅ | ⚠️ Simplified |
| 12 | Gravitational redshift | ✅ | ⚠️ Simplified |
| 13 | Dimension-based | ✅ | ✅ |

### Black Hole Optimizations (WebGL only)

28 named optimizations (OPT-BH-1 through OPT-BH-28) not ported to WebGPU.

---

## 4. UI SECTIONS AFFECTED

### Completely Non-Functional

- Extended Object Settings (all fractal/quantum/physics params)
- Rotation Controls (all N-D planes)
- Transform Controls (scale)
- PBR Materials (face/edge/ground)

### Toggle-Only (no parameter control)

- Bloom, GTAO, SSR
- Skybox, Ground

### Not Available

- Bokeh/DOF, Cinematic, Paper texture
- Refraction, Gravitational lensing
- Frame blending, SMAA

---

## 5. ROOT CAUSE

WebGL pattern (works):
```typescript
// In useFrame (per-frame)
const state = useExtendedObjectStore.getState()
shader.uniforms.uPower.value = state.mandelbulb.power
```

WebGPU pattern (broken):
```typescript
// Getter registered but NEVER called
graph.setStoreGetter('extended', () => useExtendedObjectStore.getState())
// execute() doesn't call graph.getStoreGetter('extended')()
```

Fix: Each renderer's `execute()` must call store getters and bind values to uniform buffers.
