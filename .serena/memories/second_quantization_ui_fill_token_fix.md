# Second Quantization UI Fill Token Fix (2026-02-21)

- Bug: `P(n)` bars in `SecondQuantizationSection` appeared unfilled despite non-zero percentages.
- Root cause: invalid Tailwind token classes (`bg-accent-cyan`, `text-accent-cyan`) were used. This project theme defines semantic tokens such as `bg-accent`/`text-accent`, not accent-specific class names.
- Fix: replaced invalid classes with `bg-accent` and `text-accent` in `src/components/sections/Geometry/SchroedingerControls/SecondQuantizationSection.tsx`.
- Hardening: bar width/label now use the same sanitized percent value (`finite` + clamped to `[0,100]`) to keep visualization and displayed percentage synchronized.
- Regression test added in `src/tests/components/sections/SecondQuantizationSection.test.tsx` asserting valid accent token usage and width/label consistency for a 100% Fock row.
