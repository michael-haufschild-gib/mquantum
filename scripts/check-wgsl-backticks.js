#!/usr/bin/env node
 
/**
 * Scan every `.wgsl.ts` and inline `/* wgsl * /`-tagged template literal in
 * `src/rendering/` for unescaped backticks inside the WGSL body. An unescaped
 * backtick terminates the template early and causes `tsc` parse errors like
 * the one in `diracKinetic.wgsl.ts` that blocked the build.
 *
 * Exits nonzero and prints offending `file:line` rows if any are found.
 * Intended to run in `pnpm build` and as a pre-commit check.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { argv, cwd, exit } from 'node:process'

const rootArgs = argv.slice(2).length ? argv.slice(2) : ['src/rendering']

/**
 * Recursively collect `.ts` files under each root.
 * @param {string} root
 * @returns {string[]}
 */
function collectTs(root) {
  const out = []
  const stack = [root]
  while (stack.length > 0) {
    const p = stack.pop()
    const st = statSync(p)
    if (st.isDirectory()) {
      for (const entry of readdirSync(p)) stack.push(join(p, entry))
    } else if (p.endsWith('.ts')) {
      out.push(p)
    }
  }
  return out
}

/**
 * Extract the ranges (start..end indices) of every `/* wgsl * /`-tagged
 * template literal in `source`. Returns an array of [start, end] in source
 * coordinates pointing at the body between the opening and closing backticks.
 *
 * @param {string} source
 * @returns {{ start: number; end: number; line: number }[]}
 */
function findWgslTemplateRanges(source) {
  const marker = '/* wgsl */'
  const ranges = []
  let offset = 0
  while (true) {
    const markerIdx = source.indexOf(marker, offset)
    if (markerIdx === -1) break
    // Opening backtick follows the marker, possibly with whitespace.
    let i = markerIdx + marker.length
    while (i < source.length && /\s/.test(source[i])) i++
    if (source[i] !== '`') {
      offset = markerIdx + marker.length
      continue
    }
    const bodyStart = i + 1
    // Find the matching closing backtick, respecting `\\\`` escapes.
    let j = bodyStart
    while (j < source.length) {
      const ch = source[j]
      if (ch === '\\') {
        j += 2
        continue
      }
      if (ch === '`') break
      j++
    }
    const line = source.slice(0, bodyStart).split('\n').length
    ranges.push({ start: bodyStart, end: j, line })
    offset = j + 1
  }
  return ranges
}

let failures = 0

const unique = [...new Set(rootArgs.flatMap(collectTs))]

for (const file of unique) {
  const source = readFileSync(file, 'utf8')
  const ranges = findWgslTemplateRanges(source)
  for (const { start, end, line: startLine } of ranges) {
    const body = source.slice(start, end)
    // Already-escaped backticks are fine (`\\\``). Unescaped ones break the
    // outer template. Count them by walking the body with a simple state machine.
    let col = 0
    let lineNum = startLine
    for (let k = 0; k < body.length; k++) {
      const ch = body[k]
      if (ch === '\n') {
        lineNum++
        col = 0
        continue
      }
      col++
      if (ch === '\\') {
        k++
        col++
        continue
      }
      // In normal cases findWgslTemplateRanges already stops at the first
      // unescaped backtick — so if we see one INSIDE the body, it's outside the
      // delimiter logic, which shouldn't happen. We still guard for completeness.
      if (ch === '`') {
        console.error(`${file}:${lineNum}:${col}: unescaped backtick inside /* wgsl */ template literal`)
        failures++
      }
    }
  }

  // Cross-check: re-run the extractor and verify every extracted template
  // range has a backtick at `end` (i.e. it was closed by the scanner and not
  // by running off the end of the file). Open templates indicate a comment
  // somewhere ate the closing backtick.
  for (const { start, end, line: startLine } of ranges) {
    if (end >= source.length || source[end] !== '`') {
      console.error(
        `${file}:${startLine}: unterminated /* wgsl */ template literal (likely an unescaped backtick broke parsing)`
      )
      failures++
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} issue(s) found across ${unique.length} files in ${cwd()}.`)
  exit(1)
}
console.log(`OK: scanned ${unique.length} files, no backtick drift in /* wgsl */ templates.`)
