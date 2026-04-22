/**
 * FSF Analysis Content
 *
 * Content component for freeScalarField mode analysis. Displays:
 * - Energy and norm sparkline charts (ring buffer history) at the top
 * - Klein-Gordon dispersion diagram
 * - Diagnostics interval slider
 * - Live field observables (energy, norm, max phi/pi, energy drift)
 * - Field statistics (mean, variance)
 *
 * Used inside the unified AnalysisSection.
 *
 * @module components/sections/Analysis/FSFAnalysisSection
 */

import React, { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ControlGroup } from '@/components/ui/ControlGroup'
import { Slider } from '@/components/ui/Slider'
import type { FreeScalarConfig } from '@/lib/geometry/extended/types'
import { equationOfState } from '@/lib/physics/cosmology/background'
import { sCritical } from '@/lib/physics/cosmology/presets'
import {
  computeFsfCosmologySnapshot,
  computeFsfVacuumDispersion,
} from '@/lib/physics/freeScalar/vacuumDispersion'
import { useDiagnosticsStore } from '@/stores/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'

import { MetricRow, SparklineRow } from './AnalysisPrimitives'
import { FSFEntanglementProbe } from './FSFEntanglementProbe'

/**
 * Analysis content for freeScalarField mode.
 * Renders sparklines at the top, then dispersion diagram, controls, and metrics.
 *
 * @returns Sparklines, dispersion diagram, controls, and metrics display
 *
 * @example
 * ```tsx
 * <FSFAnalysisContent />
 * ```
 */
export const FSFAnalysisContent: React.FC = React.memo(() => {
  const { fsf, setDiagnosticsInterval } = useExtendedObjectStore(
    useShallow((s) => ({
      fsf: s.schroedinger.freeScalar,
      setDiagnosticsInterval: s.setFreeScalarDiagnosticsInterval,
    }))
  )

  // Physical "effective mass squared" at `η₀` — the canonical δφ
  // integrator uses `ω² = k² + mass² · a²(η₀)`, so the dispersion diagram
  // shows `m²·a²` as its mass term. Under Minkowski / cosmology-disabled /
  // invalid-preset paths this collapses to `mass²` via the shared
  // `computeFsfVacuumDispersion` helper, whose `'kgFloor'` fallback tag
  // we unpack into the bare squared mass so the dispersion diagram has a
  // numeric input.
  const effectiveMassSq = useMemo(() => {
    const dispersion = computeFsfVacuumDispersion(fsf, fsf.cosmology.eta0)
    if (dispersion === 'kgFloor') return fsf.mass * fsf.mass
    if (typeof dispersion === 'number') return dispersion
    // Bianchi-I anisotropic variant — collapse to a scalar massSq for the
    // dispersion-diagram overlay. The diagram shows an isotropic ω(k), so
    // we use the (kineticScale · massSq) component that matches the
    // isotropic FLRW trace at the Bianchi-I symmetric-gauge anchor.
    return dispersion.kineticScale * dispersion.massSq
  }, [fsf])

  return (
    <>
      {/* Sparkline charts at the top */}
      <SparklineCharts />

      {/* Cosmology readout (only when cosmology is enabled) */}
      <CosmologyReadout config={fsf} />

      {/* Dispersion relation — uses M²_eff(η₀) under cosmology, mass² otherwise */}
      <KGDispersionDiagram
        effectiveMassSq={effectiveMassSq}
        cosmologyEnabled={fsf.cosmology.enabled}
      />

      <Slider
        label="Diagnostics Interval (frames)"
        tooltip="How often to compute field observables (energy, norm, drift). Lower values give more responsive sparklines but use more GPU time."
        min={1}
        max={120}
        step={1}
        value={fsf.diagnosticsInterval}
        onChange={setDiagnosticsInterval}
        showValue
      />

      {/* Field observables table */}
      <MetricsDisplay cosmologyEnabled={fsf.cosmology.enabled} />

      {/* Peschel entanglement entropy probe (toggleable, expensive) */}
      <FSFEntanglementProbe />
    </>
  )
})

FSFAnalysisContent.displayName = 'FSFAnalysisContent'

/* ────────────────────────────────────────────────────────────── */
/*  Sparkline charts (isolated store subscription)               */
/* ────────────────────────────────────────────────────────────── */

