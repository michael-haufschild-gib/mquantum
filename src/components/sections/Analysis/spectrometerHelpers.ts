/**
 * Pure-logic helpers for the TDSE wavepacket spectrometer panel.
 *
 * Kept out of the React component file so
 * 1. the component can stay under the project's `max-lines` cap,
 * 2. the derivations are trivially unit-testable without rendering,
 * 3. React developers can skim the panel without wading through
 *    SVG-geometry and tick-label math.
 *
 * None of these functions read stores, refs, or DOM — they take their
 * inputs explicitly.
 *
 * @module components/sections/Analysis/spectrometerHelpers
 */

import type { TdseConfig } from '@/lib/geometry/extended/types'
import type { HellerRingBuffer, HellerSpectrum } from '@/lib/physics/tdse/heller'

/**
 * Set of TDSE potential types for which Heller spectroscopy will
 * produce a physically meaningful discrete-eigenvalue spectrum. Every
 * other potential either lacks bound states (scattering), has a
 * time-dependent Hamiltonian (driven), or produces such dense /
 * pseudo-continuous structure that peak extraction is misleading.
 */
export const HELLER_COMPATIBLE_POTENTIALS: ReadonlySet<TdseConfig['potentialType']> = new Set([
  'harmonicTrap',
  'becTrap',
  'finiteWell',
  'doubleWell',
  'periodicLattice',
  'radialDoubleWell',
  'coupledAnharmonic',
])

/**
 * Does the current potential admit a discrete bound-state spectrum
 * that Heller spectroscopy can usefully recover? Scattering potentials
 * (barrier, step, free, doubleSlit) and driven Hamiltonians all return
 * false so the UI can warn the user before they waste a capture cycle.
 *
 * @param potentialType - Current TDSE potential type
 * @returns true if the potential has a usable bound-state spectrum
 */
export function isHellerCompatiblePotential(potentialType: TdseConfig['potentialType']): boolean {
  return HELLER_COMPATIBLE_POTENTIALS.has(potentialType)
}

/** Number of harmonic-trap eigenlevels to draw as theoretical overlay. */
export const HARMONIC_OVERLAY_LEVELS = 8

/** Derived timing values summarising the ring buffer. */
export interface CaptureTiming {
  /** Simulation time spanned by the current capture, or NaN if empty. */
  tCaptured: number
  /** Spectral resolution Δω = 2π/T, or NaN if empty. */
  deltaOmega: number
  /**
   * Nyquist angular frequency π/dt where dt is the nominal cadence used
   * by the spectrum builder. NaN if empty.
   */
  omegaNyquist: number
}

/**
 * Derive T captured, Δω resolution, and ω_max (Nyquist) from a ring
 * buffer. Reads the stored `times[]` directly and mirrors the
 * `computeHellerSpectrum` cadence convention: integer-multiple gaps are
 * treated as dropped readback slots, so Nyquist uses the smallest
 * positive gap rather than the first/last mean spacing.
 *
 * @param buf - Ring buffer, or null if the pass has not wired one yet
 * @param _sampleCount - Snapshot of `buf.count` at call time. Not read
 *        inside the function — it exists so callers (React memos) can
 *        pass the latest sample count as a dep and force re-evaluation
 *        when the pass mutates `buf` in place, which React cannot observe
 *        through the stable ref.
 * @returns Derived timing values, with NaNs when the buffer is too
 *          thin to measure
 */
export function deriveCaptureTiming(
  buf: HellerRingBuffer | null,
  _sampleCount: number
): CaptureTiming {
  if (!buf || buf.count < 2) {
    return { tCaptured: NaN, deltaOmega: NaN, omegaNyquist: NaN }
  }
  const start = buf.count === buf.capacity ? buf.head : 0
  const tFirst = buf.times[start % buf.capacity]!
  let previousTime = tFirst
  let nominalDt = Infinity

  if (!Number.isFinite(tFirst)) {
    return { tCaptured: NaN, deltaOmega: NaN, omegaNyquist: NaN }
  }

  for (let i = 1; i < buf.count; i++) {
    const time = buf.times[(start + i) % buf.capacity]!
    const gap = time - previousTime
    if (!(gap > 0) || !Number.isFinite(gap) || !Number.isFinite(time)) {
      return { tCaptured: NaN, deltaOmega: NaN, omegaNyquist: NaN }
    }
    nominalDt = Math.min(nominalDt, gap)
    previousTime = time
  }

  const tLast = previousTime
  const tCaptured = tLast - tFirst
  if (!(tCaptured > 0) || !Number.isFinite(tCaptured) || !Number.isFinite(nominalDt)) {
    return { tCaptured: NaN, deltaOmega: NaN, omegaNyquist: NaN }
  }
  const deltaOmega = (2 * Math.PI) / tCaptured
  const omegaNyquist = Math.PI / nominalDt
  return { tCaptured, deltaOmega, omegaNyquist }
}

