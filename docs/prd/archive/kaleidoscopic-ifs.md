# N-Dimensional Kaleidoscopic IFS PRD

## Overview

**Kaleidoscopic IFS (KIFS)** are fractals built from iterated folding operations—conditional reflections across hyperplanes—combined with scaling and translation. First introduced by Knighty on Fractal Forums, KIFS produce some of the most visually stunning 3D fractals ever discovered, ranging from crystalline structures to organic, flower-like forms.

KIFS are ideal for our N-dimensional visualizer because **hyperplane reflections are dimension-agnostic**—the same fold operation works identically from 3D to 11D.

## What is Kaleidoscopic IFS?

### Core Concept

A kaleidoscope creates patterns by reflecting images between angled mirrors. KIFS applies this principle mathematically:

1. **Fold** the point across multiple hyperplanes (conditional reflections)
2. **Scale** the point away from or toward a center
3. **Translate** to offset the scaling center
4. **Repeat** for many iterations

The "kaleidoscopic" effect comes from the fold operations forcing all points into a fundamental domain, creating the characteristic symmetric, self-similar structures.

### Mathematical Definition

#### Hyperplane Fold

A fold across a hyperplane with normal vector `n` (unit length):

```glsl
// If point is on "wrong" side of plane, reflect it
float d = dot(z, n);
if (d < 0.0) {
    z = z - 2.0 * d * n;
}
```

Optimized single-line version:
```glsl
z -= 2.0 * min(0.0, dot(z, n)) * n;
```

This is a **conditional reflection**—it only reflects if the point is on the negative side of the hyperplane. This is what creates the folding behavior rather than simple mirroring.

#### Complete KIFS Iteration

```glsl
for (int i = 0; i < maxIterations; i++) {
    // Apply all fold operations
    for (int f = 0; f < numFolds; f++) {
        z -= 2.0 * min(0.0, dot(z, foldNormal[f])) * foldNormal[f];
    }

    // Optional: rotation between folds (creates organic variation)
    z = rotationMatrix * z;

    // Scale and translate
    z = scale * z - offset * (scale - 1.0);

    // Track running derivative for DE
    dr = dr * abs(scale) + 1.0;
}
```

### Platonic Solid Symmetries

The classic KIFS use fold planes derived from Platonic solid symmetries:

| Solid | Vertices | Fold Planes | Symmetry Group |
|-------|----------|-------------|----------------|
| Tetrahedron | 4 | 6 | Td (tetrahedral) |
| Cube/Octahedron | 8/6 | 9 | Oh (octahedral) |
| Icosahedron/Dodecahedron | 12/20 | 15 | Ih (icosahedral) |

**Tetrahedron fold planes** (normals):
```glsl
n1 = normalize(vec3(1, 1, 0));   // XY diagonal
n2 = normalize(vec3(1, 0, 1));   // XZ diagonal
n3 = normalize(vec3(0, 1, 1));   // YZ diagonal
```

**Icosahedron fold planes** involve the golden ratio φ = (1 + √5)/2:
```glsl
n1 = normalize(vec3(1, φ, 0));
n2 = normalize(vec3(0, 1, φ));
n3 = normalize(vec3(φ, 0, 1));
// ... additional planes for full symmetry
```

## Why KIFS for N-Dimensions?

### 1. Hyperplane Folds Are Dimension-Agnostic

The fold operation uses only:
- **Dot product**: `dot(z, n)` — works in any dimension
- **Scalar-vector multiplication**: `2.0 * d * n` — works in any dimension
- **Vector subtraction**: `z - ...` — works in any dimension

The exact same code handles 3D, 4D, ..., 11D with no modification.

### 2. N-Dimensional Polytope Symmetries

Just as 3D has Platonic solids, higher dimensions have regular polytopes:

| Dimension | Regular Polytopes | Example Fold Symmetries |
|-----------|-------------------|------------------------|
| 3D | 5 (Platonic solids) | Tetra, Octa, Icosa |
| 4D | 6 (including 24-cell, 120-cell) | 24-cell, 600-cell |
| 5D+ | 3 (simplex, cross-polytope, hypercube) | Generalized versions |

