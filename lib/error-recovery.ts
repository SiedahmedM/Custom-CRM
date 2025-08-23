import { toast } from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'

export interface ErrorRecoveryOptions {
  maxRetries?: number
  retryDelay?: number
  exponentialBackoff?: boolean
  showToast?: boolean
  fallbackAction?: () => void
  criticalError?: boolean
}

export class ErrorRecoveryManager {
  private static instance: ErrorRecoveryManager
  private supabase = createClient()
  private retryQueue: Map<string, QueuedOperation> = new Map()
  private isOnline = true
  private errorCounts: Map<string, number> = new Map()

  private constructor() {
    this.setupNetworkMonitoring()
    this.setupUnhandledErrorCatching()
  }

  public static getInstance(): ErrorRecoveryManager {
    if (!ErrorRecoveryManager.instance) {
      ErrorRecoveryManager.instance = new ErrorRecoveryManager()
    }
    return ErrorRecoveryManager.instance
  }

  private setupNetworkMonitoring() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline)
      window.addEventListener('offline', this.handleOffline)
      
      // Check initial connection status
      this.isOnline = navigator.onLine
    }
  }

  private setupUnhandledErrorCatching() {
    if (typeof window !== 'undefined') {
      // Catch unhandled promise rejections
      window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled promise rejection:', event.reason)
        this.handleError(event.reason, {
          showToast: true,
          criticalError: true
        })
        event.preventDefault()
      })

      // Catch unhandled errors
      window.addEventListener('error', (event) => {
        console.error('Unhandled error:', event.error)
        this.handleError(event.error, {
          showToast: true,
          criticalError: true
        })
      })
    }
  }

  private handleOnline = () => {
    this.isOnline = true
    toast.success('Connection restored', {
      icon: '🟢',
      duration: 3000,
    })
    
    // Process queued operations
    this.processRetryQueue()
  }

  private handleOffline = () => {
    this.isOnline = false
    toast.error('Connection lost. Operations will be queued.', {
      icon: '🔴',
      duration: 5000,
    })
  }

  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationId: string,
    options: ErrorRecoveryOptions = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      retryDelay = 1000,
      exponentialBackoff = true,
      showToast = true,
      criticalError = false
    } = options

    let attempt = 0

    while (attempt <= maxRetries) {
      try {
        const result = await operation()
        
        // Clear error count on success
        this.errorCounts.delete(operationId)
        
        // Remove from retry queue if it was queued
        this.retryQueue.delete(operationId)
        
        return result
      } catch (error: unknown) {
        attempt++
        const currentErrorCount = this.errorCounts.get(operationId) || 0
        this.errorCounts.set(operationId, currentErrorCount + 1)

        console.error(`Attempt ${attempt} failed for operation ${operationId}:`, error)

        // Check if this is a network error
        const isNetworkError = this.isNetworkError(error)
        
        if (isNetworkError && !this.isOnline) {
          // Queue operation for retry when back online
          this.queueOperation(operationId, operation, options)
          
          if (showToast) {
            toast.error('Operation queued. Will retry when online.', {
              duration: 3000,
            })
          }
          
          throw new Error('Network unavailable - operation queued')
        }

        if (attempt > maxRetries) {
          // Max retries reached
          await this.handleMaxRetriesReached(operationId, error, options)
          throw error
        }

        // Calculate delay with optional exponential backoff
        const delay = exponentialBackoff 
          ? retryDelay * Math.pow(2, attempt - 1)
          : retryDelay

        if (showToast && attempt < maxRetries) {
          toast.error(`Retrying in ${delay/1000}s... (${attempt}/${maxRetries})`, {
            duration: delay,
          })
        }

        // Wait before retry
        await this.sleep(delay)
      }
    }

    throw new Error(`Operation ${operationId} failed after ${maxRetries} retries`)
  }

  private queueOperation<T>(
    operationId: string,
    operation: () => Promise<T>,
    options: ErrorRecoveryOptions
  ) {
    this.retryQueue.set(operationId, {
      id: operationId,
      operation,
      options,
      timestamp: Date.now(),
      attempts: 0
    })
  }

  private async processRetryQueue() {
    const operations = Array.from(this.retryQueue.values())
    
    if (operations.length === 0) return

    toast.loading(`Processing ${operations.length} queued operations...`, {
      id: 'queue-processing',
    })

    const results = await Promise.allSettled(
      operations.map(async (queuedOp) => {
        try {
          await this.executeWithRetry(
            queuedOp.operation,
            queuedOp.id,
            { ...queuedOp.options, showToast: false }
          )
          return { success: true, id: queuedOp.id }
        } catch (error) {
          return { success: false, id: queuedOp.id, error }
        }
      })
    )

    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length
    const failed = results.length - successful

    // Clear processed operations
    operations.forEach(op => this.retryQueue.delete(op.id))

    if (failed === 0) {
      toast.success('All queued operations completed successfully!', {
        id: 'queue-processing',
      })
    } else {
      toast.error(`${successful} operations completed, ${failed} failed`, {
        id: 'queue-processing',
      })
    }
  }

  private async handleMaxRetriesReached(
    operationId: string,
    error: unknown,
    options: ErrorRecoveryOptions
  ) {
    const errorCount = this.errorCounts.get(operationId) || 0
    
    // Log critical errors to Supabase for monitoring
    try {
      await this.supabase
        .from('activity_logs')
        .insert({
          action: 'critical_error',
          entity_type: 'system',
          details: {
            operation_id: operationId,
            error_message: error.message,
            error_stack: error.stack,
            error_count: errorCount,
            is_critical: options.criticalError,
            timestamp: new Date().toISOString()
          }
        })
    } catch (loggingError) {
      console.error('Failed to log error to database:', loggingError)
    }

    if (options.criticalError) {
      // Show persistent error notification for critical errors
      toast.error('Critical system error. Please contact support if this persists.', {
        duration: 0, // Persistent
        id: `critical-${operationId}`,
      })

      // Optionally trigger fallback action
      if (options.fallbackAction) {
        try {
          options.fallbackAction()
        } catch (fallbackError) {
          console.error('Fallback action failed:', fallbackError)
        }
      }
    }
  }

  public handleError(error: unknown, options: ErrorRecoveryOptions = {}) {
    console.error('Error handled by ErrorRecoveryManager:', error)

    if (options.showToast) {
      const isNetworkError = this.isNetworkError(error)
      const isCritical = options.criticalError

      if (isNetworkError) {
        toast.error('Network error. Please check your connection.', {
          icon: '📡',
          duration: 4000,
        })
      } else if (isCritical) {
        toast.error('A critical error occurred. Please refresh and try again.', {
          icon: '🚨',
          duration: 8000,
        })
      } else {
        toast.error(this.getErrorMessage(error), {
          duration: 4000,
        })
      }
    }

    // Haptic feedback for errors on mobile
    if (window.navigator.vibrate && options.criticalError) {
      window.navigator.vibrate([200, 100, 200])
    }
  }

  private isNetworkError(error: unknown): boolean {
    if (!error) return false
    
    const networkErrorMessages = [
      'fetch failed',
      'network error',
      'connection failed',
      'timeout',
      'offline',
      'no internet',
      'disconnected'
    ]

    const errorMessage = (error.message || '').toLowerCase()
    return networkErrorMessages.some(msg => errorMessage.includes(msg)) ||
           error.code === 'NETWORK_ERROR' ||
           error.code === 'TIMEOUT' ||
           !navigator.onLine
  }

  private getErrorMessage(error: unknown): string {
    if (typeof error === 'string') return error
    if (error?.message) return error.message
    if (error?.error) return error.error
    return 'An unexpected error occurred'
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  public getQueueStatus() {
    return {
      queueSize: this.retryQueue.size,
      isOnline: this.isOnline,
      errorCounts: Object.fromEntries(this.errorCounts),
      oldestQueuedOperation: this.retryQueue.size > 0 
        ? Math.min(...Array.from(this.retryQueue.values()).map(op => op.timestamp))
        : null
    }
  }

  public clearQueue() {
    this.retryQueue.clear()
    this.errorCounts.clear()
    toast.success('Error queue cleared')
  }

  public cleanup() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline)
      window.removeEventListener('offline', this.handleOffline)
    }
  }
}

