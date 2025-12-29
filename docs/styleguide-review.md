# Styleguide Compliance Review

**Date:** 2025-12-29
**Reviewed Against:** `docs/meta/styleguide.md`

---

## Executive Summary

| Category | Status | Violations | Priority |
|----------|--------|------------|----------|
| WebGL2/GLSL ES 3.00 | PASS | 0 | - |
| Modern CSS (Logical Properties) | FAIL | 40+ | High |
| State Management (useShallow) | FAIL | 15+ | High |
| Import Patterns | FAIL | 10 | Medium |
| JSDoc Documentation | FAIL | 15 | Medium |
| Three.js DPR/Viewport | FAIL | 2 | Low |

---

## 1. Modern CSS Violations - Physical Properties

**Requirement:** Use logical properties (`margin-inline`, `padding-block`, `inset-inline-start`) instead of physical properties (`margin-left`, `padding-top`, `left`).

**Reference:** `docs/meta/styleguide.md` → "Modern CSS Standard (2025 Baseline)" → "Logical Properties"

### 1.1 src/components/ui/Slider.tsx

| Line | Violation | Fix |
|------|-----------|-----|
| 180 | `ml-2` | `ms-2` |
| 194 | `pl-1.5` | `ps-1.5` |
| 200 | `pr-7`, `pr-1.5` | `pe-7`, `pe-1.5` |
| 204 | `right-1.5` | `end-1.5` or inline style `insetInlineEnd` |

### 1.2 src/components/ui/Tabs.tsx

| Line | Violation | Fix |
|------|-----------|-----|
| 200 | `pb-[1px]` | `pb-[1px]` is acceptable for block-end, but consider `border-b` → `border-block-end` |
| 215 | `left-0`, `top-0`, `bottom-0` | `start-0`, `inset-block-0` |
| 260 | `bottom-[-1px]`, `left-0`, `right-0` | `inset-block-end-[-1px]`, `inset-inline-0` |
| 279 | `right-0`, `top-0`, `bottom-0` | `end-0`, `inset-block-0` |

### 1.3 src/components/ui/Select.tsx

| Line | Violation | Fix |
|------|-----------|-----|
| 44 | `pl-3`, `pr-8` | `ps-3`, `pe-8` |
| 52 | `right-2.5`, `top-1/2` | `end-2.5`, use logical positioning |

### 1.4 src/components/ui/ControlGroup.tsx

| Line | Violation | Fix |
|------|-----------|-----|
| 45 | `pb-2`, `border-b` | Consider `pb-2` → block-end, `border-b` → `border-block-end` |
| 94 | `pt-2`, `ml-1`, `pl-2`, `border-l` | `pt-2` → block-start, `ms-1`, `ps-2`, `border-inline-start` |

### 1.5 src/components/ui/Input.tsx

| Line | Violation | Fix |
|------|-----------|-----|
| 32 | `left-3` | `start-3` |
| 44 | `pl-9` | `ps-9` |
| 45 | `pr-9` | `pe-9` |

### 1.6 src/contexts/ToastContext.tsx

| Line | Violation | Fix |
|------|-----------|-----|
| 33 | `bottom-6`, `right-6` | `inset-block-end-6`, `inset-inline-end-6` or `end-6` |
| 79 | `bottom-0`, `left-0` | `inset-block-end-0`, `inset-inline-start-0` |

### 1.7 src/components/overlays/CropEditor.tsx

| Line | Violation | Fix |
|------|-----------|-----|
| 223-226 | Handle definitions with `-top-1`, `-left-1`, `-right-1`, `-bottom-1` | Use logical equivalents: `-inset-block-start-1`, `-inset-inline-start-1`, etc. |
| 223-226 | `border-t-4`, `border-l-4`, `border-r-4`, `border-b-4` | `border-block-start-4`, `border-inline-start-4`, etc. |
| 281-287 | Inline styles: `left`, `top`, `right`, `bottom` | Use `insetInlineStart`, `insetBlockStart`, etc. |
| 312-315 | `left-1/3`, `top-0`, `bottom-0`, `right-1/3` | `start-1/3`, `inset-block-0`, `end-1/3` |
| 318-319 | `left-1/2`, `top-1/2` | `start-1/2`, logical positioning |