const SparklineCharts: React.FC = React.memo(() => {
  const {
    hasData,
    historyEnergy,
    historyNorm,
    historyHead,
    historyCount,
    historyParticles,
    historyParticlesHead,
    historyParticlesCount,
  } = useDiagnosticsStore(
    useShallow((s) => ({
      hasData: s.fsf.hasData,
      historyEnergy: s.fsf.historyEnergy,
      historyNorm: s.fsf.historyNorm,
      historyHead: s.fsf.historyHead,
      historyCount: s.fsf.historyCount,
      historyParticles: s.fsf.historyParticles,
      historyParticlesHead: s.fsf.historyParticlesHead,
      historyParticlesCount: s.fsf.historyParticlesCount,
    }))
  )

  // Energy and norm sparklines are fed by the diagnostics readback,
  // which is gated on `config.diagnosticsEnabled`. The particle N(η)
  // sparkline is fed by the *k-space* readback, which runs
  // unconditionally (see `FsfKSpaceManager.maybeStartKSpaceReadback`).
  // Render each row independently so that e.g. a run with
  // `diagnosticsEnabled = false` still shows the particle thermometer
  // once the first FFT lands. The outer "Waiting…" placeholder only
  // appears when *neither* channel has any samples yet.
  const hasEnergyData = hasData && historyCount > 0
  const hasParticleData = historyParticlesCount > 0

  if (!hasEnergyData && !hasParticleData) {
    return (
      <div className="px-1 py-3 text-center">
        <p className="text-xs text-text-tertiary italic">Waiting for first readback...</p>
      </div>
    )
  }

  return (
    <div className="space-y-2 px-1">
      {hasEnergyData && (
        <>
          <SparklineRow
            label="Energy"
            data={historyEnergy}
            head={historyHead}
            count={historyCount}
          />
          <SparklineRow
            label="Norm"
            data={historyNorm}
            head={historyHead}
            count={historyCount}
            min={0}
          />
        </>
      )}
      {hasParticleData && (
        <SparklineRow
          label="Particles N(η)"
          data={historyParticles}
          head={historyParticlesHead}
          count={historyParticlesCount}
          min={0}
        />
      )}
    </div>
  )
})

SparklineCharts.displayName = 'SparklineCharts'

/* ────────────────────────────────────────────────────────────── */
/*  Klein-Gordon dispersion relation ω(k) = √(k² + m²)          */
/* ────────────────────────────────────────────────────────────── */

const KG_WIDTH = 260
const KG_HEIGHT = 130
const KG_PX = 32
const KG_PY = 16
const KG_PW = KG_WIDTH - 2 * KG_PX
const KG_PH = KG_HEIGHT - 2 * KG_PY

/**
 * Inline SVG showing the dispersion ω(k) = √(k² + M²_eff), where M²_eff is
 * either `mass²` (Klein-Gordon) or the Mukhanov-Sasaki effective mass
 * squared under cosmology. For tachyonic `M²_eff < 0` the real branch is
 * clipped at the mode crossing `|k| = √|M²_eff|`, below which ω is purely
 * imaginary (super-horizon growing mode).
 *
 * @param props.effectiveMassSq - M²_eff to plot (signed; can be negative)
 * @param props.cosmologyEnabled - Whether cosmology mode is active (affects labels)
 */
