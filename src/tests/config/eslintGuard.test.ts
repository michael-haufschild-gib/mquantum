/// <reference types="node" />
/**
 * Guards against per-file exemptions for structural quality rules in eslint.config.js.
 *
 * Exempting specific files from `complexity` or `max-lines` is almost always a sign
 * that the file needs splitting — not that the rule is wrong. If this test fails,
 * split the file instead of adding an override.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../..')
const config = readFileSync(resolve(ROOT, 'eslint.config.js'), 'utf8')

describe('eslint config: no per-file exemptions for structural quality rules', () => {
  it('complexity rule is defined exactly once (off — sonarjs/cognitive-complexity is the active rule)', () => {
    // Base config: complexity: 'off' (disabled in favor of sonarjs/cognitive-complexity).
    // If this fails, someone added a per-file complexity override — use sonarjs/cognitive-complexity instead.
    const matches = [...config.matchAll(/^\s+complexity\s*:/gm)]
    expect(matches).toHaveLength(1)
  })

  it('sonarjs/cognitive-complexity has exactly 3 definitions (base + off for physics/rendering/tests + re-enable for rendering hooks)', () => {
    // Base config: error at 15 for all code.
    // Exclusion: off for src/lib/physics, src/rendering, src/tests.
    // Re-enable: error at 15 for rendering hooks (useExportRuntime, useGizmoInteraction, gizmoHitTesting).
    // If this fails, someone added a per-file override — refactor the file instead.
    const matches = [...config.matchAll(/^\s+'sonarjs\/cognitive-complexity'\s*:/gm)]
    expect(matches).toHaveLength(3)
  })

  it('max-lines rule is defined exactly twice (tsx at 500 + ts at 600)', () => {
    // Two occurrences: .tsx files at 500 (error) and .ts files at 600 (warn).
    // If this fails, someone added a per-file max-lines override — split the file instead.
    const matches = [...config.matchAll(/^\s+'max-lines'\s*:/gm)]
    expect(matches).toHaveLength(2)
  })

  it('no-console rule is defined with exactly 4 occurrences', () => {
    // Base config enables no-console as error.
    // 3 off overrides: logger.ts, ErrorBoundary files, unit test files, and e2e spec files.
    // If this fails, someone broadened the exemption — use logger instead.
    const ruleMatches = [...config.matchAll(/^\s+'no-console'\s*:/gm)]
    expect(ruleMatches).toHaveLength(4) // 1 enable + 3 off overrides
  })

  it('no-restricted-imports boundary exists for render passes with exactly one block', () => {
    // Render passes must access stores via ctx.stores, not direct imports.
    // Single enforcement block with negation patterns for known exemptions
    // (diagnostic stores, simulationStateStore, performanceStore, defaults).
    // If this test fails, someone added a second override — consolidate into the existing block.
    const ruleMatches = [...config.matchAll(/^\s+'no-restricted-imports'\s*:/gm)]
    expect(ruleMatches).toHaveLength(1)
  })
})
