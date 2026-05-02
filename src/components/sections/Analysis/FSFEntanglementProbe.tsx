/**
 * FSF Entanglement Probe
 *
 * Peschel correlation-matrix entanglement entropy for the 1D slice of
 * the free scalar field. Displays a sweep of `S(L_A)` for a contiguous
 * interval and extracts the effective log-slope (central charge in the
 * 1D case; a mixed bulk/boundary effective slope for `latticeDim > 1`).
 *
 * Toggles off by default — the compute cost is `O((N_0/2)⁴)` at worst
 * for the length sweep, plus the transverse-mode sum in the correlator
 * builder which scales as `O(Π N_d)` per k_0. At the current
 * `MAX_PROBE_GRIDSIZE = 256` these together tip into the "several seconds
 * of main-thread work" regime if run inline, so all heavy lifting runs
 * in a dedicated Web Worker (`peschelWorker.ts`) — the component only
 * orchestrates request/response, shows a spinner while pending, and
 * renders the latest result.
 *
 * For `latticeDim > 1` the slice is along axis 0, with the transverse
 * axes marginalised *into* the correlator by summing over all transverse
 * k modes. This is the reduced two-point function of the full N-D
 * vacuum restricted to the 1D slice, not the two-point function of a
 * separate 1D theory that happens to share `(N_0, a_0, m)`.
 *
 * @module components/sections/Analysis/FSFEntanglementProbe
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { logger } from '@/lib/logger'
import type { CosmologicalEntropyTrajectory } from '@/lib/physics/entanglement/peschelCosmology'
import type {
  PeschelWorkerRequest,
  PeschelWorkerResponse,
  PeschelWorkerResultMessage,
} from '@/lib/physics/entanglement/peschelWorker'
import {
  computeFsfCosmologySnapshot,
  computeFsfVacuumDispersion,
} from '@/lib/physics/freeScalar/vacuumDispersion'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

import { MetricRow } from './AnalysisPrimitives'
import { FSFCosmoTrajectoryChart } from './FSFCosmoTrajectoryChart'

/**
 * Maximum lattice size we are willing to diagonalise inside the worker.
 * Past this the full length sweep scales as `O(N⁴)` and even a worker
 * thread cannot keep up with rapid parameter scrubbing — the UI surfaces
 * a "too large" hint instead of silently queueing minute-long jobs.
 *
 * Cap justification (benchmark: `scripts/benchmark-peschel.ts`, 2026-04-11):
 *   N=128 → ~69 ms,  N=256 → ~1.1 s,  projected N=384 → ~5.5 s,
 *   projected N=512 → ~17 s. 256 keeps the worker sweep under the
 *   "feels instant" threshold while the 120 ms debounce coalesces
 *   rapid scrubs. Re-run the benchmark before changing this cap.
 */
const MAX_PROBE_GRIDSIZE = 256

/**
 * Debounce delay for coalescing rapid parameter changes into a single
 * worker dispatch. 120 ms is long enough to skip intermediate slider
 * ticks but short enough to feel instant once the user lets go.
 */
const REQUEST_DEBOUNCE_MS = 120

/** Chart geometry (inline SVG). */
const CHART_WIDTH = 260
const CHART_HEIGHT = 120
const CHART_PX = 32
const CHART_PY = 14
const CHART_PW = CHART_WIDTH - 2 * CHART_PX
const CHART_PH = CHART_HEIGHT - 2 * CHART_PY

/**
 * Build the logarithmic η sweep used for the cosmological trajectory
 * chart. Spans a full decade on either side of the current `η₀` with an
 * **odd** sample count so the midpoint index lands exactly on `η₀`. The
 * midpoint is pinned to `eta0` bit-identically (not re-derived via
 * `exp(log(|eta0|))`) so the trajectory line passes through the current
 * parameter at machine precision — otherwise the `η₀` marker could sit
 * between two neighbouring samples and disagree visually with the live
 * `S(L_A)` readout in the metric row above the chart.
 *
 * @param eta0 - Current conformal time (must be finite and non-zero)
 * @returns A negative-η sweep, or an empty array if `eta0` is not a
 *          usable negative finite number
 */