### 1.8 src/components/ui/ColorPicker.tsx

| Line | Violation | Fix |
|------|-----------|-----|
| 289 | Inline `style={{ left: \`${hsv.h * 100}%\` }}` | Use `insetInlineStart` |
| 302 | Inline `style={{ left: \`${hsv.a * 100}%\` }}` | Use `insetInlineStart` |

### 1.9 src/components/sections/Advanced/AdvancedObjectControls.tsx

**Pattern violations throughout file:**
- `pb-4`, `pt-3`, `pl-2`, `ml-1` → Use `pb-4` (block-end ok), `pt-3` (block-start ok), `ps-2`, `ms-1`
- `border-t`, `border-l` → `border-block-start`, `border-inline-start`

### 1.10 src/components/layout/EditorTopBar.tsx

| Line | Violation | Fix |
|------|-----------|-----|
| 150 | `style.setProperty('--left-edge', ...)` | Rename CSS variable to `--inline-start-edge` and update downstream usage |

---

## 2. State Management Violations - Missing useShallow

**Requirement:** Use `useShallow` when subscribing to multiple properties from Zustand stores to prevent unnecessary re-renders.

**Reference:** `docs/meta/styleguide.md` → CIB-002 → "Leverage useShallow"

### Pattern to Fix

**Current (Wrong):**
```typescript
const prop1 = useStore((state) => state.prop1);
const prop2 = useStore((state) => state.prop2);
const action1 = useStore((state) => state.action1);
```

**Required (Correct):**
```typescript
import { useShallow } from 'zustand/react/shallow';

const { prop1, prop2, action1 } = useStore(
  useShallow((state) => ({
    prop1: state.prop1,
    prop2: state.prop2,
    action1: state.action1,
  }))
);
```

### 2.1 src/components/sections/Settings/SettingsSection.tsx

| Lines | Store | Properties to Combine |
|-------|-------|----------------------|
| 39-42 | `useUIStore` | `showAxisHelper`, `setShowAxisHelper`, `maxFps`, `setMaxFps` |
| 43-44 | `usePerformanceStore` | `renderResolutionScale`, `setRenderResolutionScale` |

### 2.2 src/components/sections/ControlPanel.tsx

| Lines | Store | Properties to Combine |
|-------|-------|----------------------|
| 43-45 | `useLayoutStore` | `isCollapsed`, `toggleCollapsed`, `sidebarWidth` |

### 2.3 src/components/sections/Performance/ProgressiveRefinementControls.tsx

| Lines | Store | Properties to Combine |
|-------|-------|----------------------|
| 36-41 | `usePerformanceStore` | `progressiveRefinementEnabled`, `setProgressiveRefinementEnabled`, `refinementStage`, `refinementProgress` |

### 2.4 src/components/sections/Performance/TemporalReprojectionControls.tsx

| Lines | Store | Properties to Combine |
|-------|-------|----------------------|
| 16-18 | `usePerformanceStore` | `temporalReprojectionEnabled`, `setTemporalReprojectionEnabled` |

### 2.5 src/components/sections/Performance/FractalAnimationQualityControls.tsx

| Lines | Store | Properties to Combine |
|-------|-------|----------------------|
| 17-18 | `usePerformanceStore` | `fractalAnimationLowQuality`, `setFractalAnimationLowQuality` |

### 2.6 src/components/canvas/RefinementIndicator.tsx

| Lines | Store | Properties to Combine |
|-------|-------|----------------------|
| 29-32 | `usePerformanceStore` | `progressiveRefinementEnabled`, `refinementStage`, `refinementProgress`, `isInteracting` |

### 2.7 src/components/ui/GlobalProgress.tsx

| Lines | Store | Properties to Combine |
|-------|-------|----------------------|
| 7-8 | `usePerformanceStore` | `sceneTransitioning`, `refinementProgress` |

### 2.8 src/components/overlays/ShaderCompilationOverlay.tsx

| Lines | Store | Properties to Combine |
|-------|-------|----------------------|
| 53-54 | `usePerformanceStore` | `isShaderCompiling`, `shaderCompilationMessage` |

### 2.9 src/components/layout/TimelineControls.tsx

