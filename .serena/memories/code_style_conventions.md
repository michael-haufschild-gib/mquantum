# Code Style & Conventions

## TypeScript

- **Strict mode enabled**: No implicit `any`, strict null checks
- **No `any` types**: Use proper typing, generics, discriminated unions
- **Path aliases**: Always use `@/` imports (`@/components`, `@/stores`, `@/lib`)

## File Naming

- **Components**: `PascalCase.tsx`
- **Hooks**: `useCamelCase.ts`
- **Stores**: `camelCaseStore.ts`
- **Slices**: `*Slice.ts`
- **Tests**: `*.test.ts` or `*.test.tsx`
- **Playwright**: `*.spec.ts`

## WebGL2 / GLSL ES 3.00 (MANDATORY)

All shaders MUST use WebGL2 syntax. WebGL1 is forbidden.

| WebGL1 (Forbidden) | WebGL2 (Required) |
|-------------------|-------------------|
| `attribute` | `in` (vertex shader) |
| `varying` (vertex) | `out` |
| `varying` (fragment) | `in` |
| `gl_FragColor` | `layout(location = N) out vec4 varName;` |
| `texture2D()` | `texture()` |
| `textureCube()` | `texture()` |

```typescript
// Three.js ShaderMaterial
const material = new THREE.ShaderMaterial({
  glslVersion: THREE.GLSL3,  // REQUIRED
  vertexShader: ...,
  fragmentShader: ...
});
```

## Zustand State Management

```typescript
// ✅ CORRECT: Individual selectors
const dimension = useGeometryStore((s) => s.dimension);
const setDimension = useGeometryStore((s) => s.setDimension);

// ✅ CORRECT: useShallow for multiple values
const uiSelector = useShallow((s: ...) => ({
  isOpen: s.isOpen,
  setOpen: s.setOpen,
}));
const { isOpen, setOpen } = useUIStore(uiSelector);

// ❌ WRONG: Full store subscription
const { dimension, setDimension } = useGeometryStore();

// ❌ WRONG: useShallow inside hook call
const { isOpen } = useUIStore(useShallow((s) => ({ isOpen: s.isOpen })));
```

## UI Components

- **Always use** `src/components/ui/*` primitives (Button, Slider, Select, etc.)
- **Never use** raw `<input>`, `<select>`, `<button>` with custom styling
- **Use Tailwind tokens** from `src/index.css` (`@theme` variables)
- **Premium utilities**: `glass-panel`, `glass-button-primary`, `glass-input`

## Modern CSS (2025 Baseline)

| Forbidden | Required |
|-----------|----------|
| Media queries for fluid typography | `clamp(min, preferred, max)` |
| Media queries for component layouts | Container queries `@container` |
| JavaScript for parent styling | `:has()` pseudo-class |
| Padding hack for aspect ratio | `aspect-ratio: width / height` |
| Physical properties (`margin-left`) | Logical properties (`margin-inline-start`) |
| Hex/RGB for design colors | `oklch()` for perceptual uniformity |

## Three.js DPR/Viewport Gotcha

```typescript
// ❌ WRONG - DPR multiplication breaks non-standard resolution targets
gl.setRenderTarget(target);
gl.setViewport(0, 0, target.width, target.height);

// ✅ CORRECT - exact pixel values, no DPR multiplication
target.viewport.set(0, 0, target.width, target.height);
gl.setRenderTarget(target);
```

## JSDoc Documentation

All exported components, hooks, and public APIs require JSDoc with:
- Brief description
- `@param` for each parameter
- `@returns` description
- `@example` usage

## Import Patterns

Prefer **direct file imports** over barrel exports:

```typescript
// ✅ Good: Direct imports
import { AnimationSection } from './Animation/AnimationSection'

// ❌ Avoid: Barrel imports
import { AnimationSection } from './Animation'
```
