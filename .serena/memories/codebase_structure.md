# Codebase Structure

```
mquantum/
├── src/
│   ├── components/
│   │   ├── ui/              # Reusable UI primitives (Button, Slider, Modal, etc.)
│   │   ├── layout/          # Layout frames, panels, top bars, drawers
│   │   ├── sections/        # Sidebar/editor sections (feature groupings)
│   │   ├── canvas/          # Performance monitor, gizmos, debug overlays
│   │   ├── controls/        # Domain controls (export, share buttons)
│   │   ├── overlays/        # Modals and notifications
│   │   └── presets/         # Scene/style preset managers
│   │
│   ├── hooks/               # React hooks (wire stores + rendering + UI)
│   │
│   ├── lib/                 # Pure logic (no React)
│   │   ├── math/            # N-dimensional math utilities
│   │   ├── geometry/        # Object type registry, Schroedinger config, presets
│   │   ├── cache/           # IndexedDB cache + Hermite polynomial constants
│   │   ├── wasm/            # WASM bridge (animation math only)
│   │   ├── url/             # URL state serialization
│   │   ├── colors/          # Color utilities
│   │   ├── export/          # Image/video export
│   │   └── animation/       # Animation bias calculations
│   │
│   ├── rendering/
│   │   └── webgpu/          # WebGPU rendering pipeline (ONLY renderer)
│   │       ├── core/        # WebGPUDevice, Camera, BasePass, UniformBuffer, ResourcePool
│   │       ├── graph/       # Declarative render graph (pass ordering, resource allocation)
│   │       ├── renderers/   # WebGPUSchrodingerRenderer, Skybox, GroundPlane
│   │       ├── passes/      # Post-processing passes (Bloom, SSAO, SSR, Bokeh, etc.)
│   │       ├── shaders/     # All WGSL shaders
│   │       │   ├── shared/        # Shared WGSL modules (lighting, color, math, depth)
│   │       │   ├── schroedinger/  # Schroedinger SDF, quantum functions, volume integration
│   │       │   ├── postprocessing/# Bloom, tonemapping, FXAA, SMAA, SSR shaders
│   │       │   ├── skybox/        # 7 procedural skybox modes
│   │       │   ├── groundplane/   # Ground plane + grid shaders
│   │       │   └── temporal/      # Temporal reprojection/reconstruction
│   │       └── utils/       # WebGPU-specific utilities (lighting, color)
│   │
│   ├── stores/              # Zustand stores + slices (global state)
│   │   ├── slices/
│   │   │   ├── visual/      # Material, color, render, PBR slices
│   │   │   └── geometry/    # Schroedinger slice
│   │   ├── defaults/        # Default values
│   │   └── utils/           # Preset serialization, merge helpers
│   │
│   ├── types/               # TypeScript type declarations
│   ├── wasm/                # Rust WASM source (animation math only)
│   │   └── mdimension_core/ # WASM package (wasm-pack) - rotation, projection, matrix/vector ops
│   ├── theme/               # CSS helper utilities
│   └── tests/               # Vitest tests (mirror src structure)
│       └── __mocks__/       # Test mocks (WASM module mock)
│
├── scripts/
│   ├── playwright/          # Playwright E2E tests (*.spec.ts)
│   └── tools/               # Utility scripts
│
├── docs/                    # Always-loaded agent docs (@import from CLAUDE.md)
│   ├── architecture.md      # File placement, naming, templates (174 lines)
│   ├── testing.md           # Test stack, placement, templates (141 lines)
│   ├── frontend.md          # UI patterns, components, stores (164 lines)
│   └── meta/
│       └── styleguide.md    # Immutable style rules (70 lines)
│
└── [config files]           # vite.config.ts, vitest.config.ts, etc.
```

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `src/components/ui/` | All reusable UI primitives |
| `src/rendering/webgpu/` | WebGPU render pipeline, WGSL shaders, passes |
| `src/rendering/webgpu/shaders/schroedinger/` | Quantum physics WGSL shaders |
| `src/stores/` | Zustand state management |
| `src/lib/` | Pure math/geometry/WASM logic |
| `src/hooks/` | React hooks |
| `src/tests/` | Vitest tests |
| `scripts/playwright/` | E2E tests |

## Forbidden Locations

- **Project root**: No scripts, screenshots, or scratch files
- Use designated folders above for all files
