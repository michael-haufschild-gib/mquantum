#!/usr/bin/env node
/**
 * Chunk dependency health check.
 *
 * Runs `vite build` and fails on:
 * 1. Circular chunk dependencies (cause TDZ ReferenceErrors in production)
 * 2. Name collisions between manual and auto-generated chunks
 *
 * Usage: node scripts/check-chunk-cycles.js
 */

import { execSync } from 'node:child_process'

const CIRCULAR_RE = /Circular chunk:/gi
const COLLISION_RE = /name collision/gi

let output
try {
  output = execSync('npx vite build', {
    cwd: import.meta.dirname + '/..',
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 120_000,
  })
} catch (err) {
  // vite build may exit 0 even with warnings, but if it crashes capture stderr
  output = (err.stdout || '') + '\n' + (err.stderr || '')
  if (!output.includes('built in')) {
    console.error('vite build failed:\n', output)
    process.exit(1)
  }
}

const combined = output
const circularMatches = combined.match(CIRCULAR_RE) || []
const collisionMatches = combined.match(COLLISION_RE) || []
const problems = []

if (circularMatches.length > 0) {
  const lines = combined.split('\n').filter((l) => /Circular chunk:/i.test(l))
  problems.push(...lines.map((l) => l.trim()))
}

if (collisionMatches.length > 0) {
  const lines = combined.split('\n').filter((l) => /name collision/i.test(l))
  problems.push(...lines.map((l) => l.trim()))
}

if (problems.length > 0) {
  console.error('\nChunk dependency violations:\n')
  for (const p of problems) {
    console.error(`  ${p}`)
  }
  console.error(
    '\nCircular chunks cause ReferenceError in production builds.',
    '\nFix: adjust manualChunks in vite.config.ts to break the cycle.\n'
  )
  process.exit(1)
} else {
  console.log('Chunk dependencies OK — no circular deps or name collisions.')
}
