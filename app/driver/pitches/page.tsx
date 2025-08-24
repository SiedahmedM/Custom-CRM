/* eslint-disable */
// @ts-nocheck
'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { 
  ArrowLeft, 
  Target,
  Navigation,
  MapPin,
  Phone,
  Clock,
  CheckCircle,
  AlertCircle,
  Star,
  TrendingUp,
  Building2,
  Route,
  Search,
  Send
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { logDriverLocation } from '@/lib/location-tracking'
import { toast } from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRealtimePitches } from '@/hooks/useRealtimePitches'

// Generate realistic muffler shops around a given location with improved geographic distribution
const generateNearbyMufflerShops = (centerLat: number, centerLng: number): any[] => {
  const shopTypes = [
    'Midas Auto Service', 'Meineke Car Care', 'Mavis Discount Tire', 'SpeeDee Oil Change',
    'Jiffy Lube', 'Monroe Muffler Brake', 'AAMCO Transmissions', 'Firestone Complete Auto',
    'NTB National Tire', 'Precision Tune Auto Care', 'Valvoline Instant Oil',
    'Pep Boys Auto Service', 'AutoZone Service Center', 'Advance Auto Parts Service',
    'Goodyear Auto Service', 'Big O Tires', 'Discount Tire Service'
  ]
  
  const streetNames = [
    'Main St', 'Broadway', 'Oak Ave', 'Park Blvd', 'First St', 'Second Ave',
    'Central Ave', 'Washington St', 'Lincoln Rd', 'Jefferson Blvd', 'Madison Ave',
    'Adams St', 'Jackson Ave', 'Monroe Rd', 'Van Buren St', 'Elm St', 'Maple Ave',
    'Cedar Rd', 'Pine St', 'Walnut Ave', 'Cherry St', 'Oak Rd', 'Birch Ave'
  ]
  
  // Get rough location info for more realistic addresses
  const getCityState = (lat: number, lng: number) => {
    // Very rough approximation based on US regions
    if (lat > 40.5 && lat < 41 && lng > -74.5 && lng < -73.5) {
      return { city: 'Brooklyn', state: 'NY', zipBase: 11000 }
    } else if (lat > 34 && lat < 34.5 && lng > -118.5 && lng < -118) {
      return { city: 'Los Angeles', state: 'CA', zipBase: 90000 }
    } else if (lat > 41.8 && lat < 42 && lng > -87.8 && lng < -87.5) {
      return { city: 'Chicago', state: 'IL', zipBase: 60000 }
    } else if (lat > 29.6 && lat < 30 && lng > -95.5 && lng < -95) {
      return { city: 'Houston', state: 'TX', zipBase: 77000 }
    } else {
      return { city: 'Springfield', state: 'ST', zipBase: 10000 + Math.floor(Math.random() * 80000) }
    }
  }
  
  const locationInfo = getCityState(centerLat, centerLng)
  const shops = []
  
  // Generate shops within a 15-mile radius with varied distances
  for (let i = 0; i < 25; i++) {
    // Use different distance distributions - more shops closer, some farther
    let distance
    if (i < 8) {
      distance = Math.random() * 3 // First 8 shops within 3 miles
    } else if (i < 15) {
      distance = 3 + Math.random() * 5 // Next 7 shops 3-8 miles
    } else {
      distance = 8 + Math.random() * 7 // Remaining shops 8-15 miles
    }
    
    // Random angle
    const angle = Math.random() * 2 * Math.PI
    
    // Convert to lat/lng offset (more accurate conversion)
    const latOffset = (distance / 69) * Math.cos(angle)
    const lngOffset = (distance / (69 * Math.cos(centerLat * Math.PI / 180))) * Math.sin(angle)
    
    const shopLat = centerLat + latOffset
    const shopLng = centerLng + lngOffset
    
    // Generate realistic address
    const streetNumber = Math.floor(Math.random() * 9000) + 1000
    const streetName = streetNames[Math.floor(Math.random() * streetNames.length)]
    const zipCode = locationInfo.zipBase + Math.floor(Math.random() * 999)
    
    // Generate more realistic phone numbers based on location
    const areaCode = locationInfo.state === 'NY' ? '718' : 
                    locationInfo.state === 'CA' ? '213' :
                    locationInfo.state === 'IL' ? '312' :
                    locationInfo.state === 'TX' ? '713' :
                    `${Math.floor(Math.random() * 900) + 200}`
    
    shops.push({
      id: `shop_${i}_${Date.now()}`,
      name: shopTypes[Math.floor(Math.random() * shopTypes.length)],
      address: `${streetNumber} ${streetName}, ${locationInfo.city}, ${locationInfo.state} ${zipCode}`,
      lat: shopLat,
      lng: shopLng,
      phone: `(${areaCode}) ${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`
    })
  }
  
  return shops
}

