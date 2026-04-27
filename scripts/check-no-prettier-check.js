#!/usr/bin/env node

/**
 * Guard rail: refuse `prettier` in CI workflows entirely, and refuse
 * `prettier --check` anywhere in the repo.
 *
 * Policy: prettier runs locally only, via husky + lint-staged on commit. It
 * must never run in CI:
 *   - `prettier --check` only ever fails the pipeline on formatting drift
 *     that `--write` would have silently fixed — pure friction, no value.
 *   - `prettier --write` in CI is a no-op (the runner discards the changes
 *     when the job ends).
 * Either way the right answer is "don't invoke prettier from CI."
 *
 * Scope:
 *   1. `.github/workflows/*.{yml,yaml}` — no `prettier` invocation at all.
 *   2. Anywhere else in the tracked tree — no `prettier --check` invocation.
 *
 * `package.json` scripts and `.husky/` hooks may use `prettier --write`.
 *
 * Exits nonzero on any match, printing `file:line` for each offender.
 * Run: `node scripts/check-no-prettier-check.js`
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import process from 'node:process'

const ANY_PRETTIER = /\bprettier\b/
const PRETTIER_CHECK = /\bprettier\b[^\n]*--check\b/

function listTrackedFiles() {
  const out = execSync('git ls-files', { encoding: 'utf8', cwd: process.cwd() })
  return out.split('\n').filter(Boolean)
}

function isCiWorkflow(path) {
  return (
    path.startsWith('.github/workflows/') &&
    (path.endsWith('.yml') || path.endsWith('.yaml'))
  )
}

function shouldScanForCheckFlag(path) {
  if (path === 'scripts/check-no-prettier-check.js') return false
  if (path.endsWith('.yml') || path.endsWith('.yaml')) return true
  if (path === 'package.json') return true
  if (path.startsWith('.husky/')) return true
  if (path.endsWith('.sh')) return true
  return false
}

const offenders = []

for (const file of listTrackedFiles()) {
  if (file === 'scripts/check-no-prettier-check.js') continue

  let body
  try {
    body = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  const lines = body.split('\n')

  // Rule 1: no `prettier` invocation in any CI workflow file. YAML comment
  // lines (whitespace + `#`), the guard step's own `name:`, and the call to
  // this very script are exempt — they reference prettier by name without
  // running it.
  if (isCiWorkflow(file)) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!ANY_PRETTIER.test(line)) continue
      if (/^\s*#/.test(line)) continue
      if (/scripts\/check-no-prettier-check\.js/.test(line)) continue
      if (/^\s*-\s*name:/.test(line)) continue
      offenders.push(
        `${file}:${i + 1}: prettier is forbidden in CI — ${line.trim()}`
      )
    }
    continue
  }

  // Rule 2: no `prettier --check` anywhere else (package.json, husky, *.sh, ...).
  // Skip shell/YAML comment lines — they may legitimately mention the
  // forbidden form when documenting why it's forbidden (e.g. this guard's own
  // comment in .husky/pre-commit).
  if (!shouldScanForCheckFlag(file)) continue
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!PRETTIER_CHECK.test(line)) continue
    if (/^\s*#/.test(line)) continue
    if (/scripts\/check-no-prettier-check\.js/.test(line)) continue
    offenders.push(
      `${file}:${i + 1}: \`prettier --check\` is forbidden — use \`--write\` — ${line.trim()}`
    )
  }
}

if (offenders.length > 0) {
  console.error('ERROR: prettier policy violation.')
  console.error('  - prettier may NOT run in .github/workflows/*.yml')
  console.error('  - `prettier --check` is forbidden anywhere; use --write')
  console.error('  - formatting runs locally via husky + lint-staged on commit')
  console.error('')
  console.error('Offenders:')
  for (const line of offenders) console.error(`  ${line}`)
  process.exit(1)
}

console.log('check-no-prettier-check: OK')
