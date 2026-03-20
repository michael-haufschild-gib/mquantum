# Quantum Carpet — Implementation Plan

## Overview

A spacetime diagram (position × time) that accumulates |ψ(x_i, t)|² into a rolling 2D heatmap. Shows quantum revivals, fractional revivals, Talbot effect, and interference tapestries.

## Data Flow

```
Compute pass (TDSE/BEC/Dirac/Pauli/FSF)
    ↓
3D density texture (rgba16float, 96³)
    ↓  channel R = |ψ|², channel G = log(|ψ|² + ε)
CarpetSlice compute dispatch (96 invocations)
    ↓  reads 1D line from 3D texture, writes 1 row
2D carpet texture (r32float, 96 × 512)
    ↓  sampled with linear filtering
CarpetOverlay render pass (fullscreen quad → overlay target)
    ↓  colormap, axis labels, color bar
Composite onto canvas
```

Key decision: read from the existing density 3D texture (`.r` for linear, `.g` for log), NOT from raw ψ buffers. The density texture is public via `getDensityTexture()` / `getDensityTextureView()` on every compute pass. No encapsulation changes needed.

## Files to Create

| File | Purpose |
|-|-|
| `src/stores/carpetStore.ts` | Zustand store: enabled, axis, slicePositions, colormap, logScale, historyLength |
| `src/rendering/webgpu/passes/CarpetSliceComputePass.ts` | GPU compute: reads 3D density tex → writes 1 row to 2D rolling texture |
| `src/rendering/webgpu/shaders/schroedinger/compute/carpetSlice.wgsl.ts` | WGSL compute shader for slice extraction |
| `src/rendering/webgpu/passes/CarpetOverlayPass.ts` | Render pass: samples 2D carpet texture, applies colormap, draws to overlay |
| `src/rendering/webgpu/shaders/postprocessing/carpetOverlay.wgsl.ts` | WGSL fragment shader: colormap + axis chrome |
| `src/components/canvas/QuantumCarpetPanel.tsx` | React overlay panel (glass chrome, opaque interior) |
| `src/lib/physics/colormaps.ts` | Viridis, inferno, magma colormap LUT functions (used by WGSL and CPU preview) |
| `src/tests/lib/physics/colormaps.test.ts` | Colormap correctness tests |
| `src/tests/stores/carpetStore.test.ts` | Store state management tests |

## Files to Modify

| File | Change |
|-|-|
| `src/rendering/webgpu/WebGPUScene.ts` | Instantiate CarpetSliceComputePass, dispatch after density write, pass density texture |
| `src/components/layout/EditorLayout.tsx` | Add `<QuantumCarpetPanel />` to canvas overlay layer |
| `src/components/sections/Advanced/AnalysisSection.tsx` | Add carpet toggle/thumbnail for TDSE/BEC/Dirac modes |
| `scripts/playwright/*.spec.ts` | E2E test for carpet panel |

## Store: `carpetStore.ts`

```typescript
interface CarpetState {
  /** Master toggle — controls texture creation and compute dispatch */
  enabled: boolean
  /** Which spatial axis to slice along (0 = x₀, 1 = x₁, ...) */
  sliceAxis: number
  /** Slice position on the perpendicular axes (normalized 0..1, default 0.5 = center) */
  slicePositionY: number
  slicePositionZ: number
  /** Colormap selection */
  colormap: 'viridis' | 'inferno' | 'magma' | 'plasma'
  /** Use log scale (reads .g channel) vs linear (reads .r channel) */
  logScale: boolean
  /** History length in frames (rows in the 2D texture) */
  historyLength: number  // 256 | 512 | 1024, default 512
  /** Current write head (modulo historyLength) — set by render pass, read by UI */
  writeHead: number
  /** Total frames accumulated (for display label) */
  totalFrames: number
  /** Time per frame in simulation units (for axis label) */
  dtPerFrame: number

  // Actions
  setEnabled: (v: boolean) => void
  setSliceAxis: (axis: number) => void
  setSlicePositionY: (v: number) => void
  setSlicePositionZ: (v: number) => void
  setColormap: (c: CarpetState['colormap']) => void
  setLogScale: (v: boolean) => void
  setHistoryLength: (v: number) => void
  clear: () => void  // reset writeHead and totalFrames
  /** Called by render pass each frame */
  advanceHead: (dt: number) => void
}
```

## WGSL Compute Shader: `carpetSlice.wgsl.ts`

