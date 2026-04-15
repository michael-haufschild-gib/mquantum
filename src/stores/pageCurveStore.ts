/**
 * Page-curve store — analog Hawking evaporation bookkeeping.
 *
 * Holds a pre-allocated ring buffer of `{t, S_therm, S_page, islandRadius}`
 * samples plus user-tunable knobs (G_eff, SB coefficient, d*_max fraction,
 * overlay toggles). All buffer writes are mutations-in-place of the same
 * Float64Arrays — no per-frame GC churn.
 *
 * This store intentionally lives outside `diagnosticsStore` because
 * (a) it is cross-cutting derived data (area, κ, T_H come from the BEC
 *     physics module), and
 * (b) its update cadence is independent of GPU readback — the panel drives
 *     it from a React effect subscribed to `diagnosticsStore.bec`.
 *
 * @module stores/pageCurveStore
 */

import { create } from 'zustand'

import {
  accumulateThermalEntropy,
  bekensteinHawkingEntropy,
  createPageCurveBuffer,
  DEFAULT_SB_COEFFICIENT,
  islandRadius as computeIslandRadius,
  MAX_PAGE_CURVE_BUFFER,
  type PageCurveRingBuffer,
  pageEntropy,
  pageTime as computePageTime,
  pushPageCurveSample,
  resetPageCurveBuffer,
  thermalEntropyDensityRate,
} from '@/lib/physics/bec/pageCurve'

/** Default ring-buffer capacity. */
export const DEFAULT_PAGE_CURVE_CAPACITY = 512

/**
 * Inputs to one page-curve tick. The caller supplies physics quantities; the
 * store converts them into the stored {t, S_therm, S_page, islandRadius} sample.
 */
export interface PageCurveTickInputs {
  /** Simulation time corresponding to this tick. */
  t: number
  /** Hawking temperature T_H at this tick (can be 0 when no horizon). */
  tH: number
  /** Analog horizon area A_h (0 when no horizon exists). */
  areaH: number
  /** Asymptotic sound speed c_s0 (> 0 when a horizon exists). */
  cs0: number
  /** Spatial extent of the supersonic region along the flow axis, ≥ 0. */
  supersonicExtent: number
}

/** Shape of the page-curve Zustand store. */
export interface PageCurveState {
  /** Ring buffer of samples (struct-of-arrays). */
  readonly buffer: PageCurveRingBuffer
  /** Effective Newton constant G_eff for S_BH. */
  gEff: number
  /** Stefan–Boltzmann-like coefficient for dS/dt. */
  sbCoefficient: number
  /** Max island radius as a fraction of supersonic extent (0..1). */
  dMaxFrac: number
  /** UI toggle — SVG HUD visibility. */
  pageCurveHudEnabled: boolean
  /** UI toggle — island overlay in the density render (render integration deferred). */
  islandOverlayEnabled: boolean
  /** Latest Bekenstein–Hawking entropy (cached for HUD). */
  lastSBH: number
  /** Latest thermal entropy rate (cached for HUD + debugging). */
  lastRate: number
  /** Latest thermal entropy value. */
  lastSTherm: number
  /** Latest island radius. */
  lastIslandRadius: number
  /** Monotonic version counter — increments on each push for render observers. */
  version: number

  // Actions
  /** Push a new sample. Trapezoid-integrates S_therm, computes S_page + island. */
  pushSample: (inputs: PageCurveTickInputs) => void
  /** Clear the ring buffer and reset cached scalars. */
  clear: () => void
  /** Resize the ring buffer (also clears). */
  setBufferSize: (capacity: number) => void
  /** Set G_eff (clamped to [1e-6, 1e6]). Resets the trapezoid integrator. */
  setGEff: (value: number) => void
  /** Set Stefan–Boltzmann coefficient (clamped to [1e-6, 1e6]). Resets the trapezoid integrator. */
  setSbCoefficient: (value: number) => void
  /**
   * Invalidate the trapezoid-integrator's last-seen `t` and rate without
   * touching stored samples, so the next `pushSample` does not blend an old
   * rate (computed under stale gEff/sbCoefficient) with the new rate.
   */
  invalidateIntegrator: () => void
  /** Set island-radius maximum fraction (clamped to [0, 1]). */
  setDMaxFrac: (value: number) => void
  /** Toggle HUD visibility. */
  setPageCurveHudEnabled: (enabled: boolean) => void
  /** Toggle island overlay visibility. */
  setIslandOverlayEnabled: (enabled: boolean) => void
  /** Compute the Page time from the current buffer, null if no crossing. */
  getPageTime: () => number | null
}

/**
 * Shared default knob values.
 */
