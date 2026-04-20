/**
 * URL sub-block for the SRMT parameter sweep.
 *
 * A complete sweep configuration encodes into five URL params:
 *
 *   | Key       | Range                                | Meaning                                  |
 *   |-----------|--------------------------------------|------------------------------------------|
 *   | `sw`      | one of {@link VALID_SRMT_SWEEP_KINDS}| Sweep kind; presence triggers auto-run.  |
 *   | `sw_n`    | int 3-64 (kind-clamped)              | Points. Forced to 3 for `bc`.            |
 *   | `sw_min`  | float ∈ [-1024, 1024] (kind-clamped) | Lower range bound. Ignored for `bc`.     |
 *   | `sw_max`  | float ∈ [-1024, 1024] (kind-clamped) | Upper range bound. Ignored for `bc`.     |
 *   | `sw_phi`  | float ∈ [-10, 10]                    | Landmark φ reference.                    |
 *   | `sw_c`    | float ∈ [0.1, 0.9]                   | Anchor cut-normalized for mass/bc.       |
 *
 * Emission is scoped to `quantumMode === 'wheelerDeWitt'` — sweep fields
 * are meaningless outside WdW mode and must not pollute unrelated
 * links.
 *
 * @module lib/url/srmtSweepSerializer
 */
import type { SrmtSweepKind } from '@/lib/physics/srmt/sweepTypes'

import { deserializeSrmt, serializeSrmt, type SrmtUrlState } from './srmtSerializer'

/** Valid sweep kinds as accepted / emitted in URLs. */
export const VALID_SRMT_SWEEP_KINDS = [
  'cut',
  'mass',
  'lambda',
  'bc',
  'phiRef',
  'rankCap',
  'phiExtent',
  'gridNa',
  'gridNphi',
] as const satisfies readonly SrmtSweepKind[]

/** String union accepted by `sw=…` — one per entry of {@link VALID_SRMT_SWEEP_KINDS}. */
export type UrlSrmtSweepKind = (typeof VALID_SRMT_SWEEP_KINDS)[number]

/** Shareable sweep fields on the parent URL state type. */
export interface SrmtSweepUrlState {
  srmtSweepKind?: UrlSrmtSweepKind
  srmtSweepPoints?: number
  srmtSweepMin?: number
  srmtSweepMax?: number
  srmtSweepPhiRef?: number
  srmtSweepCutAnchor?: number
}

const INT_RE = /^-?\d+$/

function parseFloatClamped(
  params: URLSearchParams,
  key: string,
  min: number,
  max: number
): number | undefined {
  const raw = params.get(key)
  if (!raw) return undefined
  // Rely on Number() + Number.isFinite so shareable links can round-trip
  // scientific-notation floats like `1e-3` or `+2.5` that a restrictive
  // regex would silently drop.
  const v = Number(raw)
  if (!Number.isFinite(v)) return undefined
  return Math.max(min, Math.min(max, v))
}

function parseIntClamped(
  params: URLSearchParams,
  key: string,
  min: number,
  max: number
): number | undefined {
  const raw = params.get(key)
  if (!raw || !INT_RE.test(raw)) return undefined
  const v = Number(raw)
  if (!Number.isSafeInteger(v)) return undefined
  return Math.max(min, Math.min(max, v))
}

