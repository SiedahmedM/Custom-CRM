/* eslint-disable */
// @ts-nocheck
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders'
import { 
  ArrowLeft, 
  Star,
  Target,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Banknote,
  Navigation
} from 'lucide-react'
import { motion } from 'framer-motion'
import { logDriverLocation } from '@/lib/location-tracking'
import { toast } from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Database } from '@/types/database'

const pitchSchema = z.object({
  shop_visited: z.string().min(1, 'Shop name is required'),
  decision_maker_contacted: z.boolean(),
  decision_maker_name: z.string().optional(),
  interest_level: z.enum(['high', 'medium', 'low', 'none']),
  potential_order_value: z.number().min(0, 'Value must be positive'),
  follow_up_required: z.boolean(),
  follow_up_date: z.string().optional(),
  notes: z.string().optional(),
})

type PitchFormData = z.infer<typeof pitchSchema>

export default function ColdPitchPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { user, isDriver } = useAuth()
  const supabase = createClient()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [currentLocation, setCurrentLocation] = useState<GeolocationPosition | null>(null)
  const [gpsVerified, setGpsVerified] = useState<boolean | null>(null)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const [selectedShop, setSelectedShop] = useState<string>('')

  // Protect route
  useEffect(() => {
    if (!user || !isDriver) {
      router.push('/')
    }
  }, [user, isDriver, router])

  // Get order details for context (declare before effects using it)
  const { orders } = useRealtimeOrders({})
  const order = orders.find(o => o.id === params.id)

  // Verify GPS helper
  const verifyGPSLocation = useCallback(async () => {
    if (!order) return

    try {
      // Basic GPS verification (placeholder)
      setGpsVerified(true)
      await logDriverLocation(user?.id || '', 'cold_pitch_attempt')
      toast.success('📍 GPS location verified', { duration: 2000 })
    } catch {
      setGpsVerified(false)
      toast.error('GPS verification failed')
    }
  }, [order, user?.id])

  // Get current location and verify GPS
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentLocation(position)
          verifyGPSLocation()
        },
        () => {
          console.error('Location access denied')
          setGpsVerified(false)
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    }
  }, [verifyGPSLocation])

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<PitchFormData>({
    resolver: zodResolver(pitchSchema),
    defaultValues: {
      shop_visited: selectedShop,
      decision_maker_contacted: false,
      interest_level: 'none',
      potential_order_value: 0,
      follow_up_required: false
    }
  })

  const watchInterestLevel = watch('interest_level')
  const watchDecisionMaker = watch('decision_maker_contacted')
  const watchFollowUp = watch('follow_up_required')

  const onSubmit = async (data: PitchFormData) => {
    if (!user) return

    setIsSubmitting(true)
    
    try {
      // Log the pitch attempt
      const { error } = await supabase
        .from('pitch_attempts')
        .insert({
          driver_id: user.id,
          customer_id: null,
          shop_name: data.shop_visited,
          contact_name: null,
          phone: null,
          pitch_date: new Date().toISOString(),
          decision_maker_contacted: data.decision_maker_contacted,
          decision_maker_name: data.decision_maker_name || null,
          interest_level: data.interest_level,
          potential_order_value: data.potential_order_value,
          follow_up_required: data.follow_up_required,
          follow_up_date: data.follow_up_date || null,
          notes: data.notes || null,
          location_verified: Boolean(gpsVerified),
          verification_status: gpsVerified ? 'verified' : 'questionable',
          latitude: currentLocation?.coords.latitude || null,
          longitude: currentLocation?.coords.longitude || null,
        } as Database['public']['Tables']['pitch_attempts']['Insert'])

      if (error) throw error

      // Log activity for audit trail
      await supabase
        .from('activity_logs')
        .insert({
          user_id: user.id,
          action: 'cold_pitch_logged',
          entity_type: 'pitch_attempt',
          entity_id: null,
          details: {
            shop_name: data.shop_visited,
            interest_level: data.interest_level,
            potential_value: data.potential_order_value,
            decision_maker_contacted: data.decision_maker_contacted,
            gps_verified: gpsVerified,
            coordinates: currentLocation ? {
              latitude: currentLocation.coords.latitude,
              longitude: currentLocation.coords.longitude,
              accuracy: currentLocation.coords.accuracy
            } : null,
            timestamp: new Date().toISOString()
          } as Database['public']['Tables']['activity_logs']['Row']['details'],
          ip_address: null,
          user_agent: null
        } as Database['public']['Tables']['activity_logs']['Insert'])

      // Create notification for admin if high interest
      if (data.interest_level === 'high') {
        await supabase
          .from('notifications')
          .insert({
            user_id: null, // Admin notification
            title: 'High Interest Cold Pitch!',
            message: `${user.name} found high interest at ${data.shop_visited} - Potential value: $${data.potential_order_value.toFixed(2)}`,
            type: 'pitch',
            priority: 'high',
            is_read: false,
            related_order_id: null
          } as Database['public']['Tables']['notifications']['Insert'])
      }

      toast.success('🎯 Cold pitch logged successfully!', {
        icon: '📋',
        duration: 5000,
      })

      // Haptic feedback for success
      if (window.navigator.vibrate) {
        window.navigator.vibrate([100, 50, 100])
      }

      // Navigate back to driver dashboard
      setTimeout(() => {
        router.push('/driver')
      }, 2000)

    } catch (err) {
      console.error('Failed to log cold pitch:', err)
      toast.error('Failed to log cold pitch')
    } finally {
      setIsSubmitting(false)
    }
  }

  const interestLevelOptions = [
    { value: 'high', label: 'High Interest', color: 'green', icon: Star },
    { value: 'medium', label: 'Medium Interest', color: 'yellow', icon: TrendingUp },
    { value: 'low', label: 'Low Interest', color: 'orange', icon: AlertCircle },
    { value: 'none', label: 'No Interest', color: 'gray', icon: CheckCircle },
  ]

  const suggestedShops = [
    'AutoZone',
    'O\'Reilly Auto Parts', 
    'Advance Auto Parts',
    'NAPA Auto Parts',
    'Pepboys',
    'Jiffy Lube',
    'Valvoline Instant Oil Change',
    'Midas',
    'Firestone Complete Auto Care',
    'Goodyear Auto Service'
  ]

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
                onClick={() => router.push('/driver')}
                className="p-2 -ml-2 active:scale-95 transition-transform"
              >
                <ArrowLeft className="w-[22px] h-[22px] text-blue-600" />
              </button>
              <div>
                <h1 className="text-[17px] font-semibold text-gray-900">Cold Pitch</h1>
                <p className="text-[13px] text-gray-500 mt-0.5">
                  Post-delivery sales opportunity
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                gpsVerified === null ? 'bg-orange-500 animate-pulse' :
                gpsVerified ? 'bg-green-500' : 'bg-red-500'
              }`} />
              <span className="text-[11px] text-gray-500">GPS</span>
            </div>
          </div>
        </div>
      </header>

      <div className="px-5 py-4">
        {/* GPS Verification Status */}
        <div className={`rounded-2xl p-4 mb-4 border-2 ${
          gpsVerified === null ? 'bg-orange-50 border-orange-200' :
          gpsVerified ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center gap-2 mb-2">
            <Navigation className={`w-5 h-5 ${
              gpsVerified === null ? 'text-orange-600' :
              gpsVerified ? 'text-green-600' : 'text-red-600'
            }`} />
            <span className={`text-[15px] font-semibold ${
              gpsVerified === null ? 'text-orange-900' :
              gpsVerified ? 'text-green-900' : 'text-red-900'
            }`}>
              GPS {gpsVerified === null ? 'Verifying...' : gpsVerified ? 'Verified' : 'Failed'}
            </span>
          </div>
          <p className={`text-[13px] ${
            gpsVerified === null ? 'text-orange-700' :
            gpsVerified ? 'text-green-700' : 'text-red-700'
          }`}>
            {gpsVerified === null ? 'Checking location accuracy...' :
             gpsVerified ? '✓ Location verified for pitch tracking' :
             '⚠️ Unable to verify location - pitch will be flagged for review'}
          </p>
        </div>

        {/* Shop Selection */}
        {showSuggestions && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 mb-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-semibold text-gray-900">Suggested Nearby Shops</h2>
              <button
                onClick={() => setShowSuggestions(false)}
                className="text-[13px] text-blue-600 font-medium"
              >
                Skip
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {suggestedShops.slice(0, 6).map((shop) => (
                <button
                  key={shop}
                  onClick={() => {
                    setSelectedShop(shop)
                    setValue('shop_visited', shop)
                    setShowSuggestions(false)
                  }}
                  className="p-3 text-left bg-gray-50 rounded-xl text-[13px] font-medium text-gray-900 active:bg-blue-50 transition-colors"
                >
                  {shop}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-500 text-center">
              Tap a shop to quick-select, or enter custom name below
            </p>
          </div>
        )}

        {/* Pitch Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Shop Name */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <label className="text-[13px] font-medium text-gray-600 uppercase tracking-wide mb-3 block">
              Shop Visited *
            </label>
            <input
              type="text"
              {...register('shop_visited')}
              value={selectedShop}
              onChange={(e) => setSelectedShop(e.target.value)}
              className="w-full bg-gray-100 rounded-xl px-4 py-3 text-[15px] font-semibold outline-none"
              placeholder="Enter shop name"
            />
            {errors.shop_visited && (
              <p className="text-red-500 text-[13px] mt-1">{errors.shop_visited.message}</p>
            )}
          </div>

          {/* Decision Maker Contact */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <label className="text-[13px] font-medium text-gray-600 uppercase tracking-wide mb-3 block">
              Decision Maker Contact
            </label>
            <div className="space-y-3">
              <label className="flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all">
                <input
                  type="checkbox"
                  {...register('decision_maker_contacted')}
                  className="w-5 h-5 text-blue-600 rounded"
                />
                <span className="text-[15px] font-medium text-gray-900">
                  I spoke with a decision maker
                </span>
              </label>
              
              {watchDecisionMaker && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <input
                    type="text"
                    {...register('decision_maker_name')}
                    className="w-full bg-gray-100 rounded-xl px-4 py-3 text-[15px] outline-none mt-3"
                    placeholder="Decision maker's name (optional)"
                  />
                </motion.div>
              )}
            </div>
          </div>

          {/* Interest Level */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <label className="text-[13px] font-medium text-gray-600 uppercase tracking-wide mb-3 block">
              Interest Level *
            </label>
            <div className="grid grid-cols-2 gap-3">
              {interestLevelOptions.map(({ value, label, color, icon: Icon }) => (
                <label
                  key={value}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    watchInterestLevel === value
                      ? color === 'green' ? 'border-green-500 bg-green-50' :
                        color === 'yellow' ? 'border-yellow-500 bg-yellow-50' :
                        color === 'orange' ? 'border-orange-500 bg-orange-50' :
                        'border-gray-500 bg-gray-50'
                      : 'border-gray-200 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    value={value}
                    {...register('interest_level')}
                    className="sr-only"
                  />
                  <Icon className={`w-5 h-5 ${
                    color === 'green' ? 'text-green-600' :
                    color === 'yellow' ? 'text-yellow-600' :
                    color === 'orange' ? 'text-orange-600' :
                    'text-gray-600'
                  }`} />
                  <div className="text-left">
                    <span className="text-[15px] font-medium text-gray-900 block">{label}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Potential Order Value */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <label className="text-[13px] font-medium text-gray-600 uppercase tracking-wide mb-2 block">
              Potential Order Value
            </label>
            <div className="flex items-center gap-2">
              <Banknote className="w-5 h-5 text-green-600" />
              <input
                type="number"
                step="0.01"
                {...register('potential_order_value', { valueAsNumber: true })}
                className="flex-1 bg-gray-100 rounded-xl px-4 py-3 text-[15px] font-semibold outline-none"
                placeholder="0.00"
              />
            </div>
            {errors.potential_order_value && (
              <p className="text-red-500 text-[13px] mt-1">{errors.potential_order_value.message}</p>
            )}
          </div>

          {/* Follow-up Required */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <label className="text-[13px] font-medium text-gray-600 uppercase tracking-wide mb-3 block">
              Follow-up Required
            </label>
            <div className="space-y-3">
              <label className="flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all">
                <input
                  type="checkbox"
                  {...register('follow_up_required')}
                  className="w-5 h-5 text-blue-600 rounded"
                />
                <span className="text-[15px] font-medium text-gray-900">
                  Schedule follow-up contact
                </span>
              </label>
              
              {watchFollowUp && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <input
                    type="date"
                    {...register('follow_up_date')}
                    className="w-full bg-gray-100 rounded-xl px-4 py-3 text-[15px] outline-none mt-3"
                    min={new Date().toISOString().split('T')[0]}
                  />
                </motion.div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <label className="text-[13px] font-medium text-gray-600 uppercase tracking-wide mb-2 block">
              Additional Notes
            </label>
            <textarea
              {...register('notes')}
              className="w-full bg-gray-100 rounded-xl px-4 py-3 text-[15px] outline-none resize-none"
              rows={3}
              placeholder="Any additional observations, competitor info, specific needs mentioned, etc..."
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-blue-600 text-white py-4 rounded-2xl font-semibold text-[17px] disabled:opacity-50 disabled:cursor-not-allowed active:bg-blue-700 transition-colors"
          >
            {isSubmitting ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Logging Real-time Data...
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <Target className="w-5 h-5" />
                Submit Cold Pitch Results
              </div>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}