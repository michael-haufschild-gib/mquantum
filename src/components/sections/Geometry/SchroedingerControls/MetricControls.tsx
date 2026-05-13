/**
 * MetricControls — Spatial metric (Laplace–Beltrami kinetic) sub-section.
 *
 * Nested inside {@link TDSEControls}. Selects the spatial metric consumed
 * by the TDSE kinetic operator. Each metric kind exposes its own
 * physically-meaningful parameters; mismatched fields are silently
 * stripped by the setter.
 *
 * @module components/sections/Geometry/SchroedingerControls/MetricControls
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { ControlGroup } from '@/components/ui/ControlGroup'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import type { TdseConfig } from '@/lib/geometry/extended/tdse'
import {
  describeMetric,
  isMetricAvailableForLattice,
  isTimeDependentMetric,
  MAX_ADS_RADIUS,
  MAX_DOUBLE_THROAT_SEPARATION,
  MAX_HUBBLE_RATE,
  MAX_SCHWARZSCHILD_MASS,
  MAX_SPHERE_RADIUS,
  MAX_THROAT_RADIUS,
  MAX_TORUS_PERIOD,
  type MetricConfig,
  type MetricKind,
  MIN_ADS_RADIUS,
  MIN_DOUBLE_THROAT_SEPARATION,
  MIN_HUBBLE_RATE,
  MIN_SCHWARZSCHILD_MASS,
  MIN_SPHERE_RADIUS,
  MIN_THROAT_RADIUS,
  MIN_TORUS_PERIOD,
  normalizeMetricForLattice,
} from '@/lib/physics/tdse/metrics/types'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

const METRIC_OPTIONS: Array<{ value: MetricKind; label: string }> = [
  { value: 'flat', label: 'Flat (Euclidean)' },
  { value: 'morrisThorne', label: 'Morris–Thorne throat' },
  { value: 'schwarzschild', label: 'Schwarzschild (isotropic)' },
  { value: 'deSitter', label: 'de Sitter (FRW, expanding)' },
  { value: 'antiDeSitter', label: 'Anti-de Sitter (Poincaré)' },
  { value: 'sphere2D', label: '2-Sphere (θ, φ)' },
  { value: 'torus', label: 'Flat Torus (periodic)' },
  { value: 'doubleThroat', label: 'Double Morris–Thorne throat' },
]

/** Default values used when a previously-flat metric is switched mid-session. */
const DEFAULT_THROAT_RADIUS = 0.5
const DEFAULT_SCHWARZSCHILD_MASS = 1.0
const DEFAULT_HUBBLE_RATE = 0.3
const DEFAULT_ADS_RADIUS = 1.0
const DEFAULT_SPHERE_RADIUS = 1.0
const DEFAULT_TORUS_PERIOD: [number, number, number] = [1, 1, 1]
const DEFAULT_DOUBLE_THROAT_SEPARATION = 4.0
const DEFAULT_DOUBLE_THROAT_RADIUS = 0.4

