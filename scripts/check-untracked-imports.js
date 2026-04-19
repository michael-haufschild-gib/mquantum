#!/usr/bin/env node
/**
 * Detect imports that resolve to untracked git files.
 *
 * TypeScript compiles fine locally when untracked files exist on disk,
 * but Vercel (clean git clone) fails with TS2307 "Cannot find module".
 *
 * This check catches the mismatch before pushing.
 */

import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')

// Get all non-tracked files under src/ — both untracked and git-ignored.
// A git-ignored source file imported from a tracked file will fail on Vercel
// (clean clone) identically to an untracked one, so both must be flagged.
const untrackedRaw = execSync('git ls-files --others src/', {
  cwd: ROOT,
  encoding: 'utf-8',
}).trim()

if (!untrackedRaw) {
  console.log('No untracked source files — OK')
  process.exit(0)
}

const untrackedSet = new Set(untrackedRaw.split('\n').map((f) => resolve(ROOT, f)))

// Get all tracked .ts/.tsx files under src/
const trackedRaw = execSync('git ls-files src/ -- "*.ts" "*.tsx"', {
  cwd: ROOT,
  encoding: 'utf-8',
}).trim()

const trackedFiles = trackedRaw.split('\n').filter(Boolean)

// Simple regex for static imports (covers from '...' and from "...")
const importRe = /from\s+['"]([^'"]+)['"]/g

// Resolve an import specifier to an absolute path (best-effort)
function tryResolve(specifier, fromFile) {
  const fromDir = dirname(fromFile)

  let base
  if (specifier.startsWith('@/')) {
    base = resolve(ROOT, 'src', specifier.slice(2))
  } else if (specifier.startsWith('.')) {
    base = resolve(fromDir, specifier)
  } else {
    return null // node_modules — skip
  }

  // Try common extensions
  const candidates = [
    base + '.ts',
    base + '.tsx',
    base + '.js',
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]
  return candidates.find((c) => existsSync(c)) ?? null
}

const violations = []

for (const rel of trackedFiles) {
  const absPath = resolve(ROOT, rel)
  let content
  try {
    content = readFileSync(absPath, 'utf-8')
  } catch {
    continue
  }

  let match
  importRe.lastIndex = 0
  while ((match = importRe.exec(content)) !== null) {
    const resolved = tryResolve(match[1], absPath)
    if (resolved && untrackedSet.has(resolved)) {
      violations.push({
        file: rel,
        specifier: match[1],
        resolvedTo: resolved.replace(ROOT + '/', ''),
      })
    }
  }
}

if (violations.length === 0) {
  console.log('No tracked files import untracked files — OK')
  process.exit(0)
}

console.error('\nERROR: Tracked files import untracked files (will fail on Vercel):\n')
for (const v of violations) {
  console.error(`  ${v.file}`)
  console.error(`    imports '${v.specifier}'`)
  console.error(`    → ${v.resolvedTo} (untracked)\n`)
}
console.error('Fix: git add the untracked files, or remove the imports.\n')
process.exit(1)
