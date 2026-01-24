# MDimension - Project Overview

## Purpose
MDimension is an N-Dimensional Object Visualizer - a React + TypeScript web application for visualizing N-dimensional geometric objects (polytopes, fractals like Mandelbulb/Mandelblob) using Three.js WebGL2 rendering. It supports interactive 3D projections, transformations, and post-processing effects.

## Tech Stack

### Core
- **React** 19.2.3 - UI library
- **TypeScript** 5.6.3 - Strict mode enabled
- **Vite** 7.x - Build tool and dev server

### 3D Graphics & Rendering
- **Three.js** 0.182.0 - WebGL2 3D library
- **@react-three/fiber** 9.x - React renderer for Three.js
- **@react-three/drei** 10.x - Three.js utilities
- **postprocessing** 6.38.0 - Post-processing effects
- **WebGL2 / GLSL ES 3.00** - All shaders MUST use WebGL2 syntax

### UI & Styling
- **Tailwind CSS** 4.x - Utility-first CSS (configured via Vite plugin, no tailwind.config.js)
- **Motion** 12.x - Animation library

### State Management
- **Zustand** 5.x - State management with selectors + `useShallow` for performance

### Testing
- **Vitest** 4.x - Unit testing (max 4 workers, pool: threads, happy-dom)
- **Playwright** 1.57.x - E2E testing

### Optional
- **Rust/WASM** - Optional WASM module for performance-critical computations

## Key Architectural Patterns

1. **WebGL2 Mandatory**: All shaders use GLSL ES 3.00 (`in`/`out`, `layout(location=N) out`, `texture()`)
2. **Zustand Selectors**: Never subscribe to entire store; use individual selectors or `useShallow`
3. **UI Component Library**: Always use `src/components/ui/*` primitives, never raw HTML controls
4. **Path Aliases**: Use `@/` imports (e.g., `@/components`, `@/stores`, `@/lib`)
5. **Modern CSS**: Use clamp(), container queries, :has(), oklch() colors

## Platform
- **macOS (Darwin)** development environment
- Deployed on **Vercel**
