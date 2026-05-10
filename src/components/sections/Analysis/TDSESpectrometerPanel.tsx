/**
 * TDSE Wavepacket Spectrometer Panel
 *
 * Plain-language UI for the Heller (1981) wavepacket autocorrelation
 * spectrometer. The panel shows the user what the instrument is doing
 * at every stage — idle, collecting, ready, paused, or broken — so
 * they never have to guess why a disabled button is disabled or what
 * the peaks on the plot mean physically.
 *
 * Layout (top to bottom):
 *   1. One-sentence inline description (plain English + brief physics).
 *   2. Capture toggle (Start / Stop) and a contextual status block
 *      that narrates the current state.
 *   3. Live-update toggle (off by default): when on, the spectrum
 *      auto-recomputes as new samples land.
 *   4. Buffer / time / resolution metric rows.
 *   5. SVG power-spectrum plot with auto-zoomed numeric X-axis ticks
 *      and, where the potential admits it, a theoretical eigenvalue
 *      overlay so users can see peaks land on the reference lines.
 *   6. Peak list showing both ω and E = ℏω so the physics units are
 *      unambiguous.
 *   7. Advanced disclosure hosting the sample-interval slider (which
 *      restarts capture — hidden from casual users and debounced so
 *      dragging does not wipe the buffer on every intermediate step).
 *
 * The heavy lifting (GPU readback, ring buffer management, static-H
 * fingerprint reset) happens inside `TDSEHellerReadback`. The SVG
 * geometry lives in `SpectrometerPlot` and the pure derivations live
 * in `spectrometerHelpers`. This file is just wiring.
 *
 * @module components/sections/Analysis/TDSESpectrometerPanel
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/ui/Button'
import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import type { TdseConfig } from '@/lib/geometry/extended/types'
import {
  computeHellerSpectrum,
  HELLER_DEFAULT_CAPACITY,
  HELLER_DEFAULT_MIN_SAMPLES,
  type HellerSpectrum,
} from '@/lib/physics/tdse/heller'
import {
  HELLER_MAX_SAMPLE_INTERVAL,
  HELLER_MIN_SAMPLE_INTERVAL,
  useHellerSpectrometerStore,
} from '@/stores/diagnostics/hellerSpectrometerStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

import { MetricRow } from './AnalysisPrimitives'
import {
  buildHarmonicOverlay,
  deriveCaptureTiming,
  derivePotentialExpectationHint,
  deriveStatusMessage,
  isHellerCompatiblePotential,
} from './spectrometerHelpers'
import { SpectrometerPlot } from './SpectrometerPlot'

/** Trailing debounce window (ms) between slider drag and store commit. */
const INTERVAL_COMMIT_DEBOUNCE_MS = 250

/** How often the live-update effect should recompute the spectrum. */
const LIVE_UPDATE_SAMPLE_STRIDE = 8

/**
 * Props for {@link TDSESpectrometerPanel}.
 */
export interface TDSESpectrometerPanelProps {
  /**
   * Current TDSE configuration. Drives the potential-aware messaging
   * and the theoretical-overlay geometry. Passed by the parent so the
   * panel does not need its own subscription to `extendedObjectStore`.
   */
  tdse: TdseConfig
}

/**
 * Run the pure-logic spectrum builder on the store's current ring
 * buffer snapshot. Kept as a plain function (not a `useCallback`) so
 * it does not close over component scope and stays cheap to reference.
 *
 * @returns Fresh spectrum, or null if no buffer has been wired yet
 */
function runHellerCompute(): HellerSpectrum | null {
  const buf = useHellerSpectrometerStore.getState().bufferRef
  if (!buf) return null
  return computeHellerSpectrum(buf)
}

/**
 * Heller Wavepacket Spectrometer panel for TDSE mode.
 *
 * @param props - Panel props
 * @returns The spectrometer control and visualisation panel
 */
