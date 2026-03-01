# mquantum

An N-dimensional quantum physics visualizer running entirely in the browser via WebGPU.

**Live demo**: https://mquantum.vercel.app/

## Honest Disclaimer

This is a vibecoded project. I have no real understanding of the quantum mechanics math behind it. I don't know whether the rendered wavefunctions or the values displayed in the UI are physically correct. It looks cool, and that's about as far as my confidence goes.

The project exists as an experiment in pushing the limits of vibecoding with Claude Code (Opus 4.5 / 4.6). The entire codebase — ~600 source files, 83 WGSL shaders, Rust/WASM math, 1800+ tests, and this README — was written by Claude across ~400 commits. I described what I wanted, Claude wrote the code.

## What It Does

- Renders quantum wavefunctions (hydrogen orbitals, harmonic oscillators) in 2 to 11 dimensions
- Raymarches volumetric probability densities on the GPU via custom WebGPU shaders
- Post-processing pipeline: bloom, tonemapping, temporal reprojection, paper texture, FXAA/SMAA
- Interactive orbit camera, N-dimensional rotation controls, animation
- PBR-ish lighting with GGX specular (whether this is physically meaningful for a wavefunction is anyone's guess)

## Tech Stack

- **Rendering**: Custom WebGPU renderer (raw `GPUDevice` / `GPUCommandEncoder`)
- **Shaders**: WGSL (83 shader modules)
- **Frontend**: React 19 + TypeScript + Vite 7
- **State**: Zustand 5
- **Styling**: Tailwind CSS 4
- **Math**: Rust/WASM for rotation and projection math
- **Testing**: Vitest (1800+ tests) + Playwright E2E

## Running Locally

Requires a browser with WebGPU support (Chrome/Edge 113+, Firefox Nightly).

```bash
npm install
npm run dev
```

Opens at `http://localhost:3000`.

## License

MIT
