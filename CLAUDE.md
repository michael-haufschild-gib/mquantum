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

**Use custom UI component library**: `src/components/ui`: Do not use default html controls. Use the custom components of this project.

**Integrate UI components into theming solution**: Do not hardcode styles, always use the theme.

**Leverage useShallow**: Leverage useShallow and Zustand 5 to improve performance.

=== END CIB-001 ===

## FOLDER USAGE RULES

| Activity | Required Directory | Agent Enforcement |
| --- | --- | --- |
| Browser automation (Playwright/Puppeteer runners, recorders) | `scripts/playwright/` | Keep every `.js`/`.mjs` harness here. Subfolders allowed, but **never** place these scripts in the repo root. |
| Physics, RNG, or analytics utilities | `scripts/tools/` | Import from `../../src` or `../../dist` as needed. No tooling lives in the project root. |
| Visual artifacts (screenshots, videos, GIFs) | `screenshots/` | Always persist captured assets here. Create nested folders like `screenshots/quality-test/` or `screenshots/videos/` to stay organized. |
| Documentation, research notes | `docs/` | Long-form analysis belongs in this directory instead of new markdown files at the root. |
| Temporary experiments / sandboxes | `src/dev-tools/` | Use this workspace for throwaway UI/physics spikes and clean it up after. |
| 🚫 Forbidden | Project root | Keep root pristine—no scripts, screenshots, or scratch docs. |

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
- **Motion** 12.23.26 - Animation library

### State Management & Utilities
- **Zustand** 5.0.2 - State management
- **convex-hull** 1.0.3 - Computational geometry

### Testing
- **vitest** 4.0.15 - Unit testing framework
- **happy-dom** 15.11.7 - DOM implementation for testing
- **playwright** 1.57.0 - E2E testing framework

### Development Tools
- **ESLint** 9.15.0 - Code linting
- **@typescript-eslint/parser** 8.15.0 - TypeScript ESLint parser
- **@typescript-eslint/eslint-plugin** 8.15.0 - TypeScript linting rules
- **eslint-plugin-react-hooks** 5.0.0 - React Hooks linting
- **eslint-plugin-react-refresh** 0.4.14 - React Refresh linting
- **eslint-plugin-jsdoc** 61.5.0 - JSDoc linting
- **Prettier** 3.4.1 - Code formatting
- **@vitejs/plugin-react** 5.1.2 - Vite React plugin