export const PAGE_CURVE_DEFAULTS = {
  gEff: 1.0,
  sbCoefficient: DEFAULT_SB_COEFFICIENT,
  dMaxFrac: 0.8,
  pageCurveHudEnabled: false,
  islandOverlayEnabled: false,
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return value < min ? min : value > max ? max : value
}

/**
 * Create the page curve Zustand store. The buffer is allocated once and
 * reused; `setBufferSize` is the only operation that reallocates.
 */
export const usePageCurveStore = create<PageCurveState>((set, get) => {
  const buffer = createPageCurveBuffer(DEFAULT_PAGE_CURVE_CAPACITY)
  // Mutable-state guard: track last-seen t and rate to support trapezoid
  // integration without exposing them in the public state.
  const integrator = { lastT: Number.NaN, lastRate: 0 }
  return {
    buffer,
    gEff: PAGE_CURVE_DEFAULTS.gEff,
    sbCoefficient: PAGE_CURVE_DEFAULTS.sbCoefficient,
    dMaxFrac: PAGE_CURVE_DEFAULTS.dMaxFrac,
    pageCurveHudEnabled: PAGE_CURVE_DEFAULTS.pageCurveHudEnabled,
    islandOverlayEnabled: PAGE_CURVE_DEFAULTS.islandOverlayEnabled,
    lastSBH: 0,
    lastRate: 0,
    lastSTherm: 0,
    lastIslandRadius: 0,
    version: 0,

    pushSample: (inputs) => {
      const state = get()
      const rate = thermalEntropyDensityRate({
        tH: inputs.tH,
        areaH: inputs.areaH,
        cs0: inputs.cs0,
        sbCoefficient: state.sbCoefficient,
      })
      let dt = 0
      if (Number.isFinite(integrator.lastT) && inputs.t > integrator.lastT) {
        dt = inputs.t - integrator.lastT
      }
      const sTherm = accumulateThermalEntropy({
        previous: state.lastSTherm,
        rateOld: integrator.lastRate,
        rateNew: rate,
        dt,
      })
      const sBH = bekensteinHawkingEntropy({ areaH: inputs.areaH, gEff: state.gEff })
      const sPage = pageEntropy(sTherm, sBH)
      const isl = computeIslandRadius({
        sTherm,
        sBH,
        dMaxFrac: state.dMaxFrac,
        supersonicExtent: inputs.supersonicExtent,
      })
      pushPageCurveSample(state.buffer, {
        t: inputs.t,
        sTherm,
        sPage,
        islandRadius: isl,
      })
      integrator.lastT = inputs.t
      integrator.lastRate = rate
      set({
        lastSBH: sBH,
        lastRate: rate,
        lastSTherm: sTherm,
        lastIslandRadius: isl,
        version: state.version + 1,
      })
    },

    clear: () => {
      resetPageCurveBuffer(get().buffer)
      integrator.lastT = Number.NaN
      integrator.lastRate = 0
      set({
        lastSBH: 0,
        lastRate: 0,
        lastSTherm: 0,
        lastIslandRadius: 0,
        version: get().version + 1,
      })
    },

    setBufferSize: (capacity) => {
      const cap = clamp(Math.floor(capacity), 1, MAX_PAGE_CURVE_BUFFER)
      const fresh = createPageCurveBuffer(cap)
      integrator.lastT = Number.NaN
      integrator.lastRate = 0
      // Replace the buffer reference — readers observe via `version`.
      set({
        // Casting because `buffer` is declared readonly externally but the
        // store owner is the sole legitimate writer.
        buffer: fresh,
        lastSBH: 0,
        lastRate: 0,
        lastSTherm: 0,
        lastIslandRadius: 0,
        version: get().version + 1,
      } as Partial<PageCurveState>)
    },

    setGEff: (value) => {
      integrator.lastT = Number.NaN
      integrator.lastRate = 0
      set({ gEff: clamp(value, 1e-6, 1e6) })
    },
    setSbCoefficient: (value) => {
      integrator.lastT = Number.NaN
      integrator.lastRate = 0
      set({ sbCoefficient: clamp(value, 1e-6, 1e6) })
    },
    setDMaxFrac: (value) => set({ dMaxFrac: clamp(value, 0, 1) }),
    invalidateIntegrator: () => {
      integrator.lastT = Number.NaN
      integrator.lastRate = 0
    },
    setPageCurveHudEnabled: (enabled) => set({ pageCurveHudEnabled: !!enabled }),
    setIslandOverlayEnabled: (enabled) => set({ islandOverlayEnabled: !!enabled }),

    getPageTime: () => {
      const state = get()
      return computePageTime(state.buffer, state.lastSBH)
    },
  }
})