function buildCosmoEtaSweep(eta0: number): number[] {
  if (!Number.isFinite(eta0) || eta0 === 0) return []
  // Odd count (25) so index 12 = (N-1)/2 is the midpoint.
  const nPoints = 25
  const mid = (nPoints - 1) / 2
  const logAbs0 = Math.log(Math.abs(eta0))
  const out: number[] = new Array(nPoints)
  for (let i = 0; i < nPoints; i++) {
    if (i === mid) {
      // Pin the midpoint to eta0 exactly — Math.exp(Math.log(x)) is not
      // bit-identical to x, and the main S(L_A) readout consumes the
      // raw eta0 through `computeFsfVacuumDispersion`. Matching at bit
      // level keeps the marker and the live metric row in lockstep.
      out[i] = eta0
      continue
    }
    const f = (i - mid) / mid
    const logAbs = logAbs0 + f * Math.log(10)
    out[i] = -Math.exp(logAbs)
  }
  return out
}

/**
 * Controls panel and inline-SVG chart for the Peschel entanglement entropy
 * probe on the free scalar field.
 *
 * @returns Control group with enable toggle, subsystem-length slider, and
 *          live `S(L_A)` plot with fitted CFT log line.
 */
export const FSFEntanglementProbe: React.FC = React.memo(() => {
  const { fsf } = useExtendedObjectStore(
    useShallow((s) => ({
      fsf: s.schroedinger.freeScalar,
    }))
  )

  const [enabled, setEnabled] = useState(false)

  const N = fsf.gridSize[0] ?? 0
  const latticeDim = fsf.latticeDim
  const mass = fsf.mass
  const cosmologyEnabled = fsf.cosmology.enabled
  const cosmologyEta0 = fsf.cosmology.eta0
  const cosmologyPreset = fsf.cosmology.preset

  // Guard against huge lattices even before we try to run Peschel.
  const tooLarge = N > MAX_PROBE_GRIDSIZE
  const canCompute = enabled && !tooLarge && N >= 2

  // Cosmology health flag: when the user has enabled a non-Minkowski
  // preset but `computeFsfCosmologySnapshot` cannot resolve `a(η₀)`
  // (invalid preset params, or numerically failing background
  // evaluation), both the main `m_eff²` readout and the trajectory
  // chart silently degrade — the main probe falls back to the
  // Klein-Gordon `mass * mass` path, and the trajectory is dropped
  // entirely. Surface that state explicitly so the user does not
  // interpret flat-space numbers as cosmology-aware.
  const cosmoDegraded = useMemo(() => {
    if (!cosmologyEnabled) return false
    if (cosmologyPreset === 'minkowski') return false
    return computeFsfCosmologySnapshot(fsf, cosmologyEta0) === undefined
  }, [cosmologyEnabled, cosmologyPreset, cosmologyEta0, fsf])

  const sliderMax = Math.max(1, Math.floor(N / 2))
  const defaultL = Math.max(1, Math.floor(N / 4))
  const [laSelection, setLaSelection] = useState<number>(defaultL)
  const la = Math.min(Math.max(laSelection, 1), sliderMax)

  // ─── Worker lifecycle ─────────────────────────────────────────────────
  //
  // The worker is created lazily when the probe is first enabled, then
  // torn down either on disable or on unmount. We keep the worker alive
  // across parameter changes (common) but destroy it across enable
  // toggles (rare) so the memory footprint is zero while the probe is
  // off.
  const workerRef = useRef<Worker | null>(null)
  const epochRef = useRef(0)
  // The component only consumes the success branch; error responses are
  // logged via the consumer below and do not feed any chart, so we narrow
  // the result state to PeschelWorkerResultMessage and treat the error
  // branch as a log-only signal that bumps `pending` back to false.
  const [result, setResult] = useState<PeschelWorkerResultMessage | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!canCompute) {
      // Tear down the worker when we leave the enabled/valid branch.
      // Also bump the epoch so any in-flight response is ignored when we
      // flip back on.
      if (workerRef.current) {
        workerRef.current.terminate()
        workerRef.current = null
      }
      epochRef.current += 1
      setResult(null)
      setPending(false)
      return
    }

    // Reuse an existing worker if we already created one in a previous
    // canCompute window — nothing to do here. First-time activation
    // spins a new instance.
    if (workerRef.current) return

    const worker = new Worker(
      new URL('@/lib/physics/entanglement/peschelWorker.ts', import.meta.url),
      { type: 'module' }
    )
    worker.onmessage = (e: MessageEvent<PeschelWorkerResponse>) => {
      const response = e.data
      // Drop any response whose epoch no longer matches the latest
      // request — the UI has moved on and a stale result would cause a
      // frame of wrong-parameter rendering.
      if (response.epoch !== epochRef.current) return
      if (response.type === 'error') {
        logger.warn('[FSFEntanglementProbe] worker compute failed:', response.message)
        setPending(false)
        return
      }
      setResult(response)
      setPending(false)
    }
    worker.onerror = (err) => {
      logger.error('[FSFEntanglementProbe] worker error', err)
      setPending(false)
    }
    workerRef.current = worker

    return () => {
      // Strict-mode double-effect cleanup: terminate the worker when the
      // component unmounts or canCompute flips false. The effect above
      // also handles this, but React guarantees the cleanup runs on
      // every dependency change, so we belt-and-braces it.
      worker.terminate()
      if (workerRef.current === worker) workerRef.current = null
    }
  }, [canCompute])

  // ─── Request dispatch ────────────────────────────────────────────────
  //
  // Debounce so a burst of slider events collapses into a single worker
  // post. Effective `m²` is computed inside the effect body so the
  // dependency array can track the underlying primitive config slots
  // directly — splitting it into a separate `useMemo` would add a
  // polymorphic memo cell for no gain.
  //
  // Epoch discipline: the epoch counter is bumped **synchronously** at the
  // start of the effect, *before* the debounce setTimeout fires. This
  // matters because a previously-posted request can still return during
  // the 120 ms debounce window — if we only bumped inside the setTimeout
  // callback, that stale response would match the current epoch and
  // render wrong-parameter numbers for up to one frame. Bumping now
  // invalidates every in-flight request immediately, so `onmessage`
  // drops it. The same bump also flips `pending` so the UI shows the
  // stale chart at reduced opacity while it waits for the fresh result.
  useEffect(() => {
    if (!canCompute || !workerRef.current) return

    // Invalidate in-flight responses and surface pending state the moment
    // inputs change, not when the debounce fires.
    epochRef.current += 1
    setPending(true)
    const dispatchedEpoch = epochRef.current

    const handle = setTimeout(() => {
      if (!workerRef.current) return
      // Guard against a cleanup-then-refire race: if another dependency
      // change already bumped the epoch past the one we captured, this
      // scheduled dispatch is already stale.
      if (dispatchedEpoch !== epochRef.current) return
      const dispersion = computeFsfVacuumDispersion(fsf, cosmologyEta0)
      // Collapse the vacuum-dispersion enum back to a scalar massSq for
      // the Peschel worker. The anisotropic Bianchi-I variant (an object)
      // is not consumed here because the probe computes its own per-mode
      // ω spectrum; we feed it `m²·a²(η)` instead, matching what the
      // worker's existing formula expects.
      let massSq: number
      if (dispersion === 'kgFloor') {
        massSq = mass * mass
      } else if (typeof dispersion === 'number') {
        massSq = dispersion
      } else {
        // Bianchi-I anisotropic variant — collapse to kineticScale·massSq
        // (its scalar ω² contribution). Under the Bianchi-I vacuum preset
        // at η₀=1.5 this equals m²·a² exactly (aKinetic=aFull=1 at t=1);
        // at non-symmetric η it approximates the FLRW trace the probe
        // already assumes.
        massSq = dispersion.kineticScale * dispersion.massSq
      }
      // Thread the full N-D lattice geometry through to the worker so it
      // can build the slice correlator by summing over transverse k modes.
      // Slicing the stored config at `latticeDim` drops any stale entries
      // left over from a larger earlier setting.
      const req: PeschelWorkerRequest = {
        type: 'compute',
        epoch: dispatchedEpoch,
        gridSize: fsf.gridSize.slice(0, latticeDim),
        spacing: fsf.spacing.slice(0, latticeDim),
        latticeDim,
        massSq,
        subsystemLength: la,
        cosmology: cosmologyEnabled
          ? {
              mass,
              params: {
                preset: fsf.cosmology.preset,
                spacetimeDim: latticeDim + 1,
                hubble: fsf.cosmology.hubble,
                steepness: fsf.cosmology.steepness,
                lqcRhoCritical: fsf.cosmology.lqcRhoCritical,
                lqcEquationOfState: fsf.cosmology.lqcEquationOfState,
                lqcInitialRhoRatio: fsf.cosmology.lqcInitialRhoRatio,
              },
              etaSweep: buildCosmoEtaSweep(cosmologyEta0),
            }
          : undefined,
      }
      workerRef.current.postMessage(req)
    }, REQUEST_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [
    canCompute,
    N,
    la,
    mass,
    latticeDim,
    cosmologyEnabled,
    cosmologyEta0,
    fsf,
    fsf.cosmology.preset,
    fsf.cosmology.hubble,
    fsf.cosmology.steepness,
    fsf.spacing,
  ])

  // ─── Derived UI state ────────────────────────────────────────────────

  const currentEntropy = useMemo(() => {
    if (!result) return Number.NaN
    const idx = result.lengths.indexOf(la)
    return idx >= 0 ? result.entropies[idx]! : Number.NaN
  }, [result, la])

  const cosmoTrajectory: CosmologicalEntropyTrajectory | null = useMemo(() => {
    if (!result || !result.trajectory) return null
    if (result.trajectory.etas.length < 2) return null
    return result.trajectory
  }, [result])

  const chart = useMemo(() => {
    if (!result || result.lengths.length === 0) return null

    // Filter to strictly positive L for log scaling
    const pts: Array<{ x: number; y: number; L: number; S: number }> = []
    let ymin = Number.POSITIVE_INFINITY
    let ymax = Number.NEGATIVE_INFINITY
    for (let i = 0; i < result.lengths.length; i++) {
      const L = result.lengths[i]!
      const S = result.entropies[i]!
      if (!Number.isFinite(S)) continue
      if (S < ymin) ymin = S
      if (S > ymax) ymax = S
      pts.push({ x: Math.log(L), y: S, L, S })
    }
    if (pts.length === 0) return null

    const xMin = Math.log(1)
    const xMax = Math.log(result.half)
    const xRange = Math.max(xMax - xMin, 1e-6)
    const yPad = Math.max((ymax - ymin) * 0.08, 0.02)
    const yLo = ymin - yPad
    const yHi = ymax + yPad
    const yRange = Math.max(yHi - yLo, 1e-6)

    const toX = (lx: number): number => CHART_PX + ((lx - xMin) / xRange) * CHART_PW
    const toY = (sy: number): number => CHART_PY + (1 - (sy - yLo) / yRange) * CHART_PH

    const path = pts.map((p) => `${toX(p.x).toFixed(1)},${toY(p.y).toFixed(1)}`).join(' ')

    // Fit line: S = (c/3) log(L) + intercept, drawn over the window
    // actually used by fitCentralCharge (short-distance band).
    let fitLine: { x1: number; y1: number; x2: number; y2: number } | null = null
    const { c, intercept } = result.fit
    if (Number.isFinite(c) && Number.isFinite(intercept)) {
      const nFull = 2 * result.half
      const winLo = Math.max(1, Math.ceil(0.05 * nFull))
      const winHi = Math.max(winLo, Math.floor(0.25 * nFull))
      const slope = c / 3
      const lLo = Math.log(winLo)
      const lHi = Math.log(winHi)
      const sLo = slope * lLo + intercept
      const sHi = slope * lHi + intercept
      fitLine = {
        x1: toX(lLo),
        y1: toY(sLo),
        x2: toX(lHi),
        y2: toY(sHi),
      }
    }

    const markerX = toX(Math.log(la))

    return { path, fitLine, markerX, xMin, xMax, yLo, yHi }
  }, [result, la])

  return (
    <ControlGroup
      title="Entanglement Probe (Peschel)"
      collapsible
      defaultOpen
      data-testid="control-group-entanglement-probe"
    >
      <div className="space-y-2 px-1" data-testid="entanglement-probe-panel">
        <Switch
          label="Enabled"
          checked={enabled}
          onCheckedChange={setEnabled}
          data-testid="entanglement-probe-toggle"
        />

        {!enabled && (
          <p className="text-xs text-text-tertiary italic">
            Enable to compute S(L_A) from lattice correlators
          </p>
        )}

        {enabled && tooLarge && (
          <p className="text-xs text-amber-300/80 italic">
            Lattice too large ({N} &gt; {MAX_PROBE_GRIDSIZE}); disable or lower grid
          </p>
        )}

        {enabled && !tooLarge && N < 2 && (
          <p className="text-xs text-text-tertiary italic">
            Grid size must be at least 2 to compute S(L_A).
          </p>
        )}

        {enabled && !tooLarge && N >= 2 && (
          <>
            {latticeDim > 1 && (
              <p className="text-xs text-text-tertiary italic">Probing 1D slice along dim 0</p>
            )}

            <Slider
              label="Subsystem length L_A"
              min={1}
              max={sliderMax}
              step={1}
              value={la}
              onChange={setLaSelection}
              showValue
              data-testid="entanglement-probe-la-slider"
            />

            {pending && !result && (
              <p
                className="text-xs text-text-tertiary italic"
                data-testid="entanglement-probe-pending"
              >
                Computing entanglement spectrum…
              </p>
            )}

            {cosmoDegraded && (
              <p
                className="text-xs text-amber-300/80 italic"
                data-testid="entanglement-probe-cosmo-degraded"
              >
                Cosmology params invalid for preset “{cosmologyPreset}” at η₀ ={' '}
                {cosmologyEta0.toExponential(2)}; m_eff² and S(L_A) use the flat-space fallback and
                the trajectory is hidden.
              </p>
            )}

            {chart && (
              <div
                className="rounded-md overflow-hidden bg-[var(--bg-surface)] relative"
                data-testid="entanglement-probe-chart"
              >
                <svg width="100%" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="block">
                  {/* Fit line (drawn first so points sit on top) */}
                  {chart.fitLine && (
                    <line
                      x1={chart.fitLine.x1}
                      y1={chart.fitLine.y1}
                      x2={chart.fitLine.x2}
                      y2={chart.fitLine.y2}
                      stroke="var(--theme-accent)"
                      strokeWidth={1}
                      strokeDasharray="3,3"
                      opacity={0.7}
                    />
                  )}
                  {/* Data polyline */}
                  <polyline
                    points={chart.path}
                    fill="none"
                    stroke="var(--theme-accent)"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    opacity={pending ? 0.35 : 1}
                  />
                  {/* Vertical marker at current L_A */}
                  <line
                    x1={chart.markerX}
                    y1={CHART_PY}
                    x2={chart.markerX}
                    y2={CHART_PY + CHART_PH}
                    stroke="var(--text-secondary)"
                    strokeWidth={0.75}
                    strokeDasharray="2,3"
                    opacity={0.8}
                  />
                  <text
                    x={CHART_PX + CHART_PW / 2}
                    y={CHART_HEIGHT - 2}
                    textAnchor="middle"
                    fill="var(--text-tertiary)"
                    fontSize={8}
                    fontFamily="monospace"
                  >
                    log L_A
                  </text>
                  <text
                    x={4}
                    y={CHART_PY + CHART_PH / 2}
                    textAnchor="middle"
                    fill="var(--text-tertiary)"
                    fontSize={8}
                    fontFamily="monospace"
                    transform={`rotate(-90, 4, ${CHART_PY + CHART_PH / 2})`}
                  >
                    S(L_A)
                  </text>
                </svg>
              </div>
            )}

            {result && (
              <div className="space-y-0.5">
                <MetricRow label="S(L_A) [nats]" value={currentEntropy} digits={4} />
                <MetricRow
                  label="ĉ (fit)"
                  value={result.fit.c}
                  digits={2}
                  unit={result.fit.c < 0.1 ? ' area-law' : ''}
                />
                <MetricRow label="fit points" value={result.fit.usedPoints} digits={0} />
                <MetricRow label="m_eff²" value={result.massSq} digits={4} />
              </div>
            )}

            {result?.modular && (
              <div
                className={
                  result.subsystemLength === la
                    ? 'transition-opacity'
                    : 'opacity-50 transition-opacity'
                }
                data-testid="entanglement-probe-modular"
                data-modular-stale={result.subsystemLength === la ? 'false' : 'true'}
              >
                <p className="text-[10px] text-text-tertiary uppercase tracking-wider pt-1">
                  Modular spectrum at L_A = {result.subsystemLength}
                </p>
                <div className="space-y-0.5">
                  <MetricRow label="ν_min" value={result.modular.nu[0] ?? Number.NaN} digits={4} />
                  <MetricRow
                    label="gap (ν_min − ½)"
                    value={result.modular.entanglementGap}
                    digits={4}
                  />
                  <MetricRow
                    label="T_mod"
                    value={result.modular.temperatureFit.temperature}
                    digits={3}
                    unit={` (r²=${result.modular.temperatureFit.rSquared.toFixed(2)})`}
                    fallback="— non-equi-spaced"
                  />
                </div>
              </div>
            )}

            {cosmoTrajectory && (
              <div
                className={
                  result && result.subsystemLength === la
                    ? 'transition-opacity'
                    : 'opacity-50 transition-opacity'
                }
                data-testid="entanglement-probe-trajectory"
                data-trajectory-stale={result && result.subsystemLength === la ? 'false' : 'true'}
              >
                <FSFCosmoTrajectoryChart trajectory={cosmoTrajectory} currentEta={cosmologyEta0} />
              </div>
            )}
          </>
        )}
      </div>
    </ControlGroup>
  )
})

FSFEntanglementProbe.displayName = 'FSFEntanglementProbe'