const KGDispersionDiagram: React.FC<{
  effectiveMassSq: number
  cosmologyEnabled: boolean
}> = React.memo(({ effectiveMassSq, cosmologyEnabled }) => {
  const curvePoints = useMemo(() => {
    const nSamples = 80
    // |M_eff| for axis scaling; fall back to 1 when M² ≈ 0
    const massScale = Math.sqrt(Math.abs(effectiveMassSq))
    const kMax = Math.max(4 * massScale, 4)
    const wMaxSq = kMax * kMax + Math.max(effectiveMassSq, 0)
    const wMax = Math.sqrt(wMaxSq) * 1.1

    const toX = (k: number) => KG_PX + ((k + kMax) / (2 * kMax)) * KG_PW
    const toY = (w: number) => KG_PY + (1 - w / wMax) * KG_PH

    // For each sampled k, compute ω² = k² + M²_eff. Clip the real branch
    // at zero when ω² < 0 (tachyonic sub-horizon modes).
    const pts: string[] = []
    for (let i = 0; i < nSamples; i++) {
      const k = -kMax + (2 * kMax * i) / (nSamples - 1)
      const wSq = k * k + effectiveMassSq
      if (wSq < 0) continue
      const w = Math.sqrt(wSq)
      pts.push(`${toX(k).toFixed(1)},${toY(w).toFixed(1)}`)
    }

    // Dashed horizontal line marker: under KG it's the mass gap ω = m;
    // under cosmology with M² > 0 it's the effective mass gap ω = √M²;
    // under tachyonic M² < 0 there is no real mass gap, suppress the line.
    const markerY = effectiveMassSq > 0 ? toY(Math.sqrt(effectiveMassSq)) : undefined

    // Tachyonic mode boundary: |k| = √|M²_eff|
    const tachyonicK = effectiveMassSq < 0 ? Math.sqrt(-effectiveMassSq) : undefined

    return {
      points: pts.join(' '),
      markerY,
      zeroY: toY(0),
      midX: toX(0),
      tachyonicLeftX: tachyonicK !== undefined ? toX(-tachyonicK) : undefined,
      tachyonicRightX: tachyonicK !== undefined ? toX(tachyonicK) : undefined,
    }
  }, [effectiveMassSq])

  const title = cosmologyEnabled
    ? 'Dispersion ω(k) = √(k² + M²_eff(η₀))'
    : 'Klein-Gordon Dispersion ω(k) = √(k² + m²)'

  return (
    <div data-testid="kg-dispersion">
      <p className="text-xs text-text-secondary mb-1">{title}</p>
      <div className="rounded-md overflow-hidden bg-[var(--bg-surface)]">
        <svg width="100%" viewBox={`0 0 ${KG_WIDTH} ${KG_HEIGHT}`} className="block">
          {/* Zero line */}
          <line
            x1={KG_PX}
            y1={curvePoints.zeroY}
            x2={KG_PX + KG_PW}
            y2={curvePoints.zeroY}
            stroke="var(--text-tertiary)"
            strokeWidth={0.5}
            strokeDasharray="2,2"
          />

          {/* Mass gap line ω = √M²_eff (hidden for tachyonic M² < 0) */}
          {curvePoints.markerY !== undefined && (
            <>
              <line
                x1={KG_PX}
                y1={curvePoints.markerY}
                x2={KG_PX + KG_PW}
                y2={curvePoints.markerY}
                stroke="var(--theme-accent)"
                strokeWidth={0.5}
                strokeDasharray="3,3"
                opacity={0.5}
              />
              <text
                x={KG_PX + KG_PW + 2}
                y={curvePoints.markerY + 3}
                fill="var(--theme-accent)"
                fontSize={7}
                fontFamily="monospace"
                opacity={0.7}
              >
                m
              </text>
            </>
          )}

          {/* Tachyonic mode boundaries: |k| = √|M²_eff| (cosmology only) */}
          {curvePoints.tachyonicLeftX !== undefined &&
            curvePoints.tachyonicRightX !== undefined && (
              <>
                <line
                  x1={curvePoints.tachyonicLeftX}
                  y1={KG_PY}
                  x2={curvePoints.tachyonicLeftX}
                  y2={KG_PY + KG_PH}
                  stroke="var(--theme-accent)"
                  strokeWidth={0.5}
                  strokeDasharray="1,2"
                  opacity={0.4}
                />
                <line
                  x1={curvePoints.tachyonicRightX}
                  y1={KG_PY}
                  x2={curvePoints.tachyonicRightX}
                  y2={KG_PY + KG_PH}
                  stroke="var(--theme-accent)"
                  strokeWidth={0.5}
                  strokeDasharray="1,2"
                  opacity={0.4}
                />
              </>
            )}

          {/* Dispersion curve — clipped to real branch when tachyonic */}
          <polyline
            points={curvePoints.points}
            fill="none"
            stroke="var(--theme-accent)"
            strokeWidth={2}
            strokeLinejoin="round"
            data-testid="kg-dispersion-polyline"
          />

          {/* Vertical k-axis */}
          <line
            x1={curvePoints.midX}
            y1={KG_PY}
            x2={curvePoints.midX}
            y2={KG_PY + KG_PH}
            stroke="var(--text-secondary)"
            strokeWidth={0.5}
          />

          {/* Axis labels */}
          <text
            x={KG_PX + KG_PW / 2}
            y={KG_HEIGHT - 2}
            textAnchor="middle"
            fill="var(--text-tertiary)"
            fontSize={8}
            fontFamily="monospace"
          >
            k
          </text>
          <text
            x={4}
            y={KG_PY + KG_PH / 2}
            textAnchor="middle"
            fill="var(--text-tertiary)"
            fontSize={8}
            fontFamily="monospace"
            transform={`rotate(-90, 4, ${KG_PY + KG_PH / 2})`}
          >
            ω(k)
          </text>
        </svg>
      </div>
      {cosmologyEnabled && (
        <p className="text-[10px] text-text-tertiary italic mt-0.5 px-1">
          n_k measured vs adiabatic vacuum at η₀
        </p>
      )}
    </div>
  )
})

