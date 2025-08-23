import { useEffect, useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { realtimeManager } from '@/lib/supabase/realtime'
import { toast } from 'react-hot-toast'
import { Database } from '@/types/database'

type PitchAttempt = Database['public']['Tables']['pitch_attempts']['Row']
type PitchInsert = Database['public']['Tables']['pitch_attempts']['Insert']
type InterestLevel = Database['public']['Tables']['pitch_attempts']['Row']['interest_level']

export interface PitchWithDetails extends PitchAttempt {
  driver: {
    id: string
    name: string
  }
  customer?: {
    id: string
    shop_name: string
    current_balance: number
  }
  distance_from_last_location?: number
  time_since_last_activity?: number
  verification_score: number // 0-100 based on GPS, timing, etc.
}

export interface DriverPerformance {
  driver_id: string
  driver_name: string
  total_pitches: number
  successful_pitches: number
  success_rate: number
  potential_value: number
  last_activity: string
  verification_issues: number
  locations_visited: number
  average_pitch_value: number
}

export function useRealtimePitches(filters?: {
  driver_id?: string
  date_range?: { start: Date; end: Date }
  verification_status?: 'all' | 'verified' | 'questionable' | 'flagged'
  interest_level?: InterestLevel
}) {
  const supabase = createClient()
  const queryClient = useQueryClient()
  const [connectionStatus, setConnectionStatus] = useState(true)

  // Build query
  const buildQuery = useCallback(() => {
    let query = supabase
      .from('pitch_attempts')
      .select(`
        *,
        driver:users!driver_id(id, name),
        customer:customers(id, shop_name, current_balance)
      `)
      .order('pitch_date', { ascending: false })

    if (filters?.driver_id) {
      query = query.eq('driver_id', filters.driver_id)
    }

    if (filters?.date_range) {
      query = query
        .gte('pitch_date', filters.date_range.start.toISOString())
        .lte('pitch_date', filters.date_range.end.toISOString())
    }

    if (filters?.verification_status && filters.verification_status !== 'all') {
      query = query.eq('verification_status', filters.verification_status)
    }

    if (filters?.interest_level) {
      query = query.eq('interest_level', filters.interest_level)
    }

    return query
  }, [filters, supabase])

  // Fetch pitches
  const { data: pitches, isLoading, error, refetch } = useQuery({
    queryKey: ['pitches', filters],
    queryFn: async () => {
      const { data, error } = await buildQuery()
      if (error) throw error
      
      // Enhance with verification scoring and analysis
      const enhancedData: PitchWithDetails[] = await Promise.all((data || []).map(async (pitch) => {
        let verificationScore = 100
        let distanceFromLast = 0
        let timeSinceLast = 0

        // Get driver's previous location for distance calculation
        if (pitch.latitude && pitch.longitude) {
          const { data: prevLocation } = await supabase
            .from('pitch_attempts')
            .select('latitude, longitude, pitch_date')
            .eq('driver_id', pitch.driver_id)
            .lt('pitch_date', pitch.pitch_date)
            .order('pitch_date', { ascending: false })
            .limit(1)
            .single()

          if (prevLocation?.latitude && prevLocation?.longitude) {
            distanceFromLast = calculateDistance(
              pitch.latitude,
              pitch.longitude,
              prevLocation.latitude,
              prevLocation.longitude
            )
            
            timeSinceLast = new Date(pitch.pitch_date).getTime() - new Date(prevLocation.pitch_date).getTime()
            
            // Adjust score based on realistic travel patterns
            if (distanceFromLast > 50 && timeSinceLast < 30 * 60 * 1000) { // >50km in <30min
              verificationScore -= 30
            }
            
            if (distanceFromLast < 0.1 && timeSinceLast > 2 * 60 * 60 * 1000) { // Same spot >2 hours later
              verificationScore -= 20
            }
          }
        } else {
          // No GPS data
          verificationScore -= 40
        }

        // Business hours check
        const pitchHour = new Date(pitch.pitch_date).getHours()
        if (pitchHour < 8 || pitchHour > 18) {
          verificationScore -= 15
        }

        // Weekend check
        const pitchDay = new Date(pitch.pitch_date).getDay()
        if (pitchDay === 0 || pitchDay === 6) {
          verificationScore -= 10
        }

        return {
          ...pitch,
          distance_from_last_location: distanceFromLast,
          time_since_last_activity: timeSinceLast,
          verification_score: Math.max(0, Math.min(100, verificationScore))
        }
      }))
      
      return enhancedData
    },
    refetchInterval: connectionStatus ? 15000 : false, // More frequent for real-time pitch monitoring
  })

  // Calculate driver performance metrics
  const driverPerformance = useQuery({
    queryKey: ['driver-performance', filters],
    queryFn: async (): Promise<DriverPerformance[]> => {
      const { data: drivers, error } = await supabase
        .from('users')
        .select(`
          id,
          name,
          pitch_attempts!driver_id(*)
        `)
        .eq('role', 'driver')
        .eq('is_active', true)

      if (error) throw error

      return drivers.map(driver => {
        const driverPitches = driver.pitch_attempts || []
        let filteredPitches = driverPitches

        // Apply filters
        if (filters?.date_range) {
          filteredPitches = driverPitches.filter(p => {
            const pitchDate = new Date(p.pitch_date)
            return pitchDate >= filters.date_range!.start && pitchDate <= filters.date_range!.end
          })
        }

        const totalPitches = filteredPitches.length
        const successfulPitches = filteredPitches.filter(p => p.interest_level === 'high').length
        const successRate = totalPitches > 0 ? (successfulPitches / totalPitches) * 100 : 0
        const potentialValue = filteredPitches.reduce((sum, p) => sum + (p.potential_order_value || 0), 0)
        const verificationIssues = filteredPitches.filter(p => p.verification_status === 'flagged').length
        
        // Calculate unique locations (within 100m radius)
        const locations = new Set()
        filteredPitches.forEach(p => {
          if (p.latitude && p.longitude) {
            const key = `${Math.floor(p.latitude * 1000)},${Math.floor(p.longitude * 1000)}`
            locations.add(key)
          }
        })

        const lastActivity = filteredPitches.length > 0 
          ? filteredPitches.sort((a, b) => new Date(b.pitch_date).getTime() - new Date(a.pitch_date).getTime())[0].pitch_date
          : driver.last_login || driver.created_at

        return {
          driver_id: driver.id,
          driver_name: driver.name,
          total_pitches: totalPitches,
          successful_pitches: successfulPitches,
          success_rate: successRate,
          potential_value: potentialValue,
          last_activity: lastActivity,
          verification_issues: verificationIssues,
          locations_visited: locations.size,
          average_pitch_value: totalPitches > 0 ? potentialValue / totalPitches : 0
        }
      }).sort((a, b) => b.success_rate - a.success_rate)
    },
    enabled: !!pitches,
    refetchInterval: 30000,
  })

  // Set up real-time subscription
  useEffect(() => {
    const channel = realtimeManager.subscribe({
      table: 'pitch_attempts',
      callback: (payload) => {
        queryClient.setQueryData(['pitches', filters], (old: PitchWithDetails[] | undefined) => {
          if (!old) return old

          switch (payload.eventType) {
            case 'INSERT':
              // Get driver name for the new pitch
              supabase
                .from('users')
                .select('id, name')
                .eq('id', payload.new.driver_id)
                .single()
                .then(({ data: driver }) => {
                  if (driver) {
                    const newPitch: PitchWithDetails = {
                      ...payload.new,
                      driver,
                      verification_score: payload.new.latitude && payload.new.longitude ? 85 : 45 // Initial score
                    }

                    queryClient.setQueryData(['pitches', filters], (current: PitchWithDetails[] | undefined) => {
                      if (!current) return [newPitch]
                      return [newPitch, ...current]
                    })

                    // Show real-time notification with sound
                    const driverName = driver.name
                    const interestLevel = payload.new.interest_level
                    const icon = interestLevel === 'high' ? '🎯' : interestLevel === 'medium' ? '👍' : '👎'
                    
                    toast.success(`${driverName} logged a ${interestLevel} interest pitch!`, {
                      icon,
                      duration: 5000,
                    })

                    // Play sound for high interest pitches
                    if (interestLevel === 'high' && typeof window !== 'undefined' && window.Audio) {
                      const audio = new Audio('/success.mp3')
                      audio.play().catch(() => {})
                    }

                    // Haptic feedback
                    if (window.navigator.vibrate) {
                      window.navigator.vibrate(interestLevel === 'high' ? [100, 50, 100] : [50])
                    }
                  }
                })
              
              return old

            case 'UPDATE':
              return old.map(pitch => 
                pitch.id === payload.new.id 
                  ? { ...pitch, ...payload.new }
                  : pitch
              )

            case 'DELETE':
              return old.filter(pitch => pitch.id !== payload.old.id)

            default:
              return old
          }
        })

        // Trigger driver performance recalculation
        queryClient.invalidateQueries({ queryKey: ['driver-performance'] })
      },
      onError: (error) => {
        console.error('Pitches subscription error:', error)
        setConnectionStatus(false)
      },
    })

    return () => {
      realtimeManager.unsubscribe(channel)
    }
  }, [filters, queryClient, supabase])

  // Log new pitch with GPS verification
  const logPitch = useMutation({
    mutationFn: async (pitchData: PitchInsert & { auto_verify_location?: boolean }) => {
      let finalPitchData = { ...pitchData }

      // Get current location if not provided and auto-verify is enabled
      if (pitchData.auto_verify_location && !pitchData.latitude && !pitchData.longitude) {
        try {
          const position = await getCurrentPosition()
          finalPitchData.latitude = position.coords.latitude
          finalPitchData.longitude = position.coords.longitude
          finalPitchData.location_verified = true
        } catch (error) {
          console.warn('Failed to get GPS location:', error)
          finalPitchData.location_verified = false
        }
      }

      // Determine verification status based on various factors
      let verificationStatus = 'verified'
      
      if (!finalPitchData.latitude || !finalPitchData.longitude) {
        verificationStatus = 'questionable'
      }

      // Check for suspicious timing patterns
      const now = new Date()
      const pitchTime = new Date(finalPitchData.pitch_date)
      const timeDiff = Math.abs(now.getTime() - pitchTime.getTime())
      
      if (timeDiff > 2 * 60 * 60 * 1000) { // More than 2 hours ago
        verificationStatus = 'questionable'
      }

      finalPitchData.verification_status = verificationStatus

      const { data, error } = await supabase
        .from('pitch_attempts')
        .insert(finalPitchData)
        .select(`
          *,
          driver:users!driver_id(id, name)
        `)
        .single()

      if (error) throw error
      return data
    },
    onMutate: async (pitchData) => {
      // Haptic feedback
      if (window.navigator.vibrate) {
        window.navigator.vibrate(10)
      }

      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['pitches', filters] })
      
      const previousPitches = queryClient.getQueryData(['pitches', filters])
      
      // We don't have complete driver data yet, so we'll let the real-time subscription handle it
      return { previousPitches }
    },
    onError: (err, pitchData, context) => {
      queryClient.setQueryData(['pitches', filters], context?.previousPitches)
      toast.error('Failed to log pitch attempt')
    },
  })

  // Update pitch verification status (admin only)
  const updateVerificationStatus = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const { error } = await supabase
        .from('pitch_attempts')
        .update({ 
          verification_status: status,
          notes: notes 
        })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Verification status updated')
    },
    onError: () => {
      toast.error('Failed to update verification status')
    },
  })

  // Helper function to get current GPS position
  const getCurrentPosition = (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'))
        return
      }

      navigator.geolocation.getCurrentPosition(
        resolve,
        reject,
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minutes
        }
      )
    })
  }

  return {
    pitches: pitches || [],
    driverPerformance: driverPerformance.data || [],
    isLoading: isLoading || driverPerformance.isLoading,
    error: error || driverPerformance.error,
    refetch,
    logPitch,
    updateVerificationStatus,
    connectionStatus,
    getCurrentPosition,
  }
}

// Helper function to calculate distance between two GPS coordinates
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371 // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c // Distance in kilometers
}