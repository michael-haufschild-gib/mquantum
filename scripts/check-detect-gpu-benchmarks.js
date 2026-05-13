#!/usr/bin/env node
/**
 * Ensure public detect-gpu benchmark assets match the installed package data.
 *
 * `detectDeviceCapabilities()` serves these files from `/gpu-benchmarks`.
 * If they drift from `detect-gpu`, newer GPUs can be misclassified even when
 * the dependency itself is current.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { exit } from 'node:process'

const ROOT = resolve(import.meta.dirname, '..')
const UPSTREAM_DIR = join(ROOT, 'node_modules/detect-gpu/dist/benchmarks')
const PUBLIC_DIR = join(ROOT, 'public/gpu-benchmarks')

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function jsonKey(value) {
  return JSON.stringify(value)
}

function listJsonFiles(path) {
  return readdirSync(path)
    .filter((file) => file.endsWith('.json'))
    .sort()
}

const failures = []

if (!existsSync(UPSTREAM_DIR)) {
  failures.push(`missing upstream benchmark directory: ${UPSTREAM_DIR}`)
}

if (!existsSync(PUBLIC_DIR)) {
  failures.push(`missing public benchmark directory: ${PUBLIC_DIR}`)
}

if (failures.length === 0) {
  const upstreamFiles = listJsonFiles(UPSTREAM_DIR)
  const publicFiles = listJsonFiles(PUBLIC_DIR)
  const upstreamSet = new Set(upstreamFiles)
  const publicSet = new Set(publicFiles)

  for (const file of upstreamFiles) {
    if (!publicSet.has(file)) {
      failures.push(`missing public benchmark: ${file}`)
      continue
    }

    const upstream = readJson(join(UPSTREAM_DIR, file))
    const bundled = readJson(join(PUBLIC_DIR, file))
    if (jsonKey(upstream) !== jsonKey(bundled)) {
      failures.push(`stale public benchmark: ${file}`)
    }
  }

  for (const file of publicFiles) {
    if (!upstreamSet.has(file)) {
      failures.push(`unexpected public benchmark: ${file}`)
    }
  }
}

if (failures.length > 0) {
  console.error('\nDetect-gpu benchmark asset drift:\n')
  for (const failure of failures) {
    console.error(`  ${failure}`)
  }
  console.error('\nFix: run `pnpm gpu-benchmarks:sync`.\n')
  exit(1)
}

console.log('Detect-gpu benchmark assets OK.')
