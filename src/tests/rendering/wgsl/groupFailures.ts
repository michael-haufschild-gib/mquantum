/**
 * Phase 6: failure triage — group naga diagnostics by stable signature.
 *
 * A red run with 500 failures is useless unless we can see that 480 share one
 * root cause. The signature normalizer already strips line numbers and paths;
 * this module buckets by signature and produces a readable summary.
 *
 * @module tests/rendering/wgsl/groupFailures
 */

import type { ShaderFailure } from './validateWithNaga'

/** A bucket of failures sharing a normalized diagnostic signature. */
export interface FailureGroup {
  signature: string
  count: number
  surfaces: Set<string>
  examples: ShaderFailure[]
}

/**
 * Bucket failures by their normalized signature, sorted by frequency.
 *
 * @param failures Raw failures from `validateWithNaga`.
 * @param examplesPerGroup Max example failures to retain per group. Default 3.
 */
export function groupFailures(
  failures: readonly ShaderFailure[],
  examplesPerGroup = 3
): FailureGroup[] {
  const groups = new Map<string, FailureGroup>()

  for (const f of failures) {
    let g = groups.get(f.signature)
    if (!g) {
      g = { signature: f.signature, count: 0, surfaces: new Set(), examples: [] }
      groups.set(f.signature, g)
    }
    g.count++
    g.surfaces.add(f.surface)
    if (g.examples.length < examplesPerGroup) g.examples.push(f)
  }

  // Stable secondary sort by signature so equal-count groups land in a
  // deterministic order — repeated red runs produce diff-able output.
  return [...groups.values()].sort(
    (a, b) => b.count - a.count || a.signature.localeCompare(b.signature)
  )
}

/**
 * Render a human-readable triage summary from grouped failures.
 *
 * Format: one section per group, top-N printed verbatim, remainder
 * summarized by count. Kept terse so a 500-failure run is readable.
 */
export function formatTriageReport(groups: readonly FailureGroup[], topN = 10): string {
  if (groups.length === 0) return ''
  const lines: string[] = []
  lines.push(`Triage: ${groups.length} distinct signature${groups.length === 1 ? '' : 's'}.`)
  const shown = groups.slice(0, topN)
  for (const g of shown) {
    lines.push('')
    lines.push(`── ${g.count}× [${[...g.surfaces].sort().join(', ')}] ──`)
    lines.push(`signature: ${g.signature}`)
    lines.push(`example labels:`)
    for (const ex of g.examples) {
      lines.push(`  • ${ex.label} (cacheKey=${ex.cacheKey})`)
    }
    const first = g.examples[0]
    if (first) {
      lines.push(`first example diagnostic:`)
      lines.push(
        first.error
          .split('\n')
          .map((l) => `    ${l}`)
          .join('\n')
      )
    }
  }
  if (groups.length > topN) {
    const hidden = groups.length - topN
    const hiddenCount = groups.slice(topN).reduce((s, g) => s + g.count, 0)
    lines.push('')
    lines.push(
      `… and ${hidden} more signature${hidden === 1 ? '' : 's'} (${hiddenCount} failures).`
    )
  }
  return lines.join('\n')
}
