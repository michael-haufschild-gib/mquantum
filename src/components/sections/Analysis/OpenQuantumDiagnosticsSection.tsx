/**
 * Open Quantum Diagnostics Section
 *
 * Displays real-time metrics for the density matrix evolution:
 * purity, entropy, coherence magnitude, and ground state population.
 * Includes rolling sparkline charts and collapsible formula reference.
 * Only visible when open quantum system mode is enabled.
 *
 * @module components/sections/Analysis/OpenQuantumDiagnosticsSection
 */

import React, { useCallback, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Section } from '@/components/sections/Section'
import { UnavailableSection } from '@/components/sections/UnavailableSection'
import { Button } from '@/components/ui/Button'
import { isAnalyticQuantumType } from '@/lib/geometry/registry'
import { useDiagnosticsStore } from '@/stores/diagnostics/diagnosticsStore'
import { useExtendedObjectStore } from '@/stores/scene/extendedObjectStore'

import { MetricRow, SparklineRow } from './AnalysisPrimitives'

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
  const enabled = useExtendedObjectStore((s) => {
    const oq = s.schroedinger.openQuantum?.enabled ?? false
    const mode = s.schroedinger.quantumMode
    const repr = s.schroedinger.representation
    return oq && isAnalyticQuantumType(mode) && repr !== 'wigner'
  })

  const metrics = useDiagnosticsStore(
    useShallow((s) => ({
      purity: s.openQuantum.purity,
      linearEntropy: s.openQuantum.linearEntropy,
      vonNeumannEntropy: s.openQuantum.vonNeumannEntropy,
      coherenceMagnitude: s.openQuantum.coherenceMagnitude,
      groundPopulation: s.openQuantum.groundPopulation,
    }))
  )

  const history = useDiagnosticsStore(
    useShallow((s) => ({
      historyPurity: s.openQuantum.historyPurity,
      historyEntropy: s.openQuantum.historyEntropy,
      historyCoherence: s.openQuantum.historyCoherence,
      historyHead: s.openQuantum.historyHead,
      historyCount: s.openQuantum.historyCount,
    }))
  )

  const populationData = useDiagnosticsStore(
    useShallow((s) => ({
      populations: s.openQuantum.populations,
      basisLabels: s.openQuantum.basisLabels,
      basisCount: s.openQuantum.basisCount,
    }))
  )

  const [showFormulas, setShowFormulas] = useState(false)
  const toggleFormulas = useCallback(() => setShowFormulas((v) => !v), [])

  if (!enabled) {
    return (
      <UnavailableSection
        title="Open Quantum Diagnostics"
        reason="Enable open quantum in analytic mode (non-Wigner)"
      />
    )
  }

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
          sparklineClassName="w-full opacity-80"
        />
        <SparklineRow
          label="Entropy"
          data={history.historyEntropy}
          head={history.historyHead}
          count={history.historyCount}
          min={0}
          sparklineClassName="w-full opacity-80"
        />
        <SparklineRow
          label="Coherence"
          data={history.historyCoherence}
          head={history.historyHead}
          count={history.historyCount}
          min={0}
          sparklineClassName="w-full opacity-80"
        />
      </div>

      {/* Per-state populations (hydrogen mode) */}
      {populationData.basisCount > 0 && (
        <div className="mt-3 space-y-1 px-1">
          <span className="text-xs text-text-tertiary uppercase tracking-wider">
            State Populations
          </span>
          {populationData.basisLabels.map((label, i) => (
            <PopulationBar key={label} label={label} value={populationData.populations[i] ?? 0} />
          ))}
        </div>
      )}

      {/* Formula help toggle */}
      <div className="mt-3 px-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleFormulas}
          ariaLabel={showFormulas ? 'Hide formulas' : 'Show formulas'}
          className="text-xs text-accent-cyan hover:text-accent-cyan/80 px-0 py-0"
        >
          {showFormulas ? 'Hide Formulas' : 'Formulas'}
        </Button>

        {showFormulas && (
          <div className="mt-2 space-y-1 text-xs text-text-tertiary font-mono leading-relaxed">
            <p>Purity = Tr(ρ²) ∈ [1/K, 1]</p>
            <p>Linear Entropy = 1 − Tr(ρ²)</p>
            <p>von Neumann S = −Tr(ρ ln ρ)</p>
            <p>
              Coherence = Σ<sub>k≠l</sub> |ρ<sub>kl</sub>|
            </p>
            <p>
              Ground Pop. = Re(ρ<sub>00</sub>)
            </p>
          </div>
        )}
      </div>
    </Section>
  )
})

OpenQuantumDiagnosticsSection.displayName = 'OpenQuantumDiagnosticsSection'

/**
 * Per-state population bar with label and percentage.
 *
 * `value` comes from a GPU readback of a density matrix diagonal; a
 * transient NaN (e.g. an early frame before the first valid readback,
 * or a numerical blow-up) would otherwise render as `width: NaN%`
 * (invalid CSS, silently dropped by the browser) and `NaN%` text. The
 * explicit `Number.isFinite` guard normalises both to 0 so the UI never
 * shows a broken bar.
 */
function PopulationBar({ label, value }: { label: string; value: number }) {
  const safeValue = Number.isFinite(value) ? value : 0
  const pct = Math.max(0, Math.min(100, safeValue * 100))
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-text-secondary font-mono w-8 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-panel-border/40 overflow-hidden">
        <div
          className="h-full rounded-full bg-accent-cyan/70 transition-[width] duration-100"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-text-tertiary font-mono tabular-nums w-10 text-end">
        {pct.toFixed(1)}%
      </span>
    </div>
  )
}
