# Frontend Guide for LLM Coding Agents

**Purpose**: Instructions for creating React components, WebGPU rendering elements, and UI patterns in this quantum visualization project.

**Read This When**: Creating UI components, WebGPU shaders/passes, or working with state management.

**Stack**: React 19 + Custom WebGPU Renderer + Zustand 5 + Tailwind CSS 4

## Component Categories

| Category | Location | Purpose |
|----------|----------|---------|
| UI Primitives | `src/components/ui/` | Reusable base components (Button, Slider, Modal, etc.) |
| Sections | `src/components/sections/` | Sidebar feature control panels |
| Layout | `src/components/layout/` | App layout, panels, top bar, drawers |
| Canvas | `src/components/canvas/` | Performance monitor, gizmos, debug overlays |
| Controls | `src/components/controls/` | Export, share buttons |
| Overlays | `src/components/overlays/` | Modals and notifications |
| Presets | `src/components/presets/` | Scene/style preset managers |

## How to Create a UI Primitive

**Template** (`src/components/ui/{Name}.tsx`):
```tsx
/**
 * {Name} Component
 * {Brief description}
 */

import React from 'react'

export interface {Name}Props {
  /** Primary prop description */
  value: string
  /** Callback description */
  onChange?: (value: string) => void
  /** Optional styling */
  className?: string
  /** Disabled state */
  disabled?: boolean
}

/**
 * {Detailed JSDoc description}
 *
 * @example
 * ```tsx
 * <{Name} value="example" onChange={handleChange} />
 * ```
 */
export function {Name}({
  value,
  onChange,
  className = '',
  disabled = false,
}: {Name}Props) {
  return (
    <div className={`glass-panel ${className}`} aria-disabled={disabled}>
      {/* Implementation */}
    </div>
  )
}
```

**Steps**:
1. Create file at `src/components/ui/{Name}.tsx`
2. Define Props interface with JSDoc comments
3. Use Tailwind for styling (prefer glass morphism utilities)
4. Export from `src/components/ui/index.ts`

## How to Create a Sidebar Section

**Location**: `src/components/sections/{Name}/`

**Template** (`{Name}Section.tsx`):
```tsx
/**
 * {Name} Section Component
 */

import { Section } from '@/components/sections/Section'
import { Slider } from '@/components/ui/Slider'
import { use{Domain}Store } from '@/stores/{domain}Store'

export interface {Name}SectionProps {
  defaultOpen?: boolean
}

export function {Name}Section({ defaultOpen = false }: {Name}SectionProps) {
  // Use individual selectors for performance
  const value = use{Domain}Store((s) => s.value)
  const setValue = use{Domain}Store((s) => s.setValue)

  return (
    <Section title="{Name}" defaultOpen={defaultOpen}>
      <div className="space-y-4">
        <Slider
          label="Value"
          min={0}
          max={100}
          value={value}
          onChange={setValue}
        />
      </div>
    </Section>
  )
}
```

## How to Create a Control Component

**Template** (`src/components/sections/{Feature}/{Name}Controls.tsx`):
```tsx
import { Slider } from '@/components/ui/Slider'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { use{Domain}Store } from '@/stores/{domain}Store'

export function {Name}Controls() {
  // Individual selectors for performance
  const value = use{Domain}Store((s) => s.value)
  const setValue = use{Domain}Store((s) => s.setValue)

  return (
    <div className="space-y-4">
      <Slider
        label="Value Label"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={setValue}
        showValue
      />
    </div>
  )
}
```

## Available UI Components

### Slider
```tsx
<Slider label="Label" min={0} max={100} step={1} value={v} onChange={set} showValue disabled={false} />
```

### Button
```tsx
<Button variant="primary" size="md" onClick={handler} disabled={false}>Text</Button>
// variants: 'primary' | 'secondary' | 'ghost'
// sizes: 'sm' | 'md' | 'lg'
```

### ToggleGroup
```tsx
<ToggleGroup
  options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]}
  value={selected}
  onChange={setSelected}
/>
```

### Select
```tsx
<Select
  label="Label"
  options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]}
  value={selected}
  onChange={setSelected}
/>
```

### Section (Collapsible)
```tsx
<Section title="Section Title" defaultOpen={true}>
  <div>Section content</div>
</Section>
```

### Other primitives
`Switch`, `Input`, `NumberInput`, `ColorPicker`, `Modal`, `ConfirmModal`, `InputModal`, `Tooltip`, `Popover`, `DropdownMenu`, `Tabs`, `Knob`, `Envelope`, `ControlGroup`, `InlineEdit`, `LoadingSpinner`

