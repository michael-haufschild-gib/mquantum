/**
 * Custom Playwright reporter that fails the run if GPU tests were silently skipped.
 *
 * Counts tests by outcome. If the "skipped" or "did not run" count exceeds
 * MAX_ALLOWED_SKIPS (default: 5), the entire run fails with a clear error.
 *
 * This catches the pattern where an AI agent runs tests, WebGPU is unavailable,
 * all GPU tests skip, and the agent claims "all tests passed" based on the
 * handful of non-GPU tests that did execute.
 *
 * Bypass: ALLOW_GPU_SKIP=1 disables the enforcement (same env var as global-setup).
 */

import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter'

/** Maximum allowed skipped tests before the run is considered failed. */
const MAX_ALLOWED_SKIPS = Number(process.env.MAX_ALLOWED_SKIPS ?? 5)

export default class GpuEnforcementReporter implements Reporter {
  private passed = 0
  private failed = 0
  private skipped = 0
  private didNotRun = 0
  private total = 0

  onTestEnd(test: TestCase, result: TestResult) {
    this.total++
    switch (result.status) {
      case 'passed':
        this.passed++
        break
      case 'failed':
      case 'timedOut':
        this.failed++
        break
      case 'skipped':
        this.skipped++
        break
      case 'interrupted':
        this.didNotRun++
        break
    }
  }

  onEnd(_result: FullResult) {
    if (process.env.ALLOW_GPU_SKIP === '1') return

    const nonExecuted = this.skipped + this.didNotRun
    const executionRate = this.total > 0 ? ((this.passed + this.failed) / this.total) * 100 : 0

    console.log(
      `\n[gpu-enforcement] Results: ${this.passed} passed, ${this.failed} failed, ` +
        `${this.skipped} skipped, ${this.didNotRun} did-not-run ` +
        `(${executionRate.toFixed(0)}% execution rate)`
    )

    if (nonExecuted > MAX_ALLOWED_SKIPS) {
      console.error(
        `\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
          `  GPU ENFORCEMENT FAILED\n` +
          `\n` +
          `  ${nonExecuted} tests skipped or did not run (max allowed: ${MAX_ALLOWED_SKIPS})\n` +
          `  Execution rate: ${executionRate.toFixed(0)}%\n` +
          `\n` +
          `  This usually means WebGPU was not available and GPU tests\n` +
          `  were silently skipped instead of failing.\n` +
          `\n` +
          `  Fix: ensure Chrome is launched with --enable-unsafe-webgpu\n` +
          `  Bypass: ALLOW_GPU_SKIP=1 (for genuine no-GPU environments)\n` +
          `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`
      )
      // Force exit with failure code
      process.exitCode = 1
    }
  }
}
