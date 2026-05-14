import { afterEach, describe, expect, it } from 'vitest'

import { getGitSha, normalizeGitSha } from '@/lib/buildInfo'

const env = (import.meta as { env?: Record<string, string | undefined> }).env
const originalSha = env?.VITE_GIT_SHA

describe('getGitSha', () => {
  afterEach(() => {
    if (env) env.VITE_GIT_SHA = originalSha
  })

  it('returns dev when the build env value is absent', () => {
    if (env) delete env.VITE_GIT_SHA

    expect(getGitSha()).toBe('dev')
  })
})

describe('normalizeGitSha', () => {
  it('trims and normalizes valid short or full hex SHAs', () => {
    expect(normalizeGitSha('  ABC1234  ')).toBe('abc1234')

    expect(normalizeGitSha('0123456789abcdef0123456789abcdef01234567')).toBe(
      '0123456789abcdef0123456789abcdef01234567'
    )
  })

  it('preserves known non-git placeholders', () => {
    expect(normalizeGitSha('unknown')).toBe('unknown')

    expect(normalizeGitSha('DEV')).toBe('dev')
  })

  it('rejects malformed provenance values', () => {
    for (const value of ['   ', 'main', 'abc', '123456g', 'abc1234\n# forged']) {
      expect(normalizeGitSha(value)).toBe('dev')
    }
  })
})
