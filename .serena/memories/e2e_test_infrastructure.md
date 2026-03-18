# E2E Test Infrastructure

## Testability Attributes on Production Components

These attributes exist specifically for Playwright e2e tests. Do not remove them.

### Renderer State (WebGPUCanvas.tsx)
- `data-testid="webgpu-canvas"` — main render canvas element
- `data-testid="webgpu-container"` — canvas wrapper div
- `data-renderer-state="initializing|ready|error"` — on webgpu-container, reflects WebGPU init lifecycle
- `data-renderer-error="..."` — on webgpu-container (error state only), contains the error message
- `data-frame-count="N"` — on webgpu-canvas, incremented each frame by useSceneFrameLoop.ts. Written sparsely (first 10 + every 60th) to avoid DOM thrashing.

### Panel State (EditorLayout.tsx, EditorTopBar/index.tsx)
- `data-testid="left-panel"` / `data-testid="right-panel"` — panel wrapper m.div elements
- `aria-expanded` on `toggle-left-panel` button — reflects layoutStore.showLeftPanel
- `aria-expanded` on `toggle-right-panel` button — reflects right panel open state

## E2E Test Patterns

### Wait for renderer (never use waitForTimeout)
```typescript
// Wait for WebGPU init
await expect(page.locator('[data-testid="webgpu-container"][data-renderer-state="ready"]')).toBeVisible({ timeout: 15_000 })

// Wait for first frame
await page.waitForFunction(() => {
  const canvas = document.querySelector('[data-testid="webgpu-canvas"]')
  return parseInt(canvas?.getAttribute('data-frame-count') ?? '0', 10) > 0
}, { timeout: 20_000 })
```

### Check panel state
```typescript
await expect(page.getByTestId('toggle-left-panel')).toHaveAttribute('aria-expanded', 'true')
```

### Read store state from browser
```typescript
const dim = await page.evaluate(async () => {
  const mod = await import('/src/stores/geometryStore.ts')
  return mod.useGeometryStore.getState().dimension
})
// Quantum mode is on extendedObjectStore:
const qm = await page.evaluate(async () => {
  const mod = await import('/src/stores/extendedObjectStore.ts')
  return (mod.useExtendedObjectStore.getState() as any).schroedinger?.quantumMode
})
```

### Animated panels
Motion/Framer panel entrance animations cause DOM instability (element detached/reattached). Use `{ force: true }` for clicks on elements inside animated panels, or wait for a stable child.

## Key Facts
- Left panel defaults to OPEN (showLeftPanel: true in layoutStore)
- Left panel has tabs: "Type" (default), "Geometry" (has dimension selector)
- Right panel has tabs: "Object" (default, has FacesSection), "Scene" (EnvironmentSection), "System" (SettingsSection)
- MIN_DIMENSION = 2, MAX_DIMENSION = 11
- Quantum mode store path: extendedObjectStore → schroedinger.quantumMode
- Dimension store path: geometryStore → dimension
- Run e2e with `--workers=1` locally to avoid GPU contention

## Spec Files (scripts/playwright/)
- `app-loads.spec.ts` — smoke: loads, canvas visible, no fatal GPU errors
- `panels.spec.ts` — panel toggle via aria-expanded
- `keyboard.spec.ts` — arrow keys dimension, C cinematic, ? shortcuts
- `rendering.spec.ts` — all quantum modes render frames + pixels (skips if no GPU)
- `screenshot-export.spec.ts` — File > Export → preview → crop → download
- `url-state.spec.ts` — URL params → store, reload, invalid params
