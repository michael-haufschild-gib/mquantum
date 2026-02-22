/**
 * Open Quantum Diagnostics Section
 *
 * Displays real-time metrics for the density matrix evolution:
 * purity, entropy, coherence magnitude, and ground state population.
 * Includes rolling sparkline charts and collapsible formula reference.
 * Only visible when open quantum system mode is enabled.
 *
 * @module components/sections/Advanced/OpenQuantumDiagnosticsSection
 */

import React, { useState, useCallback } from 'react'
import { Section } from '@/components/sections/Section'
import { Sparkline } from '@/components/ui/Sparkline'
import { useExtendedObjectStore } from '@/stores/extendedObjectStore'
import { useOpenQuantumDiagnosticsStore } from '@/stores/openQuantumDiagnosticsStore'
import { useShallow } from 'zustand/react/shallow'

/**
 * Diagnostics readout for the open quantum system.
 *
 * Shows live values of:
 * - Purity: Tr(rho^2) in [1/K, 1]. 1 = pure state, 1/K = maximally mixed.
 * - Linear Entropy: 1 - Tr(rho^2)
 * - von Neumann Entropy: -Tr(rho ln rho)
 * - Coherence: sum of off-diagonal magnitudes
 * - Ground Population: rho_{00}
 *
 * Plus rolling sparkline charts for purity, entropy, and coherence,
 * and a collapsible formula help section.
 *
 * @returns React component, or null when open quantum is disabled
 */
export const OpenQuantumDiagnosticsSection: React.FC = React.memo(() => {
  const enabled = useExtendedObjectStore(
    (s) => {
      const oq = s.schroedinger.openQuantum?.enabled ?? false
      const mode = s.schroedinger.quantumMode
      const repr = s.schroedinger.representation
      return oq && (mode === 'harmonicOscillator' || mode === 'hydrogenND') && repr !== 'wigner'
    }
  )

  const metrics = useOpenQuantumDiagnosticsStore(
    useShallow((s) => ({
      purity: s.purity,
      linearEntropy: s.linearEntropy,
      vonNeumannEntropy: s.vonNeumannEntropy,
      coherenceMagnitude: s.coherenceMagnitude,
      groundPopulation: s.groundPopulation,
    }))
  )

  const history = useOpenQuantumDiagnosticsStore(
    useShallow((s) => ({
      historyPurity: s.historyPurity,
      historyEntropy: s.historyEntropy,
      historyCoherence: s.historyCoherence,
      historyHead: s.historyHead,
      historyCount: s.historyCount,
    }))
  )

  const populationData = useOpenQuantumDiagnosticsStore(
    useShallow((s) => ({
      populations: s.populations,
      basisLabels: s.basisLabels,
      basisCount: s.basisCount,
    }))
  )

  const [showFormulas, setShowFormulas] = useState(false)
  const toggleFormulas = useCallback(() => setShowFormulas((v) => !v), [])

  if (!enabled) return null

  return (
    <Section title="Open Quantum Diagnostics" defaultOpen={false}>
      <div className="space-y-1 px-1">
        <MetricRow label="Purity" value={metrics.purity} digits={4} />
        <MetricRow label="Linear Entropy" value={metrics.linearEntropy} digits={4} />
        <MetricRow label="von Neumann S" value={metrics.vonNeumannEntropy} digits={4} />
        <MetricRow label="Coherence" value={metrics.coherenceMagnitude} digits={4} />
        <MetricRow label="Ground Pop." value={metrics.groundPopulation} digits={4} />
      </div>

      {/* Rolling sparkline charts */}
      <div className="mt-3 space-y-2 px-1">
        <SparklineRow
          label="Purity"
          data={history.historyPurity}
          head={history.historyHead}
          count={history.historyCount}
          min={0}
          max={1}
        />
        <SparklineRow
          label="Entropy"
          data={history.historyEntropy}
          head={history.historyHead}
          count={history.historyCount}
          min={0}
        />
        <SparklineRow
          label="Coherence"
          data={history.historyCoherence}
          head={history.historyHead}
          count={history.historyCount}
          min={0}
        />
      </div>

      {/* Per-state populations (hydrogen mode) */}
      {populationData.basisCount > 0 && (
        <div className="mt-3 space-y-1 px-1">
          <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
            State Populations
          </span>
          {populationData.basisLabels.map((label, i) => (
            <PopulationBar
              key={label}
              label={label}
              value={populationData.populations[i] ?? 0}
            />
          ))}
        </div>
      )}

      {/* Formula help toggle */}
      <div className="mt-3 px-1">
        <button
          type="button"
          className="text-xs text-accent-cyan hover:text-accent-cyan/80 transition-colors"
          onClick={toggleFormulas}
          aria-expanded={showFormulas}
        >
          {showFormulas ? 'Hide Formulas' : 'Formulas'}
        </button>

        {showFormulas && (
          <div className="mt-2 space-y-1 text-xs text-text-tertiary font-mono leading-relaxed">
            <p>Purity = Tr(\u03C1\u00B2) \u2208 [1/K, 1]</p>
            <p>Linear Entropy = 1 \u2212 Tr(\u03C1\u00B2)</p>
            <p>von Neumann S = \u2212Tr(\u03C1 ln \u03C1)</p>
            <p>Coherence = \u03A3<sub>k\u2260l</sub> |\u03C1<sub>kl</sub>|</p>
            <p>Ground Pop. = Re(\u03C1<sub>00</sub>)</p>
          </div>
        )}
      </div>
    </Section>
  )
})

OpenQuantumDiagnosticsSection.displayName = 'OpenQuantumDiagnosticsSection'

/** Single metric row with label and formatted value */
function MetricRow({ label, value, digits }: { label: string; value: number; digits: number }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-text-secondary">{label}</span>
      <span className="text-text-primary font-mono tabular-nums">
        {value.toFixed(digits)}
      </span>
    </div>
  )
}

/** Per-state population bar with label and percentage */
function PopulationBar({ label, value }: { label: string; value: number }) {
  const pct = Math.max(0, Math.min(100, value * 100))
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-text-secondary font-mono w-8 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-panel-border/40 overflow-hidden">
        <div
          className="h-full rounded-full bg-accent-cyan/70 transition-[width] duration-100"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-text-tertiary font-mono tabular-nums w-10 text-end">
        {(value * 100).toFixed(1)}%
      </span>
    </div>
  )
}

/** Labeled sparkline row for a single metric history */
function SparklineRow({
  label,
  data,
  head,
  count,
  min,
  max,
}: {
  label: string
  data: Float32Array
  head: number
  count: number
  min?: number
  max?: number
}) {
  return (
    <div>
      <span className="text-[10px] text-text-tertiary uppercase tracking-wider">{label}</span>
      <Sparkline
        data={data}
        head={head}
        count={count}
        min={min}
        max={max}
        height={28}
        className="w-full opacity-80"
      />
    </div>
  )
}