interface QueuedOperation {
  id: string
  operation: () => Promise<unknown>
  options: ErrorRecoveryOptions
  timestamp: number
  attempts: number
}

// Export singleton instance
export const errorRecoveryManager = ErrorRecoveryManager.getInstance()

// Utility function for easy error handling in components
export const withErrorRecovery = <T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  operationId: string,
  options: ErrorRecoveryOptions = {}
): T => {
  return (async (...args: unknown[]) => {
    return errorRecoveryManager.executeWithRetry(
      () => fn(...args),
      operationId,
      options
    )
  }) as T
}

// React hook for error boundary functionality
export const useErrorRecovery = () => {
  const handleError = (error: unknown, options: ErrorRecoveryOptions = {}) => {
    errorRecoveryManager.handleError(error, options)
  }

  const executeWithRetry = async <T>(
    operation: () => Promise<T>,
    operationId: string,
    options: ErrorRecoveryOptions = {}
  ): Promise<T> => {
    return errorRecoveryManager.executeWithRetry(operation, operationId, options)
  }

  const getQueueStatus = () => errorRecoveryManager.getQueueStatus()
  const clearQueue = () => errorRecoveryManager.clearQueue()

  return {
    handleError,
    executeWithRetry,
    getQueueStatus,
    clearQueue
  }
}