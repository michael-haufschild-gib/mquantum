import { createJSONStorage, type PersistStorage, type StateStorage } from 'zustand/middleware'

import { logger } from '@/lib/logger'

type PersistOperation = 'read' | 'write' | 'remove'

const reportedPersistStorageFailures = new Set<string>()

function reportPersistStorageFailure(
  storeName: string,
  op: PersistOperation,
  key: string,
  err: unknown
): void {
  const reportKey = `${storeName}:${op}:${key}`
  if (reportedPersistStorageFailures.has(reportKey)) return
  reportedPersistStorageFailures.add(reportKey)

  const message = err instanceof Error ? err.message : String(err)
  logger.warn(
    `[${storeName}] localStorage ${op} failed for key "${key}" (${message}). ` +
      'State was kept in memory, but persistence is unavailable.'
  )
}

/** Session-lifetime Map-backed stand-in for an inaccessible localStorage. */
function createMemoryStorage(): StateStorage {
  const items = new Map<string, string>()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value)
    },
    removeItem: (key) => {
      items.delete(key)
    },
  }
}

/**
 * Resolve `window.localStorage`, falling back to in-memory storage when the
 * accessor itself throws (site data blocked, sandboxed iframe, no `window`).
 * Returning `undefined` to zustand's persist middleware instead would make it
 * skip attaching `store.persist`, so `persist.hasHydrated()` callers (scene
 * URLs, "don't show again" dialogs) would throw a TypeError.
 */
function resolveLocalStorage(storeName: string): StateStorage {
  try {
    return window.localStorage
  } catch (err) {
    reportPersistStorageFailure(storeName, 'read', 'localStorage', err)
    return createMemoryStorage()
  }
}

/**
 * Create JSON storage for Zustand persist that treats browser storage as
 * best-effort. Some browsers/extensions allow the app to load but later throw
 * on getItem/setItem/removeItem, or throw on the `localStorage` accessor
 * itself; persisted stores must not throw after mutating in-memory state, and
 * must always expose the `persist` API.
 */
export function createBestEffortJSONStorage<S>(
  storeName: string
): PersistStorage<S, unknown> | undefined {
  const storage = createJSONStorage<S>(() => resolveLocalStorage(storeName))
  if (!storage) return undefined

  return {
    getItem: (key) => {
      try {
        return storage.getItem(key)
      } catch (err) {
        reportPersistStorageFailure(storeName, 'read', key, err)
        return null
      }
    },
    setItem: (key, value) => {
      try {
        return storage.setItem(key, value)
      } catch (err) {
        reportPersistStorageFailure(storeName, 'write', key, err)
        return undefined
      }
    },
    removeItem: (key) => {
      try {
        return storage.removeItem(key)
      } catch (err) {
        reportPersistStorageFailure(storeName, 'remove', key, err)
        return undefined
      }
    },
  }
}