/** Emit the SRMT sweep sub-block. No-op outside Wheeler–DeWitt mode. */
export function serializeSrmtSweep(
  params: URLSearchParams,
  quantumMode: string | undefined,
  state: SrmtSweepUrlState
): void {
  if (quantumMode !== 'wheelerDeWitt') return
  if (state.srmtSweepKind !== undefined) params.set('sw', state.srmtSweepKind)
  if (
    state.srmtSweepKind === 'cut' ||
    state.srmtSweepKind === 'mass' ||
    state.srmtSweepKind === 'lambda' ||
    state.srmtSweepKind === 'phiRef' ||
    state.srmtSweepKind === 'rankCap' ||
    state.srmtSweepKind === 'phiExtent' ||
    state.srmtSweepKind === 'gridNa' ||
    state.srmtSweepKind === 'gridNphi'
  ) {
    if (state.srmtSweepPoints !== undefined) params.set('sw_n', String(state.srmtSweepPoints))
    if (state.srmtSweepMin !== undefined) params.set('sw_min', state.srmtSweepMin.toFixed(3))
    if (state.srmtSweepMax !== undefined) params.set('sw_max', state.srmtSweepMax.toFixed(3))
  }
  if (state.srmtSweepPhiRef !== undefined) params.set('sw_phi', state.srmtSweepPhiRef.toFixed(3))
  if (state.srmtSweepCutAnchor !== undefined)
    params.set('sw_c', state.srmtSweepCutAnchor.toFixed(2))
}

/**
 * Combined SRMT + sweep emitter. Exists so `state-serializer.ts` can
 * delegate both blocks with a single call, keeping the parent file
 * under its max-lines budget.
 */
export function serializeSrmtAndSweep(
  params: URLSearchParams,
  quantumMode: string | undefined,
  state: SrmtSweepUrlState & SrmtUrlState
): void {
  serializeSrmt(params, quantumMode, state)
  serializeSrmtSweep(params, quantumMode, state)
}

/** Combined SRMT + sweep parser. See {@link serializeSrmtAndSweep}. */
export function deserializeSrmtAndSweep(
  params: URLSearchParams,
  state: SrmtSweepUrlState & SrmtUrlState
): void {
  deserializeSrmt(params, state)
  deserializeSrmtSweep(params, state)
}

/** Parse the SRMT sweep sub-block into `state`. */
export function deserializeSrmtSweep(params: URLSearchParams, state: SrmtSweepUrlState): void {
  const kindRaw = params.get('sw')
  const kind =
    kindRaw && (VALID_SRMT_SWEEP_KINDS as readonly string[]).includes(kindRaw)
      ? (kindRaw as UrlSrmtSweepKind)
      : undefined
  state.srmtSweepKind = kind
  // Orphaned `sw_*` params (no `sw=…` or invalid kind) must not mutate
  // hidden sweep state. A later manually-selected sweep would otherwise
  // pick up stray ranges/landmarks from a malformed shared link.
  if (kind === undefined) {
    state.srmtSweepPoints = undefined
    state.srmtSweepMin = undefined
    state.srmtSweepMax = undefined
    state.srmtSweepPhiRef = undefined
    state.srmtSweepCutAnchor = undefined
    return
  }
  // Points clamps match the sweepDriver per-kind rules:
  //  cut ∈ [4, 64], mass / λ / phiRef ∈ [3, 21], rankCap ∈ [3, 32],
  //  phiExtent ∈ [3, 13], gridNa / gridNphi ∈ [3, 9]. Use the outer
  //  union and let the driver clamp per kind.
  state.srmtSweepPoints = parseIntClamped(params, 'sw_n', 3, 64)
  // Float range must admit the widest per-kind sweep — `gridNa` extends
  // up to 1024 (driver clamp). Box `[-1024, 1024]` covers every kind:
  // cut ∈ [0,1], mass ∈ [0,2], λ ∈ [-1,1], phiRef ∈ [-phiExtent,
  // +phiExtent], phiExtent ∈ [0.5, 5], rankCap ∈ [8, 256], gridNa ∈
  // [64, 1024], gridNphi ∈ [9, 33]. Driver enforces per-kind bounds.
  state.srmtSweepMin = parseFloatClamped(params, 'sw_min', -1024, 1024)
  state.srmtSweepMax = parseFloatClamped(params, 'sw_max', -1024, 1024)
  state.srmtSweepPhiRef = parseFloatClamped(params, 'sw_phi', -10, 10)
  state.srmtSweepCutAnchor = parseFloatClamped(params, 'sw_c', 0.1, 0.9)
}