The **N-simplex** (generalization of tetrahedron) and **N-cross-polytope** (generalization of octahedron) exist in all dimensions and provide natural fold plane systems.

### 3. Conformal Transformations Preserve DE

All KIFS operations are conformal:
- **Reflections**: Orthogonal transformations (Jacobian = orthogonal matrix)
- **Uniform scaling**: Jacobian = scalar × identity
- **Rotations**: Orthogonal transformations

This means the distance estimate uses a simple scalar running derivative:

```glsl
DE = length(z) / abs(dr);
```

### 4. Bounded Volume

KIFS fractals are inherently bounded. The iterative scaling with `|scale| > 1` combined with offset keeps the structure within a predictable bounding sphere.

## Raymarching Implementation

### N-Dimensional SDF

```glsl
float kifsSDF(vec3 pos, int D, int maxIter, out float trap) {
    // Map 3D position to D-dimensional point via basis vectors
    float z[11];
    for (int i = 0; i < D; i++) {
        z[i] = uOrigin[i] + pos.x * uBasisX[i] + pos.y * uBasisY[i] + pos.z * uBasisZ[i];
    }

    float dr = 1.0;
    float minDist = 1000.0;  // Orbit trap

    for (int iter = 0; iter < maxIter; iter++) {
        // Apply fold operations
        for (int f = 0; f < uNumFolds; f++) {
            float d = 0.0;
            for (int i = 0; i < D; i++) {
                d += z[i] * uFoldNormal[f][i];
            }
            if (d < 0.0) {
                for (int i = 0; i < D; i++) {
                    z[i] -= 2.0 * d * uFoldNormal[f][i];
                }
            }
        }

        // Optional rotation (apply D-dimensional rotation matrix)
        if (uRotationEnabled) {
            applyRotation(z, uIterRotation, D);
        }

        // Scale and translate
        for (int i = 0; i < D; i++) {
            z[i] = uScale * z[i] - uOffset[i] * (uScale - 1.0);
        }
        dr = dr * abs(uScale) + 1.0;

        // Orbit trap
        float r2 = 0.0;
        for (int i = 0; i < D; i++) r2 += z[i] * z[i];
        minDist = min(minDist, sqrt(r2));
    }

    // Final distance: either to a primitive or just length-based
    float r = 0.0;
    for (int i = 0; i < D; i++) r += z[i] * z[i];
    r = sqrt(r);

    trap = minDist;
    return (r - uPrimitiveRadius) / dr;  // Distance to sphere primitive
}
```

### Fold Normal Generation for N-D

#### N-Simplex Fold Normals

An N-simplex has N+1 vertices. The fold planes are the perpendicular bisectors between vertex pairs:

```typescript
function generateSimplexFoldNormals(D: number): number[][] {
    // Regular N-simplex vertices (centered at origin)
    const vertices = generateSimplexVertices(D);  // N+1 vertices

    const normals: number[][] = [];

    // For each pair of adjacent vertices, create a fold normal
    for (let i = 0; i < D; i++) {
        for (let j = i + 1; j < D + 1; j++) {
            const normal = new Array(D).fill(0);
            for (let k = 0; k < D; k++) {
                normal[k] = vertices[j][k] - vertices[i][k];
            }
            normalize(normal);
            normals.push(normal);
        }
    }

    return normals;  // D(D+1)/2 fold normals
}
```

#### Coordinate Plane Folds (Simplest)

The simplest fold system uses coordinate hyperplanes:

```glsl
// Fold into positive orthant (works in any dimension)
for (int i = 0; i < D; i++) {
    z[i] = abs(z[i]);
}
```

This is equivalent to folding across all coordinate hyperplanes simultaneously.

#### Diagonal Folds

For richer structure, add diagonal folds:

```glsl
// Fold across XY diagonal (swap if x < y)
if (z[0] < z[1]) { float t = z[0]; z[0] = z[1]; z[1] = t; }

// Generalized: fold to sort coordinates descending
// This creates cross-polytope symmetry
sortDescending(z, D);
```

## N-Dimensional Animation System

### Rotation Planes

KIFS uses the **same rotation system as all N-dimensional objects**. In N dimensions, there are `N(N-1)/2` independent rotation planes:

