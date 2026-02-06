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
- **WGSL shaders**: `name.wgsl.ts` (TypeScript exporting template literal strings)
- **Tests**: `*.test.ts` or `*.test.tsx`
- **Playwright**: `*.spec.ts`

## WebGPU / WGSL (MANDATORY)

All GPU shaders use WGSL. There is no GLSL/WebGL in this project.

- Shaders are `.wgsl.ts` files exporting template literal strings
- Composition via `composeWGSL()` from `src/rendering/webgpu/shaders/shared/compose-helpers.ts`
- Entry points must be named `main` (matches `WebGPUBasePass.createFullscreenPipeline()`)
- Maximum 4 bind groups (0-3)
- All `textureSample` calls must be in uniform control flow
- Depth/unfilterable textures use `textureLoad`, not `textureSample`

## Zustand State Management

```typescript
// CORRECT: Individual selectors
const dimension = useGeometryStore((s) => s.dimension);
const setDimension = useGeometryStore((s) => s.setDimension);

// CORRECT: useShallow for multiple values
const uiSelector = useShallow((s: ...) => ({
  isOpen: s.isOpen,
  setOpen: s.setOpen,
}));
const { isOpen, setOpen } = useUIStore(uiSelector);

// WRONG: Full store subscription
const { dimension, setDimension } = useGeometryStore();

// WRONG: useShallow inside hook call
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
| Physical properties (`margin-left`) | Logical properties (`margin-inline-start`) |
| Hex/RGB for design colors | `oklch()` for perceptual uniformity |

## JSDoc Documentation

All exported components, hooks, and public APIs require JSDoc with:
- Brief description
- `@param` for each parameter
- `@returns` description
- `@example` usage

## Import Patterns

Prefer **direct file imports** over barrel exports:

```typescript
// Good: Direct imports
import { AnimationSection } from './Animation/AnimationSection'

// Avoid: Barrel imports
import { AnimationSection } from './Animation'
```