```wgsl
struct CarpetSliceParams {
  sliceAxis: u32,         // 0=x, 1=y, 2=z
  writeRow: u32,          // current row in 2D texture
  slicePosY: f32,         // normalized position on perp axis 1 (0..1)
  slicePosZ: f32,         // normalized position on perp axis 2 (0..1)
  useLogScale: u32,       // 0=linear (.r), 1=log (.g)
  gridSize: u32,          // density grid dimension (96)
  _pad0: u32,
  _pad1: u32,
}

@group(0) @binding(0) var<uniform> params: CarpetSliceParams;
@group(0) @binding(1) var densityTex: texture_3d<f32>;
@group(0) @binding(2) var carpetTex: texture_storage_2d<r32float, write>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.gridSize) { return; }

  // Build 3D coordinates based on slice axis
  var coord: vec3u;
  let perpY = u32(params.slicePosY * f32(params.gridSize - 1u));
  let perpZ = u32(params.slicePosZ * f32(params.gridSize - 1u));

  if (params.sliceAxis == 0u) {
    coord = vec3u(i, perpY, perpZ);        // slice along x
  } else if (params.sliceAxis == 1u) {
    coord = vec3u(perpY, i, perpZ);        // slice along y
  } else {
    coord = vec3u(perpY, perpZ, i);        // slice along z
  }

  let sample = textureLoad(densityTex, coord, 0);
  let value = select(sample.r, sample.g, params.useLogScale == 1u);

  textureStore(carpetTex, vec2u(i, params.writeRow), vec4f(value, 0.0, 0.0, 1.0));
}
```

Workgroup dispatches: `ceil(96 / 64) = 2` workgroups per frame. Negligible.

## WGSL Fragment Shader: `carpetOverlay.wgsl.ts`

Renders the 2D carpet texture with:
- Colormap LUT (256-entry 1D texture, generated on CPU, uploaded once)
- Rolling display: shader knows writeHead, samples with offset to show oldest at top, newest at bottom (or vice versa)
- Color bar: thin strip on the right edge showing the full colormap gradient
- No axis labels in shader — those are drawn by React (SVG or CSS) for text quality

```wgsl
struct CarpetOverlayParams {
  writeHead: u32,
  historyLength: u32,
  totalFrames: u32,
  _pad: u32,
  // Display region in NDC (or pixel coordinates)
  displayRect: vec4f,     // x, y, width, height in pixels
}

@group(0) @binding(0) var<uniform> params: CarpetOverlayParams;
@group(0) @binding(1) var carpetTex: texture_2d<f32>;
@group(0) @binding(2) var carpetSampler: sampler;
@group(0) @binding(3) var colormapTex: texture_1d<f32>;
@group(0) @binding(4) var colormapSampler: sampler;

@fragment
fn main(@builtin(position) fragPos: vec4f) -> @location(0) vec4f {
  // Map fragment position to carpet UV
  let uv = (fragPos.xy - params.displayRect.xy) / params.displayRect.zw;

  // Rolling offset: map v=0 to oldest row, v=1 to newest
  let row = (u32(uv.y * f32(params.historyLength)) + params.writeHead + 1u) % params.historyLength;
  let texU = uv.x;
  let texV = f32(row) / f32(params.historyLength);

  // Sample carpet density
  let density = textureSample(carpetTex, carpetSampler, vec2f(texU, texV)).r;

  // Map through colormap
  let color = textureSample(colormapTex, colormapSampler, density);

  return color;
}
```

## React Component: `QuantumCarpetPanel.tsx`