export const TDSESpectrometerPanel: React.FC<TDSESpectrometerPanelProps> = React.memo(
  ({ tdse }) => {
    const {
      enabled,
      sampleInterval,
      sampleCount,
      resetVersion,
      hamiltonianTimeDependent,
      bufferRef,
      setEnabled,
      setSampleInterval,
      requestReset,
    } = useHellerSpectrometerStore(
      useShallow((s) => ({
        enabled: s.enabled,
        sampleInterval: s.sampleInterval,
        sampleCount: s.sampleCount,
        resetVersion: s.resetVersion,
        hamiltonianTimeDependent: s.hamiltonianTimeDependent,
        bufferRef: s.bufferRef,
        setEnabled: s.setEnabled,
        setSampleInterval: s.setSampleInterval,
        requestReset: s.requestReset,
      }))
    )

    // Couple Start / Restart with the same wavefunction reset the
    // timeline "Reset" button performs. Without this, users have to
    // manually click timeline-reset in addition to pressing Start, and
    // forgetting either one anchors ψ₀ against a stale wavepacket that
    // had already evolved arbitrarily far from its initial state.
    const resetTdseField = useExtendedObjectStore((s) => s.resetTdseField)

    /**
     * Start-or-stop toggle handler. On turn-on, also reinitialise the
     * wavefunction (needsReset=true on the TDSE config) so ψ(0) — the
     * anchor for the autocorrelation — is the mode's true initial
     * state, not whatever ψ happens to be at the moment the user
     * clicked.
     */
    const handleEnabledChange = useCallback(
      (next: boolean): void => {
        if (next) resetTdseField()
        setEnabled(next)
      },
      [resetTdseField, setEnabled]
    )

    /**
     * Restart button handler. Clears the ring buffer + ψ₀ AND resets
     * the wavefunction — the two have to happen together or the next
     * anchor will be taken against the drift-evolved state and the
     * spectrum will silently be wrong.
     */
    const handleRestart = useCallback((): void => {
      resetTdseField()
      requestReset()
    }, [resetTdseField, requestReset])

    const bufferCapacity = bufferRef?.capacity ?? HELLER_DEFAULT_CAPACITY

    /* ── Destructure TDSE fields the panel reads ─────────────── */
    // Avoids re-running memos on unrelated visual toggles.
    const { potentialType, harmonicOmega, latticeDim, trapAnisotropy, hbar } = tdse

    /* ── Spectrum state ─────────────────────────────────────── */
    const [spectrum, setSpectrum] = useState<HellerSpectrum | null>(null)
    const [computeAttempted, setComputeAttempted] = useState(false)
    const [liveUpdate, setLiveUpdate] = useState(false)

    // Drop any previously computed spectrum when the capture is cleared
    // (either by the user or by the static-H fingerprint guard in the
    // readback pass).
    useEffect(() => {
      setSpectrum(null)
      setComputeAttempted(false)
    }, [resetVersion])

    // When the Hamiltonian becomes time-dependent mid-view, drop the
    // displayed spectrum: it is no longer a valid readout of a
    // stationary eigenbasis and could mislead the user.
    useEffect(() => {
      if (hamiltonianTimeDependent) {
        setSpectrum(null)
        setComputeAttempted(false)
      }
    }, [hamiltonianTimeDependent])

    /* ── Compute handlers ───────────────────────────────────── */
    const onCompute = (): void => {
      setComputeAttempted(true)
      setSpectrum(runHellerCompute())
    }

    /* ── Live-update effect ─────────────────────────────────── */
    // Recompute the spectrum every LIVE_UPDATE_SAMPLE_STRIDE new
    // samples while enabled. Reads `liveUpdate` and
    // `hamiltonianTimeDependent` inside the effect body so toggling
    // them mid-capture does not require re-subscribing.
    const lastComputedCountRef = useRef(0)
    useEffect(() => {
      if (!liveUpdate) return
      if (hamiltonianTimeDependent) return
      if (sampleCount < HELLER_DEFAULT_MIN_SAMPLES) return
      if (sampleCount - lastComputedCountRef.current < LIVE_UPDATE_SAMPLE_STRIDE) return
      lastComputedCountRef.current = sampleCount
      setComputeAttempted(true)
      setSpectrum(runHellerCompute())
    }, [sampleCount, liveUpdate, hamiltonianTimeDependent])

    // Reset the live-update stride anchor on any capture reset so the
    // first post-reset sample above the min-gate triggers a fresh
    // compute instead of waiting another LIVE_UPDATE_SAMPLE_STRIDE.
    useEffect(() => {
      lastComputedCountRef.current = 0
    }, [resetVersion])

    /* ── Debounced sample-interval slider ───────────────────── */
    // Local pending value: the slider writes here continuously while
    // the user drags; the effect below commits to the store after
    // INTERVAL_COMMIT_DEBOUNCE_MS of inactivity. Without this, every
    // intermediate slider position would trigger a full capture reset
    // via `setSampleInterval`'s physics guard, wiping the buffer on
    // every tick of the drag.
    const [pendingInterval, setPendingInterval] = useState(sampleInterval)

    // External writes to the store (e.g. explicit reset, preset load)
    // should flow back to the slider. Only overwrite the local pending
    // value when it differs from the store — otherwise toggling
    // `enabled` (which does not touch `sampleInterval`) would still
    // stomp user input via stale re-renders.
    useEffect(() => {
      setPendingInterval((prev) => (prev === sampleInterval ? prev : sampleInterval))
    }, [sampleInterval])

    useEffect(() => {
      if (pendingInterval === sampleInterval) return
      const id = window.setTimeout(() => {
        setSampleInterval(pendingInterval)
      }, INTERVAL_COMMIT_DEBOUNCE_MS)
      return (): void => window.clearTimeout(id)
    }, [pendingInterval, sampleInterval, setSampleInterval])

    /* ── Derived display values ─────────────────────────────── */
    const hasEnoughSamples = sampleCount >= HELLER_DEFAULT_MIN_SAMPLES
    const captureFull = sampleCount >= bufferCapacity

    // bufferRef is a stable mutable reference from the pass that mutates
    // in place (React cannot observe this). Pass sampleCount through to
    // force re-derivation when the buffer advances — otherwise T captured /
    // Δω / Nyquist rows would freeze at the first frame's values.
    const timing = useMemo(
      () => deriveCaptureTiming(bufferRef, sampleCount),
      [bufferRef, sampleCount]
    )

    const potentialIncompatible = useMemo(
      () => !isHellerCompatiblePotential(potentialType),
      [potentialType]
    )

    const statusMessage = useMemo(
      () =>
        deriveStatusMessage({
          enabled,
          hamiltonianTimeDependent,
          sampleCount,
          bufferFull: captureFull,
          minSamples: HELLER_DEFAULT_MIN_SAMPLES,
          computeAttempted,
          spectrumEmpty: spectrum !== null && spectrum.nUsed === 0,
          potentialIncompatible,
        }),
      [
        enabled,
        hamiltonianTimeDependent,
        sampleCount,
        captureFull,
        computeAttempted,
        spectrum,
        potentialIncompatible,
      ]
    )

    const expectationHint = useMemo(
      () => derivePotentialExpectationHint(potentialType),
      [potentialType]
    )

    const overlay = useMemo(
      () => buildHarmonicOverlay(potentialType, harmonicOmega, latticeDim, trapAnisotropy),
      [potentialType, harmonicOmega, latticeDim, trapAnisotropy]
    )

    /* ── Render ─────────────────────────────────────────────── */
    return (
      <ControlGroup
        title="Energy Spectrum (wavepacket probe)"
        collapsible
        defaultOpen={false}
        data-testid="control-group-heller-spectrometer"
        tooltip="Heller's wavepacket spectroscopy: FFT of ⟨ψ(0)|ψ(t)⟩ gives a power spectrum whose peaks are the energy eigenvalues of the current potential. Only works for time-independent Hamiltonians."
      >
        <div className="space-y-2" data-testid="heller-spectrometer-panel">
          {/* Inline plain-language description */}
          <p className="text-xs text-text-secondary leading-snug" data-testid="heller-description">
            Lets the wavepacket evolve and reads off the potential&apos;s energy levels from the
            autocorrelation <span className="font-mono">⟨ψ(0)|ψ(t)⟩</span>. FFT peaks sit at the
            eigenvalues <span className="font-mono">E_n</span> of the current Hamiltonian (Heller
            1981).
          </p>

          {/* Time-dependent Hamiltonian notice — info tone, not warning */}
          {hamiltonianTimeDependent && (
            <div
              className="rounded-md border border-border-default bg-[var(--bg-surface)] px-2 py-1 text-xs text-text-secondary leading-snug"
              data-testid="heller-time-dependent-notice"
            >
              The drive is armed, so H depends on time. Heller&apos;s theorem needs a stationary
              Hamiltonian — capture is paused until you turn the drive off in the TDSE controls.
            </div>
          )}

          {/* Capture toggle */}
          <Switch
            label={enabled ? 'Capturing ψ(t)' : 'Start measuring'}
            checked={enabled}
            onCheckedChange={handleEnabledChange}
            disabled={hamiltonianTimeDependent}
            tooltip="Start the Heller capture. Also resets the wavefunction so ψ(0) is the mode's true initial state — no need to hit the timeline Reset button separately."
            data-testid="heller-capture-toggle"
          />

          {/* Contextual status block — narrates the current state */}
          <div
            className="rounded-md bg-[var(--bg-surface)] px-2 py-1.5 text-xs text-text-secondary leading-snug"
            data-testid="heller-status-block"
          >
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${statusMessage.dotClass}`}
                aria-hidden="true"
              />
              <span data-testid="heller-status-label">{statusMessage.label}</span>
            </div>
            {statusMessage.detail && (
              <div className="text-text-tertiary mt-0.5" data-testid="heller-status-detail">
                {statusMessage.detail}
              </div>
            )}
            {expectationHint && !hamiltonianTimeDependent && (
              <div className="text-text-tertiary mt-0.5" data-testid="heller-expectation-hint">
                {expectationHint}
              </div>
            )}
          </div>

          {/* Live-update switch */}
          <Switch
            label="Live update"
            checked={liveUpdate}
            onCheckedChange={setLiveUpdate}
            tooltip="Automatically recompute the spectrum every few samples while capture is running."
            data-testid="heller-live-update-toggle"
          />

          {/* Derived timing / resolution rows */}
          <MetricRow
            label="Samples"
            value={sampleCount}
            digits={0}
            unit={`/ ${bufferCapacity}${hasEnoughSamples ? '' : ` (need ${HELLER_DEFAULT_MIN_SAMPLES})`}`}
          />
          <MetricRow label="T captured" value={timing.tCaptured} digits={3} fallback="—" />
          <MetricRow label="Δω resolution" value={timing.deltaOmega} digits={3} fallback="—" />
          <MetricRow label="ω_max (Nyquist)" value={timing.omegaNyquist} digits={2} fallback="—" />

          {/* Controls row */}
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRestart}
              tooltip="Reset the wavefunction and start a fresh capture. Equivalent to the timeline Reset button followed by toggling capture off and on."
              data-testid="heller-reset-button"
            >
              Restart capture
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={onCompute}
              disabled={!hasEnoughSamples || hamiltonianTimeDependent}
              tooltip={
                !hasEnoughSamples
                  ? `Collect at least ${HELLER_DEFAULT_MIN_SAMPLES} samples first.`
                  : hamiltonianTimeDependent
                    ? 'Capture paused — Hamiltonian is time-dependent.'
                    : 'Run the FFT on the current buffer and update the spectrum.'
              }
              data-testid="heller-compute-button"
            >
              Compute spectrum
            </Button>
          </div>

          {/* Power-spectrum plot */}
          <SpectrometerPlot spectrum={spectrum} overlay={overlay} statusMessage={statusMessage} />

          {/* Peak list — ω and E = ℏω */}
          {spectrum && spectrum.peaks.length > 0 && (
            <div className="mt-1" data-testid="heller-peak-list">
              <p className="text-xs text-text-secondary mb-0.5 uppercase tracking-wider">
                Top peaks
              </p>
              <div className="text-xs font-mono">
                <div className="flex gap-2 text-text-tertiary">
                  <span className="w-6">#</span>
                  <span className="w-20 text-right">ω</span>
                  <span className="w-20 text-right" title={`E = ℏω with ℏ = ${hbar}`}>
                    E = ℏω
                  </span>
                </div>
                {spectrum.peaks.map((peak, idx) => {
                  const e = hbar * peak.omega
                  return (
                    <div
                      key={idx}
                      className="flex gap-2 text-text-secondary"
                      data-testid={`heller-peak-row-${idx}`}
                    >
                      <span className="w-6 text-text-tertiary">{idx + 1}</span>
                      <span className="w-20 text-right">{peak.omega.toFixed(4)}</span>
                      <span className="w-20 text-right">{e.toFixed(4)}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Advanced disclosure for sample interval — hidden by default */}
          <details className="mt-2 text-xs" data-testid="heller-advanced-disclosure">
            <summary className="cursor-pointer text-text-tertiary uppercase tracking-wider select-none">
              Advanced
            </summary>
            <div className="mt-2">
              <Slider
                label="Sample interval (Strang steps)"
                min={HELLER_MIN_SAMPLE_INTERVAL}
                max={HELLER_MAX_SAMPLE_INTERVAL}
                step={1}
                value={pendingInterval}
                onChange={setPendingInterval}
                showValue
                disabled={hamiltonianTimeDependent}
                tooltip="Simulation steps between captures. Each step advances time by dt, so N steps = N·dt of simTime between samples. Lower = finer ω resolution, higher = less GPU bandwidth. Changing this restarts capture."
                data-testid="heller-sample-interval"
              />
            </div>
          </details>
        </div>
      </ControlGroup>
    )
  }
)

TDSESpectrometerPanel.displayName = 'TDSESpectrometerPanel'
