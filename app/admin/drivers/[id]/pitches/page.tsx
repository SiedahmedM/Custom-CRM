/* eslint-disable */
// @ts-nocheck
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { 
  ArrowLeft,
  Target,
  MapPin,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Phone,
  User,
  Navigation,
  Calendar,
  TrendingUp,
  Star,
  DollarSign
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRealtimePitches } from '@/hooks/useRealtimePitches'
import { format, isToday, isThisWeek, isThisMonth } from 'date-fns'

export default function DriverPitchesPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { user, isAdmin } = useAuth()

  // Protect route
  useEffect(() => {
    if (!user || !isAdmin) {
      router.push('/')
    }
  }, [user, isAdmin, router])

  // Get pitch data for this driver
  const { 
    pitches, 
    driverPerformance, 
    updateVerificationStatus 
  } = useRealtimePitches({
    driver_id: params.id
  })

  // iOS optimizations
  useEffect(() => {
    document.body.style.overscrollBehavior = 'none'
    
    const setSafeArea = () => {
      const vh = window.innerHeight * 0.01
      document.documentElement.style.setProperty('--vh', `${vh}px`)
    }
    
    setSafeArea()
    window.addEventListener('resize', setSafeArea)
    
    return () => {
      window.removeEventListener('resize', setSafeArea)
      document.body.style.overscrollBehavior = 'auto'
    }
  }, [])

  // Get driver performance data
  const driverData = driverPerformance.find(d => d.driver_id === params.id)
  
  // Calculate detailed stats
  const todayPitches = pitches.filter(p => isToday(new Date(p.pitch_date)))
  const weekPitches = pitches.filter(p => isThisWeek(new Date(p.pitch_date)))
  const monthPitches = pitches.filter(p => isThisMonth(new Date(p.pitch_date)))
  
  const verificationCounts = {
    verified: pitches.filter(p => p.verification_status === 'verified').length,
    questionable: pitches.filter(p => p.verification_status === 'questionable').length,
    flagged: pitches.filter(p => p.verification_status === 'flagged').length
  }

  const handleVerificationUpdate = async (pitchId: string, newStatus: string) => {
    try {
      await updateVerificationStatus.mutateAsync({
        id: pitchId,
        status: newStatus,
        notes: `Status updated by admin on ${format(new Date(), 'PPpp')}`
      })
    } catch (error) {
      console.error('Failed to update verification status:', error)
    }
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50" style={{ minHeight: 'calc(var(--vh, 1vh) * 100)' }}>
      <ConnectionStatus />
      
      {/* iOS-style Header */}
      <header className="bg-white/95 backdrop-blur-md border-b border-gray-200/50 sticky top-0 z-40" 
              style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="px-5 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="p-2 -ml-2 active:scale-95 transition-transform"
              >
                <ArrowLeft className="w-[22px] h-[22px] text-blue-600" />
              </button>
              <div>
                <h1 className="text-[17px] font-semibold text-gray-900">Pitch History</h1>
                <p className="text-[13px] text-gray-500 mt-0.5">
                  {driverData?.driver_name || 'Unknown Driver'}
                </p>
              </div>
            </div>
            <Target className="w-6 h-6 text-blue-600" />
          </div>
        </div>
      </header>

      {/* Driver Performance Overview */}
      <div className="px-5 py-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 mb-4">
          <h2 className="text-[15px] font-semibold text-gray-900 mb-3">Performance Overview</h2>
          <div className="grid grid-cols-4 gap-3">
            <div className="text-center">
              <p className="text-[18px] font-bold text-gray-900">{pitches.length}</p>
              <p className="text-[10px] text-gray-500">Total</p>
            </div>
            <div className="text-center">
              <p className="text-[18px] font-bold text-green-600">
                {driverData?.success_rate.toFixed(0) || 0}%
              </p>
              <p className="text-[10px] text-gray-500">Success</p>
            </div>
            <div className="text-center">
              <p className="text-[18px] font-bold text-blue-600">
                ${driverData?.potential_value.toFixed(0) || 0}
              </p>
              <p className="text-[10px] text-gray-500">Potential</p>
            </div>
            <div className="text-center">
              <p className="text-[18px] font-bold text-red-600">{verificationCounts.flagged}</p>
              <p className="text-[10px] text-gray-500">Flagged</p>
            </div>
          </div>
        </div>

        {/* Verification Status Overview */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-green-50 rounded-2xl p-4 border border-green-200">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-[13px] font-medium text-green-700">Verified</span>
            </div>
            <p className="text-[20px] font-bold text-green-700">{verificationCounts.verified}</p>
          </div>
          
          <div className="bg-yellow-50 rounded-2xl p-4 border border-yellow-200">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-yellow-600" />
              <span className="text-[13px] font-medium text-yellow-700">Questionable</span>
            </div>
            <p className="text-[20px] font-bold text-yellow-700">{verificationCounts.questionable}</p>
          </div>
          
          <div className="bg-red-50 rounded-2xl p-4 border border-red-200">
            <div className="flex items-center gap-2 mb-2">
              <XCircle className="w-4 h-4 text-red-600" />
              <span className="text-[13px] font-medium text-red-700">Flagged</span>
            </div>
            <p className="text-[20px] font-bold text-red-700">{verificationCounts.flagged}</p>
          </div>
        </div>
      </div>

      {/* Pitch History */}
      <div className="px-5 pb-safe">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold text-gray-900">Pitch History</h2>
          <p className="text-[13px] text-gray-500">{pitches.length} total pitches</p>
        </div>

        <div className="space-y-3">
          <AnimatePresence>
            {pitches.map((pitch, index) => (
              <motion.div
                key={pitch.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className={`bg-white rounded-2xl p-4 shadow-sm border-2 ${
                  pitch.verification_status === 'verified' ? 'border-green-200' :
                  pitch.verification_status === 'questionable' ? 'border-yellow-200' :
                  'border-red-200'
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-3 h-3 rounded-full ${
                        pitch.verification_status === 'verified' ? 'bg-green-500' :
                        pitch.verification_status === 'questionable' ? 'bg-yellow-500' :
                        'bg-red-500'
                      }`} />
                      <p className="font-semibold text-[15px] text-gray-900">
                        {pitch.shop_name || pitch.customer?.shop_name || 'Unknown Shop'}
                      </p>
                    </div>
                    
                    {pitch.contact_name && (
                      <div className="flex items-center gap-2 text-[13px] text-gray-600 mb-1">
                        <MapPin className="w-3 h-3" />
                        <span>{pitch.contact_name}</span>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-2 text-[13px] text-gray-600 mb-1">
                      <Clock className="w-3 h-3" />
                      <span>{format(new Date(pitch.pitch_date), 'MMM d, yyyy h:mm a')}</span>
                    </div>
                    
                    {pitch.latitude && pitch.longitude && (
                      <div className="flex items-center gap-2 text-[13px] text-gray-600 mb-2">
                        <Navigation className="w-3 h-3" />
                        <span>
                          {pitch.latitude.toFixed(4)}, {pitch.longitude.toFixed(4)}
                        </span>
                      </div>
                    )}
                    
                    <div className="flex items-center gap-3 mt-3">
                      <div className={`px-2 py-1 rounded-full text-[11px] font-medium ${
                        pitch.interest_level === 'high' ? 'bg-green-100 text-green-700' :
                        pitch.interest_level === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                        pitch.interest_level === 'low' ? 'bg-orange-100 text-orange-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {pitch.interest_level} interest
                      </div>
                      
                      {pitch.potential_order_value > 0 && (
                        <div className="flex items-center gap-1 text-[11px] text-green-600 font-medium">
                          <DollarSign className="w-3 h-3" />
                          <span>{pitch.potential_order_value.toFixed(0)}</span>
                        </div>
                      )}
                      
                      <div className={`px-2 py-1 rounded-full text-[11px] font-medium ${
                        pitch.verification_score >= 80 ? 'bg-green-100 text-green-700' :
                        pitch.verification_score >= 60 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        Score: {pitch.verification_score}
                      </div>
                    </div>
                    
                    {pitch.decision_maker_contacted && (
                      <div className="mt-2 p-2 bg-blue-50 rounded-lg">
                        <div className="flex items-center gap-2 text-[12px] text-blue-700">
                          <User className="w-3 h-3" />
                          <span>Decision maker contacted</span>
                        </div>
                        {pitch.decision_maker_name && (
                          <p className="text-[11px] text-blue-600 mt-1 ml-5">
                            {pitch.decision_maker_name}
                          </p>
                        )}
                      </div>
                    )}
                    
                    {pitch.follow_up_required && pitch.follow_up_date && (
                      <div className="mt-2 p-2 bg-orange-50 rounded-lg">
                        <div className="flex items-center gap-2 text-[12px] text-orange-700">
                          <Calendar className="w-3 h-3" />
                          <span>Follow-up: {format(new Date(pitch.follow_up_date), 'MMM d, yyyy')}</span>
                        </div>
                      </div>
                    )}
                    
                    {pitch.notes && (
                      <div className="mt-2 p-2 bg-gray-50 rounded-lg">
                        <p className="text-[11px] text-gray-600">{pitch.notes}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Admin Actions */}
                <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                  <span className="text-[11px] text-gray-500 mr-2">Update status:</span>
                  <button
                    onClick={() => handleVerificationUpdate(pitch.id, 'verified')}
                    disabled={pitch.verification_status === 'verified'}
                    className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                      pitch.verification_status === 'verified'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600 active:bg-green-100 active:text-green-700'
                    }`}
                  >
                    Verified
                  </button>
                  <button
                    onClick={() => handleVerificationUpdate(pitch.id, 'questionable')}
                    disabled={pitch.verification_status === 'questionable'}
                    className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                      pitch.verification_status === 'questionable'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-600 active:bg-yellow-100 active:text-yellow-700'
                    }`}
                  >
                    Questionable
                  </button>
                  <button
                    onClick={() => handleVerificationUpdate(pitch.id, 'flagged')}
                    disabled={pitch.verification_status === 'flagged'}
                    className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                      pitch.verification_status === 'flagged'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600 active:bg-red-100 active:text-red-700'
                    }`}
                  >
                    Flagged
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {pitches.length === 0 && (
            <div className="text-center py-12">
              <Target className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-[17px] font-semibold text-gray-900 mb-2">
                No pitch history
              </h3>
              <p className="text-[15px] text-gray-500">
                This driver hasn't logged any pitches yet
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Safe Area */}
      <div style={{ height: 'env(safe-area-inset-bottom)' }} />
    </div>
  )
}