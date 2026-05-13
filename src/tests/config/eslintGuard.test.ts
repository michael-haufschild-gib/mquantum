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
const IDENTIFIER_RULE_NAME_RE = /^[A-Za-z_$][\w$]*$/

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function countRuleDefinitions(ruleName: string, source = config): number {
  const escapedRuleName = escapeRegExp(ruleName)
  const quotedRuleKey = `['"]${escapedRuleName}['"]`
  const computedRuleKey = `\\[\\s*${quotedRuleKey}\\s*\\]`
  const keyPattern = IDENTIFIER_RULE_NAME_RE.test(ruleName)
    ? `(?:${escapedRuleName}|${quotedRuleKey}|${computedRuleKey})`
    : `(?:${quotedRuleKey}|${computedRuleKey})`

  return [...source.matchAll(new RegExp(`^\\s+${keyPattern}\\s*:`, 'gm'))].length
}

describe('eslint config: no per-file exemptions for structural quality rules', () => {
  it('rule definition counter recognizes quoted and unquoted rule keys', () => {
    const sample = `
      complexity: 'off',
      'complexity': 'off',
      "complexity": 'off',
      ['complexity']: 'off',
      'no-console': 'off',
      "no-console": 'off',
      ["no-console"]: 'off',
      'sonarjs/cognitive-complexity': 'off',
      "sonarjs/cognitive-complexity": 'off',
      ['sonarjs/cognitive-complexity']: 'off',
    `

    expect(countRuleDefinitions('complexity', sample)).toBe(4)
    expect(countRuleDefinitions('no-console', sample)).toBe(3)
    expect(countRuleDefinitions('sonarjs/cognitive-complexity', sample)).toBe(3)
  })

  it('complexity rule is defined exactly once (off — sonarjs/cognitive-complexity is the active rule)', () => {
    // Base config: complexity: 'off' (disabled in favor of sonarjs/cognitive-complexity).
    // If this fails, someone added a per-file complexity override — use sonarjs/cognitive-complexity instead.
    expect(countRuleDefinitions('complexity')).toBe(1)
  })

  it('sonarjs/cognitive-complexity has exactly 3 definitions (base + off for physics/rendering/tests + re-enable for rendering hooks)', () => {
    // Base config: error at 15 for all code.
    // Exclusion: off for src/lib/physics, src/rendering, src/tests.
    // Re-enable: error at 15 for rendering hooks (useExportRuntime, useGizmoInteraction, gizmoHitTesting).
    // If this fails, someone added a per-file override — refactor the file instead.
    expect(countRuleDefinitions('sonarjs/cognitive-complexity')).toBe(3)
  })

  it('max-lines rule has exactly 4 definitions (tsx 500 + ts 600 + compute passes off + physics 1500)', () => {
    // Four occurrences:
    //   1. .tsx files at 500 (error).
    //   2. .ts files at 600 (error).
    //   3. src/rendering/webgpu/passes & renderers off — compute passes are
    //      cohesive units; the 600-line cap forced fake decomposition into
    //      helper files passing typed *Fields interface bags.
    //   4. src/lib/physics at 1500 — thick numerical solvers.
    // If this fails, someone added a per-file max-lines override outside these
    // categories — split the file instead, or document the new directory.
    expect(countRuleDefinitions('max-lines')).toBe(4)
  })

  it('no-console rule is defined with exactly 4 occurrences', () => {
    // Base config enables no-console as error.
    // 3 off overrides: logger.ts, ErrorBoundary files, unit test files, and e2e spec files.
    // If this fails, someone broadened the exemption — use logger instead.
    expect(countRuleDefinitions('no-console')).toBe(4) // 1 enable + 3 off overrides
  })

  it('no-restricted-imports boundary exists for render passes with exactly one block', () => {
    // Render passes must access stores via ctx.stores, not direct imports.
    // Single enforcement block with negation patterns for known exemptions
    // (diagnostic stores, simulationStateStore, performanceStore, defaults).
    // If this test fails, someone added a second override — consolidate into the existing block.
    expect(countRuleDefinitions('no-restricted-imports')).toBe(1)
  })
})
