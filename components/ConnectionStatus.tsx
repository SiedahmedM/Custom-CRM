'use client'

import { useEffect, useState } from 'react'
import { Wifi, WifiOff } from 'lucide-react'
import { realtimeManager } from '@/lib/supabase/realtime'
import { motion, AnimatePresence } from 'framer-motion'
import { DarkModeToggle } from './DarkModeToggle'

export function ConnectionStatus() {
  const [isOnline, setIsOnline] = useState(true)
  const [showStatus, setShowStatus] = useState(false)

  useEffect(() => {
    const checkConnection = () => {
      const status = realtimeManager.getConnectionStatus()
      setIsOnline(status)
      
      // Show status briefly when connection changes
      if (status !== isOnline) {
        setShowStatus(true)
        setTimeout(() => setShowStatus(false), 3000)
      }
    }

    const interval = setInterval(checkConnection, 5000)

    // Listen for online/offline events
    const handleOnline = () => {
      setIsOnline(true)
      setShowStatus(true)
      setTimeout(() => setShowStatus(false), 3000)
    }

    const handleOffline = () => {
      setIsOnline(false)
      setShowStatus(true)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      clearInterval(interval)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [isOnline])

  return (
    <>
      {/* Dark mode toggle - always visible */}
      <div className="fixed top-4 left-4 z-50">
        <DarkModeToggle />
      </div>

      {/* Corner indicator: show only when offline or while showStatus is true */}
      {(showStatus || !isOnline) && (
        <div className="fixed top-4 right-4 z-50">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm transition-all ${
            isOnline 
              ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
              : 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
          }`}>
            {isOnline ? (
              <>
                <Wifi className="w-3 h-3" />
                <span>Connected</span>
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3" />
                <span>Offline</span>
                <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
              </>
            )}
          </div>
        </div>
      )}

      {/* Temporary notification */}
      <AnimatePresence>
        {showStatus && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50"
          >
            <div className={`px-6 py-3 rounded-lg shadow-lg backdrop-blur-md ${
              isOnline 
                ? 'bg-green-500/90 text-white' 
                : 'bg-red-500/90 text-white'
            }`}>
              <div className="flex items-center gap-3">
                {isOnline ? (
                  <>
                    <Wifi className="w-5 h-5" />
                    <div>
                      <p className="font-semibold">Connection Restored</p>
                      <p className="text-sm opacity-90">Real-time updates active</p>
                    </div>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-5 h-5" />
                    <div>
                      <p className="font-semibold">Connection Lost</p>
                      <p className="text-sm opacity-90">Working offline - changes will sync when reconnected</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}