| Dimension | Rotation Planes | Plane Names |
|-----------|-----------------|-------------|
| 3D | 3 | XY, XZ, YZ |
| 4D | 6 | XY, XZ, YZ, XW, YW, ZW |
| 5D | 10 | XY, XZ, YZ, XW, YW, ZW, XV, YV, ZV, WV |
| 6D | 15 | + XU, YU, ZU, WU, VU |
| ... | ... | ... |
| 11D | 55 | All pairs of 11 axes |

### How Rotation Works

We use a **3D slice through N-dimensional space**, defined by:

```
c = origin + x·basisX + y·basisY + z·basisZ
```

Where:
- `origin`: N-dimensional vector, position of slice center
- `basisX`, `basisY`, `basisZ`: N-dimensional unit vectors defining slice orientation
- `(x, y, z)`: 3D raymarching coordinates

### Rotation Transformation

When the user rotates in a plane (e.g., XW in 4D), we:

1. **Build the N-dimensional rotation matrix** using `composeRotations(dimension, angles)`
2. **Rotate the basis vectors** through N-dimensional space:
   ```typescript
   rotatedBasisX = rotationMatrix × [1, 0, 0, 0, ...]
   rotatedBasisY = rotationMatrix × [0, 1, 0, 0, ...]
   rotatedBasisZ = rotationMatrix × [0, 0, 1, 0, ...]
   rotatedOrigin = rotationMatrix × origin
   ```
3. **Pass rotated basis to shader** as uniforms

### KIFS-Specific Animation: Fold Plane Rotation

Beyond the standard N-D slice rotation, KIFS offers a unique animation dimension:

**Rotating the fold normals themselves** creates organic morphing:

```typescript
interface KIFSAnimation {
    // Standard N-D rotation (slice orientation)
    sliceRotation: Map<string, number>;  // Per rotation plane

    // KIFS-specific: rotate fold planes
    foldRotation: {
        enabled: boolean;
        speed: number;
        planes: number[][];  // Which fold normals to rotate
    };

    // Inter-iteration rotation (creates organic twisting)
    iterationRotation: {
        enabled: boolean;
        anglePerIteration: number;
        plane: [number, number];  // Which plane to rotate in
    };
}
```

### Why This Creates Smooth Morphing

KIFS morphs smoothly because:

1. **Fold operations are continuous**: The `min(0, dot(z, n))` creates a smooth transition at the fold plane
2. **Rotating fold normals**: Smoothly changing `n` smoothly changes where points get reflected
3. **N-D rotation is continuous**: Basis vector changes are infinitesimal per frame

**No jumpcuts** because all operations are continuous functions of their parameters.

## Store Integration

### Extended Object Store Configuration

```typescript
interface KIFSConfig {
    // Fold system
    foldType: 'simplex' | 'cross-polytope' | 'custom';
    customFoldNormals?: number[][];  // For custom fold systems

    // Iteration parameters
    scale: number;           // 1.5 to 3.0, default 2.0
    offset: number[];        // D-dimensional offset vector
    iterations: number;      // 5 to 20, default 10

    // Inter-iteration rotation (organic twisting)
    iterRotationEnabled: boolean;
    iterRotationAngle: number;   // Radians per iteration
    iterRotationPlane: [number, number];  // Axis indices

    // Primitive for final distance
    primitiveType: 'sphere' | 'box' | 'none';
    primitiveRadius: number;

    // Slice position (for dimensions 4+)
    parameterValues: number[];
}
```

### Geometry Store

No changes needed—dimension selection works identically to all N-dimensional objects.

### Rotation Store

No changes needed—rotation planes computed the same way.

## UI Controls

### Parameter Panel

| Parameter | Range | Default | Effect |
|-----------|-------|---------|--------|
| Fold Type | simplex/cross/custom | simplex | Symmetry character |
| Scale | 1.5 to 3.0 | 2.0 | Detail density |
| Iterations | 5 to 20 | 10 | Recursion depth |
| Offset X/Y/Z/... | -2.0 to 2.0 | 1.0 | Structure shape |
| Iter Rotation | 0° to 45° | 0° | Organic twisting |
| Primitive Radius | 0.0 to 0.5 | 0.1 | Surface thickness |

### Animation Controls

