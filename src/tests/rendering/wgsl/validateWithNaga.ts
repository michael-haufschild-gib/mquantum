/**
 * Phase 3: naga subprocess validator driver.
 *
 * Takes a stream of `ShaderRecord`s, writes each WGSL payload to a temp file,
 * then invokes `naga --bulk-validate` over batches. Parses stderr for
 * per-file diagnostics and produces a structured report.
 *
 * Relies on `naga-cli` being on PATH. Install with `cargo install naga-cli`.
 *
 * @module tests/rendering/wgsl/validateWithNaga
 */

/* global process -- Node-only driver: inherits parent env to propagate PATH/NO_COLOR to naga. */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { ShaderRecord } from './enumerateSchroedingerAnalytic'

/** One shader whose composed WGSL failed naga validation. */
export interface ShaderFailure {
  label: string
  cacheKey: string
  surface: string
  sha256: string
  /** Full stderr snippet for this file from naga. */
  error: string
  /** Normalized single-line error signature (for triage grouping). */
  signature: string
}

/** Structured summary returned by `validateWithNaga`. */
export interface ValidationReport {
  total: number
  unique: number
  passed: number
  failures: ShaderFailure[]
  /**
   * Failures whose signatures matched a `knownDeviations` regex. Separated
   * from `failures` so the test suite can stay green on known spec-vs-Tint
   * discrepancies while still reporting their count.
   */
  knownDeviations: ShaderFailure[]
  /** Wall-clock duration in milliseconds. */
  durationMs: number
}

/** Progress snapshot emitted after completed naga batches. */
export interface ValidationProgress {
  batches: number
  unique: number
  passed: number
  failures: number
  knownDeviations: number
  durationMs: number
}

interface ValidateOptions {
  /** Batch size for `naga --bulk-validate`. Default 512. */
  batchSize?: number
  /** Timeout for one naga subprocess invocation. Default 120 seconds. */
  nagaTimeoutMs?: number
  /**
   * Base directory under which a unique scratch subdir is created. We never
   * write into the directory the caller passes — only into a freshly-created
   * child of it — so cleanup can never delete caller-owned files. Defaults
   * to `os.tmpdir()`.
   */
  tmpDir?: string
  /** Retain temp files on exit (for debugging). Default false. */
  keepTempFiles?: boolean
  /**
   * Regex patterns matching normalized signatures that should NOT fail the
   * run. Use for known Tint-accepts-but-naga-rejects discrepancies (the
   * canonical example is "array stride 4 is not a multiple of the required
   * alignment 16" for scalar arrays in uniform-address-space structs —
   * spec-noncompliant but Dawn/Tint accepts it). Still counted and reported,
   * just classified as `knownDeviations` instead of `failures`.
   */
  knownDeviations?: readonly RegExp[]
  /** Emit `onProgress` every N completed batches. Default 0 (disabled). */
  progressEveryBatches?: number
  /** Optional progress callback for long full-suite validation runs. */
  onProgress?: (progress: ValidationProgress) => void
}

/**
 * Validate a stream of shader records via `naga --bulk-validate`.
 *
 * Contract:
 * - Records are deduped by `sha256` before invocation (downstream dedup
 *   is still cheap — callers may pass already-unique records).
 * - Each unique payload is written to a temp file named `{index}.wgsl`;
 *   a reverse map associates the file path back to the record for error
 *   attribution.
 * - Batches avoid OS argv limits and keep memory bounded. The driver streams
 *   shader payloads through temp files instead of holding all WGSL strings at
 *   once; only SHA keys and the current batch stay resident.
 *
 * @param records Stream of shader records (from any enumerator).
 * @param opts Tuning knobs.
 * @returns Structured validation report.
 */
