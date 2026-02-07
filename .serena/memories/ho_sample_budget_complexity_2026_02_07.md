Implemented complexity-aware Schrödinger sample budgeting for HO states.

Changes:
- Added src/rendering/webgpu/renderers/schroedingerSampleBudget.ts with:
  - computeHarmonicOscillatorComplexityScore(termCount,maxQuantumNumber,dimension)
  - computeSchroedingerSampleBudget(...) returning final capped sample count
- Integrated helper in WebGPUSchrodingerRenderer.updateSchroedingerUniforms for uniforms.sampleCount (offset 920).
- Integrated same helper in renderer diagnostics logging path to keep logged sample count consistent with runtime behavior.
- Raised quality mapping headroom in src/lib/geometry/extended/types.ts:
  - fast 24, balanced 40, quality 64, ultra 96
  - DEFAULT_SCHROEDINGER_CONFIG.sampleCount from 32 -> 40
- Raised explicit sampleCount setter clamp in src/stores/slices/geometry/schroedingerSlice.ts from max 128 -> 192.

Behavior:
- HO complexity uses weighted normalized inputs: term count (45%), max quantum number (35%), dimension (20%).
- Complexity multiplier ranges up to 2.5x (limited to 1.35x in fast mode).
- HO position cap ladder: 128 (fast/low complexity), 160 (mid complexity), 192 (high complexity non-fast).
- Momentum representation remains capped at 96 for responsiveness.
- Non-HO modes keep baseline cap behavior (position cap 96).

Test coverage:
- Added src/tests/rendering/webgpu/schroedingerSampleBudget.test.ts covering:
  - quality mapping headroom,
  - low complexity baseline,
  - high detail HO scaling,
  - 192 cap,
  - momentum cap,
  - no HO boost for hydrogenND.
