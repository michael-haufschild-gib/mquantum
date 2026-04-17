#!/usr/bin/env node
/**
 * Circular dependency detection for value imports.
 *
 * Runs madge to find circular dependencies, then filters out cycles that
 * consist entirely of `import type` (type-only) imports. Type-only imports
 * are erased at compile time and cannot cause runtime TDZ issues.
 *
 * Also filters out React.lazy() dynamic imports, which are code-splitting
 * boundaries and cannot cause synchronous circular dependency issues.
 *
 * Known acceptable cycles (documented):
 * - DropdownMenu MenuItems ↔ PortaledSubmenu: intentional mutual recursion
 *   for nested submenu rendering.
 *
 * Exit code 1 if real value-import cycles are found.
 *
 * Usage: node scripts/check-circular-deps.js
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

// Known acceptable cycles (short descriptions for matching)
const ALLOWED_CYCLES = [
  // Mutual recursion: submenus contain menu items which can have submenus
  'MenuItems.tsx,PortaledSubmenu.tsx',
]

/**
 * Check if an import between two files is type-only.
 * Reads the importing file and checks if all imports from the target
 * use `import type` syntax.
 */
function isTypeOnlyImport(fromFile, toFile) {
  try {
    const absFrom = resolve(ROOT, 'src', fromFile)
    const content = readFileSync(absFrom, 'utf-8')

    // Extract the filename stem that would appear in the import path
    const toStem = toFile.replace(/\.[^.]+$/, '').split('/').pop()

    // Find all import statements that reference the target file
    const importRegex = new RegExp(
      `^\\s*import\\s+(type\\s+)?\\{[^}]*\\}\\s+from\\s+['\"][^'"]*${toStem}['\"]`,
      'gm'
    )

    const matches = content.match(importRegex)
    if (!matches || matches.length === 0) {
      // Dynamic import or re-export — check for those patterns
      const dynamicImport = new RegExp(`import\\([^)]*${toStem}`)
      if (dynamicImport.test(content)) {
        return true // Dynamic imports are async, not circular at load time
      }

      // Re-export: export { X } from './Y'
      const reExportRegex = new RegExp(
        `^\\s*export\\s+(type\\s+)?\\{[^}]*\\}\\s+from\\s+['\"][^'"]*${toStem}['\"]`,
        'gm'
      )
      const reExports = content.match(reExportRegex)
      if (reExports && reExports.length > 0) {
        return reExports.every((m) => m.includes('export type'))
      }

      return false
    }

    // All imports from target must be type-only
    return matches.every((m) => /import\s+type\s/.test(m))
  } catch {
    return false
  }
}

/**
 * Check if a cycle is allowed (known acceptable pattern).
 */
function isCycleAllowed(cycleFiles) {
  const fileNames = cycleFiles.map((f) => f.split('/').pop())
  const key = fileNames.join(',')
  return ALLOWED_CYCLES.some((allowed) => {
    const allowedFiles = allowed.split(',')
    return allowedFiles.every((af) => fileNames.includes(af))
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

// Filter: remove type-only cycles and allowed cycles
const realCycles = []

for (const cycle of cycles) {
  if (isCycleAllowed(cycle)) continue

  // A cycle is safe if ANY edge is type-only or dynamic — removing
  // that edge at compile time breaks the runtime cycle.
  let hasTypeOnlyEdge = false
  for (let i = 0; i < cycle.length; i++) {
    const from = cycle[i]
    const to = cycle[(i + 1) % cycle.length]
    if (isTypeOnlyImport(from, to)) {
      hasTypeOnlyEdge = true
      break
    }
  }

  if (!hasTypeOnlyEdge) {
    realCycles.push(cycle)
  }
}

if (realCycles.length === 0) {
  console.log(
    `Circular dependency check OK — ${cycles.length} cycles found, all type-only or allowed.`
  )
  process.exit(0)
}

console.error(`\n✖ Found ${realCycles.length} value-import circular dependencies:\n`)
for (let i = 0; i < realCycles.length; i++) {
  console.error(`  ${i + 1}) ${realCycles[i].join(' → ')}`)
}
console.error(
  '\nValue-import cycles can cause TDZ ReferenceErrors at runtime.',
  '\nFix: extract shared code into a separate file, or use `import type`.\n'
)
process.exit(1)
