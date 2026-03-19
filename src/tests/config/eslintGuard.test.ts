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
  it('complexity rule is defined exactly once (in the base config block)', () => {
    // Matches "complexity:" as a rule key assignment in a rules object.
    // One occurrence: the base config at complexity: ['error', 40].
    // If this fails, someone added a per-file complexity override — split the file instead.
    const matches = [...config.matchAll(/^\s+complexity\s*:/gm)]
    expect(matches).toHaveLength(1)
  })

  it('max-lines rule is defined exactly twice (tsx at 500 + ts at 600)', () => {
    // Two occurrences: .tsx files at 500 (error) and .ts files at 600 (warn).
    // If this fails, someone added a per-file max-lines override — split the file instead.
    const matches = [...config.matchAll(/^\s+'max-lines'\s*:/gm)]
    expect(matches).toHaveLength(2)
  })
})
