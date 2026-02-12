---
paths:
  - "src/stores/**/*.ts"
  - "src/components/**/*.tsx"
---

# Zustand Store Rules

## Selector Patterns

```tsx
// REQUIRED: Individual selectors (best performance)
const dimension = useGeometryStore((s) => s.dimension)

// REQUIRED: useShallow for multiple values
import { useShallow } from 'zustand/react/shallow'
const { dimension, objectType } = useGeometryStore(
  useShallow((s) => ({ dimension: s.dimension, objectType: s.objectType }))
)

// FORBIDDEN: Full store subscription
const { dimension } = useGeometryStore()  // triggers re-render on ANY change
```

## Store Access in WebGPU Passes

```ts
// REQUIRED: Use getStore() in pass render methods
const appearance = getStore(ctx, 'appearance')

// FORBIDDEN: Direct store imports in pass files
import { useAppearanceStore } from '...'  // never do this in passes
```

## Key Conventions

| Pattern | Detail |
|---------|--------|
| Version counters | Stores use version counters for dirty-flag render optimization |
| Preset serialization | `TRANSIENT_FIELDS` in `presetSerialization.ts` controls what gets stripped from imports/exports |
| Scale clamping | `setSchroedingerScale` clamps to `[0.1, 2.0]` |