/** Read a number from the metric config or fall back. */
function readNum(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * Spatial-metric sub-section for the TDSE control panel. Selects the
 * Laplace–Beltrami metric kind and exposes per-kind parameter sliders.
 *
 * @param props - Component props
 * @param props.td - Current TDSE config (read for the active metric and params)
 * @returns React element with the metric-kind selector and per-kind sliders
 */
export function MetricControls({ td }: { td: TdseConfig }): React.ReactElement {
  const { setTdseMetric, setShowCurvatureOverlay, setDensityView, setCurvatureOverlayOpacity } =
    useExtendedObjectStore(
      useShallow((s) => ({
        setTdseMetric: s.setTdseMetric,
        setShowCurvatureOverlay: s.setShowCurvatureOverlay,
        setDensityView: s.setDensityView,
        setCurvatureOverlayOpacity: s.setCurvatureOverlayOpacity,
      }))
    )

  const metric: MetricConfig = normalizeMetricForLattice(td.metric, td.latticeDim)
  const kind: MetricKind = metric.kind
  const metricOptions = React.useMemo(
    () =>
      METRIC_OPTIONS.filter((option) => isMetricAvailableForLattice(option.value, td.latticeDim)),
    [td.latticeDim]
  )

  // Each kind reads its own field from the (possibly previous) metric so the
  // slider initial value reflects state. Where the field is absent we use
  // the same defaults the setter falls back to.
  const throatRadius = readNum(metric.throatRadius, DEFAULT_THROAT_RADIUS)
  const schwarzschildMass = readNum(metric.schwarzschildMass, DEFAULT_SCHWARZSCHILD_MASS)
  const hubbleRate = readNum(metric.hubbleRate, DEFAULT_HUBBLE_RATE)
  const adsRadius = readNum(metric.adsRadius, DEFAULT_ADS_RADIUS)
  const sphereRadius = readNum(metric.sphereRadius, DEFAULT_SPHERE_RADIUS)
  const torusPeriod: [number, number, number] = [
    readNum(metric.torusPeriod?.[0], DEFAULT_TORUS_PERIOD[0]),
    readNum(metric.torusPeriod?.[1], DEFAULT_TORUS_PERIOD[1]),
    readNum(metric.torusPeriod?.[2], DEFAULT_TORUS_PERIOD[2]),
  ]
  const doubleSep = readNum(metric.doubleThroatSeparation, DEFAULT_DOUBLE_THROAT_SEPARATION)
  const doubleRad = readNum(metric.doubleThroatRadius, DEFAULT_DOUBLE_THROAT_RADIUS)

  const onKindChange = (next: MetricKind) => {
    switch (next) {
      case 'flat':
        setTdseMetric({ kind: 'flat' })
        return
      case 'morrisThorne':
        setTdseMetric({ kind: 'morrisThorne', throatRadius })
        return
      case 'schwarzschild':
        setTdseMetric({ kind: 'schwarzschild', schwarzschildMass })
        return
      case 'deSitter':
        setTdseMetric({ kind: 'deSitter', hubbleRate })
        return
      case 'antiDeSitter':
        setTdseMetric({ kind: 'antiDeSitter', adsRadius })
        return
      case 'sphere2D':
        setTdseMetric({ kind: 'sphere2D', sphereRadius })
        return
      case 'torus':
        setTdseMetric({ kind: 'torus', torusPeriod })
        return
      case 'doubleThroat':
        setTdseMetric({
          kind: 'doubleThroat',
          doubleThroatSeparation: doubleSep,
          doubleThroatRadius: doubleRad,
        })
        return
    }
  }

  const description = describeMetric(metric)

  return (
    <ControlGroup
      title="Spatial Metric"
      collapsible
      defaultOpen={false}
      data-testid="control-group-tdse-metric"
    >
      <Select
        label="Metric"
        tooltip="Spatial metric used by the TDSE kinetic operator. Each non-flat option routes to the curved Laplace–Beltrami integrator (RK4 in real time) instead of the split-step FFT."
        options={metricOptions}
        value={kind}
        onChange={(v) => onKindChange(v as MetricKind)}
        data-testid="tdse-metric-kind"
      />

      <p className="text-xs text-text-tertiary">
        {description.label} — <code>{description.formula}</code>
      </p>

      {isTimeDependentMetric(kind) && (
        <p
          className="text-xs font-semibold text-amber-400"
          data-testid="tdse-metric-time-dependent-badge"
        >
          Time-dependent metric
        </p>
      )}

      {kind === 'morrisThorne' && (
        <Slider
          label="Throat radius b₀"
          tooltip="Morris–Thorne throat radius b₀. Smaller → sharper narrowing and stronger curvature-induced dispersion."
          min={MIN_THROAT_RADIUS}
          max={MAX_THROAT_RADIUS}
          step={0.05}
          value={throatRadius}
          onChange={(v) => setTdseMetric({ kind: 'morrisThorne', throatRadius: v })}
          showValue
          data-testid="tdse-metric-b0"
        />
      )}

      {kind === 'schwarzschild' && (
        <Slider
          label="Mass M"
          tooltip="Schwarzschild mass M in geometrized units (G=c=1). Isotropic-coordinate horizon at r=M/2."
          min={MIN_SCHWARZSCHILD_MASS}
          max={MAX_SCHWARZSCHILD_MASS}
          step={0.05}
          value={schwarzschildMass}
          onChange={(v) => setTdseMetric({ kind: 'schwarzschild', schwarzschildMass: v })}
          showValue
          data-testid="tdse-metric-mass"
        />
      )}

      {kind === 'deSitter' && (
        <Slider
          label="Hubble H"
          tooltip="de Sitter Hubble rate H. Scale factor a(t) = exp(H·t) — time-dependent metric."
          min={MIN_HUBBLE_RATE}
          max={MAX_HUBBLE_RATE}
          step={0.05}
          value={hubbleRate}
          onChange={(v) => setTdseMetric({ kind: 'deSitter', hubbleRate: v })}
          showValue
          data-testid="tdse-metric-hubble"
        />
      )}

      {kind === 'antiDeSitter' && (
        <Slider
          label="L"
          tooltip="AdS radius L on the Poincaré half-space chart, axis 0 = z. g_ij = (L/z)² δ_ij."
          min={MIN_ADS_RADIUS}
          max={MAX_ADS_RADIUS}
          step={0.05}
          value={adsRadius}
          onChange={(v) => setTdseMetric({ kind: 'antiDeSitter', adsRadius: v })}
          showValue
          data-testid="tdse-metric-ads-l"
        />
      )}

      {kind === 'sphere2D' && (
        <Slider
          label="R"
          tooltip="2-sphere radius R. Chart uses axis 1 = θ, axis 2 = φ; pole buffer ε = 0.2 keeps the chart non-singular."
          min={MIN_SPHERE_RADIUS}
          max={MAX_SPHERE_RADIUS}
          step={0.05}
          value={sphereRadius}
          onChange={(v) => setTdseMetric({ kind: 'sphere2D', sphereRadius: v })}
          showValue
          data-testid="tdse-metric-sphere-r"
        />
      )}

      {kind === 'torus' &&
        ([0, 1, 2] as const).map((axis) => (
          <Slider
            key={axis}
            label={`Period axis ${axis}`}
            tooltip={`Flat-torus period along axis ${axis}. Allowed momenta are quantized as k = 2π·n / period.`}
            min={MIN_TORUS_PERIOD}
            max={MAX_TORUS_PERIOD}
            step={0.05}
            value={torusPeriod[axis]}
            onChange={(v) => {
              const next: [number, number, number] = [...torusPeriod]
              next[axis] = v
              setTdseMetric({ kind: 'torus', torusPeriod: next })
            }}
            showValue
            data-testid={`tdse-metric-torus-period-${axis}`}
          />
        ))}

      {kind === 'doubleThroat' && (
        <>
          <Slider
            label="Throat separation s"
            tooltip="Distance between the two Morris–Thorne throats along axis 0."
            min={MIN_DOUBLE_THROAT_SEPARATION}
            max={MAX_DOUBLE_THROAT_SEPARATION}
            step={0.1}
            value={doubleSep}
            onChange={(v) =>
              setTdseMetric({
                kind: 'doubleThroat',
                doubleThroatSeparation: v,
                doubleThroatRadius: doubleRad,
              })
            }
            showValue
            data-testid="tdse-metric-double-sep"
          />
          <Slider
            label="Throat radius b₀"
            tooltip="Shared radius of both throats."
            min={MIN_THROAT_RADIUS}
            max={MAX_THROAT_RADIUS}
            step={0.05}
            value={doubleRad}
            onChange={(v) =>
              setTdseMetric({
                kind: 'doubleThroat',
                doubleThroatSeparation: doubleSep,
                doubleThroatRadius: v,
              })
            }
            showValue
            data-testid="tdse-metric-double-b0"
          />
        </>
      )}

      {/*
        Wave 6 curvature-overlay + density-view controls. Hidden on flat
        metric because Ricci is 0 and √|g| = 1 — no signal to render.
      */}
      {kind !== 'flat' && (
        <>
          <Switch
            label="Ricci curvature overlay"
            tooltip="Diagnostic overlay: bias voxels toward hot (R > 0) or cool (R < 0) ends of the density palette, scaled by |R| with a soft-saturating log·tanh mapping. Density view only."
            checked={td.showCurvatureOverlay === true}
            onCheckedChange={setShowCurvatureOverlay}
            data-testid="tdse-metric-curvature-overlay"
          />
          {td.showCurvatureOverlay === true && (
            <Slider
              label="Overlay opacity"
              tooltip="Curvature overlay blend strength. 0 = invisible, 1 = fully saturated."
              min={0}
              max={1}
              step={0.05}
              value={td.curvatureOverlayOpacity ?? 0.4}
              onChange={setCurvatureOverlayOpacity}
              showValue
              data-testid="tdse-metric-curvature-opacity"
            />
          )}
          <ToggleGroup<'coordinate' | 'proper'>
            ariaLabel="Density view"
            options={[
              { value: 'coordinate', label: 'Coordinate' },
              { value: 'proper', label: 'Proper' },
            ]}
            value={td.densityView ?? 'coordinate'}
            onChange={setDensityView}
            data-testid="tdse-metric-density-view"
          />
        </>
      )}
    </ControlGroup>
  )
}
