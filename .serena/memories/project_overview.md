# mquantum - Project Overview

## Purpose
mquantum is an **N-Dimensional Quantum Physics Simulator** - a React + TypeScript web application for visualizing Schroedinger quantum wavefunctions in 3 to 11 dimensions. It renders volumetric quantum mechanics (hydrogen orbitals, harmonic oscillators) via raymarching in WGSL shaders, with a full post-processing pipeline (bloom, SSAO, SSR, bokeh, tonemapping, etc.).

## Scope
- **Single object type**: `ObjectType = 'schroedinger'` (no polytopes, fractals, or black holes)
- **Single rendering backend**: Custom WebGPU renderer (no WebGL, no Three.js renderer)
- **Shader language**: WGSL (not GLSL) for all GPU shaders
- **Quantum modes**:
  - **Harmonic Oscillator (HO)**: Superposition of up to 8 terms, per-dimension frequencies, Hermite polynomial basis (1D-11D)
  - **Hydrogen Orbital**: Laguerre polynomials + spherical harmonics, real orbital variants (3D)
  - **Hydrogen N-Dimensional**: 3D hydrogen radial core + independent harmonic oscillators for extra dimensions (4D-11D)

## Tech Stack

### Core
- **React** 19.2.3 - UI library
- **TypeScript** 5.6.3 - Strict mode enabled
- **Vite** 7.x - Build tool and dev server

### 3D Graphics & Rendering
- **Custom WebGPU Renderer** - Pure `GPUDevice` / `GPUCommandEncoder` APIs
- **WGSL** - All GPU shaders (vertex, fragment, compute)
- **Declarative Render Graph** - Automatic pass ordering via topological sort

### UI & Styling
- **Tailwind CSS** 4.x - Utility-first CSS (configured via Vite plugin, no tailwind.config.js)
- **Motion** 12.x - Animation library

### State Management
- **Zustand** 5.x - State management with selectors + `useShallow` for performance

### Testing
- **Vitest** 4.x - Unit testing (max 4 workers, pool: threads, happy-dom)
- **Playwright** 1.57.x - E2E testing

### Performance-Critical Math
- **Rust/WASM** - Animation-loop math (rotation composition, nD projection, matrix/vector ops) with JS fallback

## Key Architectural Patterns

1. **WebGPU Only**: All shaders use WGSL, rendered via custom render graph on raw GPU APIs
2. **Zustand Selectors**: Never subscribe to entire store; use individual selectors or `useShallow`
3. **UI Component Library**: Always use `src/components/ui/*` primitives, never raw HTML controls
4. **Path Aliases**: Use `@/` imports (e.g., `@/components`, `@/stores`, `@/lib`)
5. **Modern CSS**: Use clamp(), container queries, :has(), oklch() colors
6. **Version-tracked stores**: Dirty-flag optimization for render uniform updates

## Platform
- **macOS (Darwin)** development environment
- Deployed on **Vercel**
