/**
 * Bell-experiment analysis section.
 *
 * The CHSH/Bell-test panel: trial-loop controls, Bloch-sphere angle
 * inputs, Werner v and detection-efficiency η sliders, sampler &
 * analysis-mode toggles, LHV strategy dropdown, the live S(N)
 * sparkline crossing the classical bound toward Tsirelson, the four
 * per-bin correlation readouts, and the loophole-budget summary.
 *
 * Rendered only when `objectType === 'bellPair'`. The Bell trial loop
 * runs in {@link useBellExperimentStore.processTrialBatch}, driven from
 * the renderer strategy every frame; this panel is read-mostly with the
 * exception of the Reset / Auto-Run / settings inputs.
 *
 * @module components/sections/Analysis/BellExperimentSection
 */

import React, { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { BellSweepPanel } from '@/components/sections/Analysis/BellSweepPanel'
import { Section } from '@/components/sections/Section'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Slider } from '@/components/ui/Slider'
import { Sparkline } from '@/components/ui/Sparkline'
import { ToggleGroup } from '@/components/ui/ToggleGroup'
import { maxChshForWerner, WERNER_VIOLATION_THRESHOLD } from '@/lib/physics/bell/analytic'
import { CLASSICAL_BOUND, TSIRELSON_BOUND } from '@/lib/physics/bell/chsh'
import { LHV_STRATEGIES } from '@/lib/physics/bell/lhv'
import { EBERHARD_THRESHOLD, maxChshGivenEta } from '@/lib/physics/bell/loopholes'
import { useBellExperimentStore } from '@/stores/diagnostics/bellExperimentStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

/** Convert a Float64Array ring buffer to Float32 for the Sparkline primitive. */
function f64ToF32(src: Float64Array): Float32Array {
  const dst = new Float32Array(src.length)
  for (let i = 0; i < src.length; i++) dst[i] = src[i] ?? Number.NaN
  return dst
}

/**
 * Bell-experiment analysis content. Top-level component for the analysis
 * panel; renders inside the shared `<Section>` wrapper provided by the
 * caller.
 *
 * @returns The Bell-experiment analysis content.
 */
