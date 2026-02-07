/**
 * IndexedDBCache - Resilient IndexedDB wrapper for mdimension.
 *
 * Features:
 * - Graceful degradation when IndexedDB unavailable (private browsing, etc.)
 * - Automatic LRU eviction when quota exceeded
 * - Typed store access
 * - Connection recovery after storage cleared
 */

/**
 * Available object stores in the cache database.
 *
 * - wavefunction-luts: Reserved. For future Schroedinger wavefunction lookup tables.
 * - blobs: Reserved. For future texture/asset blob storage.
 * - metadata: Reserved. For future cache metadata/statistics.
 */
export type IndexedDBCacheStore = 'wavefunction-luts' | 'blobs' | 'metadata'

/** Metadata stored with each cached entry */
interface CacheEntry<T> {
  /** The cached data */
  data: T
  /** Timestamp when entry was last accessed */
  lastAccess: number
  /** Size in bytes (approximate) */
  size: number
  /** Optional checksum for validation */
  checksum?: string
}

/** Database schema version */
const DB_VERSION = 1
const DB_NAME = 'mdimension-cache'

/** Store names to create */
const STORES: IndexedDBCacheStore[] = [
  'wavefunction-luts',
  'blobs',
  'metadata',
]

/**
 * IndexedDB wrapper with resilience features.
 */
export class IndexedDBCache {
  private db: IDBDatabase | null = null
  private openPromise: Promise<boolean> | null = null

  /**
   * Open the database connection.
   * Returns true if successful, false if IndexedDB is unavailable.
   * @returns Promise resolving to true if successful, false otherwise
   */
  async open(): Promise<boolean> {
    // Return existing promise if already opening
    if (this.openPromise) {
      return this.openPromise
    }

    this.openPromise = this.doOpen()
    return this.openPromise
  }