/** One narrated status-block message. */
export interface StatusMessage {
  label: string
  detail: string | null
  /** Tailwind class selecting the coloured status dot. */
  dotClass: string
}

/** Inputs to {@link deriveStatusMessage}. */
export interface StatusInputs {
  enabled: boolean
  hamiltonianTimeDependent: boolean
  sampleCount: number
  bufferFull: boolean
  minSamples: number
  computeAttempted: boolean
  spectrumEmpty: boolean
  /**
   * True when the current potential is NOT a member of
   * {@link HELLER_COMPATIBLE_POTENTIALS}. Used to show a non-blocking
   * warning before the user burns a capture on a scattering setup
   * that will never produce clean peaks.
   */
  potentialIncompatible: boolean
}

/**
 * Translate the current capture state into a short label + optional
 * detail line for the status block. Centralised so every state has
 * exactly one place to edit its copy.
 *
 * @param inputs - Current state snapshot
 * @returns Status label, detail, and dot colour class
 */
export function deriveStatusMessage(inputs: StatusInputs): StatusMessage {
  const {
    enabled,
    hamiltonianTimeDependent,
    sampleCount,
    bufferFull,
    minSamples,
    computeAttempted,
    spectrumEmpty,
    potentialIncompatible,
  } = inputs

  if (hamiltonianTimeDependent) {
    return {
      label: 'Paused — time-dependent Hamiltonian',
      detail: 'Heller\u2019s theorem needs a stationary H. Disarm the drive to resume.',
      dotClass: 'bg-text-tertiary',
    }
  }
  if (!enabled) {
    if (potentialIncompatible) {
      return {
        label: 'Idle — no bound states in this potential',
        detail:
          'Heller needs a discrete spectrum. Switch to harmonicTrap, finiteWell, doubleWell, periodicLattice, radialDoubleWell, coupledAnharmonic, or becTrap to get clean peaks.',
        dotClass: 'bg-[var(--color-warning)]',
      }
    }
    return {
      label: 'Idle',
      detail:
        'Turn on capture above — this also resets the wavefunction so ψ(0) is the initial state.',
      dotClass: 'bg-text-tertiary',
    }
  }
  if (computeAttempted && spectrumEmpty) {
    return {
      label: 'Capture corrupted — restart',
      detail:
        'Sample cadence changed mid-capture (parameter drift, pause/resume, or too many dropped frames). Click Restart to collect a fresh window.',
      dotClass: 'bg-[var(--color-warning)]',
    }
  }
  if (sampleCount < minSamples) {
    return {
      label: `Collecting… ${sampleCount} / ${minSamples} samples`,
      detail: 'The Compute button unlocks once the minimum is reached.',
      dotClass: 'bg-[var(--theme-accent)]',
    }
  }
  if (bufferFull) {
    return {
      label: 'Buffer full — rolling window',
      detail: 'Oldest samples are being overwritten. Restart to lock a fresh window.',
      dotClass: 'bg-[var(--theme-accent)]',
    }
  }
  return {
    label: `Ready — ${sampleCount} samples`,
    detail: 'Click Compute (or toggle Live update) to view the spectrum.',
    dotClass: 'bg-[var(--color-success)]',
  }
}

/**
 * Per-potential one-liner telling the user what to expect from the
 * spectrum. Returns `null` for potentials we have no specific claim
 * about. This is pedagogy — the user reads the instrument result in
 * the context of the physics they selected.
 *
 * @param potentialType - Current TDSE potential
 * @returns A short hint or null
 */