export const BellExperimentContent: React.FC = React.memo(() => {
  // ── Config bindings from the extended object store ──
  const {
    config,
    setAliceAxis,
    setAliceAxisPrime,
    setBobAxis,
    setBobAxisPrime,
    setVisibility,
    setDetectionEfficiency,
    setAnalysisMode,
    setSamplerMode,
    setLhvStrategyId,
    setTargetTrials,
    setTrialsPerFrame,
    setSeed,
    resetConfig,
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
      setSamplerMode: s.setBellSamplerMode,
      setLhvStrategyId: s.setBellLhvStrategyId,
      setTargetTrials: s.setBellTargetTrials,
      setTrialsPerFrame: s.setBellTrialsPerFrame,
      setSeed: s.setBellSeed,
      resetConfig: s.resetBellPair,
    }))
  )

  // ── Diagnostic readouts ──
  const {
    qm,
    lhv,
    totalTrials,
    qmHasViolated,
    historyQmS,
    historyLhvS,
    historyHead,
    historyCount,
    isRunning,
    setIsRunning,
    storeReset,
  } = useBellExperimentStore(
    useShallow((s) => ({
      qm: s.qm,
      lhv: s.lhv,
      totalTrials: s.totalTrials,
      qmHasViolated: s.qmHasViolated,
      historyQmS: s.historyQmS,
      historyLhvS: s.historyLhvS,
      historyHead: s.historyHead,
      historyCount: s.historyCount,
      isRunning: s.isRunning,
      setIsRunning: s.setIsRunning,
      storeReset: s.reset,
    }))
  )

  // Reset both config and store.
  const handleReset = useCallback(() => {
    resetConfig()
    storeReset(config.seed)
  }, [resetConfig, storeReset, config.seed])

  // Randomize seed: draws a fresh 32-bit seed, applies to config + diag store.
  const handleRandomizeSeed = useCallback(() => {
    const fresh = Math.floor(Math.random() * 0x1_0000_0000) >>> 0
    setSeed(fresh)
    storeReset(fresh)
  }, [setSeed, storeReset])

  const handleRun = useCallback(() => setIsRunning(!isRunning), [isRunning, setIsRunning])

  // ── Derived display values ──
  const qmS = Number.isFinite(qm.S) ? Math.abs(qm.S) : Number.NaN
  const lhvS = Number.isFinite(lhv.S) ? Math.abs(lhv.S) : Number.NaN
  const ci = qm.sCI
  const qmCiText =
    Number.isFinite(qmS) && Number.isFinite(ci.halfWidth)
      ? `${qmS.toFixed(3)} ± ${ci.halfWidth.toFixed(3)}`
      : '—'

  // Loophole budget: closed-form max |S| under the current (η, v).
  const wernerCeiling = maxChshForWerner(config.visibility)
  const etaCeiling = maxChshGivenEta(config.detectionEfficiency, config.analysisMode)
  const combinedCeiling = Math.min(wernerCeiling, etaCeiling)
  const ceilingPctOfTsirelson = (combinedCeiling / TSIRELSON_BOUND) * 100

  const wernerAllowsViolation = config.visibility > WERNER_VIOLATION_THRESHOLD
  const etaAllowsViolation =
    config.detectionEfficiency >= EBERHARD_THRESHOLD || config.analysisMode === 'fairSampling'

  // ── Sparkline payloads ──
  const sparkQm = f64ToF32(historyQmS)
  const sparkLhv = f64ToF32(historyLhvS)

  // ── Axis helpers ──
  const renderAxisSliders = (
    label: string,
    axis: readonly [number, number],
    onChange: (axis: [number, number]) => void
  ) => (
    <div className="space-y-1">
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
        max={2 * Math.PI}
        step={0.005}
        value={axis[1]}
        onChange={(v) => onChange([axis[0], v])}
        showValue
      />
    </div>
  )

  return (
    <div className="flex flex-col gap-2" data-testid="bell-experiment-content">
      {/* Run / reset controls */}
      <div className="flex items-center gap-2">
        <Button
          variant={isRunning ? 'secondary' : 'primary'}
          size="sm"
          onClick={handleRun}
          data-testid="bell-run-toggle"
        >
          {isRunning ? 'Pause' : 'Run'}
        </Button>
        <Button variant="secondary" size="sm" onClick={handleReset} data-testid="bell-reset">
          Reset
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleRandomizeSeed}
          data-testid="bell-randomize-seed"
        >
          Randomize seed
        </Button>
        <span className="text-xs text-text-secondary ml-auto" data-testid="bell-total-trials">
          {totalTrials.toLocaleString()} trials
        </span>
      </div>

      {/* Headline S readout */}
      <div className="flex gap-3 text-sm">
        <span data-testid="bell-qm-s">
          QM |S| = <span className="font-mono">{qmCiText}</span>
        </span>
        <span data-testid="bell-lhv-s">
          LHV |S| ={' '}
          <span className="font-mono">{Number.isFinite(lhvS) ? lhvS.toFixed(3) : '—'}</span>
        </span>
        {qmHasViolated && (
          <span className="text-emerald-400 font-semibold" data-testid="bell-violated">
            CHSH violated
          </span>
        )}
      </div>

      {/* S(N) sparkline — QM in primary color, LHV behind. */}
      {historyCount > 1 && (
        <div className="space-y-0.5">
          <p className="text-xs text-text-secondary">
            |S|(N) — classical bound = 2.000, Tsirelson = {TSIRELSON_BOUND.toFixed(3)}
          </p>
          <Sparkline
            data={sparkQm}
            head={historyHead}
            count={historyCount}
            min={0}
            max={TSIRELSON_BOUND + 0.2}
            height={48}
            data-testid="bell-sparkline-qm"
          />
          <Sparkline
            data={sparkLhv}
            head={historyHead}
            count={historyCount}
            min={0}
            max={TSIRELSON_BOUND + 0.2}
            height={24}
            data-testid="bell-sparkline-lhv"
          />
        </div>
      )}

      {/* Per-bin correlations */}
      <div className="text-xs grid grid-cols-2 gap-x-3 gap-y-0.5">
        {qm.bins.map((b, i) => (
          <span key={i} className="font-mono">
            E_{['ab', 'ab′', 'a′b', 'a′b′'][i]} ={' '}
            {Number.isFinite(b.mean) ? b.mean.toFixed(3) : '—'} ({b.count})
          </span>
        ))}
      </div>

      {/* Loophole-budget panel */}
      <div className="border border-[var(--border-subtle)] rounded p-2 text-xs space-y-0.5">
        <p className="font-semibold">Loophole budget</p>
        <p>
          Max |S| achievable under (v={config.visibility.toFixed(3)}, η=
          {config.detectionEfficiency.toFixed(3)}):{' '}
          <span className="font-mono">{combinedCeiling.toFixed(3)}</span> (
          {ceilingPctOfTsirelson.toFixed(0)}% of Tsirelson)
        </p>
        <p
          className={wernerAllowsViolation ? 'text-emerald-300' : 'text-amber-300'}
          data-testid="bell-werner-status"
        >
          Werner threshold v &gt; 1/√2 ≈ {WERNER_VIOLATION_THRESHOLD.toFixed(4)}:{' '}
          {wernerAllowsViolation ? 'allows' : 'forbids'} violation
        </p>
        <p
          className={etaAllowsViolation ? 'text-emerald-300' : 'text-amber-300'}
          data-testid="bell-eta-status"
        >
          Eberhard threshold η ≥ {EBERHARD_THRESHOLD.toFixed(4)} (or fair-sampling):{' '}
          {etaAllowsViolation ? 'allows' : 'forbids'} violation
        </p>
      </div>

      {/* Measurement-axis sliders */}
      <div className="space-y-2 border-t border-[var(--border-subtle)] pt-2">
        <p className="text-xs font-semibold">Measurement axes (Bloch sphere)</p>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {renderAxisSliders('Alice a (unprimed)', config.aliceAxis, setAliceAxis)}
          {renderAxisSliders('Alice a′ (primed)', config.aliceAxisPrime, setAliceAxisPrime)}
          {renderAxisSliders('Bob b (unprimed)', config.bobAxis, setBobAxis)}
          {renderAxisSliders('Bob b′ (primed)', config.bobAxisPrime, setBobAxisPrime)}
        </div>
      </div>

      {/* State noise / loopholes */}
      <div className="space-y-1 border-t border-[var(--border-subtle)] pt-2">
        <p className="text-xs font-semibold">State noise &amp; detection loopholes</p>
        <Slider
          label="Werner visibility v"
          tooltip="Mixes the singlet with the maximally mixed state. v ≤ 1/√2 makes CHSH violation impossible regardless of angles."
          min={0}
          max={1}
          step={0.005}
          value={config.visibility}
          onChange={setVisibility}
          showValue
          data-testid="bell-slider-visibility"
        />
        <Slider
          label="Detection efficiency η"
          tooltip="Symmetric per-detector firing probability. Eberhard threshold ≈ 0.828; below that, without fair-sampling, no violation is possible."
          min={0}
          max={1}
          step={0.005}
          value={config.detectionEfficiency}
          onChange={setDetectionEfficiency}
          showValue
          data-testid="bell-slider-eta"
        />
        <div>
          <p className="text-xs text-text-secondary mb-0.5">Analysis policy</p>
          <ToggleGroup
            value={config.analysisMode}
            onChange={(v) => setAnalysisMode(v as typeof config.analysisMode)}
            data-testid="bell-toggle-analysis"
            options={[
              { value: 'fairSampling', label: 'Fair sampling' },
              { value: 'assignNonDetection', label: 'Clauser-Horne' },
            ]}
          />
        </div>
      </div>

      {/* Sampler controls */}
      <div className="space-y-1 border-t border-[var(--border-subtle)] pt-2">
        <p className="text-xs font-semibold">Sampler</p>
        <ToggleGroup
          value={config.samplerMode}
          onChange={(v) => setSamplerMode(v as typeof config.samplerMode)}
          data-testid="bell-toggle-sampler"
          options={[
            { value: 'qm', label: 'Quantum' },
            { value: 'lhv', label: 'LHV' },
          ]}
        />
        <Select
          label="LHV strategy"
          value={config.lhvStrategyId}
          onChange={(v) => setLhvStrategyId(v)}
          options={LHV_STRATEGIES.map((s) => ({ value: s.id, label: s.name }))}
          data-testid="bell-lhv-strategy"
        />
      </div>

      {/* Trial loop pacing */}
      <div className="space-y-1 border-t border-[var(--border-subtle)] pt-2">
        <p className="text-xs font-semibold">Trial loop</p>
        <Slider
          label="Target trials"
          min={1000}
          max={1_000_000}
          step={1000}
          value={config.targetTrials}
          onChange={setTargetTrials}
          showValue
          data-testid="bell-slider-target-trials"
        />
        <Slider
          label="Trials / frame"
          tooltip="Trials drawn per render frame while Auto-Run is active. Higher values converge faster but use more CPU."
          min={1}
          max={2000}
          step={1}
          value={config.trialsPerFrame}
          onChange={setTrialsPerFrame}
          showValue
          data-testid="bell-slider-trials-per-frame"
        />
      </div>

      {/* Atlas sweep */}
      <BellSweepPanel />

      {/* Status footer — non-violation reasons */}
      {!qmHasViolated && totalTrials > 1000 && (
        <p className="text-xs text-text-secondary border-t border-[var(--border-subtle)] pt-2">
          QM has not (yet) violated CHSH. Reasons that can prevent violation:{' '}
          {!wernerAllowsViolation && <span>v too low; </span>}
          {!etaAllowsViolation && <span>η too low without fair-sampling; </span>}
          {wernerAllowsViolation && etaAllowsViolation && totalTrials < 20_000 && (
            <span>not enough trials for the |S| estimate to escape noise.</span>
          )}
        </p>
      )}

      {/* Watermark — connects panel to physics core */}
      <p className="text-[10px] text-text-secondary opacity-60 mt-1">
        Classical bound = {CLASSICAL_BOUND}. Tsirelson = 2√2 ≈ {TSIRELSON_BOUND.toFixed(3)}.
      </p>
    </div>
  )
})

BellExperimentContent.displayName = 'BellExperimentContent'
/**
 * Convenience wrapper that renders {@link BellExperimentContent} inside a
 * collapsible Section. The renderer's AnalysisSection prefers to inline
 * the content directly, but this wrapper is provided for stand-alone use
 * (e.g. integration tests) where a self-contained section is convenient.
 *
 * @param props - Standard collapsible-section props.
 * @returns The wrapped Bell-experiment section.
 */
export interface BellExperimentSectionProps {
  defaultOpen?: boolean
}

export const BellExperimentSection: React.FC<BellExperimentSectionProps> = React.memo(
  ({ defaultOpen = true }) => (
    <Section title="Bell Test" defaultOpen={defaultOpen} data-testid="bell-experiment-section">
      <BellExperimentContent />
    </Section>
  )
)
BellExperimentSection.displayName = 'BellExperimentSection'
