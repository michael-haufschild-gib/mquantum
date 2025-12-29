/**
 * Cache Pre-warming Hook
 *
 * Pre-warms the memory cache from IndexedDB on app startup.
 * Loads the most recently accessed cached polytopes into memory
 * for faster access during the session.
 *
 * @module hooks/useCachePrewarming
 */

import { useEffect, useRef } from 'react'
import { IndexedDBCache } from '@/lib/cache/IndexedDBCache'
import { getCachedPolytope } from '@/lib/geometry/wythoff/cache'

/** Maximum number of entries to pre-warm into memory */
const MAX_PREWARM_ENTRIES = 10

/**
 * Pre-warms the memory cache from IndexedDB on app startup.
 *
 * This hook runs once on mount and loads cached polytopes from IndexedDB
 * into the memory cache. This ensures that previously generated polytopes
 * can be accessed instantly without waiting for IndexedDB reads.
 *
 * The hook is designed to be non-blocking and fail-safe:
 * - Runs in background without blocking the UI
 * - Silently handles errors (IndexedDB unavailable, etc.)
 * - Limits pre-warming to prevent memory pressure
 *
 * @example
 * ```tsx
 * function App() {
 *   useCachePrewarming()
 *   return <MainContent />
 * }
 * ```
 */
export function useCachePrewarming(): void {
  const hasRun = useRef(false)

  useEffect(() => {
    // Single-run guard - only pre-warm once per app session
    if (hasRun.current) return
    hasRun.current = true

    const prewarm = async () => {
      try {
        const cache = new IndexedDBCache()
        const opened = await cache.open()
        if (!opened) {
          // IndexedDB unavailable - skip pre-warming
          return
        }

        const keys = await cache.getAllKeys('polytope-geometry')
        if (keys.length === 0) {
          cache.close()
          return
        }

        // Pre-load up to MAX_PREWARM_ENTRIES
        // getCachedPolytope already populates the memory cache
        const keysToLoad = keys.slice(0, MAX_PREWARM_ENTRIES)

        for (const key of keysToLoad) {
          await getCachedPolytope(key)
        }

        cache.close()

        if (import.meta.env.DEV) {
          console.log(
            `[CachePrewarming] Loaded ${keysToLoad.length} of ${keys.length} entries into memory cache`
          )
        }
      } catch (error) {
        // Non-critical - just log in dev and continue
        if (import.meta.env.DEV) {
          console.warn('[CachePrewarming] Failed:', error)
        }
      }
    }

    // Run pre-warming in background
    prewarm()
  }, [])
}