KGDispersionDiagram.displayName = 'KGDispersionDiagram'

/* ────────────────────────────────────────────────────────────── */
/*  Field observables table (isolated store subscription)         */
/* ────────────────────────────────────────────────────────────── */

const MetricsDisplay: React.FC<{ cosmologyEnabled: boolean }> = React.memo(
  ({ cosmologyEnabled }) => {
    const {
      hasData,
      totalEnergy,
      totalNorm,
      maxPhi,
      maxPi,
      energyDrift,
      meanPhi,
      variancePhi,
      totalParticles,
      historyParticlesCount,
    } = useDiagnosticsStore(
      useShallow((s) => ({
        hasData: s.fsf.hasData,
        totalEnergy: s.fsf.totalEnergy,
        totalNorm: s.fsf.totalNorm,
        maxPhi: s.fsf.maxPhi,
        maxPi: s.fsf.maxPi,
        energyDrift: s.fsf.energyDrift,
        meanPhi: s.fsf.meanPhi,
        variancePhi: s.fsf.variancePhi,
        totalParticles: s.fsf.totalParticles,
        historyParticlesCount: s.fsf.historyParticlesCount,
      }))
    )

    // `hasData` only flips on the first energy/norm diagnostics readback
    // — which is gated by `config.diagnosticsEnabled`. The particle
    // thermometer runs on the (unconditional) k-space readback path, so
    // we need to render the observables control group whenever *either*
    // channel has landed. Without this, default configs with
    // `diagnosticsEnabled = false` would hide the "Total particles"
    // metric even after N(η) samples have flowed, which was the
    // round-2 "high" review finding.
    if (!hasData && historyParticlesCount === 0) return null

    // Cosmology mode evolves the physical perturbation δφ directly via the
    // canonical integrator (not the Mukhanov-Sasaki `v = a^((n−2)/2)·δφ`
    // variable — that formulation was abandoned when the z''/z pole broke
    // the leapfrog CFL condition at late times; see
    // `@/lib/physics/cosmology/background` for the derivation). The
    // Hamiltonian H = ½aK·π² + ½aP·(∇δφ)² + ½m²·aF·δφ² is time-dependent
    // through the coefficients, so energy is NOT conserved and the drift
    // metric does not apply. The labels mirror the shader's canonical
    // variables δφ, π_δφ.
    const energyLabel = cosmologyEnabled ? 'Hamiltonian (η-dep.)' : 'Total Energy'
    const normLabel = cosmologyEnabled ? '∫(δφ)² dV' : '∫φ² dV (norm)'
    const maxPhiLabel = cosmologyEnabled ? 'max |δφ|' : 'max |φ|'
    const maxPiLabel = cosmologyEnabled ? 'max |π_δφ|' : 'max |π|'
    const meanLabel = cosmologyEnabled ? '⟨δφ⟩' : '⟨φ⟩'
    const varianceLabel = cosmologyEnabled ? 'Var(δφ)' : 'Var(φ)'

    return (
      <ControlGroup
        title="Field Observables"
        collapsible
        defaultOpen
        data-testid="control-group-field-observables"
      >
        <div className="space-y-0.5 px-1">
          {hasData && (
            <>
              <MetricRow label={energyLabel} value={totalEnergy} digits={6} />
              {!cosmologyEnabled && (
                <MetricRow label="Energy Drift" value={energyDrift * 100} digits={4} unit="%" />
              )}
              <div className="border-t border-panel-border my-1" />
              <MetricRow label={normLabel} value={totalNorm} digits={4} />
              <MetricRow label={maxPhiLabel} value={maxPhi} digits={4} />
              <MetricRow label={maxPiLabel} value={maxPi} digits={4} />
              <div className="border-t border-panel-border my-1" />
              <MetricRow label={meanLabel} value={meanPhi} digits={6} />
              <MetricRow label={varianceLabel} value={variancePhi} digits={6} />
            </>
          )}
          {historyParticlesCount > 0 && (
            <>
              {hasData && <div className="border-t border-panel-border my-1" />}
              <MetricRow label="Total particles" value={totalParticles} digits={4} />
            </>
          )}
        </div>
      </ControlGroup>
    )
  }
)

MetricsDisplay.displayName = 'MetricsDisplay'