Same as existing animation panel:
- Play/Pause toggle
- Speed slider (0.1× to 3×)
- Direction toggle
- Plane selection checkboxes (XY, XZ, YZ, XW, ...)

Plus KIFS-specific:
- Fold rotation toggle and speed
- Iteration rotation toggle and angle

## Shader Uniforms

```glsl
// KIFS parameters
uniform int uNumFolds;
uniform float uFoldNormals[15 * 11];  // Up to 15 fold planes × 11 dimensions
uniform float uScale;
uniform float uOffset[11];
uniform int uIterations;
uniform float uPrimitiveRadius;

// Inter-iteration rotation
uniform bool uIterRotationEnabled;
uniform float uIterRotationAngle;
uniform int uIterRotationPlane[2];

// N-dimensional slice (same as Mandelbulb)
uniform int uDimension;
uniform float uBasisX[11];
uniform float uBasisY[11];
uniform float uBasisZ[11];
uniform float uOrigin[11];
```

## Visual Variations

### By Fold Type

| Fold System | Character | Best For |
|-------------|-----------|----------|
| Simplex | Sharp, crystalline | Gems, crystals |
| Cross-polytope | Cubic, lattice | Architecture, grids |
| Icosahedral (3D) | Complex, organic | Flowers, shells |
| Custom | Anything | Experimentation |

### By Parameters

| Scale | Offset | Iter Rotation | Result |
|-------|--------|---------------|--------|
| 2.0 | (1,1,1) | 0° | Classic Sierpiński-like |
| 2.5 | (1,1,0) | 0° | Asymmetric crystal |
| 2.0 | (1,1,1) | 15° | Twisted organic |
| 3.0 | (0.5,0.5,0.5) | 5° | Dense, intricate |

## Implementation Phases

### Phase 1: Core 3D KIFS
- [ ] Basic fold operations (simplex, cross-polytope)
- [ ] Standard raymarching with sphere primitive
- [ ] Scale, offset, iterations parameters

### Phase 2: N-Dimensional Extension
- [ ] Generalized fold normals for D dimensions
- [ ] Basis vector rotation system (reuse from Mandelbulb)
- [ ] Dimension-aware fold normal generation

### Phase 3: Animation Integration
- [ ] Connect to existing rotation store
- [ ] Per-plane animation toggles
- [ ] Fold normal rotation animation
- [ ] Inter-iteration rotation

### Phase 4: Advanced Features
- [ ] Custom fold normal editor
- [ ] Multiple primitive types
- [ ] Orbit trap coloring (reuse from Mandelbulb)

## Example: 4D KIFS with Simplex Folds

For 4D, the 4-simplex has 5 vertices and 10 fold planes:

```glsl
// 4D simplex fold normals (normalized)
const float n0[4] = { 0.7071, 0.7071, 0.0, 0.0 };     // XY diagonal
const float n1[4] = { 0.7071, 0.0, 0.7071, 0.0 };     // XZ diagonal
const float n2[4] = { 0.7071, 0.0, 0.0, 0.7071 };     // XW diagonal
const float n3[4] = { 0.0, 0.7071, 0.7071, 0.0 };     // YZ diagonal
const float n4[4] = { 0.0, 0.7071, 0.0, 0.7071 };     // YW diagonal
const float n5[4] = { 0.0, 0.0, 0.7071, 0.7071 };     // ZW diagonal
// ... additional normals for full simplex symmetry
```

When rotating in the XW plane, the 3D slice reveals different cross-sections of this 4D symmetric structure, creating smooth morphing between crystalline forms.

## References

- [Knighty's Kaleidoscopic IFS Thread (Fractal Forums)](http://www.fractalforums.com/3d-fractal-generation/kaleidoscopic-%28escape-time-ifs%29/)
- [Distance Estimated 3D Fractals Part III: Folding Space (Syntopia)](http://blog.hvidtfeldts.net/index.php/2011/08/distance-estimated-3d-fractals-iii-folding-space/)
- [Regular Polytopes (Wikipedia)](https://en.wikipedia.org/wiki/Regular_polytope)
- [Platonic Solids Symmetry Groups](https://en.wikipedia.org/wiki/Polyhedral_group)
