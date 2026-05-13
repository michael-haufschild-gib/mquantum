# Frontend Guide for LLM Coding Agents

**Purpose**: UI patterns, component library, and state management conventions.
**Read This When**: Building UI features, adding controls, or wiring stores to components.
**Stack**: React 19 + Zustand 5 + Tailwind CSS 4 + Motion 12

## Component Library (`src/components/ui/`)

Use these primitives. Never use raw HTML `<input>`, `<select>`, `<button>`.

| Component | File | Purpose |
|-----------|------|---------|
| `Button` | `Button.tsx` | All buttons |
| `Slider` | `Slider.tsx` | Numeric ranges |
| `NumberInput` | `NumberInput.tsx` | Numeric text input |
| `Select` | `Select.tsx` | Dropdowns |
| `Switch` | `Switch.tsx` | Boolean toggles |
| `ToggleButton` | `ToggleButton.tsx` | On/off buttons |
| `ToggleGroup` | `ToggleGroup.tsx` | Mutually exclusive options |
| `MultiToggleGroup` | `MultiToggleGroup.tsx` | Multi-select toggle |
| `Input` | `Input.tsx` | Text input |
| `InlineEdit` | `InlineEdit.tsx` | Editable text |
| `Modal` | `Modal.tsx` | Modal dialogs |
| `ConfirmModal` | `ConfirmModal.tsx` | Confirmation dialogs |
| `InputModal` | `InputModal.tsx` | Input-collecting modals |
| `Tooltip` | `Tooltip.tsx` | Hover tooltips |
| `Popover` | `Popover.tsx` | Click popovers |
| `DropdownMenu` | `DropdownMenu.tsx` | Context/dropdown menus |
| `Tabs` | `Tabs.tsx` | Tabbed content |
| `ColorPicker` | `ColorPicker.tsx` | Color selection |
| `Knob` | `Knob.tsx` | Rotary knob control |
| `Envelope` | `Envelope.tsx` | ADSR envelope control |
| `Sparkline` | `Sparkline.tsx` | Inline charts |
| `Icon` | `Icon.tsx` | Icon wrapper |
| `ControlGroup` | `ControlGroup.tsx` | Grouping control rows |
| `Section` | `sections/Section.tsx` | Collapsible sidebar section |
| `LoadingSpinner` | `LoadingSpinner.tsx` | Loading indicator |
| `GlobalProgress` | `GlobalProgress.tsx` | Progress bar |
| `ErrorBoundary` | `ErrorBoundary.tsx` | Error boundary |

## Sidebar Sections

Each sidebar section lives in `src/components/sections/{Name}/`. The control panel (`ControlPanel.tsx`) aggregates them.

Existing sections: Advanced, Environment, Export, Faces, Geometry, Lights, ObjectTypes, Performance, PostProcessing, RenderMode, Settings, Shortcuts, Test.

## State Management Pattern

### Reading state in components

```tsx
import { useShallow } from 'zustand/react/shallow'
import { useAppearanceStore } from '@/stores/scene/appearanceStore'

// Single value — individual selector
const opacity = useAppearanceStore((s) => s.opacity)

// Multiple values — useShallow
const { opacity, setOpacity } = useAppearanceStore(
  useShallow((s) => ({ opacity: s.opacity, setOpacity: s.setOpacity }))
)
```

### Reading state in render passes

```typescript
// REQUIRED in WebGPU passes:
const appearance = getStore(ctx, 'appearance')

// FORBIDDEN in WebGPU passes:
import { useAppearanceStore } from '@/stores/scene/appearanceStore'
```

## Stores Reference

Stores are grouped by purpose. Import path: `@/stores/{group}/{name}Store`.