export function validateWithNaga(
  records: Iterable<ShaderRecord>,
  opts: ValidateOptions = {}
): ValidationReport {
  const {
    batchSize = 512,
    keepTempFiles = false,
    knownDeviations = [],
    nagaTimeoutMs = 120_000,
    progressEveryBatches = 0,
    onProgress,
  } = opts
  const start = Date.now()

  // Always allocate a fresh scratch subdir under the chosen base so cleanup
  // can never delete a caller-owned directory. `mkdtempSync` returns a
  // unique path like `<base>/mquantum-wgsl-XXXXXX`.
  const baseDir = opts.tmpDir ?? tmpdir()
  mkdirSync(baseDir, { recursive: true })
  const dir = mkdtempSync(join(baseDir, 'mquantum-wgsl-'))

  try {
    let total = 0
    let unique = 0
    let passed = 0
    let idx = 0
    const seen = new Set<string>()
    const failures: ShaderFailure[] = []
    const deviations: ShaderFailure[] = []
    let batches = 0
    let batchPaths: string[] = []
    let batchByPath = new Map<string, ShaderRecord>()

    const flushBatch = () => {
      if (batchPaths.length === 0) return

      const paths = batchPaths
      const byPath = batchByPath
      batchPaths = []
      batchByPath = new Map<string, ShaderRecord>()

      try {
        const result = spawnSync('naga', ['--bulk-validate', ...paths], {
          encoding: 'utf8',
          maxBuffer: 256 * 1024 * 1024,
          timeout: nagaTimeoutMs,
          // Force no ANSI output so signature normalization is stable. naga emits
          // color when stderr is a TTY; vitest's capture path looks TTY-shaped.
          env: {
            ...process.env,
            NO_COLOR: '1',
            CLICOLOR: '0',
            CLICOLOR_FORCE: '0',
          },
        })

        if (result.error) {
          throw new Error(
            `[validateWithNaga] naga subprocess failed or timed out: ${result.error.message}. ` +
              `Is naga-cli installed? Run: cargo install naga-cli`
          )
        }

        // Exit code 0 = all files in batch passed. Nonzero = at least one failure.
        // Parse stderr regardless (naga prints diagnostics on stderr).
        const stderr = result.stderr ?? ''
        const batchFailures = parseNagaBulkStderr(stderr, paths, byPath)

        // If naga exited non-zero (or was signaled) but we couldn't attribute
        // any per-file diagnostic, the process crashed or emitted unexpected
        // stderr. Treat that as a hard failure rather than counting every
        // file in the batch as `passed` — silent green here would mask broken
        // tooling. Status `0` with empty diagnostics is the legitimate
        // all-passed path and stays untouched.
        if ((result.status !== 0 || result.signal !== null) && batchFailures.length === 0) {
          throw new Error(
            `[validateWithNaga] naga exited unexpectedly (status=${result.status}, signal=${result.signal ?? 'none'}) with no per-file diagnostics. stderr:\n${stderr}`
          )
        }

        for (const f of batchFailures) {
          const deviation = knownDeviations.some((re) => re.test(f.signature))
          if (deviation) deviations.push(f)
          else failures.push(f)
        }

        passed += paths.length - batchFailures.length
        batches++

        if (
          progressEveryBatches > 0 &&
          batches % progressEveryBatches === 0 &&
          onProgress !== undefined
        ) {
          onProgress({
            batches,
            unique,
            passed,
            failures: failures.length,
            knownDeviations: deviations.length,
            durationMs: Date.now() - start,
          })
        }
      } finally {
        if (!keepTempFiles) {
          for (const filePath of paths) rmSync(filePath, { force: true })
        }
      }
    }

    for (const rec of records) {
      total++
      if (seen.has(rec.sha256)) continue
      seen.add(rec.sha256)
      unique++

      const shaderPath = join(dir, `${idx}.wgsl`)
      idx++
      writeFileSync(shaderPath, rec.wgsl)
      batchByPath.set(shaderPath, rec)
      batchPaths.push(shaderPath)

      if (batchPaths.length >= batchSize) flushBatch()
    }

    flushBatch()

    return {
      total,
      unique,
      passed,
      failures,
      knownDeviations: deviations,
      durationMs: Date.now() - start,
    }
  } finally {
    if (!keepTempFiles) {
      // Only the freshly-created child is removed; `opts.tmpDir` (if the
      // caller passed one) is left intact.
      rmSync(dir, { recursive: true, force: true })
    }
  }
}

/**
 * Parse `naga --bulk-validate` stderr into per-file failures.
 *
 * Format (confirmed by Phase 0 spike):
 *   Error validating <path>:
 *   <diagnostic body, possibly multi-line with codespan-style source pointers>
 *
 *   Error validating <next path>:
 *   ...
 *
 *   Validation failed for the following inputs:
 *     <path>
 *     <path>
 *
 * Strategy: split on `^Error validating ` markers; everything between this
 * marker and the next marker (or the "Validation failed" summary) is the
 * diagnostic for one file. Emit a failure record per matched path.
 */
function parseNagaBulkStderr(
  stderr: string,
  batchPaths: string[],
  byPath: Map<string, ShaderRecord>
): ShaderFailure[] {
  const out: ShaderFailure[] = []
  if (stderr.trim() === '') return out

  const batchPathSet = new Set(batchPaths)
  const errorMarker = /^Error validating (.+):$/gm

  const markers: { path: string; start: number }[] = []
  let match: RegExpExecArray | null
  while ((match = errorMarker.exec(stderr)) !== null) {
    const path = match[1]
    if (path !== undefined && batchPathSet.has(path)) {
      markers.push({ path, start: match.index })
    }
  }

  // Cut the summary block off the tail so it doesn't pollute the last diagnostic.
  const summaryIdx = stderr.indexOf('\nValidation failed for the following inputs:')
  const tailCut = summaryIdx === -1 ? stderr.length : summaryIdx

  for (let i = 0; i < markers.length; i++) {
    const m = markers[i]
    if (!m) continue
    const { path, start } = m
    const next = markers[i + 1]
    const end = next ? next.start : tailCut
    const body = stderr.slice(start, end).trim()

    const rec = byPath.get(path)
    if (!rec) continue

    out.push({
      label: rec.label,
      cacheKey: rec.cacheKey,
      surface: rec.surface,
      sha256: rec.sha256,
      error: body,
      signature: normalizeSignature(body),
    })
  }

  return out
}

/**
 * Normalize a naga diagnostic into a stable signature for triage grouping.
 *
 * Strips file paths, line/column numbers, and sometimes-variable identifiers,
 * keeping the error class + the naga message template intact.
 */
function normalizeSignature(body: string): string {
  // eslint-disable-next-line no-control-regex -- naga emits ANSI color sequences on TTY-less stderr when --color=always is set; strip them before fingerprinting.
  const ansi = /\[[0-9;]*m/g
  return body
    .replace(ansi, '')
    .replace(/^Error validating .*$/gm, 'Error validating <file>:')
    .replace(/┌─ .+?:\d+:\d+/g, '┌─ <file>:<line>:<col>')
    .replace(/^\s*\d+\s*│/gm, ' │')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400)
}
