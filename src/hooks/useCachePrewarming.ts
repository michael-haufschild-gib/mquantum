/**
 * Cache Pre-warming Hook
 *
 * Previously pre-warmed the Wythoff polytope memory cache from IndexedDB on app startup.
 * The Wythoff module has been removed, so this hook is now a no-op.
 * The export is kept to avoid breaking callers.
 *
 * @module hooks/useCachePrewarming
 */

/**
 * No-op hook. Previously pre-warmed the Wythoff cache from IndexedDB.
 */
export function useCachePrewarming(): void {
  // No-op: Wythoff cache module has been removed
}
