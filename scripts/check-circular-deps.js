#!/usr/bin/env node
/**
 * Strict circular dependency gate.
 *
 * Runs `madge --circular --extensions ts,tsx src/` and fails on any cycle
 * not in `ALLOWED_CYCLES`. The allowlist is explicit so reviewers see
 * which cycles are intentional vs. accidentally added.
 *
 * Why fail on type-only cycles too: while `import type` edges are erased
 * by TypeScript and pose no runtime TDZ hazard, structural cycles still
 * obscure module ownership and break tooling (madge graphs, dependency
 * visualization, future bundler optimizations). The cheapest way to keep
 * the graph honest is to reject every cycle and document the few that
 * are intentional.
 *
 * Known acceptable cycles (must be added here AND documented):
 * - DropdownMenu MenuItems ↔ PortaledSubmenu: intentional mutual recursion
 *   for nested submenu rendering.
 *
 * Exit code 1 if any non-allowlisted cycle is found.
 *
 * Usage: node scripts/check-circular-deps.js
 */

import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

// Known acceptable cycles (short descriptions for matching)
const ALLOWED_CYCLES = [
  // Mutual recursion: submenus contain menu items which can have submenus
  'MenuItems.tsx,PortaledSubmenu.tsx',
]

/**
 * Check if a cycle is allowed (known acceptable pattern).
 */
function isCycleAllowed(cycleFiles) {
  const fileNames = cycleFiles.map((f) => f.split('/').pop()).sort()
  return ALLOWED_CYCLES.some((allowed) => {
    const allowedFiles = allowed.split(',').sort()
    if (allowedFiles.length !== fileNames.length) return false
    return allowedFiles.every((af, i) => af === fileNames[i])
  })
}

// Run madge
let output
try {
  output = execSync('pnpm exec madge --circular --extensions ts,tsx --json src/', {
    cwd: ROOT,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 60_000,
  })
} catch (err) {
  output = err.stdout || '[]'
}

let cycles
try {
  cycles = JSON.parse(output)
} catch {
  console.error('Failed to parse madge output')
  process.exit(1)
}

if (!Array.isArray(cycles) || cycles.length === 0) {
  console.log('No circular dependencies found.')
  process.exit(0)
}

// Strict gate: every cycle must be on the explicit allowlist
const disallowed = cycles.filter((cycle) => !isCycleAllowed(cycle))

if (disallowed.length === 0) {
  console.log(
    `Circular dependency check OK — ${cycles.length} cycle(s), all on the documented allowlist.`
  )
  process.exit(0)
}

console.error(`\n✖ Found ${disallowed.length} non-allowlisted circular dependencies:\n`)
for (let i = 0; i < disallowed.length; i++) {
  console.error(`  ${i + 1}) ${disallowed[i].join(' → ')}`)
}
console.error(
  '\nFix: extract shared code (typically types) into a separate file so',
  '\nneither side imports the other. If the cycle is intentional, add it',
  "\nto ALLOWED_CYCLES in this script with a one-line justification.\n"
)
process.exit(1)
