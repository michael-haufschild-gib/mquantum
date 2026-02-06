=== CRITICAL CODE STYLE INSTRUCTION BLOCK (CIB-000)===
## KEEP THE BIG PICTURE IN MIND
This is a scientific research project for my PhD thesis. Students will use this project to study **quantum physics simulations in N dimensions** - specifically Schroedinger wavefunctions including harmonic oscillators (1D-11D) and hydrogen orbitals (3D + N-dimensional extensions). It is very important for my work and my career, we have to do it in steps, carefully, without mistakes and rush. Avoid hallucinations. Don't jump into coding without first researching. Don't patch bugs reactively. Use WebSearch extensively. Understand the purpose of code before changing it.

## RENDERING: WEBGPU ONLY
This project uses a **custom WebGPU renderer** - there is no WebGL, no Three.js rendering path. All GPU shaders are written in **WGSL** (not GLSL). The rendering pipeline is a declarative render graph built on raw `GPUDevice` / `GPUCommandEncoder` APIs.

## QUANTUM PHYSICS SCOPE
The project has a **single object type**: `ObjectType = 'schroedinger'`. There are no polytopes, fractals, black holes, or other geometric objects. All development should focus on expanding and improving the quantum physics simulation capabilities:
- **Harmonic Oscillator**: Superposition of up to 8 terms, per-dimension frequencies, Hermite polynomial basis (1D-11D)
- **Hydrogen Orbital**: Laguerre polynomials + spherical harmonics, real orbital variants (3D)
- **Hydrogen N-Dimensional**: 3D hydrogen radial core + independent harmonic oscillators for extra dimensions (4D-11D)

=== END CIB-000 ===


=== CRITICAL CODE STYLE INSTRUCTION BLOCK (CIB-001)===

## MANDATORY DOCUMENT READS
Read at the start of a new session:
- Project architecture and folder structure: `docs/architecture.md`
- Development environment: `docs/testing.md`
- Testing setup: `docs/testing.md`
- Frontend setup: `docs/frontend.md`

## MANDATORY CODE STYLE AND ARCHITECTURE RULES
Coding agents must follow `docs/meta/styleguide.md` - No exceptions!

**All GPU shaders MUST be written in WGSL.** This project does not use GLSL. Shaders are TypeScript files exporting template literal strings (`.wgsl.ts`) composed via `composeWGSL()`.

**WGSL shader files**: `src/rendering/webgpu/shaders/<category>/<name>.wgsl.ts`

**Leverage useShallow**: Leverage useShallow and Zustand 5 to improve performance.

=== END CIB-001 ===

## TECH STACK

### Core Framework
- **React** 19.2.3 - UI library
- **TypeScript** 5.6.3 - Type-safe JavaScript
- **Vite** 7.2.7 - Build tool and dev server

### 3D Graphics & Rendering
- **Custom WebGPU Renderer** - Pure `GPUDevice` / `GPUCommandEncoder` APIs
- **WGSL** - All GPU shaders (vertex, fragment, compute)
- **Declarative Render Graph** - Automatic pass ordering via topological sort

### UI & Styling
- **Tailwind CSS** 4.1.18 - Utility-first CSS framework
- **@tailwindcss/vite** 4.1.18 - Vite plugin for Tailwind

### State Management & Utilities
- **Zustand** 5.0.2 - State management

### Performance-Critical Math (WASM)
- **Rust/wasm-pack** - Animation-loop math (rotation composition, nD projection, matrix/vector ops)
- JS fallback for all WASM functions (graceful degradation)

### Testing
- **vitest** 4.0.15 - Unit testing framework
- **happy-dom** 15.11.7 - DOM implementation for testing
- **Playwright** - E2E testing with actual GPU rendering

### Development Tools
- **ESLint** 9.15.0 - Code linting
- **@typescript-eslint/parser** 8.15.0 - TypeScript ESLint parser
- **@typescript-eslint/eslint-plugin** 8.15.0 - TypeScript linting rules
- **eslint-plugin-react-hooks** 5.0.0 - React Hooks linting
- **eslint-plugin-react-refresh** 0.4.14 - React Refresh linting
- **eslint-plugin-jsdoc** 61.5.0 - JSDoc linting
- **Prettier** 3.4.1 - Code formatting
- **@vitejs/plugin-react** 5.1.2 - Vite React plugin
