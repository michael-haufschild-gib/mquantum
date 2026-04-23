/**
 * Known naga-rejects-but-Tint-accepts discrepancies.
 *
 * Each entry here represents a real WGSL-spec noncompliance in the renderer
 * that Chrome/Dawn/Tint silently accepts. The Phase 1b enumerator surfaces
 * these, the test suite files them under `knownDeviations` (not `failures`),
 * and the pattern stays listed until a follow-up task removes the source.
 *
 * Workflow for adding/removing entries:
 *
 * 1. Run `pnpm test:shaders` — the triage report prints any UNCAUGHT failure
 *    signatures.
 * 2. If a failure is a legitimate spec violation that Tint accepts (and it's
 *    not trivially fixable right now), add a regex here and file a task.
 * 3. When the underlying fix lands, delete the regex. The test will then fail
 *    if the same pattern recurs — catching regressions.
 *
 * Do NOT add entries for real bugs. A missing symbol or syntax error is never
 * "known deviation" — it's a bug, fix it.
 *
 * @module tests/rendering/wgsl/knownDeviations
 */

export const KNOWN_DEVIATIONS: readonly RegExp[] = []