## WebGPU Rendering

For render pass templates, shader module templates, and render graph architecture, see `docs/architecture.md`.

## State Management Patterns

### Connecting Component to Store

Use individual selectors or `useShallow` for multi-value selectors. See `.claude/rules/stores.md` for correct patterns.

### Key stores

| Store | Domain | Key properties |
|-------|--------|----------------|
| `geometryStore` | Object config | `dimension` (3-11), `objectType` ('schroedinger') |
| `extendedObjectStore` | Quantum config | `schroedinger` (quantum mode, n/l/m, quality, etc.) |
| `appearanceStore` | Visual style | `colorAlgorithm`, `facesVisible`, `edgeColor` (Fresnel rim) |
| `environmentStore` | Environment | `skyboxEnabled`, `skyboxMode`, ground plane config |
| `lightingStore` | Lights | Light list, shadow settings |
| `postProcessingStore` | Effects | Bloom, cinematic tonemapping, paper texture, frame blending, AA |
| `performanceStore` | Performance | Resolution scale, temporal reprojection, progressive refinement |
| `animationStore` | Animation | `isPlaying`, `animatingPlanes`, rotation speeds |
| `rotationStore` | N-D rotation | `rotations` Map, dimension |
| `cameraStore` | Camera | Position, target, FOV |

## Tailwind Patterns

### Color Tokens (from `src/index.css` @theme)
```tsx
// Background
className="bg-app-bg"       // Main app background
className="bg-panel-bg"     // Panel background
className="bg-panel-border" // Border color as background

// Text
className="text-text-primary"   // Main text
className="text-text-secondary" // Subdued text

// Accent colors
className="text-accent-cyan"    // Cyan accent
className="bg-accent-cyan/20"   // Cyan with opacity
```

### Glass morphism utilities
```tsx
className="glass-panel"           // Panel with glass effect
className="glass-button-primary"  // Primary button with glass
className="glass-input"           // Input with glass styling
```

### Common layout patterns
```tsx
className="space-y-4"                          // Vertical stack
className="flex items-center justify-between"  // Horizontal spread
className="border border-panel-border rounded-md"  // Bordered box
className="hover:bg-panel-border transition-colors" // Interactive
className="disabled:opacity-50 disabled:cursor-not-allowed" // Disabled
```

## Tailwind CSS 4 Notes

This project uses Tailwind CSS 4 with the Vite plugin:
- **No tailwind.config.js** - Configuration in CSS via `@theme` directive
- **CSS variables for theming** - `--color-accent`, `--color-panel-bg`, etc.
- **Modern CSS features**: `clamp()`, container queries, `:has()`, native nesting, `oklch()`, `color-mix()`

## Performance Patterns

- **Memoize derived data**: `useMemo(() => expensiveTransform(data), [data])`
- **Memoize callbacks**: `useCallback((value: number) => setValue(value), [setValue])`
- **No inline objects in JSX props**: create stable references with `useMemo` or outside the component

## Hook Decision Tree

| Need to... | Create hook in... | Pattern |
|------------|-------------------|---------|
| Connect store to component | `src/hooks/use{Name}.ts` | Return store values + memoized callbacks |
| Sync multiple stores | `src/hooks/useSynced{Name}.ts` | Use useLayoutEffect |
| Handle keyboard input | `src/hooks/use{Name}.ts` | useEffect with event listeners |
| Manage progressive quality | `src/hooks/use{Name}.ts` | Track camera movement, ramp quality |
| Wrap WebGPU interaction | `src/hooks/use{Name}.ts` | Ref-based, cleanup in useEffect return |

## Common Mistakes

- **Don't**: Create components without TypeScript interfaces.
  **Do**: Define and export `{Name}Props` interface for every component.

- **Don't**: Use inline styles for layout.
  **Do**: Use Tailwind utility classes.

- **Don't**: Use arbitrary color values (hex literals).
  **Do**: Use Tailwind color tokens (`accent-cyan`, `text-primary`, etc.).

- **Don't**: Create new arrays/objects in JSX props.
  **Do**: Create stable references with `useMemo` or outside component.

- **Don't**: Forget cleanup in `useEffect`.
  **Do**: Return cleanup function for subscriptions/timers.

- **Don't**: Put business logic in components.
  **Do**: Extract to hooks, stores, or `src/lib/` modules.

- **Don't**: Skip memoization for expensive computations.
  **Do**: Always `useMemo` for derived data, `useCallback` for handlers.
