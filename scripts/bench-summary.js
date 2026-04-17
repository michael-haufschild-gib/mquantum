#!/usr/bin/env node
/**
 * Aggregate multiple benchmark JSON runs into a median summary.
 *
 * Usage: node scripts/bench-summary.js logs/baseline_r1.json logs/baseline_r2.json ...
 *
 * Each input file may be either:
 *   - a pure JSON array matching `perf-benchmark.spec.ts` result shape, OR
 *   - raw Playwright stdout containing one or more
 *     `BENCHMARK_JSON_START ... BENCHMARK_JSON_END` blocks (concatenated).
 *
 * Prints a markdown table with median / min / max across runs for each scenario.
 */

import { readFileSync } from 'node:fs'

const MARKER_START = 'BENCHMARK_JSON_START'
const MARKER_END = 'BENCHMARK_JSON_END'

function median(arr) {
  const s = [...arr].sort((a, b) => a - b)
  const n = s.length
  if (n === 0) return 0
  return n % 2 === 0 ? (s[n / 2 - 1] + s[n / 2]) / 2 : s[(n - 1) / 2]
}

function fmt(arr, digits = 2) {
  return arr.length ? median(arr).toFixed(digits) : '—'
}

function fmtMedMin(arr, digits = 2) {
  if (!arr.length) return '—'
  return `${median(arr).toFixed(digits)}/${Math.min(...arr).toFixed(digits)}`
}

function fmtFps(arr) {
  if (!arr.length) return '—'
  return `${median(arr)}/${Math.min(...arr)}/${Math.max(...arr)}`
}

/** Extract every JSON payload between BENCHMARK_JSON_START/END markers. */
function extractMarkedBlocks(text) {
  const blocks = []
  let cursor = 0
  while (true) {
    const start = text.indexOf(MARKER_START, cursor)
    if (start === -1) break
    const end = text.indexOf(MARKER_END, start + MARKER_START.length)
    if (end === -1) break
    const payload = text.slice(start + MARKER_START.length, end).trim()
    if (payload) blocks.push(payload)
    cursor = end + MARKER_END.length
  }
  return blocks
}

/** Parse a file as either pure JSON or stdout containing marked blocks. Returns flat array of results. */
function parseFile(path) {
  const raw = readFileSync(path, 'utf8')
  const trimmed = raw.trimStart()

  // Pure JSON array/object fast-path.
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : [parsed]
  }

  // Extract marked blocks from stdout-style files.
  const blocks = extractMarkedBlocks(raw)
  if (blocks.length === 0) {
    throw new Error(
      `${path}: no JSON array found and no BENCHMARK_JSON_START/END markers detected`
    )
  }
  const results = []
  for (const block of blocks) {
    const parsed = JSON.parse(block)
    if (Array.isArray(parsed)) results.push(...parsed)
    else results.push(parsed)
  }
  return results
}

function summarize(files) {
  const labelMap = new Map()
  for (const f of files) {
    const data = parseFile(f)
    for (const r of data) {
      const key = r.label
      const existing = labelMap.get(key) ?? {
        label: key,
        fps: [],
        frame: [],
        gpu: [],
        schro: [],
        toScreen: [],
        cpu: [],
        vram: [],
      }
      const s = r.sample ?? {}
      if (typeof s.fps === 'number') existing.fps.push(s.fps)
      if (typeof s.frameTimeMs === 'number') existing.frame.push(s.frameTimeMs)
      if (typeof s.totalGpuTimeMs === 'number') existing.gpu.push(s.totalGpuTimeMs)
      if (typeof s.cpuTimeMs === 'number') existing.cpu.push(s.cpuTimeMs)
      if (typeof s.vramMB === 'number') existing.vram.push(s.vramMB)
      const passTimings = Array.isArray(s.passTimings) ? s.passTimings : []
      const sp = passTimings.find((p) => p.passId === 'schroedinger')
      if (sp && typeof sp.gpuTimeMs === 'number') existing.schro.push(sp.gpuTimeMs)
      const to = passTimings.find((p) => p.passId === 'toScreen')
      if (to && typeof to.gpuTimeMs === 'number') existing.toScreen.push(to.gpuTimeMs)
      labelMap.set(key, existing)
    }
  }
  console.log(
    '| Scenario            | runs | fps (med/min/max) | frame ms | gpu total ms (med) | schroedinger ms (med/min) | toScreen ms (med) |'
  )
  console.log(
    '|---------------------|-----:|------------------:|---------:|-------------------:|--------------------------:|------------------:|'
  )
  for (const v of labelMap.values()) {
    const f = fmtFps(v.fps)
    const frame = fmt(v.frame)
    const gpu = fmt(v.gpu)
    const sch = fmtMedMin(v.schro)
    const ts = fmt(v.toScreen)
    console.log(
      `| ${v.label.padEnd(20)}| ${String(v.fps.length).padStart(5)}| ${f.padStart(18)}| ${frame.padStart(9)}| ${gpu.padStart(19)}| ${sch.padStart(26)}| ${ts.padStart(17)}|`
    )
  }
}

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: node scripts/bench-summary.js <json files>')
  process.exit(1)
}
summarize(files)
