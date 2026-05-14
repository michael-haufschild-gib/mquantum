/**
 * Build provenance — values baked into the bundle at build time and
 * surfaced to consumers (currently only the SRMT sweep CSV manifest).
 *
 * Accessors are functions, not top-level constants, so consumers can
 * mock them in tests without module-level caching interfering.
 *
 * @module lib/build/buildInfo
 */

/** Valid provenance token: git SHA or explicit non-git placeholder. */
const GIT_SHA_PATTERN = /^(?:[0-9a-f]{7,40}|dev|unknown)$/i

/** Normalize an injected git SHA-like value to a safe manifest token. */
export function normalizeGitSha(sha: unknown): string {
  if (typeof sha !== 'string') return 'dev'
  const normalized = sha.trim()
  if (GIT_SHA_PATTERN.test(normalized)) return normalized.toLowerCase()
  return 'dev'
}

/**
 * Short or full git SHA of the HEAD commit at `vite build` time, or
 * `'dev'` in non-build contexts (vitest, Node scripts, SSR) where
 * `import.meta.env.VITE_GIT_SHA` was never injected.
 *
 * Vite's `define:` rewrites `import.meta.env.VITE_GIT_SHA` to a string
 * literal at build time (see `vite.config.ts::resolveGitSha`). Vitest
 * does not apply the same define, so this helper guards with a
 * nullish-coalesce + type check so it still returns a stable placeholder
 * when the env var is absent. Values are trimmed and must be hex SHAs
 * (7-40 chars) or the known placeholders `dev`/`unknown`; malformed
 * environment values fall back to `dev` rather than polluting manifests.
 */
export function getGitSha(): string {
  const sha = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_GIT_SHA
  return normalizeGitSha(sha)
}