**Visual design:**
- Glass panel chrome (border, rounded corners, header bar with title + close button)
- **Opaque dark interior** (`bg-panel/95` or `bg-black/90`) — not glass-through — for scientific readability
- Default size: 480×280px, resizable
- Position: bottom-right corner, above TimelineControls, avoiding overlap with PerformanceMonitor (bottom-left)
- Draggable (reuse PerformanceMonitor's drag pattern with motion values)
- Hidden in cinematic mode
- Desktop only (hidden on mobile via `useIsDesktop()`)

**Interior layout:**
```
┌─────────────────────────────────────────────────┐
│ Quantum Carpet  ×  [axis ▼] [cmap ▼] [log ▼]   │  ← header (glass, 32px)
├─────────────────────────────────────────────────┤
│                                              │▓│ │
│                                              │▓│ │  ← color bar (12px wide)
│   [CARPET HEATMAP - opaque dark bg]          │▓│ │
│                                              │▓│ │
│                                              │▓│ │
│ x₀ ─────────────────────────────────── x_max │▓│ │  ← x-axis label
├─────────────────────────────────────────────────┤
│ t_new ──────────────────────── t_old    dt=0.01 │  ← time info (12px)
└─────────────────────────────────────────────────┘
     ↑ time axis is vertical (newest at bottom, oldest at top)
```

**Controls in header:**
- Axis dropdown: `x₀`, `x₁`, `x₂` (up to dim-1, using axis index labels)
- Colormap dropdown: viridis (default), inferno, magma, plasma
- Log scale toggle button
- Clear (reset) button
- Close button

**Axis labels** (CSS/SVG, not shader):
- Horizontal: spatial axis label with tick marks (e.g., "Position x₀")
- Vertical: time label (e.g., "t" with arrow showing direction)
- Color bar: vertical gradient strip with min/max value labels
- Use `oklch()` for text colors per style guide

**Scientific conventions:**
- Vertical axis: time increasing downward (newest at bottom = natural reading for a "waterfall" display). This matches the convention in Kaplan et al. "Quantum carpets made simple" and is intuitive for a rolling display.
- Horizontal axis: position, with the axis index matching the N-D coordinate
- Colormap: perceptually uniform sequential (viridis default, scientifically standard since Matplotlib 2.0)
- Color bar: always visible, labeled with the value range [0, max] or [min, max] for log scale

## Activation Logic

The carpet is available when ANY of these conditions hold:
- Compute mode active: `tdseDynamics`, `becDynamics`, `diracEquation`, `freeScalarField`
- Analytic mode with superposition: `harmonicOscillator` or `hydrogenND` with `DensityGridComputePass` active

The carpet toggle appears in the AnalysisSection for applicable modes. The toggle creates/destroys the GPU resources.

For analytic modes: the DensityGridComputePass produces the same 3D density texture format. The carpet can read from it. However, for single-eigenstate HO/hydrogen, the density is time-invariant — the carpet will show a static pattern. This is physically correct (no time evolution) and should be communicated to the user via a tooltip.

## Performance

| Concern | Budget | Solution |
|-|-|-|
| Compute dispatch per frame | 2 workgroups (128 threads) | Negligible vs existing TDSE (~500 dispatches) |
| Carpet texture memory | 96 × 512 × 4 bytes = 192 KB | Negligible |
| Colormap LUT texture | 256 × 4 bytes = 1 KB | One-time upload |
| Overlay render pass | 1 fullscreen quad draw call | Negligible |
| CPU overhead | Store update (writeHead++) + uniform write (32 bytes) | Negligible |

**Gating**: When carpet `enabled` is false:
- No texture creation
- No compute dispatch
- No render pass
- Zero GPU cost

**Cleanup**: When carpet is disabled after being enabled, destroy the 2D texture and colormap LUT immediately.

## Test Matrix

### Unit Tests

| Test File | Test | What It Verifies |
|-|-|-|
| `carpetStore.test.ts` | `setEnabled` / `clear` toggle | Store defaults, enable/disable cycle |
| `carpetStore.test.ts` | `advanceHead` wraps at historyLength | Ring buffer modular arithmetic |
| `carpetStore.test.ts` | `setSliceAxis` clamps to valid range | Axis 0..N-1, rejects out-of-range |
| `carpetStore.test.ts` | `clear` resets writeHead and totalFrames | Correct reset behavior |
| `colormaps.test.ts` | viridis(0) = dark purple, viridis(1) = yellow | Known endpoint colors match matplotlib |
| `colormaps.test.ts` | viridis(0.5) matches published midpoint | Perceptual uniformity verification |
| `colormaps.test.ts` | All colormaps produce valid sRGB [0,1] for all inputs [0,1] | No out-of-range colors |
| `colormaps.test.ts` | Colormap interpolation at non-integer LUT positions | Smooth interpolation, no banding |

### E2E Tests (Playwright)

| Test | Steps | Assertion |
|-|-|-|
| Carpet toggle in TDSE mode | Load app → set TDSE mode → open analysis section → click carpet toggle | Panel appears, `data-testid="quantum-carpet-panel"` visible |
| Carpet accumulates frames | Enable carpet → wait for `data-frame-count > 10` | Carpet texture has non-uniform content (pixel sampling) |
| Carpet hidden in cinematic | Enable carpet → enter cinematic mode | Panel hidden |
| Carpet respects axis switch | Open carpet → change axis dropdown | Panel content changes (carpet clears) |
| Carpet not available in 1D | Set dimension=1 | Carpet toggle not rendered |

### Integration Tests

| Test | Scope |
|-|-|
| CarpetSliceComputePass creates/destroys texture on enable/disable | GPU resource lifecycle |
| Carpet overlay reads correct density channel (linear vs log) | Render correctness |

## Open Questions

1. **Analytic mode carpet**: Should the DensityGridComputePass (for HO/hydrogen) update every frame during animation? Currently it may only update when quantum numbers change. If it doesn't update per-frame, the carpet will show a static row repeated. Investigate during implementation.

2. **Multi-carpet**: Future extension — show multiple carpets for different axes simultaneously (the N-D unique feature). Defer to post-MVP. The architecture supports it (multiple CarpetSliceComputePass instances with different axis params).

3. **Export**: Carpet image export as PNG (for publications). Defer to when data export (B2) is implemented. The 2D texture readback is straightforward.
