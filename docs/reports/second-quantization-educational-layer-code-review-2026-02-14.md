# Code Review: Second-Quantization Educational Layer

Date: 2026-02-14  
Reviewer: Codex (deep review)

## Scope Reviewed

- `src/components/sections/Geometry/SchroedingerControls/index.tsx`
- `src/components/sections/Geometry/SchroedingerControls/types.ts`
- `src/components/sections/Geometry/SchroedingerControls/SecondQuantizationSection.tsx`
- `src/lib/geometry/extended/types.ts`
- `src/lib/math/secondQuantization.ts`
- `src/stores/slices/geometry/types.ts`
- `src/stores/slices/geometry/schroedingerSlice.ts`
- `src/stores/utils/presetSerialization.ts`
- `src/stores/presetManagerStore.ts`
- `src/tests/components/sections/SecondQuantizationSection.test.tsx`
- `src/tests/lib/math/secondQuantization.test.ts`
- `src/tests/stores/utils/presetSerialization.test.ts`
- `src/tests/stores/presetManagerStore.test.ts`

## Verification Run

- `npm run test -- src/tests/lib/math/secondQuantization.test.ts src/tests/components/sections/SecondQuantizationSection.test.tsx --maxWorkers=4`  
  Result: 30/30 passing
- `npm run test -- src/tests/stores/utils/presetSerialization.test.ts --maxWorkers=4`  
  Result: 1/1 passing
- `npm run test -- src/tests/stores/presetManagerStore.test.ts --maxWorkers=4`  
  Result: 44/44 passing

All targeted tests pass, but important correctness gaps remain (below).

## Findings (Ordered by Severity)

### [P1] Mode index is incorrectly used as Fock number `n`, producing physically inconsistent metrics

**Evidence**
- `src/components/sections/Geometry/SchroedingerControls/SecondQuantizationSection.tsx:59` sets:
  - `n = sqLayerSelectedModeIndex < config.termCount ? sqLayerSelectedModeIndex : 0`
- `src/components/sections/Geometry/SchroedingerControls/SecondQuantizationSection.tsx:110` labels slider as “Mode index (k)”
- `src/lib/geometry/extended/types.ts:574` default `termCount` is `1`

**Why this is a bug**
- `k` (selected mode index) and Fock number `n` are different quantities.
- With default `termCount = 1`, any `k > 0` forces `n = 0`, so higher selected modes display vacuum-like metrics regardless of rendered state.
- Metrics shown as physical interpretation are not derived from the actual HO state content.

**Impact**
- Educational/scientific interpretation is frequently wrong in normal usage.

**Recommendation**
- Separate concepts explicitly:
  - `selectedModeIndex` for mode selection.
  - independent `fockN` (if using synthetic pedagogical state), or
  - compute `n_k` from actual state amplitudes if available.
- Remove fallback-to-zero behavior tied to `termCount`.

---

### [P1] “Minimum uncertainty” logic is incorrect for rotated squeezed states

**Evidence**
- `src/lib/math/secondQuantization.ts:282-296` computes `product = deltaX * deltaP`.
- `src/components/sections/Geometry/SchroedingerControls/SecondQuantizationSection.tsx:333` flags minimum only when `|product - 0.5| < 0.01`.

**Why this is a bug**
- For general squeeze angle, covariance is nonzero.
- Minimum-uncertainty condition is Robertson-Schrödinger:
  - `DeltaX^2 DeltaP^2 - Cov(X,P)^2 >= 1/4`
- Using only `DeltaX * DeltaP` marks many rotated minimum-uncertainty states as “not minimum”.

**Impact**
- Scientific mis-teaching for non-axis-aligned squeezing (`theta != 0, pi`).

**Recommendation**
- Compute and display covariance (or principal-axis uncertainties).
- Replace minimum check with covariance-aware invariant.

---

### [P2] Selected mode index is not dimension-aware in store, causing stale invalid values

**Evidence**
- `src/stores/slices/geometry/schroedingerSlice.ts:643` clamps `sqLayerSelectedModeIndex` to `[0,10]` globally.
- UI slider max is dimension-based:
  - `src/components/sections/Geometry/SchroedingerControls/SecondQuantizationSection.tsx:112` uses `dimension - 1`.

**Why this is problematic**
- After dimension reductions (e.g., 11D -> 3D), stored index can remain out of visible range.
- Combined with current `n` mapping (`...:59`), this can silently force vacuum metrics.

**Impact**
- Confusing UI/state mismatch and silent metric corruption.

**Recommendation**
- Clamp index on dimension changes (`initializeSchroedingerForDimension`), or clamp dynamically in setter using current geometry dimension.

---

### [P2] Transient sq-layer fields are still persisted in scenes despite comments saying they are not scene state

**Evidence**
- Fields added to transient list:
  - `src/stores/utils/presetSerialization.ts:104-113`
- But extended config serialization bypasses transient filtering:
  - `src/stores/utils/presetSerialization.ts:173-195` returns raw JSON clone of `schroedinger` config.
- `sanitizeLoadedState` is shallow (top-level key deletion only):
  - `src/stores/utils/presetSerialization.ts:204-207`
- Scene flow uses nested `extended` object:
  - save: `src/stores/presetManagerStore.ts:317`
  - load: `src/stores/presetManagerStore.ts:427`

**Why this is a bug**
- `sqLayer*` lives under `extended.schroedinger.*`; shallow sanitization does not remove nested keys.
- Current implementation still serializes and reloads sq-layer fields.

**Impact**
- Behavior contradicts code comments and intended “session-only” semantics.

**Recommendation**
- Filter nested `schroedinger` config fields during `serializeExtendedState`, or implement deep transient stripping for extended payloads.

---

### [P3] Test suite misses key behavioral/scientific regression cases

**Evidence**
- Component tests (`src/tests/components/sections/SecondQuantizationSection.test.tsx`) are mostly presence/callback assertions.
- No store/preset tests for new sq-layer persistence behavior.
- No test verifying dimension change clamps sq mode index.
- No uncertainty test covering covariance-aware minimum criterion.

**Impact**
- Core scientific logic errors can pass CI undetected.

**Recommendation**
- Add tests for:
  - `k` vs `n` separation semantics.
  - dimension-change clamping.
  - scene save/load excluding (or intentionally including) sq-layer fields.
  - rotated squeezed-state uncertainty invariant.

## Overall Assessment

The implementation is cleanly wired into types/store/UI and has good local unit coverage for pure helper math, but it currently has high-impact scientific correctness issues in the interpretation layer. The two P1 issues should be addressed before treating this feature as scientifically reliable for education.