| Lines | Store | Properties to Combine |
|-------|-------|----------------------|
| 52-53 | `useUIStore` | `animationBias`, `setAnimationBias` |

### 2.10 src/components/layout/ResizeHandle.tsx

| Lines | Store | Properties to Combine |
|-------|-------|----------------------|
| 41-42 | `useLayoutStore` | `setSidebarWidth`, `sidebarWidth` |

### 2.11 src/components/canvas/PerformanceMonitor.tsx

| Lines | Store | Properties to Combine |
|-------|-------|----------------------|
| 436-438, 534 | `usePerformanceStore` | `shaderDebugInfos`, `shaderOverrides`, `toggleShaderModule`, `temporalReprojectionEnabled`, and others |

### 2.12 src/components/overlays/export/ExportGeneralTab.tsx

| Line | Store | Properties to Combine |
|------|-------|----------------------|
| 14 | `useLayoutStore` | `setCinematicMode` (single, but should follow pattern) |

### 2.13 src/components/overlays/CropEditor.tsx

| Line | Store | Properties to Combine |
|------|-------|----------------------|
| 19 | `useLayoutStore` | `setCinematicMode` |

### 2.14 src/components/layout/ShortcutsOverlay.tsx

| Line | Store | Properties to Combine |
|------|-------|----------------------|
| 9 | Multiple stores | Review and combine related subscriptions |

### 2.15 src/components/layout/EditorTopBar.tsx

| Lines | Store | Properties to Combine |
|-------|-------|----------------------|
| 50, 124 | `useLayoutStore`, `useUIStore` | Combine related subscriptions |

---

## 3. Import Pattern Violations - Barrel Imports

**Requirement:** Use direct file imports instead of barrel imports (index.ts re-exports).

**Reference:** `docs/meta/styleguide.md` → "Architectural Conventions" → "Import Patterns"

### 3.1 src/components/sections/Environment/SkyboxControls.tsx

| Line | Current Import | Should Be |
|------|----------------|-----------|
| 21 | `} from './skybox'` | Import each component directly from its file |

**Components imported via barrel:**
- `AuroraControls` → `'./skybox/AuroraControls'`
- `HorizonControls` → `'./skybox/HorizonControls'`
- `OceanControls` → `'./skybox/OceanControls'`
- `SkyboxSharedClassicControls` → `'./skybox/SkyboxSharedClassicControls'`
- `SkyboxSharedProceduralControls` → `'./skybox/SkyboxSharedProceduralControls'`
- `StarfieldControls` → `'./skybox/StarfieldControls'`

### 3.2 Files Using `@/stores` Barrel Instead of Direct Imports

| File | Line | Current | Should Be |
|------|------|---------|-----------|
| `src/hooks/useProgressiveRefinement.ts` | 6, 12 | `from '@/stores'` | `from '@/stores/performanceStore'` |
| `src/hooks/useInteractionState.ts` | 7 | `from '@/stores'` | `from '@/stores/performanceStore'` |
| `src/rendering/core/TemporalDepthState.ts` | 12 | `from '@/stores'` | `from '@/stores/performanceStore'` |
| `src/components/sections/Performance/TemporalReprojectionControls.tsx` | 7 | `from '@/stores'` | `from '@/stores/performanceStore'` |
| `src/components/sections/Performance/ProgressiveRefinementControls.tsx` | 7 | `from '@/stores'` | `from '@/stores/performanceStore'` |
| `src/components/sections/Performance/FractalAnimationQualityControls.tsx` | 7 | `from '@/stores'` | `from '@/stores/performanceStore'` |
| `src/components/canvas/RefinementIndicator.tsx` | 6 | `from '@/stores'` | `from '@/stores/performanceStore'` |

### 3.3 Test Files with Same Issue

| File | Line | Current | Should Be |
|------|------|---------|-----------|
| `src/tests/components/canvas/RefinementIndicator.test.tsx` | 4 | `from '@/stores'` | `from '@/stores/performanceStore'` |
| `src/tests/hooks/useInteractionState.test.tsx` | 3 | `from '@/stores'` | `from '@/stores/performanceStore'` |
| `src/tests/lib/rendering/TemporalDepthManager.test.ts` | 6 | `from '@/stores'` | `from '@/stores/performanceStore'` |

---