export function derivePotentialExpectationHint(
  potentialType: TdseConfig['potentialType']
): string | null {
  switch (potentialType) {
    case 'harmonicTrap':
      return 'Expect equally spaced peaks at E_n = ℏω·(n + D/2) — see overlay.'
    case 'finiteWell':
      return 'Expect a few bound-state peaks below the well depth.'
    case 'doubleWell':
      return 'Expect tunnelling doublets (closely paired peaks) below the barrier.'
    case 'periodicLattice':
      return 'Expect Bloch-band structure: clusters of peaks separated by band gaps.'
    case 'radialDoubleWell':
      return 'Expect near-degenerate inner/outer well levels with small splittings.'
    case 'coupledAnharmonic':
      return 'Anharmonic ladder — peaks not equally spaced; tests coupling strength.'
    case 'becTrap':
      return 'Harmonic-trap eigenlevels shifted by the interaction g|ψ|² (mean field).'
    case 'barrier':
    case 'step':
    case 'free':
      return 'Scattering potential — mostly continuous spectrum. Peaks are resonances, not bound eigenvalues.'
    case 'driven':
      return 'Only meaningful when the drive is disarmed (static barrier).'
    case 'doubleSlit':
      return 'Mostly scattering — interference structure dominates over discrete peaks.'
    case 'andersonDisorder':
      return 'Disordered — spectrum is a dense set of localised levels; peaks depend on the seed.'
    case 'custom':
      return null
    default:
      return null
  }
}

/** Theoretical eigenvalue overlay to draw on top of the FFT plot. */
export interface HarmonicOverlay {
  /** Angular-frequency positions of the theoretical eigenvalues. */
  omegas: number[]
  /** Integer labels n = 0..N-1. */
  labels: number[]
  /** Human-readable caption rendered next to the plot. */
  caption: string
}

/**
 * Compute a theoretical overlay for the isotropic harmonic trap.
 * Returns `null` when the potential is not a harmonic trap or when the
 * trap is anisotropic (the per-dimension ladder does not collapse into
 * a single set of equally-spaced peaks).
 *
 * @param potentialType - Current TDSE potential type
 * @param omega - Base harmonic trap angular frequency
 * @param dim - Lattice dimension D
 * @param trapAnisotropy - Optional per-axis anisotropy ratios
 * @returns Overlay description or null
 */
export function buildHarmonicOverlay(
  potentialType: TdseConfig['potentialType'],
  omega: number,
  dim: number,
  trapAnisotropy: number[] | undefined
): HarmonicOverlay | null {
  if (potentialType !== 'harmonicTrap' && potentialType !== 'becTrap') return null
  if (!(omega > 0) || !Number.isFinite(omega)) return null
  if (trapAnisotropy && trapAnisotropy.length > 0) {
    // Isotropic check: all entries within 0.1% of each other.
    const first = trapAnisotropy[0]!
    for (let i = 0; i < trapAnisotropy.length; i++) {
      if (Math.abs(trapAnisotropy[i]! - first) > 1e-3) return null
    }
    // A uniform non-unit anisotropy is still isotropic (same ω on all
    // axes) — fall through with the scaled frequency.
    const effOmega = omega * first
    return buildOverlayFor(effOmega, dim)
  }
  return buildOverlayFor(omega, dim)
}

/**
 * Produce a harmonic-oscillator eigenvalue ladder.
 *
 * @param omega - Effective angular frequency
 * @param dim - Lattice dimension D
 * @returns Overlay with {@link HARMONIC_OVERLAY_LEVELS} levels
 */
function buildOverlayFor(omega: number, dim: number): HarmonicOverlay {
  // E_n = ℏω(n + D/2). We display ω positions (E/ℏ), which matches the
  // X-axis of the FFT plot.
  const omegas: number[] = []
  const labels: number[] = []
  for (let n = 0; n < HARMONIC_OVERLAY_LEVELS; n++) {
    omegas.push(omega * (n + dim / 2))
    labels.push(n)
  }
  return {
    omegas,
    labels,
    caption: `Theory: E_n / ℏ = ω·(n + ${dim}/2)`,
  }
}

/** Data bundle describing a fully-geometried SVG power spectrum. */
export interface PlotData {
  polyline: string
  peakMarkers: { x: number; y: number }[]
  overlayLines: { x: number; label: string }[]
  overlayCaption: string | null
  xTicks: { x: number; label: string }[]
}

