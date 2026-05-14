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
import { fileURLToPath } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')
const SOURCE_FILE_EXT_RE = /\.(?:ts|tsx|js|jsx)$/
const IMPORT_TARGET_EXT_RE =
  /\.(?:ts|tsx|js|jsx|css|json|svg|png|jpe?g|webp|gif|wasm|wgsl|ktx2)$/
const IMPORT_TARGET_GLOBS = [
  '*.ts',
  '*.tsx',
  '*.js',
  '*.jsx',
  '*.css',
  '*.json',
  '*.svg',
  '*.png',
  '*.jpg',
  '*.jpeg',
  '*.webp',
  '*.gif',
  '*.wasm',
  '*.wgsl',
  '*.ktx2',
]
const IMPORT_TARGET_PATHSPECS = IMPORT_TARGET_GLOBS.map((glob) => `"${glob}"`).join(' ')
const ROOT_CONFIG_SOURCE_RE = /^[^/]*config(?:\.[^/]*)?\.(?:ts|js)$/

function stripImportQuery(specifier) {
  return specifier.split('?')[0]
}

function toImportableUntrackedSet(files, root = ROOT) {
  return new Set(
    files.filter((file) => IMPORT_TARGET_EXT_RE.test(file)).map((file) => resolve(root, file))
  )
}

function isTrackedImportSourceFile(file) {
  return (
    SOURCE_FILE_EXT_RE.test(file) &&
    (file.startsWith('src/') || file.startsWith('scripts/') || ROOT_CONFIG_SOURCE_RE.test(file))
  )
}

// Static import specifiers: `from '...'`, side-effect `import '...'`,
// static-string dynamic `import('...')`, and bundler assets/workers via
// `new URL('...', import.meta.url)`.
const importRe = /(?:from\s+|import\s*\(\s*|import\s+|new\s+URL\s*\(\s*)['"]([^'"]+)['"]/g

// Resolve an import specifier to an absolute path (best-effort)
function tryResolve(specifier, fromFile, exists = existsSync, root = ROOT) {
  const fromDir = dirname(fromFile)
  const cleanSpecifier = stripImportQuery(specifier)

  let base
  if (cleanSpecifier.startsWith('@/')) {
    base = resolve(root, 'src', cleanSpecifier.slice(2))
  } else if (cleanSpecifier.startsWith('/src/')) {
    base = resolve(root, cleanSpecifier.slice(1))
  } else if (cleanSpecifier.startsWith('.')) {
    base = resolve(fromDir, cleanSpecifier)
  } else {
    return null // node_modules — skip
  }

  // Try common extensions AND — when the specifier already includes an
  // importable extension (e.g. `./foo.ts` or `./icon.svg?react`) — the bare
  // path. The bare-path candidate is gated on IMPORT_TARGET_EXT_RE so a
  // directory import like `./foo` cannot short-circuit to the `foo/` directory
  // (existsSync is true for directories) and bypass the `index.*` probes.
  const candidates = [
    ...(IMPORT_TARGET_EXT_RE.test(base) ? [base] : []),
    base + '.ts',
    base + '.tsx',
    base + '.js',
    base + '.jsx',
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
    join(base, 'index.js'),
    join(base, 'index.jsx'),
  ]
  return candidates.find((candidate) => exists(candidate)) ?? null
}

function findUntrackedImportViolations({
  root = ROOT,
  trackedFiles,
  untrackedFiles,
  readFile,
  exists,
}) {
  const untrackedSet = toImportableUntrackedSet(untrackedFiles, root)
  const violations = []

  for (const rel of trackedFiles) {
    const absPath = resolve(root, rel)
    let content
    try {
      content = readFile(absPath)
    } catch {
      continue
    }

    let match
    importRe.lastIndex = 0
    while ((match = importRe.exec(content)) !== null) {
      const resolved = tryResolve(match[1], absPath, exists, root)
      if (resolved && untrackedSet.has(resolved)) {
        violations.push({
          file: rel,
          specifier: match[1],
          resolvedTo: resolved.replace(root + '/', ''),
        })
      }
    }
  }

  return violations
}

function main() {
  // Get non-tracked import targets — both untracked and git-ignored.
  // A git-ignored source or asset file imported from a tracked file will fail
  // on Vercel (clean clone) identically to an untracked one, so both must be
  // flagged. Restrict to extensions the import resolver can actually match so
  // large generated trees don't dominate the walk.
  const untrackedRaw = execSync(`git ls-files --others -- ${IMPORT_TARGET_PATHSPECS}`, {
    cwd: ROOT,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  }).trim()

  if (!untrackedRaw) {
    console.log('No untracked importable files — OK')
    return 0
  }

  const untrackedFiles = untrackedRaw.split('\n').filter((file) => IMPORT_TARGET_EXT_RE.test(file))
  if (untrackedFiles.length === 0) {
    console.log('No untracked importable files — OK')
    return 0
  }

  // Get tracked import-source files. Root config files are included because
  // Vite/Vitest/Playwright config imports can break clean-clone builds too.
  const trackedRaw = execSync('git ls-files -- "*.ts" "*.tsx" "*.js" "*.jsx"', {
    cwd: ROOT,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  }).trim()

  const trackedFiles = trackedRaw.split('\n').filter(isTrackedImportSourceFile)
  const violations = findUntrackedImportViolations({
    root: ROOT,
    trackedFiles,
    untrackedFiles,
    readFile: (file) => readFileSync(file, 'utf-8'),
    exists: existsSync,
  })

  if (violations.length === 0) {
    console.log('No tracked files import untracked files — OK')
    return 0
  }

  console.error('\nERROR: Tracked files import untracked files (will fail on Vercel):\n')
  for (const v of violations) {
    console.error(`  ${v.file}`)
    console.error(`    imports '${v.specifier}'`)
    console.error(`    → ${v.resolvedTo} (untracked)\n`)
  }
  console.error('Fix: git add the untracked files, or remove the imports.\n')
  return 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exit(main())
}

export {
  findUntrackedImportViolations,
  isTrackedImportSourceFile,
  stripImportQuery,
  toImportableUntrackedSet,
  tryResolve,
}
