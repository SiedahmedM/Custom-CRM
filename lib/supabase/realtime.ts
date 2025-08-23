import { createClient } from './client'
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { toast } from 'react-hot-toast'

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE'

interface RealtimeConfig {
  table: string
  event?: RealtimeEvent | '*'
  filter?: string
  callback: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void
  onError?: (error: Error) => void
}

class RealtimeManager {
  private supabase = createClient()
  private channels: Map<string, RealtimeChannel> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private reconnectDelay = 5000
  private heartbeatInterval = 30000
  private heartbeatTimer: NodeJS.Timeout | null = null
  private isOnline = true
  private queuedUpdates: Array<() => void> = []

  constructor() {
    this.setupConnectionMonitoring()
    this.setupOfflineQueue()
  }

  private setupConnectionMonitoring() {
    // Monitor online/offline status
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline)
      window.addEventListener('offline', this.handleOffline)
    }

    // Setup heartbeat
    this.startHeartbeat()
  }

  private setupOfflineQueue() {
    // Process queued updates when coming back online
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.processQueue()
      })
    }
  }

  private handleOnline = () => {
    this.isOnline = true
    this.reconnectAttempts = 0
    toast.success('Connection restored', {
      icon: '🟢',
      duration: 3000,
    })
    this.processQueue()
    this.reconnectAllChannels()
  }

  private handleOffline = () => {
    this.isOnline = false
    toast.error('Connection lost. Working offline...', {
      icon: '🔴',
      duration: 5000,
    })
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      this.checkConnection()
    }, this.heartbeatInterval)
  }

  private async checkConnection() {
    try {
      const { error } = await this.supabase.from('users').select('id').limit(1)
      if (error) throw error
      
      if (!this.isOnline) {
        this.handleOnline()
      }
    } catch (error) {
      if (this.isOnline) {
        this.handleOffline()
      }
      this.attemptReconnect()
    }
  }

  private async attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      toast.error('Failed to reconnect. Please refresh the page.', {
        duration: 0,
        id: 'reconnect-failed',
      })
      return
    }

    this.reconnectAttempts++
    
    setTimeout(() => {
      this.checkConnection()
    }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1))
  }

  private reconnectAllChannels() {
    this.channels.forEach((channel, key) => {
      channel.unsubscribe()
      this.channels.delete(key)
    })
    
    // Channels will be re-subscribed by components
    toast.success('Real-time subscriptions restored')
  }

  public subscribe(config: RealtimeConfig): RealtimeChannel {
    const { table, event = '*', filter, callback, onError } = config
    const channelKey = `${table}-${event}-${filter || 'all'}`
    
    // Check if channel already exists
    if (this.channels.has(channelKey)) {
      return this.channels.get(channelKey)!
    }

    const channel = this.supabase
      .channel(channelKey)
      .on(
        'postgres_changes',
        {
          event,
          schema: 'public',
          table,
          filter,
        },
        (payload) => {
          try {
            // Handle optimistic updates
            callback(payload)
          } catch (error) {
            console.error(`Error processing ${table} update:`, error)
            onError?.(error as Error)
            
            toast.error(`Failed to process ${table} update`, {
              duration: 3000,
            })
          }
        }
      )
      .on('error', (error) => {
        console.error(`Subscription error for ${table}:`, error)
        onError?.(new Error(error.message))
        
        // Attempt to resubscribe
        setTimeout(() => {
          this.resubscribe(channelKey, config)
        }, this.reconnectDelay)
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`✅ Subscribed to ${table} real-time updates`)
        } else if (status === 'CLOSED') {
          console.log(`❌ Subscription closed for ${table}`)
          this.channels.delete(channelKey)
        } else if (status === 'CHANNEL_ERROR') {
          console.error(`Channel error for ${table}`)
          this.resubscribe(channelKey, config)
        }
      })

    this.channels.set(channelKey, channel)
    return channel
  }

  private resubscribe(channelKey: string, config: RealtimeConfig) {
    const existingChannel = this.channels.get(channelKey)
    if (existingChannel) {
      existingChannel.unsubscribe()
      this.channels.delete(channelKey)
    }
    
    // Resubscribe after a delay
    setTimeout(() => {
      this.subscribe(config)
    }, this.reconnectDelay)
  }

  public unsubscribe(channel: RealtimeChannel) {
    channel.unsubscribe()
    
    // Remove from channels map
    this.channels.forEach((ch, key) => {
      if (ch === channel) {
        this.channels.delete(key)
      }
    })
  }

  public unsubscribeAll() {
    this.channels.forEach(channel => {
      channel.unsubscribe()
    })
    this.channels.clear()
  }

  public queueUpdate(update: () => void) {
    if (this.isOnline) {
      update()
    } else {
      this.queuedUpdates.push(update)
      toast.info('Update queued. Will sync when online.', {
        duration: 2000,
      })
    }
  }

  private processQueue() {
    if (this.queuedUpdates.length === 0) return
    
    toast.loading(`Syncing ${this.queuedUpdates.length} queued updates...`, {
      id: 'sync-queue',
    })
    
    const updates = [...this.queuedUpdates]
    this.queuedUpdates = []
    
    Promise.all(updates.map(update => {
      try {
        return update()
      } catch (error) {
        console.error('Failed to process queued update:', error)
        return null
      }
    })).then(() => {
      toast.success('All updates synced successfully', {
        id: 'sync-queue',
      })
    }).catch(error => {
      toast.error('Some updates failed to sync', {
        id: 'sync-queue',
      })
    })
  }

  public getConnectionStatus(): boolean {
    return this.isOnline
  }

  public cleanup() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
    }
    
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline)
      window.removeEventListener('offline', this.handleOffline)
    }
    
    this.unsubscribeAll()
  }
}

// Export singleton instance
export const realtimeManager = new RealtimeManager()

// Cleanup on unmount
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    realtimeManager.cleanup()
  })
}