/** Plot geometry (layout-critical; matches the SVG viewBox in SpectrometerPlot). */
export interface PlotGeometry {
  padL: number
  padT: number
  areaW: number
  areaH: number
}

/**
 * Compute the full set of SVG coordinates for the spectrum polyline,
 * peak markers, theoretical overlay lines, and numeric X-axis ticks.
 * Returns `null` whenever there is no meaningful spectrum to draw.
 *
 * Broken into small helpers (`computePeakMax`, `pickOmegaMax`,
 * `buildPolyline`) to keep each below the cognitive-complexity cap
 * and to make the zoom / projection logic individually testable.
 *
 * @param spectrum - Current spectrum (may be null or empty)
 * @param overlay - Theoretical overlay to draw on top, or null
 * @param geom - SVG geometry (plot area offsets and size)
 * @returns Geometry bundle or null
 */
export function buildPlotData(
  spectrum: HellerSpectrum | null,
  overlay: HarmonicOverlay | null,
  geom: PlotGeometry
): PlotData | null {
  if (!spectrum || spectrum.power.length === 0) return null
  const { omega, power, peaks } = spectrum

  const maxP = computeMaxPower(power)
  if (!(maxP > 0)) return null

  const nyquist = omega[omega.length - 1] ?? 0
  const omegaMax = pickOmegaMax(peaks, overlay, nyquist)

  const proj = makeProjection(maxP, omegaMax, geom)
  const polyline = buildPolyline(omega, power, omegaMax, proj)

  const peakMarkers = peaks
    .filter((p) => p.omega <= omegaMax)
    .map((p) => ({ x: proj.toX(p.omega), y: proj.toY(p.power) }))

  const overlayLines =
    overlay?.omegas
      .map((w, i) => ({
        x: proj.toX(w),
        omega: w,
        label: `n=${overlay.labels[i]}`,
      }))
      .filter((line) => line.omega <= omegaMax)
      .map(({ x, label }) => ({ x, label })) ?? []

  const xTicks = buildNiceTicks(0, omegaMax, 5).map((v) => ({
    x: proj.toX(v),
    label: formatTickLabel(v),
  }))

  return {
    polyline,
    peakMarkers,
    overlayLines,
    overlayCaption: overlay?.caption ?? null,
    xTicks,
  }
}

/* ── buildPlotData sub-helpers ─────────────────────────────────── */

interface Projection {
  toX: (w: number) => number
  toY: (p: number) => number
}

/**
 * Find the max value of the power array in one pass.
 *
 * @param power - Power array
 * @returns Max value (0 if array is empty or all non-positive)
 */
function computeMaxPower(power: Float64Array): number {
  let maxP = 0
  for (let k = 0; k < power.length; k++) {
    if (power[k]! > maxP) maxP = power[k]!
  }
  return maxP
}

/**
 * Choose an X-axis upper bound that focuses on the interesting region:
 * the captured peaks and any theoretical overlay. Never exceeds the
 * Nyquist limit — the FFT simply has no information past it.
 *
 * @param peaks - Extracted top peaks from the spectrum
 * @param overlay - Theoretical overlay, or null
 * @param nyquist - Nyquist angular frequency (plot hard cap)
 * @returns Chosen upper ω bound (always > 0)
 */
function pickOmegaMax(
  peaks: { omega: number }[],
  overlay: HarmonicOverlay | null,
  nyquist: number
): number {
  let omegaMax = nyquist > 0 ? nyquist : 1
  if (peaks.length > 0) {
    let maxPeakOmega = 0
    for (const p of peaks) {
      if (p.omega > maxPeakOmega) maxPeakOmega = p.omega
    }
    if (maxPeakOmega > 0) {
      omegaMax = Math.min(omegaMax, Math.max(omegaMax * 0.1, 2 * maxPeakOmega))
    }
  }
  if (overlay && overlay.omegas.length > 0) {
    const maxTheory = overlay.omegas[overlay.omegas.length - 1]!
    const minZoom = 1.3 * maxTheory
    omegaMax = Math.max(omegaMax, minZoom)
  }
  // Never zoom past Nyquist (FFT is only defined up to that point).
  if (nyquist > 0) omegaMax = Math.min(omegaMax, nyquist)
  if (!(omegaMax > 0) || !Number.isFinite(omegaMax)) omegaMax = 1
  return omegaMax
}

