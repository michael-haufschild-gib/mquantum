## Hydrogen ND Bounding Radius Fix (2026-02-21)

### Context
In hydrogenND mode, store state keeps `extraDimQuantumNumbers` and `extraDimOmega` as fixed 8-slot arrays (dims 4..11). Hidden slots can preserve stale values when user reduces dimension.

### Root Cause
`computeBoundingRadius()` in `src/lib/geometry/extended/schroedinger/boundingRadius.ts` forwarded full arrays to hydrogen bound functions, which iterate array length. This allowed inactive dimensions to inflate bound radius.

### Impact
Inflated `boundingRadius` in `WebGPUSchrodingerRenderer` reduces effective sample density and detail because:
- volume cube is larger
- adaptive sample count and step estimates depend on radius
- density compensation depends on estimated step length

### Fix
At dispatch in `computeBoundingRadius()`, slice extra-dim arrays to active count:
- `activeExtraDimCount = clamp(dimension - 3, 0, 8)`
- pass `extraDimN.slice(0, activeExtraDimCount)` and same for omega to hydrogen position/momentum bound functions.

### Regression Test
Added to `src/tests/lib/geometry/extended/schroedinger/boundingRadius.test.ts`:
- dimension=4 with stale high value in slot 7 must still return radius based on active physics (~12 for n=2, a0=1, active extra dim ground).
- test fails pre-fix (observed ~19.3), passes post-fix.

### Additional Documentation Correction
Updated header comments in `src/lib/geometry/extended/schroedinger/hydrogenNDPresets.ts` to reflect actual model:
- radial part uses 3D core radius `r3`
- extra dimensions are independent HO factors
