# Codebase Structure

```
mdimension/
├── src/
│   ├── components/
│   │   ├── ui/              # Reusable UI primitives (Button, Slider, Modal, etc.)
│   │   ├── layout/          # Layout frames, panels, top bars, drawers
│   │   ├── sections/        # Sidebar/editor sections (feature groupings)
│   │   ├── canvas/          # R3F helpers (controllers, gizmos)
│   │   └── ...              # Domain components (presets, share, etc.)
│   │
│   ├── hooks/               # React hooks (wire stores + rendering + UI)
│   │
│   ├── lib/                 # Pure logic (no React)
│   │   ├── math/            # N-dimensional math utilities
│   │   ├── geometry/        # Object generation algorithms
│   │   └── projection/      # Projection algorithms
│   │
│   ├── rendering/           # Rendering pipeline
│   │   ├── renderers/       # Specific renderers (polytope, mandelbulb, etc.)
│   │   └── shaders/         # GLSL shader code
│   │
│   ├── stores/              # Zustand stores + slices
│   │   ├── slices/          # Store slices
│   │   └── defaults/        # Default constants
│   │
│   ├── workers/             # Web Workers (expensive computations)
│   │
│   ├── types/               # TypeScript type definitions
│   │
│   ├── contexts/            # React context providers
│   │
│   ├── utils/               # Utility functions
│   │
│   ├── styles/              # Additional styles
│   │
│   ├── assets/              # Static assets
│   │
│   ├── constants/           # Application constants
│   │
│   ├── dev-tools/           # Development tools (debug panels)
│   │
│   ├── wasm/                # Optional Rust WASM module
│   │   └── mdimension_core/ # WASM package (wasm-pack)
│   │
│   ├── tests/               # Vitest tests (mirror src structure)
│   │   ├── __mocks__/       # Test mocks
│   │   ├── lib/             # lib tests
│   │   ├── stores/          # store tests
│   │   ├── hooks/           # hook tests
│   │   ├── components/      # component tests
│   │   └── rendering/       # rendering tests
│   │
│   ├── App.tsx              # Root component
│   ├── main.tsx             # Entry point
│   └── index.css            # Tailwind CSS with @theme tokens
│
├── scripts/
│   ├── playwright/          # Playwright E2E tests (*.spec.ts)
│   └── tools/               # Utility scripts
│
├── screenshots/             # Visual artifacts (png, jpg, json)
│
├── docs/                    # Documentation
│   ├── architecture.md      # Architecture guide
│   ├── testing.md           # Testing guide
│   ├── frontend.md          # Frontend patterns
│   └── meta/
│       └── styleguide.md    # Style guide
│
├── public/                  # Static public assets
│
└── [config files]           # vite.config.ts, vitest.config.ts, etc.
```

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `src/components/ui/` | All reusable UI primitives |
| `src/rendering/` | Three.js render pipeline, shaders |
| `src/stores/` | Zustand state management |
| `src/lib/` | Pure math/geometry logic |
| `src/hooks/` | React hooks |
| `src/tests/` | Vitest tests |
| `scripts/playwright/` | E2E tests |
| `screenshots/` | Visual outputs |

## Forbidden Locations

- **Project root**: No scripts, screenshots, or scratch files
- Use designated folders above for all files
