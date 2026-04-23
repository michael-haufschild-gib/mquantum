/**
 * Phase 5: Playwright Tint validation tier.
 *
 * Runs every shader the unified enumerator produces (subject to WGSL_MAX)
 * through Chrome's real WebGPU implementation (Tint). Catches Chrome-specific
 * rejections that naga's WGSL-spec validator accepts.
 *
 * Skipped in the default Playwright run (tagged `@wgsl-tint`). Invoke with:
 *   pnpm test:shaders:tint              # curated ~500
 *   pnpm test:shaders:tint -- --grep ... # override
 *
 * Bugs caught: Chrome-Tint-only rejections (stricter bind-group-layout checks,
 * storage-texture format nuances, `textureSample` placement rules, etc.) that
 * naga's validator does not enforce.
 */

import { expect, test } from '@playwright/test'

import { enumerateAll } from '@/tests/rendering/wgsl/enumerateAll'

import {
  RENDERER_READY_TIMEOUT,
  waitForAppLoaded,
  waitForRendererReady,
} from './helpers/app-helpers'

test.describe('@wgsl-tint WGSL validation (Chrome/Tint)', () => {
  // Gate the entire suite behind an explicit env var so the default Playwright
  // run (pnpm exec playwright test) skips it. `pnpm test:shaders:tint` sets
  // the var to opt in.
  test.skip(process.env.WGSL_TINT !== '1', 'set WGSL_TINT=1 to enable the Tint tier')

  // Set a longer deadline — ~500 shaders × ~30ms each in-browser = ~15s,
  // plus app boot ~5s. Doubled for slow machines.
  test.setTimeout(180_000)

  test('every curated composed shader compiles under Tint', async ({ page }) => {
    // Curation: the naga tier (pnpm test:shaders) already validates every
    // unique shader against the WGSL spec. This tier specifically tests Tint's
    // stricter-than-spec checks, so a curated subset is sufficient — and
    // running 50k+ shaders through a real browser is impractical.
    //
    // WGSL_TINT_MAX bounds the batch (default 500). WGSL_SUBSET / WGSL_MODE /
    // WGSL_MAX all pass through to the enumerator so the curation can be
    // narrowed further.
    const parsedTintMax = Number(process.env.WGSL_TINT_MAX ?? 500)
    const TINT_MAX =
      Number.isFinite(parsedTintMax) && parsedTintMax > 0 ? Math.floor(parsedTintMax) : 500
    const records: Array<{ label: string; wgsl: string; surface: string }> = []
    for (const rec of enumerateAll({ maxUnique: TINT_MAX })) {
      records.push({ label: rec.label, wgsl: rec.wgsl, surface: rec.surface })
      if (records.length >= TINT_MAX) break
    }
    // Fail loudly if curation/filtering yielded nothing — a green run with
    // zero validated shaders is meaningless and would mask coverage drops.
    expect(
      records.length,
      'No shaders collected — check WGSL_TINT_MAX, WGSL_SUBSET, WGSL_MODE filters'
    ).toBeGreaterThan(0)

    // Need the app to boot so the worker registers `navigator.gpu`, even
    // though we request our own adapter/device below. The renderer-ready
    // gate also proves this machine has a functional WebGPU stack.
    await page.goto('/')
    await waitForAppLoaded(page)
    await waitForRendererReady(page)

    type TintFailure = {
      label: string
      surface: string
      errors: Array<{ line: number; col: number; msg: string; offset: number }>
    }

    // Chunk the payload — Playwright's page.evaluate has a JSON-serializable
    // size limit; 50 shaders × ~150KB ≈ 7.5MB per chunk stays comfortable.
    const CHUNK_SIZE = 50
    const chunks: (typeof records)[] = []
    for (let i = 0; i < records.length; i += CHUNK_SIZE) {
      chunks.push(records.slice(i, i + CHUNK_SIZE))
    }

    const failures: TintFailure[] = []
    const startedAt = Date.now()

    for (const chunk of chunks) {
      const chunkFailures = await page.evaluate(
        async (
          list: Array<{ label: string; wgsl: string; surface: string }>
        ): Promise<TintFailure[]> => {
          // Shared device across the chunk keeps adapter/device creation out
          // of the hot loop. The app's own device is still alive in parallel —
          // requesting another is allowed.
          const adapter = await navigator.gpu.requestAdapter()
          if (!adapter) {
            throw new Error('[wgsl-tint] navigator.gpu.requestAdapter() returned null')
          }
          const device = await adapter.requestDevice()

          const out: TintFailure[] = []
          for (const { label, wgsl, surface } of list) {
            // Capture uncaught errors from the validation scope. Most WGSL
            // rejections surface via getCompilationInfo, but some land in
            // device.onuncapturederror / pushErrorScope('validation').
            device.pushErrorScope('validation')
            const mod = device.createShaderModule({ code: wgsl, label })
            const info = await mod.getCompilationInfo()
            const scoped = await device.popErrorScope()

            const errors = info.messages
              .filter((m) => m.type === 'error')
              .map((m) => ({
                line: m.lineNum,
                col: m.linePos,
                msg: m.message,
                offset: m.offset,
              }))

            if (scoped) {
              // A validation error on the scope but no compilation-info message
              // — record the scope message with line=0.
              errors.push({ line: 0, col: 0, msg: `validation: ${scoped.message}`, offset: 0 })
            }

            if (errors.length > 0) out.push({ label, surface, errors })
          }
          return out
        },
        chunk
      )
      failures.push(...chunkFailures)
    }

    const durationMs = Date.now() - startedAt

    console.log(
      `[wgsl-tint] ${records.length} shaders, ${records.length - failures.length} passed, ${failures.length} failed in ${durationMs}ms`
    )

    if (failures.length > 0) {
      const summary = failures
        .slice(0, 20)
        .map((f) => {
          const first = f.errors[0]!
          return `  [${f.surface}] ${f.label}: ${first.msg} (line ${first.line}:${first.col})`
        })
        .join('\n')
      const extra = failures.length > 20 ? `\n  … and ${failures.length - 20} more` : ''
      throw new Error(`[wgsl-tint] ${failures.length} Tint rejection(s):\n${summary}${extra}`)
    }

    expect(failures).toEqual([])
  })
})

// Reference imported helper symbols so tsc doesn't prune them on unused checks.
void RENDERER_READY_TIMEOUT
