import LZString from 'lz-string'

interface CompressionStats {
  originalSize: number
  compressedSize: number
  compressionRatio: number
}

export class OfflineStorage {
  private static readonly MAX_STORAGE_MB = 5 // 5MB limit for localStorage
  private static readonly CLEANUP_DAYS = 7 // Clean up data older than 7 days
  private static readonly STORAGE_PREFIX = 'muffler_offline_'

  /**
   * Compress and store data
   */
  static async setItem(key: string, data: unknown): Promise<CompressionStats> {
    try {
      const originalData = JSON.stringify({
        data,
        timestamp: Date.now(),
        version: '1.0'
      })

      const compressed = LZString.compressToUTF16(originalData)
      const storageKey = `${this.STORAGE_PREFIX}${key}`
      
      // Check storage quota
      const currentSize = this.getStorageSize()
      const newSize = compressed.length * 2 // UTF-16 uses 2 bytes per character
      
      if ((currentSize + newSize) > this.MAX_STORAGE_MB * 1024 * 1024) {
        // Cleanup old data if we're running out of space
        this.cleanupOldData()
        
        // If still not enough space, throw error
        if ((this.getStorageSize() + newSize) > this.MAX_STORAGE_MB * 1024 * 1024) {
          throw new Error('Storage quota exceeded')
        }
      }

      localStorage.setItem(storageKey, compressed)

      return {
        originalSize: originalData.length,
        compressedSize: compressed.length,
        compressionRatio: (1 - compressed.length / originalData.length) * 100
      }
    } catch (error) {
      console.error('Error storing compressed data:', error)
      throw error
    }
  }

  /**
   * Retrieve and decompress data
   */
  static getItem<T = unknown>(key: string): T | null {
    try {
      const storageKey = `${this.STORAGE_PREFIX}${key}`
      const compressed = localStorage.getItem(storageKey)
      
      if (!compressed) return null

      const decompressed = LZString.decompressFromUTF16(compressed)
      if (!decompressed) {
        console.warn('Failed to decompress data for key:', key)
        return null
      }

      const parsed = JSON.parse(decompressed)
      
      // Check if data is too old
      const age = Date.now() - parsed.timestamp
      if (age > this.CLEANUP_DAYS * 24 * 60 * 60 * 1000) {
        this.removeItem(key)
        return null
      }

      return parsed.data as T
    } catch (error) {
      console.error('Error retrieving compressed data:', error)
      return null
    }
  }

  /**
   * Remove item
   */
  static removeItem(key: string): void {
    const storageKey = `${this.STORAGE_PREFIX}${key}`
    localStorage.removeItem(storageKey)
  }

  /**
   * Clear all offline data
   */
  static clear(): void {
    const keys = Object.keys(localStorage)
    keys.forEach(key => {
      if (key.startsWith(this.STORAGE_PREFIX)) {
        localStorage.removeItem(key)
      }
    })
  }

  /**
   * Get total storage size in bytes
   */
  static getStorageSize(): number {
    let size = 0
    const keys = Object.keys(localStorage)
    
    keys.forEach(key => {
      if (key.startsWith(this.STORAGE_PREFIX)) {
        const item = localStorage.getItem(key)
        if (item) {
          size += item.length * 2 // UTF-16 uses 2 bytes per character
        }
      }
    })
    
    return size
  }

  /**
   * Get storage statistics
   */
  static getStats(): {
    usedMB: number
    maxMB: number
    percentUsed: number
    itemCount: number
  } {
    const size = this.getStorageSize()
    const itemCount = Object.keys(localStorage).filter(
      key => key.startsWith(this.STORAGE_PREFIX)
    ).length

    return {
      usedMB: size / (1024 * 1024),
      maxMB: this.MAX_STORAGE_MB,
      percentUsed: (size / (this.MAX_STORAGE_MB * 1024 * 1024)) * 100,
      itemCount
    }
  }

  /**
   * Clean up old data
   */
  private static cleanupOldData(): void {
    const keys = Object.keys(localStorage)
    const cutoffTime = Date.now() - (this.CLEANUP_DAYS * 24 * 60 * 60 * 1000)
    
    keys.forEach(key => {
      if (key.startsWith(this.STORAGE_PREFIX)) {
        try {
          const compressed = localStorage.getItem(key)
          if (compressed) {
            const decompressed = LZString.decompressFromUTF16(compressed)
            if (decompressed) {
              const parsed = JSON.parse(decompressed)
              if (parsed.timestamp < cutoffTime) {
                localStorage.removeItem(key)
              }
            }
          }
        } catch {
          // If we can't parse it, remove it
          localStorage.removeItem(key)
        }
      }
    })
  }

  /**
   * Cache orders with compression
   */
  static async cacheOrders(orders: unknown[]): Promise<void> {
    try {
      await this.setItem('orders_cache', orders)
      console.log(`Cached ${orders.length} orders with compression`)
    } catch (error) {
      console.error('Failed to cache orders:', error)
    }
  }

  /**
   * Get cached orders
   */
  static getCachedOrders<T = unknown>(): T[] | null {
    return this.getItem<T[]>('orders_cache')
  }

  /**
   * Cache customers with compression
   */
  static async cacheCustomers(customers: unknown[]): Promise<void> {
    try {
      await this.setItem('customers_cache', customers)
      console.log(`Cached ${customers.length} customers with compression`)
    } catch (error) {
      console.error('Failed to cache customers:', error)
    }
  }

  /**
   * Get cached customers
   */
  static getCachedCustomers<T = unknown>(): T[] | null {
    return this.getItem<T[]>('customers_cache')
  }

  /**
   * Cache inventory with compression
   */
  static async cacheInventory(inventory: unknown[]): Promise<void> {
    try {
      await this.setItem('inventory_cache', inventory)
      console.log(`Cached ${inventory.length} inventory items with compression`)
    } catch (error) {
      console.error('Failed to cache inventory:', error)
    }
  }

  /**
   * Get cached inventory
   */
  static getCachedInventory<T = unknown>(): T[] | null {
    return this.getItem<T[]>('inventory_cache')
  }
}