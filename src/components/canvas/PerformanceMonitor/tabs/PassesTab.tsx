import React from 'react'
import { useShallow } from 'zustand/react/shallow'

import { usePerformanceMetricsStore } from '@/stores/performanceMetricsStore'

import { Icons } from '../icons'
import { SectionHeader } from '../subcomponents'

// ============================================================================
// Constants
// ============================================================================

/** Pass colors for the stacked bar — references CSS variables, cycles for many passes. */
const PASS_COLORS = [
  'var(--chart-pass-1)',
  'var(--chart-pass-2)',
  'var(--chart-pass-3)',
  'var(--chart-pass-4)',
  'var(--chart-pass-5)',
  'var(--chart-pass-6)',
  'var(--chart-pass-7)',
  'var(--chart-pass-8)',
]

// ============================================================================
// Helpers
// ============================================================================

/** Classify a pass's GPU cost for color-coding the table rows. */
function getCostColor(gpuTimeMs: number): string {
  if (gpuTimeMs >= 4) return 'text-[var(--chart-cost-hot)]'
  if (gpuTimeMs >= 1) return 'text-[var(--chart-cost-warm)]'
  return 'text-[var(--text-secondary)]'
}

/** Format ms with 2 decimal places. */
function fmtMs(ms: number): string {
  return ms < 0.005 ? '<0.01' : ms.toFixed(2)
}

/** Human-readable pass name from camelCase or kebab-case passId. */
function formatPassId(passId: string): string {
  return (
    passId
      // Split on hyphens and camelCase boundaries
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
  )
}

// ============================================================================
// PASSES TAB
// ============================================================================

/**
 * Displays per-pass GPU and CPU timing from the render graph.
 * Shows a stacked bar for GPU budget and a table with per-pass breakdown.
 */
export const PassesTabContent = React.memo(function PassesTabContent() {
  const { passTimings, totalGpuTimeMs, cpuBreakdown } = usePerformanceMetricsStore(
    useShallow((s) => ({
      passTimings: s.passTimings,
      totalGpuTimeMs: s.totalGpuTimeMs,
      cpuBreakdown: s.cpuBreakdown,
    }))
  )

  const activePasses = passTimings.filter((p) => !p.skipped)
  const hasGpuTimings = activePasses.some((p) => p.gpuTimeMs > 0)

  if (passTimings.length === 0) {
    return (
      <div className="p-5 text-center text-text-tertiary text-xs py-8">
        No pass timing data available
      </div>
    )
  }

  return (
    <div className="space-y-4 p-5 overflow-y-auto">
      {/* GPU Budget Bar */}
      {hasGpuTimings && totalGpuTimeMs > 0 && (
        <div className="space-y-2">
          <SectionHeader icon={<Icons.Zap />} label={`GPU Budget — ${fmtMs(totalGpuTimeMs)} ms`} />
          <div className="h-5 w-full rounded-md overflow-hidden flex bg-[var(--bg-hover)]">
            {activePasses.map((p, i) => {
              const pct = totalGpuTimeMs > 0 ? (p.gpuTimeMs / totalGpuTimeMs) * 100 : 0
              if (pct < 0.5) return null
              return (
                <div
                  key={p.passId}
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: PASS_COLORS[i % PASS_COLORS.length],
                    opacity: 0.85,
                  }}
                  title={`${formatPassId(p.passId)}: ${fmtMs(p.gpuTimeMs)} ms (${pct.toFixed(0)}%)`}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* CPU Breakdown Bar */}
      {cpuBreakdown.passesMs > 0 && (
        <div className="space-y-2">
          <SectionHeader
            icon={<Icons.Clock />}
            label={`CPU Breakdown — ${fmtMs(cpuBreakdown.setupMs + cpuBreakdown.passesMs + cpuBreakdown.submitMs)} ms`}
          />
          <div className="h-3 w-full rounded-md overflow-hidden flex bg-[var(--bg-hover)]">
            {[
              { label: 'Setup', ms: cpuBreakdown.setupMs, color: 'var(--chart-cpu-setup)' },
              { label: 'Passes', ms: cpuBreakdown.passesMs, color: 'var(--chart-cpu-passes)' },
              { label: 'Submit', ms: cpuBreakdown.submitMs, color: 'var(--chart-cpu-submit)' },
            ].map((phase) => {
              const total = cpuBreakdown.setupMs + cpuBreakdown.passesMs + cpuBreakdown.submitMs
              const pct = total > 0 ? (phase.ms / total) * 100 : 0
              if (pct < 0.5) return null
              return (
                <div
                  key={phase.label}
                  className="h-full transition-all duration-300"
                  style={{ width: `${pct}%`, backgroundColor: phase.color, opacity: 0.75 }}
                  title={`${phase.label}: ${fmtMs(phase.ms)} ms`}
                />
              )
            })}
          </div>
          <div className="flex gap-3 text-xs text-text-tertiary">
            <span>Setup {fmtMs(cpuBreakdown.setupMs)}</span>
            <span>Passes {fmtMs(cpuBreakdown.passesMs)}</span>
            <span>Submit {fmtMs(cpuBreakdown.submitMs)}</span>
          </div>
        </div>
      )}

      {/* No GPU Timing Warning */}
      {!hasGpuTimings && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-warning border border-warning-border text-xs text-warning">
          <Icons.AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>GPU timing unavailable — timestamp-query not supported</span>
        </div>
      )}

      {/* Per-Pass Table */}
      <div className="space-y-2">
        <SectionHeader icon={<Icons.Layers />} label="Per-Pass Timing" />
        <div className="border border-border-subtle rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_60px_60px_48px] gap-1 px-3 py-1.5 bg-[var(--bg-hover)] border-b border-border-subtle text-xs text-text-tertiary uppercase tracking-wider font-bold">
            <span>Pass</span>
            <span className="text-right">GPU</span>
            <span className="text-right">CPU</span>
            <span className="text-right">%</span>
          </div>
          {/* Rows */}
          {activePasses.map((p, i) => {
            const pct = totalGpuTimeMs > 0 ? (p.gpuTimeMs / totalGpuTimeMs) * 100 : 0
            return (
              <div
                key={p.passId}
                className="grid grid-cols-[1fr_60px_60px_48px] gap-1 px-3 py-1.5 border-b border-border-subtle last:border-0 hover:bg-[var(--bg-hover)] transition-colors items-center"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: PASS_COLORS[i % PASS_COLORS.length] }}
                  />
                  <span className="text-xs font-mono text-text-secondary truncate">
                    {formatPassId(p.passId)}
                  </span>
                </div>
                <span className={`text-xs font-mono text-right ${getCostColor(p.gpuTimeMs)}`}>
                  {hasGpuTimings ? fmtMs(p.gpuTimeMs) : '—'}
                </span>
                <span className="text-xs font-mono text-right text-text-tertiary">
                  {fmtMs(p.cpuTimeMs)}
                </span>
                <span className="text-xs font-mono text-right text-text-tertiary">
                  {hasGpuTimings && totalGpuTimeMs > 0 ? `${pct.toFixed(0)}%` : '—'}
                </span>
              </div>
            )
          })}
          {/* Skipped passes */}
          {passTimings.filter((p) => p.skipped).length > 0 && (
            <div className="px-3 py-1.5 text-xs text-text-tertiary italic">
              {passTimings.filter((p) => p.skipped).length} passes skipped
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