const pitchSchema = z.object({
  shop_visited: z.string().min(1, 'Shop selection is required'),
  decision_maker_contacted: z.boolean(),
  decision_maker_name: z.string().optional(),
  decision_maker_phone: z.string().optional(),
  interest_level: z.enum(['high', 'medium', 'low', 'none']),
  potential_order_value: z.number().min(0, 'Value must be positive'),
  follow_up_required: z.boolean(),
  follow_up_date: z.string().optional(),
  notes: z.string().optional(),
})

type PitchFormData = z.infer<typeof pitchSchema>

interface NearbyShop {
  id: string
  name: string
  address: string
  lat: number
  lng: number
  phone: string
  distance: number
  bearing: string
}

function PitchesPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, isDriver } = useAuth()
  const supabase = createClient()
  
  const [currentLocation, setCurrentLocation] = useState<GeolocationCoordinates | null>(null)
  const [nearbyShops, setNearbyShops] = useState<NearbyShop[]>([])
  const [selectedShop, setSelectedShop] = useState<NearbyShop | null>(null)
  const [isLoadingLocation, setIsLoadingLocation] = useState(false)
  const [gpsVerified, setGpsVerified] = useState<boolean | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showPitchForm, setShowPitchForm] = useState(false)
  
  const fromDelivery = searchParams.get('from') === 'delivery'

  // Protect route
  useEffect(() => {
    if (!user || !isDriver) {
      router.push('/')
    }
  }, [user, isDriver, router])

  // Get pitch history
  const { 
    pitches, 
    logPitch,
    getCurrentPosition 
  } = useRealtimePitches({
    driver_id: user?.id
  })

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors }
  } = useForm<PitchFormData>({
    resolver: zodResolver(pitchSchema),
    defaultValues: {
      decision_maker_contacted: false,
      interest_level: 'none',
      potential_order_value: 0,
      follow_up_required: false
    }
  })

  const watchInterestLevel = watch('interest_level')
  const watchDecisionMaker = watch('decision_maker_contacted')
  const watchFollowUp = watch('follow_up_required')

  // Calculate distance between two coordinates
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3959 // Radius of Earth in miles
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return R * c
  }

  // Get cardinal direction
  const getCardinalDirection = (lat1: number, lon1: number, lat2: number, lon2: number): string => {
    const dLon = lon2 - lon1
    const dLat = lat2 - lat1
    const angle = Math.atan2(dLon, dLat) * 180 / Math.PI
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
    const index = Math.round(((angle + 360) % 360) / 45) % 8
    return directions[index]
  }

  // Find nearby shops based on actual GPS location
  const findNearbyShops = useCallback(async () => {
    setIsLoadingLocation(true)
    
    try {
      const position = await getCurrentPosition()
      const coords = position.coords
      setCurrentLocation(coords)
      
      // Generate shops around the current location
      const generatedShops = generateNearbyMufflerShops(coords.latitude, coords.longitude)
      
      // Calculate distances and sort shops
      const shopsWithDistance = generatedShops.map(shop => {
        const distance = calculateDistance(coords.latitude, coords.longitude, shop.lat, shop.lng)
        const bearing = getCardinalDirection(coords.latitude, coords.longitude, shop.lat, shop.lng)
        return {
          ...shop,
          distance,
          bearing
        }
      }).sort((a, b) => a.distance - b.distance).slice(0, 5)
      
      setNearbyShops(shopsWithDistance)
      
      // Log location check
      await logDriverLocation(user?.id || '', 'pitch_location_check')
      
      toast.success(`Found ${shopsWithDistance.length} muffler shops nearby`, {
        icon: '📍',
        duration: 3000
      })
      
      // Haptic feedback
      if (window.navigator.vibrate) {
        window.navigator.vibrate(10)
      }
    } catch (error) {
      console.error('Failed to get location:', error)
      toast.error('Please enable location services to find nearby shops')
    } finally {
      setIsLoadingLocation(false)
    }
  }, [getCurrentPosition, user?.id])

  // Auto-find shops if coming from delivery
  useEffect(() => {
    if (fromDelivery) {
      findNearbyShops()
    }
  }, [fromDelivery, findNearbyShops])

  // Verify GPS at shop location
  const verifyShopArrival = async (shop: NearbyShop) => {
    try {
      const position = await getCurrentPosition()
      const distance = calculateDistance(
        position.coords.latitude,
        position.coords.longitude,
        shop.lat,
        shop.lng
      )
      
      // Within 0.1 miles (~500 feet) is considered "at location"
      const isAtLocation = distance <= 0.1
      setGpsVerified(isAtLocation)
      
      if (isAtLocation) {
        toast.success('GPS verified - You are at the shop location', {
          icon: '✅',
          duration: 3000
        })
      } else {
        toast.warning(`You are ${distance.toFixed(2)} miles from the shop`, {
          icon: '⚠️',
          duration: 4000
        })
      }
      
      return isAtLocation
    } catch (error) {
      setGpsVerified(false)
      toast.error('Could not verify GPS location')
      return false
    }
  }

  // Select shop and open pitch form
  const handleSelectShop = async (shop: NearbyShop) => {
    setSelectedShop(shop)
    setValue('shop_visited', shop.name)
    
    // Verify GPS location
    const verified = await verifyShopArrival(shop)
    
    setShowPitchForm(true)
  }

  // Submit pitch
  const onSubmit = async (data: PitchFormData) => {
    if (!user || !selectedShop) return
    
    setIsSubmitting(true)
    
    try {
      // Get current location for verification
      const position = await getCurrentPosition()
      
      // Calculate actual distance for verification
      const actualDistance = calculateDistance(
        position.coords.latitude,
        position.coords.longitude,
        selectedShop.lat,
        selectedShop.lng
      )
      
      // Determine verification status
      let verificationStatus: 'verified' | 'questionable' | 'flagged' = 'verified'
      if (actualDistance > 0.5) {
        verificationStatus = 'flagged'
      } else if (actualDistance > 0.1) {
        verificationStatus = 'questionable'
      }
      
      // Log the pitch
      await logPitch.mutateAsync({
        driver_id: user.id,
        customer_id: null,
        shop_name: selectedShop.name,
        contact_name: selectedShop.address,
        phone: selectedShop.phone,
        pitch_date: new Date().toISOString(),
        decision_maker_contacted: data.decision_maker_contacted,
        decision_maker_name: data.decision_maker_name || null,
        interest_level: data.interest_level,
        potential_order_value: data.potential_order_value,
        follow_up_required: data.follow_up_required,
        follow_up_date: data.follow_up_date || null,
        notes: data.notes || null,
        location_verified: gpsVerified || false,
        verification_status: verificationStatus,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        auto_verify_location: false
      })
      
      toast.success('Pitch logged successfully!', {
        icon: '🎯',
        duration: 5000
      })
      
      // Reset form
      reset()
      setSelectedShop(null)
      setShowPitchForm(false)
      setGpsVerified(null)
      
      // Refresh nearby shops
      if (nearbyShops.length === 0) {
        findNearbyShops()
      }
      
    } catch (error) {
      console.error('Failed to log pitch:', error)
      toast.error('Failed to log pitch. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Today's stats
  const todayPitches = pitches.filter(p => {
    const today = new Date()
    const pitchDate = new Date(p.pitch_date)
    return pitchDate.toDateString() === today.toDateString()
  })
  
  const highInterestToday = todayPitches.filter(p => p.interest_level === 'high').length
  const successRate = todayPitches.length > 0 
    ? (highInterestToday / todayPitches.length * 100).toFixed(0)
    : '0'

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
                <h1 className="text-[17px] font-semibold text-gray-900">Sales Pitches</h1>
                <p className="text-[13px] text-gray-500 mt-0.5">
                  Find and pitch to muffler shops
                </p>
              </div>
            </div>
            <Target className="w-6 h-6 text-blue-600" />
          </div>
        </div>
      </header>

      {/* Today's Stats */}
      <div className="px-5 py-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <div className="text-center">
              <p className="text-[24px] font-bold text-gray-900">{todayPitches.length}</p>
              <p className="text-[11px] text-gray-500 mt-1">Today's Pitches</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <div className="text-center">
              <p className="text-[24px] font-bold text-green-600">{highInterestToday}</p>
              <p className="text-[11px] text-gray-500 mt-1">High Interest</p>
            </div>
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200">
            <div className="text-center">
              <p className="text-[24px] font-bold text-blue-600">{successRate}%</p>
              <p className="text-[11px] text-gray-500 mt-1">Success Rate</p>
            </div>
          </div>
        </div>
      </div>

      {/* Find Shops Button or Nearby Shops List */}
      <div className="px-5 py-4">
        {nearbyShops.length === 0 && !isLoadingLocation ? (
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={findNearbyShops}
            disabled={isLoadingLocation}
            className="w-full bg-blue-600 text-white rounded-2xl p-5 shadow-sm active:bg-blue-700 transition-colors flex items-center justify-center gap-3"
          >
            <Search className="w-6 h-6" />
            <span className="text-[17px] font-semibold">Find Shops Near Me</span>
          </motion.button>
        ) : isLoadingLocation ? (
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200">
            <div className="text-center">
              <Navigation className="w-12 h-12 text-blue-600 mx-auto mb-3 animate-pulse" />
              <p className="text-[15px] text-gray-600">Finding nearby muffler shops...</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-semibold text-gray-900">Nearby Muffler Shops</h2>
              <button
                onClick={findNearbyShops}
                className="text-[13px] text-blue-600 font-medium active:text-blue-700"
              >
                Refresh
              </button>
            </div>
            
            <AnimatePresence>
              {nearbyShops.map((shop, index) => (
                <motion.div
                  key={shop.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 active:scale-[0.98] transition-transform"
                  onClick={() => handleSelectShop(shop)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Building2 className="w-4 h-4 text-blue-600" />
                        <p className="font-semibold text-[15px] text-gray-900">{shop.name}</p>
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3 h-3 text-gray-400" />
                          <p className="text-[13px] text-gray-600">{shop.address}</p>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Phone className="w-3 h-3 text-gray-400" />
                          <p className="text-[13px] text-gray-600">{shop.phone}</p>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <Route className="w-3 h-3 text-green-600" />
                          <p className="text-[13px] font-medium text-green-600">
                            {shop.distance.toFixed(1)} miles {shop.bearing}
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="ml-3">
                      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                        <Target className="w-5 h-5 text-blue-600" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Recent Pitches */}
      {todayPitches.length > 0 && (
        <div className="px-5 py-4 border-t border-gray-100">
          <h2 className="text-[15px] font-semibold text-gray-900 mb-3">Today's Activity</h2>
          <div className="space-y-2">
            {todayPitches.slice(0, 3).map((pitch, index) => (
              <motion.div
                key={pitch.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-gray-50 rounded-xl p-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-gray-900">
                      {pitch.shop_name || 'Unknown Shop'}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {new Date(pitch.pitch_date).toLocaleTimeString('en-US', { 
                        hour: 'numeric', 
                        minute: '2-digit' 
                      })}
                    </p>
                  </div>
                  <div className={`px-2 py-1 rounded-full text-[11px] font-medium ${
                    pitch.interest_level === 'high' ? 'bg-green-100 text-green-700' :
                    pitch.interest_level === 'medium' ? 'bg-yellow-100 text-yellow-700' :
                    pitch.interest_level === 'low' ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {pitch.interest_level}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Pitch Form Modal */}
      <AnimatePresence>
        {showPitchForm && selectedShop && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-end justify-center z-50"
            onClick={() => setShowPitchForm(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-white rounded-t-3xl p-6 w-full max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 20px)' }}
            >
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-[20px] font-bold text-gray-900">Log Pitch</h2>
                  <p className="text-[13px] text-gray-500 mt-1">{selectedShop.name}</p>
                </div>
                <button
                  onClick={() => setShowPitchForm(false)}
                  className="p-2 active:scale-95 transition-transform"
                >
                  <ArrowLeft className="w-6 h-6 text-gray-400 rotate-180" />
                </button>
              </div>

              {/* GPS Verification Status */}
              <div className={`rounded-2xl p-4 mb-4 border-2 ${
                gpsVerified === null ? 'bg-orange-50 border-orange-200' :
                gpsVerified ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
              }`}>
                <div className="flex items-center gap-2">
                  <Navigation className={`w-5 h-5 ${
                    gpsVerified === null ? 'text-orange-600' :
                    gpsVerified ? 'text-green-600' : 'text-yellow-600'
                  }`} />
                  <span className={`text-[15px] font-semibold ${
                    gpsVerified === null ? 'text-orange-900' :
                    gpsVerified ? 'text-green-900' : 'text-yellow-900'
                  }`}>
                    {gpsVerified === null ? 'Verifying location...' :
                     gpsVerified ? 'Location verified - At shop' : 
                     'Not at shop location'}
                  </span>
                </div>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {/* Decision Maker Contact */}
                <div>
                  <label className="flex items-center gap-3 mb-3">
                    <input
                      type="checkbox"
                      {...register('decision_maker_contacted')}
                      className="w-5 h-5 text-blue-600 rounded"
                    />
                    <span className="text-[15px] font-medium text-gray-700">
                      Spoke with decision maker
                    </span>
                  </label>
                  
                  {watchDecisionMaker && (
                    <div className="space-y-3 ml-8">
                      <input
                        {...register('decision_maker_name')}
                        placeholder="Decision maker name"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[15px]"
                      />
                      <input
                        {...register('decision_maker_phone')}
                        placeholder="Phone number (optional)"
                        className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[15px]"
                      />
                    </div>
                  )}
                </div>

                {/* Interest Level */}
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-3">
                    Interest Level
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: 'high', label: 'High', color: 'green', icon: Star },
                      { value: 'medium', label: 'Medium', color: 'yellow', icon: TrendingUp },
                      { value: 'low', label: 'Low', color: 'orange', icon: AlertCircle },
                      { value: 'none', label: 'None', color: 'gray', icon: Clock }
                    ].map(({ value, label, color, icon: Icon }) => (
                      <label
                        key={value}
                        className={`relative flex items-center justify-center p-4 rounded-xl border-2 transition-all ${
                          watchInterestLevel === value
                            ? `bg-${color}-50 border-${color}-300`
                            : 'bg-white border-gray-200'
                        }`}
                      >
                        <input
                          type="radio"
                          value={value}
                          {...register('interest_level')}
                          className="sr-only"
                        />
                        <div className="flex flex-col items-center gap-2">
                          <Icon className={`w-5 h-5 ${
                            watchInterestLevel === value ? `text-${color}-600` : 'text-gray-400'
                          }`} />
                          <span className={`text-[13px] font-medium ${
                            watchInterestLevel === value ? `text-${color}-700` : 'text-gray-600'
                          }`}>
                            {label}
                          </span>
                        </div>
                      </label>
                    ))}
                  </div>
                  {errors.interest_level && (
                    <p className="text-red-500 text-[12px] mt-2">{errors.interest_level.message}</p>
                  )}
                </div>

                {/* Potential Order Value */}
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-2">
                    Potential Order Value
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    {...register('potential_order_value', { valueAsNumber: true })}
                    placeholder="Enter estimated value"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[15px]"
                  />
                  {errors.potential_order_value && (
                    <p className="text-red-500 text-[12px] mt-2">{errors.potential_order_value.message}</p>
                  )}
                </div>

                {/* Follow-up Required */}
                <div>
                  <label className="flex items-center gap-3 mb-3">
                    <input
                      type="checkbox"
                      {...register('follow_up_required')}
                      className="w-5 h-5 text-blue-600 rounded"
                    />
                    <span className="text-[15px] font-medium text-gray-700">
                      Follow-up required
                    </span>
                  </label>
                  
                  {watchFollowUp && (
                    <input
                      type="date"
                      {...register('follow_up_date')}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[15px] ml-8"
                    />
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-[13px] font-medium text-gray-700 mb-2">
                    Notes
                  </label>
                  <textarea
                    {...register('notes')}
                    rows={3}
                    placeholder="Additional details..."
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 text-[15px] resize-none"
                  />
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-blue-600 text-white py-4 rounded-xl font-semibold text-[16px] active:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Logging Pitch...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      <span>Log Pitch</span>
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Safe Area */}
      <div style={{ height: 'env(safe-area-inset-bottom)' }} />
    </div>
  )
}

export default function PitchesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-500">Loading...</div></div>}>
      <PitchesPageContent />
    </Suspense>
  )
}