## 4. JSDoc Documentation Violations

**Requirement:** 100% JSDoc coverage for exported components and hooks.

**Reference:** `docs/meta/styleguide.md` → "Documentation Standards"

### 4.1 Missing JSDoc Entirely (Critical)

| File | Export | What to Document |
|------|--------|------------------|
| `src/components/ui/Popover.tsx:15` | `Popover` | Component description, @param for props, @returns, @example |
| `src/components/ui/Select.tsx:18` | `Select` | Component description, @param for props, @returns, @example |
| `src/components/ui/ToggleGroup.tsx:21` | `ToggleGroup` | Component description, @param for props, @returns, @example |
| `src/components/layout/CanvasContextMenu.tsx:17` | `CanvasContextMenu` | Component description, @param for props, @returns |
| `src/hooks/useKonamiCode.ts:7` | `useKonamiCode` | Hook description, @param, @returns, side effects |
| `src/hooks/useDynamicFavicon.ts:4` | `useDynamicFavicon` | Hook description, @param, @returns, side effects |

### 4.2 Missing @returns Documentation (Important)

| File | Export | What to Add |
|------|--------|-------------|
| `src/components/sections/ControlPanel.tsx:24-36` | `ControlPanel` | Add @returns describing rendered output |
| `src/hooks/usePanelCollision.ts:26` | `usePanelCollision` | Add @returns with return type description |
| `src/hooks/useTransformedVertices.ts:15` | `useTransformedVertices` | Add @returns describing vertex array |
| `src/hooks/useSmoothResizing.ts:27` | `useSmoothResizing` | Add @returns describing return object |
| `src/hooks/useViewportOffset.ts:20` | `useViewportOffset` | Add @returns describing offset values |

### 4.3 Class/Public Methods Missing Documentation

| File | Export | What to Document |
|------|--------|------------------|
| `src/lib/audio/SoundManager.ts:12` | `SoundManager` class | Add class-level JSDoc |
| `src/lib/audio/SoundManager.ts:41` | `playClick()` | Add method JSDoc |
| `src/lib/audio/SoundManager.ts:51` | `playHover()` | Add method JSDoc |

---

## 5. Three.js DPR/Viewport Violations

**Requirement:** Fullscreen quad shaders rendered manually (not via ShaderPass) with PlaneGeometry(2, 2) must use direct NDC coordinates, not camera matrices.

**Reference:** `docs/meta/styleguide.md` → CIB-002 → "CRITICAL THREE.JS DPR/VIEWPORT GOTCHA"

### 5.1 src/rendering/graph/passes/BloomPass.ts

| Line | Violation | Fix |
|------|-----------|-----|
| 46 | `gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);` | Change to `gl_Position = vec4(position.xy, 0.0, 1.0);` for fullscreen quad |

**Context:** The `luminosityHighPassShader` is used for fullscreen bloom threshold detection. If it renders to a PlaneGeometry(2,2), it should use direct NDC.

### 5.2 src/rendering/graph/passes/NormalPass.ts

| Line | Violation | Fix |
|------|-----------|-----|
| 97 | `gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);` | If this is a fullscreen quad pass, change to `gl_Position = vec4(position.xy, 0.0, 1.0);` |

**Context:** Verify if this is rendering a fullscreen quad or actual geometry. If fullscreen quad, use direct NDC.

### Reference Implementation

See `src/rendering/graph/passes/ToScreenPass.ts:137` for correct pattern:
```glsl
gl_Position = vec4(position.xy, 0.0, 1.0);
```

---

## Appendix: Files with Good Patterns to Reference

### Correct useShallow Usage
- `src/hooks/useDeviceCapabilities.ts`
- `src/components/overlays/ExportModal.tsx`
- `src/components/layout/TopBarControls.tsx`

### Correct Direct Imports
- Most files in `src/components/layout/TimelineControls/` use direct imports

### Correct JSDoc Documentation
- `src/hooks/useAnimationLoop.ts`
- `src/hooks/useToast.ts`
- `src/hooks/useGeometryGenerator.ts`
- `src/lib/math/vector.ts`
- `src/lib/math/matrix.ts`

### Correct Fullscreen Quad Shader
- `src/rendering/graph/passes/ToScreenPass.ts:137`
