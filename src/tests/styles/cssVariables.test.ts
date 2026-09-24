/**
 * Every CSS custom property referenced through `var(--name)` without a
 * fallback must be defined somewhere in the app's stylesheets (or set from
 * script). An undefined one is invalid at computed-value time: an SVG
 * `stroke`/`fill` then renders nothing — the SRMT sweep plot drew its φ₂
 * series, φ₂ landmarks and φ₂ champion markers with `var(--accent)` and
 * showed none of them.
 *
 * @module tests/styles/cssVariables
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const SRC_ROOT = resolve(fileURLToPath(import.meta.url), '../../..')

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || full === join(SRC_ROOT, 'tests')) continue
      walk(full, out)
    } else if (/\.(css|ts|tsx)$/.test(name)) {
      out.push(full)
    }
  }
}

describe('CSS custom properties', () => {
  // Reads every source file under src/: under a second alone, but a whole-tree
  // scan like this exceeded the 5 s default under full-suite worker contention.
  it('defines every var(--name) that is used without a fallback', () => {
    const files: string[] = []
    walk(SRC_ROOT, files)
    const defined = new Set<string>()
    const unresolved = new Map<string, string>()
    const sources = files.map((file) => ({ file, text: readFileSync(file, 'utf-8') }))
    for (const { file, text } of sources) {
      if (file.endsWith('.css')) {
        for (const m of text.matchAll(/(--[\w-]+)\s*:/g)) defined.add(m[1]!)
      }
      for (const m of text.matchAll(/setProperty\(\s*['"`](--[\w-]+)/g)) defined.add(m[1]!)
      for (const m of text.matchAll(/['"](--[\w-]+)['"]\s*:/g)) defined.add(m[1]!)
    }
    for (const { file, text } of sources) {
      for (const m of text.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
        if (m[2]) continue // has a fallback
        if (!unresolved.has(m[1]!)) unresolved.set(m[1]!, file.slice(SRC_ROOT.length + 1))
      }
    }
    // Guard against a vacuous pass (wrong root, nothing scanned).
    expect(files.length).toBeGreaterThan(500)
    expect(defined.has('--color-accent')).toBe(true)
    expect(unresolved.has('--color-accent')).toBe(true)
    const missing = [...unresolved].filter(([name]) => !defined.has(name))
    expect(missing).toEqual([])
  }, 30_000)
})
