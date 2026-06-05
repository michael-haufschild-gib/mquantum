#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const MAX_FILES_PER_FOLDER = 20
const SOURCE_EXTENSIONS = new Set(['.css', '.js', '.jsx', '.mjs', '.ts', '.tsx'])
const IGNORED_DIRS = new Set(['.git', '.claude', 'coverage', 'dist', 'node_modules'])
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const roots = resolveScanRoots(process.argv.slice(2))
const violations = roots.flatMap(scanRoot)

if (violations.length > 0) {
  process.stderr.write(formatViolations(violations))
  process.exit(1)
}

process.stdout.write(
  `Folder file-count lint passed: checked ${roots.length} source root${
    roots.length === 1 ? '' : 's'
  }, max ${MAX_FILES_PER_FOLDER} source files per folder.\n`
)

function resolveScanRoots(args) {
  if (args.length === 0) return [resolve(repoRoot, 'src')]
  return args.map(resolvePath).map((path) => {
    if (!existsSync(path)) return path
    return statSync(path).isFile() ? dirname(path) : path
  })
}

function resolvePath(arg) {
  return isAbsolute(arg) ? arg : resolve(process.cwd(), arg)
}

function scanRoot(root) {
  if (!existsSync(root)) return []
  const rootStat = statSync(root)
  if (rootStat.isFile()) return checkFolder(dirname(root), [root])
  return scanDirectory(root)
}

function scanDirectory(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
  const sourceFiles = entries
    .filter((entry) => entry.isFile() && isSourceFile(entry.name))
    .map((entry) => resolve(dir, entry.name))
  const childViolations = entries
    .filter((entry) => entry.isDirectory() && !IGNORED_DIRS.has(entry.name))
    .flatMap((entry) => scanDirectory(resolve(dir, entry.name)))

  return [...checkFolder(dir, sourceFiles), ...childViolations]
}

function checkFolder(dir, sourceFiles) {
  if (sourceFiles.length <= MAX_FILES_PER_FOLDER) return []
  return [
    {
      dir,
      count: sourceFiles.length,
      files: sourceFiles.map((file) => basename(file)).sort(),
    },
  ]
}

function isSourceFile(file) {
  if (file.endsWith('.d.ts')) return true
  return SOURCE_EXTENSIONS.has(extname(file))
}

function formatViolations(items) {
  const lines = [
    `Folder file-count lint failed: ${items.length} folder${
      items.length === 1 ? '' : 's'
    } exceed ${MAX_FILES_PER_FOLDER} source files.`,
    '',
  ]

  for (const item of items.sort((left, right) => left.dir.localeCompare(right.dir))) {
    const path = relative(repoRoot, item.dir) || '.'
    const preview = item.files.slice(0, 10).join(', ')
    const suffix = item.files.length > 10 ? `, +${item.files.length - 10} more` : ''
    lines.push(`- ${path} has ${item.count} source files (max ${MAX_FILES_PER_FOLDER}).`)
    lines.push(`  Files: ${preview}${suffix}`)
    lines.push(
      '  Action: split by feature/domain into named subfolders; do not raise the limit.'
    )
  }

  return `${lines.join('\n')}\n`
}
