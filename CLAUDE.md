=== CRITICAL CODE STYLE INSTRUCTION BLOCK (CIB-000)===
## KEEP THE BIG PICTURE IN MIND
This is a scientific research project for my PHD thesis. Students will use this project to study multi-dimensional objects, fractals and physics. It is very important for my work and my career, we have to do it in steps, carefully , without mistakes and rush. Avoid hallucinations. Don't jump into coding without first researching. Don't patch bugs reactively. Use WebSearch extensively. Understand the purpose of code before changing it.

## CHECK WEBGL BEFORE WORKING ON WEBGPU
WebGL is working perfectly. WebGPU is supposed to give the user the option to use WebGPU rendering instead of WebGL without losing any functionality, configuration options, visual quality. Always check first how WebGL is doing it before working on a WebGPU feature.

=== END CIB-000 ===


=== CRITICAL CODE STYLE INSTRUCTION BLOCK (CIB-001)===

## MANDATORY DOCUMENT READS
Read at the start of a new session:
- Project architecture and folder structure: `docs/architecture.md`
- Development environment: `docs/testing.md`
- Testing setup: `docs/testing.md`
- Frontend setup: `docs/frontend.md`
- Understanding math used for object creation, transformation and projection: `docs/research/nd-dimensional-react-threejs-guide.md`

## MANDATORY CODE STYLE AND ARCHITECTURE RULES
Coding agents must follow `docs/meta/styleguide.md` - No exceptions!

**All shaders MUST use WebGL2 and GLSL ES 3.00 syntax.** This is a mandatory requirement with no exceptions.

*** Required GLSL ES 3.00 Syntax ***

| WebGL1 (Forbidden) | WebGL2 (Required) |
|-------------------|-------------------|
| `attribute` | `in` (vertex shader) |
| `varying` (vertex) | `out` |
| `varying` (fragment) | `in` |
| `gl_FragColor` | `layout(location = N) out vec4 varName;` |
| `texture2D()` | `texture()` |
| `textureCube()` | `texture()` |

**CRITICAL THREE.JS DPR/VIEWPORT GOTCHA**: When rendering to WebGLRenderTarget at non-standard resolutions, NEVER use `gl.setViewport()`. It internally multiplies by device pixel ratio (DPR), causing incorrect rendering on high-DPI displays.

```typescript
// ✗ WRONG - DPR multiplication breaks non-standard resolution targets
gl.setRenderTarget(target);
gl.setViewport(0, 0, target.width, target.height);

// ✓ CORRECT - exact pixel values, no DPR multiplication
target.viewport.set(0, 0, target.width, target.height);
gl.setRenderTarget(target);
```

For fullscreen quad shaders rendered manually (not via ShaderPass), use direct NDC coordinates:
```glsl
// ✗ WRONG - camera matrices affected by DPR
gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

// ✓ CORRECT - direct NDC for PlaneGeometry(2, 2)
gl_Position = vec4(position.xy, 0.0, 1.0);
```
**Leverage useShallow**: Leverage useShallow and Zustand 5 to improve performance.

=== END CIB-001 ===

## TECH STACK

### Core Framework
- **React** 19.2.3 - UI library
- **TypeScript** 5.6.3 - Type-safe JavaScript
- **Vite** 7.2.7 - Build tool and dev server

### 3D Graphics & Rendering
- **Three.js** 0.181.0 - WebGL 3D library
- **@react-three/fiber** 9.4.2 - React renderer for Three.js
- **@react-three/drei** 10.7.7 - Three.js utilities
- **@react-three/postprocessing** 3.0.4 - Post-processing effects
- **postprocessing** 6.38.0 - Post-processing library

### UI & Styling
- **Tailwind CSS** 4.1.18 - Utility-first CSS framework
- **@tailwindcss/vite** 4.1.18 - Vite plugin for Tailwind

### State Management & Utilities
- **Zustand** 5.0.2 - State management

### Testing
- **vitest** 4.0.15 - Unit testing framework
- **happy-dom** 15.11.7 - DOM implementation for testing

### Development Tools
- **ESLint** 9.15.0 - Code linting
- **@typescript-eslint/parser** 8.15.0 - TypeScript ESLint parser
- **@typescript-eslint/eslint-plugin** 8.15.0 - TypeScript linting rules
- **eslint-plugin-react-hooks** 5.0.0 - React Hooks linting
- **eslint-plugin-react-refresh** 0.4.14 - React Refresh linting
- **eslint-plugin-jsdoc** 61.5.0 - JSDoc linting
- **Prettier** 3.4.1 - Code formatting
- **@vitejs/plugin-react** 5.1.2 - Vite React plugin

