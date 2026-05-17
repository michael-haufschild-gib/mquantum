import { createJSONStorage, type PersistStorage } from 'zustand/middleware'

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

/**
 * Create JSON storage for Zustand persist that treats browser storage as
 * best-effort. Some browsers/extensions allow the app to load but later throw
 * on getItem/setItem/removeItem; persisted stores must not throw after mutating
 * in-memory state.
 */
export function createBestEffortJSONStorage<S>(
  storeName: string
): PersistStorage<S, unknown> | undefined {
  const storage = createJSONStorage<S>(() => window.localStorage)
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
