'use client'

import { useEffect, useState } from 'react'
import { X, Download, Share } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

export function PWAInstaller() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isInStandaloneMode, setIsInStandaloneMode] = useState(false)
  const [showIOSInstructions, setShowIOSInstructions] = useState(false)

  useEffect(() => {
    // Detect iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOS(iOS)

    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                        (window.navigator as any).standalone === true
    setIsInStandaloneMode(isStandalone)

    // Listen for beforeinstallprompt (Android/PWA)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      
      // Show install prompt after a delay (don't be too pushy)
      setTimeout(() => {
        if (!isStandalone) {
          setShowInstallPrompt(true)
        }
      }, 30000) // 30 seconds
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)

    // For iOS, show instructions after user has used the app for a bit
    if (iOS && !isStandalone) {
      const hasSeenInstructions = localStorage.getItem('ios-install-instructions-seen')
      if (!hasSeenInstructions) {
        setTimeout(() => {
          setShowIOSInstructions(true)
        }, 60000) // 1 minute
      }
    }

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(registration => {
          console.log('SW registered: ', registration)
        })
        .catch(registrationError => {
          console.log('SW registration failed: ', registrationError)
        })
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    }
  }, [])

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      
      if (outcome === 'accepted') {
        setDeferredPrompt(null)
        setShowInstallPrompt(false)
      }
    }
  }

  const dismissPrompt = () => {
    setShowInstallPrompt(false)
    // Don't show again for 7 days
    localStorage.setItem('install-prompt-dismissed', Date.now().toString())
  }

  const dismissIOSInstructions = () => {
    setShowIOSInstructions(false)
    localStorage.setItem('ios-install-instructions-seen', 'true')
  }

  // Don't show if already installed
  if (isInStandaloneMode) {
    return null
  }

  return (
    <>
      {/* Android/PWA Install Prompt */}
      <AnimatePresence>
        {showInstallPrompt && deferredPrompt && (
          <motion.div
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-50 shadow-lg"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 flex-1">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Download className="w-6 h-6 text-blue-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900 text-[15px]">
                    Install Muffler CRM
                  </h3>
                  <p className="text-[13px] text-gray-600">
                    Add to home screen for quick access
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={dismissPrompt}
                  className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
                <button
                  onClick={handleInstallClick}
                  className="bg-blue-600 text-white px-4 py-2 rounded-xl font-medium text-[14px] active:bg-blue-700 transition-colors"
                >
                  Install
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* iOS Install Instructions */}
      <AnimatePresence>
        {showIOSInstructions && isIOS && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end"
            onClick={dismissIOSInstructions}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-white rounded-t-3xl p-6 w-full max-h-[70vh] overflow-y-auto"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[20px] font-bold text-gray-900">
                  Install Muffler CRM
                </h2>
                <button
                  onClick={dismissIOSInstructions}
                  className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <p className="text-[15px] text-gray-600 mb-6">
                Install this app on your iPhone for the best experience:
              </p>

              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-[14px] font-bold text-blue-600">1</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <Share className="w-5 h-5 text-blue-600" />
                      <span className="text-[15px] font-semibold text-gray-900">
                        Tap the Share button
                      </span>
                    </div>
                    <p className="text-[13px] text-gray-600">
                      Look for the share icon in your Safari browser toolbar
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-[14px] font-bold text-blue-600">2</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[15px] font-semibold text-gray-900 mb-2">
                      Select "Add to Home Screen"
                    </p>
                    <p className="text-[13px] text-gray-600">
                      Scroll down in the share menu and tap "Add to Home Screen"
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                    <span className="text-[14px] font-bold text-blue-600">3</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[15px] font-semibold text-gray-900 mb-2">
                      Tap "Add" to confirm
                    </p>
                    <p className="text-[13px] text-gray-600">
                      The app will be added to your home screen for easy access
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-8 p-4 bg-blue-50 rounded-2xl">
                <p className="text-[13px] text-blue-800">
                  <strong>Tip:</strong> Once installed, the app will work offline and feel just like a native iPhone app!
                </p>
              </div>

              <button
                onClick={dismissIOSInstructions}
                className="w-full mt-6 bg-blue-600 text-white py-3.5 rounded-2xl font-semibold text-[17px] active:bg-blue-700 transition-colors"
              >
                Got it!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}