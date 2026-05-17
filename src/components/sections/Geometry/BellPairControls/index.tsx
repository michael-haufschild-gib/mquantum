/**
 * BellPairControls component — Geometry-tab controls for the Bell / CHSH
 * object.
 *
 * Owns the *configuration* surface of the Bell-pair object: the four
 * Bloch-sphere measurement axes, Werner-state visibility, detection
 * efficiency, analysis policy, and per-particle precession fields. These
 * fields describe *what the Bell state is and how it is measured* — the
 * natural Geometry-tab content for a non-Schrödinger object type.
 *
 * The Analysis-tab `BellExperimentContent` continues to own experiment
 * *runtime*: run/pause/reset, sparkline, headline S, correlations,
 * loophole budget, sampler/LHV strategy, trial-loop pacing, atlas sweep.
 * Both panels read and write the same `bellPair` slice of the extended
 * object store, so changes here are reflected immediately in the
 * Analysis-tab readouts on the right.
 *
 * @module components/sections/Geometry/BellPairControls
 */

import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Section } from '@/components/sections/Section'
import { Slider } from '@/components/ui/Slider'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import {
  type BellAnalysisMode,
  type BellPairAxis,
  type BellPairField,
} from '@/lib/geometry/extended/bellPair'
import { EBERHARD_THRESHOLD } from '@/lib/physics/bell/loopholes'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

const TWO_PI = 2 * Math.PI
const FIELD_LIMIT = 50 // matches the slice's clampFinite cap

const ANALYSIS_MODE_OPTIONS = [
  { value: 'fairSampling' as const, label: 'Fair sampling' },
  { value: 'assignNonDetection' as const, label: 'Clauser-Horne' },
]

/** Render two sliders (θ, φ) for one Bloch axis. */
const AxisSliders: React.FC<{
  label: string
  testId: string
  axis: BellPairAxis
  onChange: (axis: BellPairAxis) => void
}> = ({ label, testId, axis, onChange }) => (
  <div className="space-y-1" data-testid={testId}>
    <p className="text-xs text-text-secondary">{label}</p>
    <Slider
      label="θ (polar)"
      min={0}
      max={Math.PI}
      step={0.005}
      value={axis[0]}
      onChange={(v) => onChange([v, axis[1]])}
      showValue
    />
    <Slider
      label="φ (azimuth)"
      min={0}
      max={TWO_PI}
      step={0.005}
      value={axis[1]}
      onChange={(v) => onChange([axis[0], v])}
      showValue
    />
  </div>
)
AxisSliders.displayName = 'AxisSliders'

/** Render three sliders (x, y, z) for one precession field. */
const FieldSliders: React.FC<{
  label: string
  testId: string
  field: BellPairField
  onChange: (field: BellPairField) => void
}> = ({ label, testId, field, onChange }) => (
  <div className="space-y-1" data-testid={testId}>
    <p className="text-xs text-text-secondary">{label}</p>
    {(['x', 'y', 'z'] as const).map((axisName, i) => (
      <Slider
        key={axisName}
        label={`B${axisName}`}
        min={-FIELD_LIMIT}
        max={FIELD_LIMIT}
        step={0.05}
        value={field[i] ?? 0}
        onChange={(v) => {
          const next: BellPairField = [field[0], field[1], field[2]]
          next[i] = v
          onChange(next)
        }}
        showValue
      />
    ))}
  </div>
)
FieldSliders.displayName = 'FieldSliders'

/**
 * Geometry-tab configuration panel for the Bell-pair / CHSH object.
 *
 * Exposes measurement axes, state-noise sliders, analysis policy, and
 * per-particle precession fields. Run controls and result readouts live
 * in `BellExperimentContent` (Analysis tab) and share the same store.
 *
 * @returns React component for the Bell-pair configuration controls.
 */
export const BellPairControls: React.FC = React.memo(() => {
  const {
    config,
    setAliceAxis,
    setAliceAxisPrime,
    setBobAxis,
    setBobAxisPrime,
    setVisibility,
    setDetectionEfficiency,
    setAnalysisMode,
    setFieldA,
    setFieldB,
  } = useExtendedObjectStore(
    useShallow((s) => ({
      config: s.bellPair,
      setAliceAxis: s.setBellAliceAxis,
      setAliceAxisPrime: s.setBellAliceAxisPrime,
      setBobAxis: s.setBellBobAxis,
      setBobAxisPrime: s.setBellBobAxisPrime,
      setVisibility: s.setBellVisibility,
      setDetectionEfficiency: s.setBellDetectionEfficiency,
      setAnalysisMode: s.setBellAnalysisMode,
      setFieldA: s.setBellFieldA,
      setFieldB: s.setBellFieldB,
    }))
  )

  return (
    <div className="space-y-1" data-testid="bell-pair-controls">
      <Section title="Measurement Axes" defaultOpen={true}>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <AxisSliders
            label="Alice a (unprimed)"
            testId="bell-axis-alice"
            axis={config.aliceAxis}
            onChange={setAliceAxis}
          />
          <AxisSliders
            label="Alice a′ (primed)"
            testId="bell-axis-alice-prime"
            axis={config.aliceAxisPrime}
            onChange={setAliceAxisPrime}
          />
          <AxisSliders
            label="Bob b (unprimed)"
            testId="bell-axis-bob"
            axis={config.bobAxis}
            onChange={setBobAxis}
          />
          <AxisSliders
            label="Bob b′ (primed)"
            testId="bell-axis-bob-prime"
            axis={config.bobAxisPrime}
            onChange={setBobAxisPrime}
          />
        </div>
      </Section>

      <Section title="State Noise &amp; Detection" defaultOpen={true}>
        <Slider
          label="Werner visibility v"
          tooltip="Mixes the singlet with the maximally mixed state. v ≤ 1/√2 makes CHSH violation impossible regardless of angles."
          min={0}
          max={1}
          step={0.005}
          value={config.visibility}
          onChange={setVisibility}
          showValue
          data-testid="bell-geom-visibility"
        />
        <Slider
          label="Detection efficiency η"
          tooltip={`Symmetric per-detector firing probability. Eberhard threshold ≈ ${EBERHARD_THRESHOLD.toFixed(4)}; below that, without fair-sampling, no violation is possible.`}
          min={0}
          max={1}
          step={0.005}
          value={config.detectionEfficiency}
          onChange={setDetectionEfficiency}
          showValue
          data-testid="bell-geom-eta"
        />
        <div>
          <p className="text-xs text-text-secondary mb-0.5">Analysis policy</p>
          <ToggleGroup
            value={config.analysisMode}
            onChange={(v) => setAnalysisMode(v as BellAnalysisMode)}
            data-testid="bell-geom-analysis"
            options={ANALYSIS_MODE_OPTIONS}
          />
        </div>
      </Section>

      <Section title="Precession Fields" defaultOpen={false}>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <FieldSliders
            label="Alice field B_A (γ·B, ℏ=1)"
            testId="bell-field-alice"
            field={config.fieldA}
            onChange={setFieldA}
          />
          <FieldSliders
            label="Bob field B_B (γ·B, ℏ=1)"
            testId="bell-field-bob"
            field={config.fieldB}
            onChange={setFieldB}
          />
        </div>
      </Section>
    </div>
  )
})

BellPairControls.displayName = 'BellPairControls'
