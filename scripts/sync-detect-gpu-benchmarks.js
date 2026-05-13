#!/usr/bin/env node
/**
 * Sync public detect-gpu benchmark assets from the installed package.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { exit } from 'node:process'

const ROOT = resolve(import.meta.dirname, '..')
const UPSTREAM_DIR = join(ROOT, 'node_modules/detect-gpu/dist/benchmarks')
const PUBLIC_DIR = join(ROOT, 'public/gpu-benchmarks')

if (!existsSync(UPSTREAM_DIR)) {
  console.error(`Missing upstream benchmark directory: ${UPSTREAM_DIR}`)
  exit(1)
}

mkdirSync(PUBLIC_DIR, { recursive: true })

const upstreamFiles = readdirSync(UPSTREAM_DIR)
  .filter((file) => file.endsWith('.json'))
  .sort()
const upstreamSet = new Set(upstreamFiles)

for (const file of upstreamFiles) {
  copyFileSync(join(UPSTREAM_DIR, file), join(PUBLIC_DIR, file))
}

for (const file of readdirSync(PUBLIC_DIR)) {
  if (file.endsWith('.json') && !upstreamSet.has(file)) {
    rmSync(join(PUBLIC_DIR, file))
  }
}

console.log(`Synced ${upstreamFiles.length} detect-gpu benchmark files.`)