| Store | Group | Domain |
|-------|-------|--------|
| `geometryStore` | scene | Dimensions, object type |
| `appearanceStore` | scene | Visual appearance |
| `animationStore` | scene | Animation state |
| `cameraStore` | scene | Camera position/target |
| `lightingStore` | scene | Light sources |
| `postProcessingStore` | scene | Bloom, SSAO, SSR, etc. |
| `environmentStore` | scene | Skybox, ground plane |
| `rotationStore` | scene | N-dimensional rotation |
| `transformStore` | scene | Object transforms |
| `pbrStore` | scene | PBR material settings |
| `extendedObjectStore` | scene | Object-specific extended state |
| `uiStore` | ui | UI state (panels, dialogs) |
| `themeStore` | ui | Theme/accent colors |
| `layoutStore` | ui | Panel layout state |
| `dropdownStore` | ui | Dropdown coordination |
| `dismissedDialogsStore` | ui | Dismissed-dialog memory |
| `msgBoxStore` | ui | Message box state |
| `rendererStore` | runtime | Render quality, resolution |
| `performanceStore` | runtime | GPU tier, quality presets |
| `exportStore` | runtime | Screenshot/video export |
| `screenshotStore` | runtime | Screenshot settings |
| `screenshotCaptureStore` | runtime | Screenshot capture coordination |
| `presetManagerStore` | runtime | Scene/style preset management |
| `simulationStateStore` | runtime | Simulation state save/load |
| `diagnosticsStore`, `performanceMetricsStore`, `measurementStore`, `coordinateEntanglementStore`, `wavefunctionSliceStore`, `srmtDiagnosticStore`, `srmtSweepStore`, `andersonSweepStore`, `monitoringSweepStore`, `hellerSpectrometerStore`, `quantumnessAtlasStore`, `wormholeCoherenceStore`, `pageCurveStore`, `carpetStore` | diagnostics | Analysis / measurement / observation overlays |

## Theme System

- Theme variables defined in `src/styles/theme.css`
- Mapped to Tailwind via `@theme` in `src/index.css`
- Use Tailwind classes: `bg-panel`, `text-primary`, `border-accent`
- Premium glass utilities: `glass-panel`, `glass-button-primary`, `glass-input`

## Template: New Sidebar Section

```tsx
// src/components/sections/{Name}/{Name}Section.tsx
import { useShallow } from 'zustand/react/shallow'
import { Section } from '@/components/sections/Section'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { useSomeStore } from '@/stores/scene/someStore'

/**
 * Controls for {feature description}.
 */
export function {Name}Section() {
  const { enabled, intensity, setEnabled, setIntensity } = useSomeStore(
    useShallow((s) => ({
      enabled: s.enabled,
      intensity: s.intensity,
      setEnabled: s.setEnabled,
      setIntensity: s.setIntensity,
    }))
  )

  return (
    <Section title="{Name}">
      <Switch label="Enabled" checked={enabled} onChange={setEnabled} />
      {enabled && (
        <Slider label="Intensity" value={intensity} onChange={setIntensity}
          min={0} max={1} step={0.01} />
      )}
    </Section>
  )
}
```

## Hooks

| Hook | Purpose |
|------|---------|
| `useWebGPUSupport` | Detect WebGPU availability |
| `useDeviceCapabilities` | GPU tier detection |
| `useKeyboardShortcuts` | Keyboard shortcut registration |
| `useScreenshotCapture` | Screenshot functionality |
| `useUrlState` | URL state sync |
| `useMediaQuery` | Responsive breakpoints |
| `usePanelCollision` | Panel overlap detection |
| `useProgressiveRefinement` | Progressive quality refinement |
| `useToast` | Toast notifications |
| `useDynamicFavicon` | Dynamic favicon |
| `useConditionalMsgBox` | Conditional message boxes |
| `useObjectTypeInitialization` | Object type setup |

## On-Demand References

| Domain | Serena Memory |
|--------|---------------|
| Code style conventions | `code_style_conventions` |
| Modern CSS patterns | `modern_css_standard` |
| JSDoc templates | `jsdoc_templates` |
| Codebase structure | `codebase_structure` |