/**
 * Construct the ω → x and power → y projection functions for the plot.
 *
 * @param maxP - Max power value (for log normalization)
 * @param omegaMax - Chosen X-axis upper bound
 * @param geom - SVG plot geometry
 * @returns `{toX, toY}` — pixel-space projectors
 */
function makeProjection(maxP: number, omegaMax: number, geom: PlotGeometry): Projection {
  const floor = maxP * 1e-4
  const logMax = Math.log10(maxP)
  const logMin = Math.log10(floor)
  const logRange = logMax - logMin || 1
  return {
    toX: (w) => geom.padL + Math.min(1, Math.max(0, w / omegaMax)) * geom.areaW,
    toY: (p) => {
      const pClamped = Math.max(p, floor)
      return geom.padT + (1 - (Math.log10(pClamped) - logMin) / logRange) * geom.areaH
    },
  }
}

/**
 * Build the SVG polyline string for the spectrum, clipped to the zoom
 * window [0, omegaMax].
 *
 * @param omega - Angular-frequency bins
 * @param power - Power values at each bin
 * @param omegaMax - Upper bound of the zoom window
 * @param proj - ω → x / power → y projectors
 * @returns Space-separated `x,y` points
 */
function buildPolyline(
  omega: Float64Array,
  power: Float64Array,
  omegaMax: number,
  proj: Projection
): string {
  const points: string[] = []
  for (let k = 0; k < power.length; k++) {
    if (omega[k]! > omegaMax) break
    points.push(`${proj.toX(omega[k]!).toFixed(1)},${proj.toY(power[k]!).toFixed(1)}`)
  }
  return points.join(' ')
}

/* ── Tick formatting ───────────────────────────────────────────── */

/**
 * Format a numeric tick label with a human-friendly number of digits.
 *
 * @param v - Tick value
 * @returns Short string representation
 */
function formatTickLabel(v: number): string {
  if (v === 0) return '0'
  const abs = Math.abs(v)
  if (abs >= 100) return v.toFixed(0)
  if (abs >= 10) return v.toFixed(1)
  if (abs >= 1) return v.toFixed(2)
  return v.toFixed(3)
}

/**
 * Build a small set of "nice" round tick values across [lo, hi]. Uses
 * the Heckbert 1990 nice-number heuristic.
 *
 * @param lo - Lower bound (inclusive)
 * @param hi - Upper bound (inclusive)
 * @param targetCount - Desired number of ticks (approximate)
 * @returns Ticks inside [lo, hi]
 */
function buildNiceTicks(lo: number, hi: number, targetCount: number): number[] {
  if (!(hi > lo) || !Number.isFinite(hi - lo)) return [lo]
  const range = niceNum(hi - lo, false)
  const step = niceNum(range / Math.max(1, targetCount - 1), true)
  const start = Math.ceil(lo / step) * step
  const ticks: number[] = []
  // Guard the loop against FP drift at very small steps.
  for (let v = start; v <= hi + step * 0.5; v += step) {
    if (v >= lo - step * 0.5 && v <= hi + step * 0.5) {
      ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v)
    }
    if (ticks.length > 32) break
  }
  return ticks
}

/**
 * Heckbert nice-number heuristic: round `range` up/down to {1, 2, 5, 10}
 * × 10^k. Same helper as used by the inline energy diagram.
 *
 * @param range - Input magnitude
 * @param round - If true, round to nearest nice; else ceil
 * @returns Nice number
 */
function niceNum(range: number, round: boolean): number {
  const exp = Math.floor(Math.log10(Math.abs(range) || 1))
  const frac = range / Math.pow(10, exp)
  let nice: number
  if (round) {
    if (frac < 1.5) nice = 1
    else if (frac < 3) nice = 2
    else if (frac < 7) nice = 5
    else nice = 10
  } else {
    if (frac <= 1) nice = 1
    else if (frac <= 2) nice = 2
    else if (frac <= 5) nice = 5
    else nice = 10
  }
  return nice * Math.pow(10, exp)
}
