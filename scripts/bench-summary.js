#!/usr/bin/env node
/**
 * Aggregate multiple benchmark JSON runs into a median summary.
 *
 * Usage: node scripts/bench-summary.js logs/baseline_r1.json logs/baseline_r2.json ...
 *
 * Prints a markdown table with median / min / max across runs for each scenario.
 */

import { readFileSync } from 'node:fs'

function median(arr) {
  const s = [...arr].sort((a, b) => a - b)
  const n = s.length
  if (n === 0) return 0
  return n % 2 === 0 ? (s[n / 2 - 1] + s[n / 2]) / 2 : s[(n - 1) / 2]
}

function summarize(files) {
  const labelMap = new Map()
  for (const f of files) {
    const data = JSON.parse(readFileSync(f, 'utf8'))
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
      const s = r.sample
      existing.fps.push(s.fps)
      existing.frame.push(s.frameTimeMs)
      existing.gpu.push(s.totalGpuTimeMs)
      existing.cpu.push(s.cpuTimeMs)
      existing.vram.push(s.vramMB)
      const sp = s.passTimings.find((p) => p.passId === 'schroedinger')
      if (sp) existing.schro.push(sp.gpuTimeMs)
      const to = s.passTimings.find((p) => p.passId === 'toScreen')
      if (to) existing.toScreen.push(to.gpuTimeMs)
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
    const f = `${median(v.fps)}/${Math.min(...v.fps)}/${Math.max(...v.fps)}`
    const frame = median(v.frame).toFixed(2)
    const gpu = median(v.gpu).toFixed(2)
    const sch = `${median(v.schro).toFixed(2)}/${Math.min(...v.schro).toFixed(2)}`
    const ts = median(v.toScreen).toFixed(2)
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