/* ────────────────────────────────────────────────────────────── */
/*  Cosmology readout (Mukhanov-Sasaki bridge)                    */
/* ────────────────────────────────────────────────────────────── */

/**
 * Cosmological quantities evaluated at the current `eta0` — effective
 * background state at which the adiabatic vacuum is prepared. Shows
 *
 *   a(η), ℋ(η), w, A, B, M²_eff, horizon-crossing scale k·|η|=1
 *
 * Under the canonical δφ integrator the reported quantities describe the
 * physical dispersion `ω² = k² + m²·a²`; the abandoned Mukhanov-Sasaki
 * `z''/z` term is not part of this readout.
 *
 * Live evolution (`η` advancing toward 0) is not plumbed through to
 * the store in v1 — see the v2 backlog entry in
 * `docs/plans/cosmological-background-scalar-field.md`.
 *
 * The cosmology snapshot is resolved through the shared
 * `computeFsfCosmologySnapshot` helper so the same deduplicated invalid-
 * preset warning path is hit as the compute pass and the k-space
 * thermometer — one source of truth for "is this cosmology evaluable".
 *
 * @param props.config - The full free-scalar-field configuration
 */
const CosmologyReadout: React.FC<{
  config: FreeScalarConfig
}> = React.memo(({ config }) => {
  const { cosmology, latticeDim, mass } = config
  const snapshot = useMemo(() => {
    const snap = computeFsfCosmologySnapshot(config, cosmology.eta0)
    if (snap === undefined) return undefined
    const spacetimeDim = latticeDim + 1
    const mSqASq = mass * mass * snap.a * snap.a
    // Effective equation-of-state parameter per paper eq. (1.20):
    //   Ekpyrotic fixed point: x₁ = s/s_c(n), so w = 2(s/s_c)² − 1 > 1
    //   Kasner fixed point:    x = ±1 → w = 1 (stiff fluid)
    //   de Sitter:             w = −1 (cosmological-constant-like)
    //   Minkowski:             w = 0 (trivially, but this branch is
    //                          guarded above because computeFsf… returns
    //                          `undefined` for Minkowski)
    let w = 0
    if (cosmology.preset === 'ekpyrotic') {
      const x1 = cosmology.steepness / sCritical(spacetimeDim)
      w = equationOfState(x1)
    } else if (cosmology.preset === 'kasner') {
      w = 1
    } else if (cosmology.preset === 'deSitter') {
      w = -1
    }
    const horizonK = 1 / Math.abs(cosmology.eta0)
    return { snap, w, horizonK, mSqASq }
  }, [config, cosmology, latticeDim, mass])

  if (!cosmology.enabled) return null

  if (!snapshot) {
    return (
      <ControlGroup title="Cosmology (η₀ snapshot)" collapsible defaultOpen={false}>
        <div className="text-xs text-text-tertiary italic">
          Invalid cosmology parameters — readout unavailable.
        </div>
      </ControlGroup>
    )
  }

  const { snap, w, horizonK, mSqASq } = snapshot

  return (
    <ControlGroup
      title="Cosmology (η₀ snapshot)"
      collapsible
      defaultOpen
      data-testid="control-group-cosmology-readout"
    >
      <div className="space-y-0.5 px-1">
        <div className="flex items-center justify-between py-0.5">
          <span className="text-xs text-text-tertiary">Preset</span>
          <span className="text-xs font-mono text-text-secondary">{cosmology.preset}</span>
        </div>
        <MetricRow label="η₀" value={cosmology.eta0} digits={3} />
        <MetricRow label="a(η₀)" value={snap.a} digits={4} />
        <MetricRow label="ℋ(η₀)" value={snap.hubble} digits={4} />
        <MetricRow label="w (EoS)" value={w} digits={3} />
        <div className="border-t border-panel-border my-1" />
        <MetricRow label="m²·a²" value={mSqASq} digits={4} />
        <MetricRow label="A = a^(−(n−2))" value={snap.aKinetic} digits={4} />
        <MetricRow label="B = a^(n−2)" value={snap.aPotential} digits={4} />
        <MetricRow label="k_horizon" value={horizonK} digits={4} />
      </div>
      <div className="text-xs text-text-tertiary italic px-1">
        Snapshot at η = η₀ (initial time). Canonical δφ variables — the physical dispersion is ω² =
        k² + m²·a².
      </div>
    </ControlGroup>
  )
})

CosmologyReadout.displayName = 'CosmologyReadout'
