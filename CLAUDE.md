=== CRITICAL INSTRUCTION BLOCK (CIB-001)===

## MANDATORY TOOLS

### For Complex Tasks (research, analysis, debugging)
```
USE: mcp__mcp_docker__sequentialthinking
WHEN: Multi-step problems, research, complex reasoning
WHY: Prevents cognitive overload, ensures systematic approach
```

### For Task Management
```
USE: TodoWrite
WHEN: Any task with 3+ steps
WHY: Tracks progress, maintains focus
```

### For Research and Validation of Solutions
```
USE: WebSearch
WHEN: Any non-trivial debugging, planning, solution design task
WHY: Offers quick access to best practices and solutions
```

=== END CIB-001 ===

=== CRITICAL CODE STYLE INSTRUCTION BLOCK (CIB-002)===

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

## MANDATORY TESTING RULES
1. Write unit tests in the style of Roy Osherove's "Art of Unit Testing" principles.
2. READABLE: Tests should be easy to understand at a glance
3. MAINTAINABLE: Tests should be easy to change without breaking others
4. TRUSTWORTHY - Tests should be reliable and deterministic
5. MEANINGFUL - NEVER test for trivial things like default values

=== END CIB-002 ===

## MANDATORY EXECUTION PROTOCOL
1. Always complete all tasks fully. Do not simplify approaches, do not skip tasks.
2. Always keep tests up to date and maintain 100% test coverage.
3. Always test. 100% of tests must pass.
4. Always fix bugs. Never changes tests only to make them pass if the cause is in the code it is testing.
5. Never run Vitest in watch mode; automation must use `npm test`. Only set `ALLOW_VITEST_WATCH=1` when a human explicitly authorizes interactive debugging.
6. **CRITICAL**: After implementing new functionality, ALWAYS create comprehensive tests:
   - Unit tests for logic and components (Vitest)
   - Integration tests for game flow
   - Playwright tests for frontend functionality (must visually confirm UI works)
   - All tests must be in `src/tests/` or `scripts/playwright/`
   - Run ALL tests before considering task complete
   - Maintain 100% test coverage - no exceptions

## TEST MEMORY MANAGEMENT

**CRITICAL**: The test suite previously caused memory exhaustion by spawning 13 workers consuming 9GB+ RAM. This has been fixed but requires vigilance.

### Configuration Safeguards (DO NOT MODIFY without review)
- `maxWorkers: 4` in `vitest.config.ts` - Prevents excessive process spawning
- `pool: 'threads'` - Uses memory-efficient threading instead of forks
- `environment: 'happy-dom'` - Fast DOM implementation for all tests

### Before Changing Test Configuration
1. **VERIFY**: Worker count stays ≤ 4, total memory < 2GB
2. **DOCUMENT**: Update guide if making configuration changes

### Writing Memory-Safe Tests
- **DON'T**: Generate 1000+ data points in a single test without batching
- **DO**: Process in batches of 100 and clear arrays between batches
- **DON'T**: Rely on DOM for pure logic tests if not needed (keep them simple)
- **DO**: Use component tests (`.test.tsx`) only for UI components
- **DON'T**: Forget to cleanup timers/listeners in afterEach
- **DO**: Call `cleanup()` from @testing-library/react in test teardown

### Emergency Response
If system becomes unresponsive during tests:
```bash
killall -9 node  # Force kill all Node processes
node scripts/cleanup-vitest.mjs  # Clean up lingering workers
```
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

## MANDATORY DOCUMENT READS
- Project architecture and folder structure: `docs/architecture.md`
- Development environment: `docs/testing.md`
- Testing setup: `docs/testing.md`
- Frontend setup: `docs/frontend.md`
- Understanding math used for object creation, transformation and projection: `docs/research/nd-dimensional-react-threejs-guide.md`
