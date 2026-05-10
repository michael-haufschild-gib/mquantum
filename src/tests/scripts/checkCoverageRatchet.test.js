import { describe, expect, it } from 'vitest'

import {
  evaluateCoverageRatchet,
  extractActuals,
  extractThresholds,
} from '../../../scripts/check-coverage-ratchet.js'

const completeActuals = {
  statements: 85.02,
  branches: 75.32,
  functions: 81.12,
  lines: 86.09,
}

describe('check-coverage-ratchet', () => {
  it('parses thresholds only from the coverage thresholds block', () => {
    const configText = `
      const unrelated = { statements: 10, branches: 10, functions: 10, lines: 10 }
      export default defineConfig({
        test: {
          coverage: {
            thresholds: {
              statements: 85,
              branches: 75,
              functions: 81,
              lines: 85.5,
            },
          },
        },
      })
    `

    expect(extractThresholds(configText)).toEqual({
      statements: 85,
      branches: 75,
      functions: 81,
      lines: 85.5,
    })
  })

  it('reports a missing configured threshold instead of silently skipping it', () => {
    const result = evaluateCoverageRatchet(completeActuals, {
      statements: 85,
      branches: undefined,
      functions: 81,
      lines: 85.5,
    })

    expect(result.missing).toEqual([{ metric: 'branches', field: 'threshold' }])
    expect(result.violations).toEqual([])
  })

  it('does not treat commented-out thresholds as active thresholds', () => {
    const configText = `
      export default defineConfig({
        test: {
          coverage: {
            thresholds: {
              statements: 85,
              // branches: 75,
              /* functions: 81, */
              lines: 85.5,
            },
          },
        },
      })
    `

    expect(extractThresholds(configText)).toEqual({
      statements: 85,
      branches: undefined,
      functions: undefined,
      lines: 85.5,
    })
  })

  it('reports a missing coverage actual instead of silently skipping it', () => {
    const result = evaluateCoverageRatchet(
      { ...completeActuals, functions: undefined },
      { statements: 85, branches: 75, functions: 81, lines: 85.5 }
    )

    expect(result.missing).toEqual([{ metric: 'functions', field: 'actual' }])
    expect(result.violations).toEqual([])
  })

  it('flags thresholds that drift more than tolerance below actual coverage', () => {
    const result = evaluateCoverageRatchet(
      completeActuals,
      { statements: 80, branches: 75, functions: 81, lines: 85.5 },
      1
    )

    expect(result.missing).toEqual([])
    expect(result.violations).toEqual([
      {
        metric: 'statements',
        actual: '85.02',
        threshold: '80.00',
        gap: '5.02',
        suggested: 85,
      },
    ])
  })

  it('extracts total actuals and rejects summaries without a total block', () => {
    expect(
      extractActuals({
        total: {
          statements: { pct: 85.02 },
          branches: { pct: 75.32 },
          functions: { pct: 81.12 },
          lines: { pct: 86.09 },
        },
      })
    ).toEqual(completeActuals)

    expect(() => extractActuals({})).toThrow('coverage-summary.json has no "total" entry.')
  })
})