  private async doOpen(): Promise<boolean> {
    // Check if IndexedDB is available
    if (typeof indexedDB === 'undefined') {
      console.warn('[IndexedDBCache] IndexedDB not available in this environment')
      return false
    }

    try {
      return await new Promise<boolean>((resolve) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION)

        request.onerror = () => {
          console.warn('[IndexedDBCache] Failed to open database:', request.error)
          this.db = null
          resolve(false)
        }

        request.onsuccess = () => {
          this.db = request.result

          // Handle unexpected database closure
          this.db.onclose = () => {
            console.warn('[IndexedDBCache] Database connection closed unexpectedly')
            this.db = null
            this.openPromise = null
          }

          // Handle version change (another tab upgraded)
          this.db.onversionchange = () => {
            console.warn('[IndexedDBCache] Database version changed, closing connection')
            this.db?.close()
            this.db = null
            this.openPromise = null
          }

          resolve(true)
        }

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result

          // Create object stores
          for (const storeName of STORES) {
            if (!db.objectStoreNames.contains(storeName)) {
              db.createObjectStore(storeName)
            }
          }
        }

        request.onblocked = () => {
          console.warn('[IndexedDBCache] Database open blocked by another connection')
          resolve(false)
        }
      })
    } catch (error) {
      console.warn('[IndexedDBCache] Unexpected error opening database:', error)
      return false
    }
  }

  /**
   * Get a value from the cache.
   * @param store - Store to get from
   * @param key - Key to retrieve
   * @returns The cached value or null if not found
   */
  async get<T>(store: IndexedDBCacheStore, key: string): Promise<T | null> {
    if (!this.db) {
      const opened = await this.open()
      if (!opened || !this.db) return null
    }

    try {
      return await new Promise<T | null>((resolve, reject) => {
        const transaction = this.db!.transaction(store, 'readwrite')
        const objectStore = transaction.objectStore(store)
        const request = objectStore.get(key)

        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const entry = request.result as CacheEntry<T> | undefined
          if (!entry) {
            resolve(null)
            return
          }

          // Update last access time
          entry.lastAccess = Date.now()
          objectStore.put(entry, key)

          resolve(entry.data)
        }
      })
    } catch (error) {
      // Connection may have been lost - close properly to cleanup event handlers
      if (this.isConnectionError(error)) {
        this.close()
      }
      throw error
    }
  }

  /**
   * Set a value in the cache.
   * Handles quota exceeded errors with LRU eviction.
   * @param store
   * @param key
   * @param value
   * @param checksum
   */
  async set<T>(
    store: IndexedDBCacheStore,
    key: string,
    value: T,
    checksum?: string
  ): Promise<void> {
    if (!this.db) {
      const opened = await this.open()
      if (!opened || !this.db) {
        console.warn('[IndexedDBCache] Cannot set - database unavailable')
        return
      }
    }

    const entry: CacheEntry<T> = {
      data: value,
      lastAccess: Date.now(),
      size: this.estimateSize(value),
      checksum,
    }

    try {
      await this.doSet(store, key, entry)
    } catch (error) {
      if (this.isQuotaError(error)) {
        // Evict old entries and retry
        console.warn('[IndexedDBCache] Quota exceeded, evicting old entries...')
        await this.evictLRU(store, 0.25) // Evict 25% oldest
        await this.doSet(store, key, entry) // Retry
      } else if (this.isConnectionError(error)) {
        // Close properly to cleanup event handlers
        this.close()
        throw error
      } else {
        throw error
      }
    }
  }

  private async doSet<T>(
    store: IndexedDBCacheStore,
    key: string,
    entry: CacheEntry<T>
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction(store, 'readwrite')
      const objectStore = transaction.objectStore(store)
      const request = objectStore.put(entry, key)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  /**
   * Delete a value from the cache.
   * @param store
   * @param key
   */
  async delete(store: IndexedDBCacheStore, key: string): Promise<void> {
    if (!this.db) {
      const opened = await this.open()
      if (!opened || !this.db) return
    }

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction(store, 'readwrite')
      const objectStore = transaction.objectStore(store)
      const request = objectStore.delete(key)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  /**
   * Clear all values in a store.
   * @param store
   */
  async clear(store: IndexedDBCacheStore): Promise<void> {
    if (!this.db) {
      const opened = await this.open()
      if (!opened || !this.db) return
    }

    return new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction(store, 'readwrite')
      const objectStore = transaction.objectStore(store)
      const request = objectStore.clear()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }

  /**
   * Get total size of a store in bytes.
   * @param store - Store to measure
   * @returns Total size in bytes
   */
  async getSize(store: IndexedDBCacheStore): Promise<number> {
    if (!this.db) {
      const opened = await this.open()
      if (!opened || !this.db) return 0
    }

    return new Promise<number>((resolve, reject) => {
      const transaction = this.db!.transaction(store, 'readonly')
      const objectStore = transaction.objectStore(store)
      const request = objectStore.openCursor()

      let total = 0

      request.onerror = () => reject(request.error)
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          const entry = cursor.value as CacheEntry<unknown>
          total += entry.size || 0
          cursor.continue()
        } else {
          resolve(total)
        }
      }
    })
  }

  /**
   * Get all keys in a store.
   * @param store - Store to get keys from
   * @returns Array of all keys in the store
   */
  async getAllKeys(store: IndexedDBCacheStore): Promise<string[]> {
    if (!this.db) {
      const opened = await this.open()
      if (!opened || !this.db) return []
    }

    return new Promise<string[]>((resolve, reject) => {
      const transaction = this.db!.transaction(store, 'readonly')
      const objectStore = transaction.objectStore(store)
      const request = objectStore.getAllKeys()

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result as string[])
    })
  }

  /**
   * Evict least recently used entries to free up space.
   * @param store - Store to evict from
   * @param fraction - Fraction of entries to evict (0.0-1.0)
   * @returns Number of entries evicted
   */
  async evictLRU(store: IndexedDBCacheStore, fraction: number): Promise<number> {
    if (!this.db) return 0

    // Get all entries with their access times
    const entries: Array<{ key: string; lastAccess: number }> = []

    await new Promise<void>((resolve, reject) => {
      const transaction = this.db!.transaction(store, 'readonly')
      const objectStore = transaction.objectStore(store)
      const request = objectStore.openCursor()

      request.onerror = () => reject(request.error)
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result
        if (cursor) {
          const entry = cursor.value as CacheEntry<unknown>
          entries.push({
            key: cursor.key as string,
            lastAccess: entry.lastAccess || 0,
          })
          cursor.continue()
        } else {
          resolve()
        }
      }
    })

    // Sort by last access time (oldest first)
    entries.sort((a, b) => a.lastAccess - b.lastAccess)

    // Evict oldest entries
    const toEvict = Math.ceil(entries.length * fraction)
    const evictKeys = entries.slice(0, toEvict).map((e) => e.key)

    for (const key of evictKeys) {
      await this.delete(store, key)
    }

    return evictKeys.length
  }

  /**
   * Check if database connection is open.
   * @returns True if database connection is open
   */
  isOpen(): boolean {
    return this.db !== null
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db?.close()
    this.db = null
    this.openPromise = null
  }

  private estimateSize(value: unknown): number {
    if (value instanceof ArrayBuffer) {
      return value.byteLength
    }
    if (value instanceof Uint8Array || value instanceof Float32Array) {
      return value.byteLength
    }
    if (typeof value === 'string') {
      return value.length * 2 // UTF-16
    }
    if (typeof value === 'object' && value !== null) {
      try {
        return JSON.stringify(value).length * 2
      } catch {
        return 1024 // Fallback estimate
      }
    }
    return 8 // Primitive
  }

  private isQuotaError(error: unknown): boolean {
    if (error instanceof DOMException) {
      return (
        error.name === 'QuotaExceededError' || error.code === 22 // Legacy quota exceeded code
      )
    }
    return false
  }

  private isConnectionError(error: unknown): boolean {
    if (error instanceof DOMException) {
      return error.name === 'InvalidStateError' || error.name === 'TransactionInactiveError'
    }
    return false
  }
}
