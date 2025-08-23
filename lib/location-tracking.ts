import React from 'react'
import { createClient } from '@/lib/supabase/client'

export interface LocationData {
  latitude: number
  longitude: number
  accuracy?: number
  speed?: number
  heading?: number
}

export interface DriverLocationEntry {
  driver_id: string
  latitude: number
  longitude: number
  accuracy: number | null
  speed: number | null
  heading: number | null
  recorded_at: string
}

export class LocationTracker {
  private supabase = createClient()
  private watchId: number | null = null
  private isTracking = false
  private lastLoggedTime = 0
  private readonly MIN_LOG_INTERVAL = 30000 // 30 seconds minimum between logs
  private readonly MIN_DISTANCE_THRESHOLD = 50 // 50 meters minimum movement

  constructor(private driverId: string) {}

  async logLocation(position: GeolocationPosition, context?: string): Promise<void> {
    try {
      const locationData: DriverLocationEntry = {
        driver_id: this.driverId,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        speed: (position.coords as GeolocationCoordinates & {speed?: number}).speed || null,
        heading: (position.coords as GeolocationCoordinates & {heading?: number}).heading || null,
        recorded_at: new Date().toISOString()
      }

      const { error } = await this.supabase
        .from('driver_locations')
        .insert(locationData as Record<string, unknown>)

      if (error) {
        console.error('Failed to log driver location:', error)
      } else if (context) {
        console.log(`Driver location logged: ${context}`)
      }
    } catch (error) {
      console.error('Location logging error:', error)
    }
  }

  async getCurrentLocationAndLog(context?: string): Promise<GeolocationPosition | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null)
        return
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          await this.logLocation(position, context)
          resolve(position)
        },
        (error) => {
          console.warn('Failed to get current location:', error)
          resolve(null)
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000 // 30 seconds
        }
      )
    })
  }

  startTracking(options?: {
    highAccuracy?: boolean
    interval?: number
    distanceThreshold?: number
  }): void {
    if (this.isTracking || !navigator.geolocation) return

    const {
      highAccuracy = true,
      interval = 60000, // 1 minute default
      distanceThreshold = this.MIN_DISTANCE_THRESHOLD
    } = options || {}

    let lastPosition: GeolocationPosition | null = null

    this.watchId = navigator.geolocation.watchPosition(
      async (position) => {
        const now = Date.now()
        
        // Check time threshold
        if (now - this.lastLoggedTime < this.MIN_LOG_INTERVAL) {
          return
        }

        // Check distance threshold if we have a last position
        if (lastPosition && distanceThreshold > 0) {
          const distance = this.calculateDistance(
            lastPosition.coords.latitude,
            lastPosition.coords.longitude,
            position.coords.latitude,
            position.coords.longitude
          )

          if (distance < distanceThreshold) {
            return
          }
        }

        await this.logLocation(position, 'tracking')
        this.lastLoggedTime = now
        lastPosition = position
      },
      (error) => {
        console.warn('Location tracking error:', error)
      },
      {
        enableHighAccuracy: highAccuracy,
        timeout: 15000,
        maximumAge: interval
      }
    )

    this.isTracking = true
  }

  stopTracking(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId)
      this.watchId = null
    }
    this.isTracking = false
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000 // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return R * c
  }

  cleanup(): void {
    this.stopTracking()
  }
}

// Utility function for one-off location logging
export async function logDriverLocation(
  driverId: string, 
  context?: string
): Promise<GeolocationPosition | null> {
  const tracker = new LocationTracker(driverId)
  return tracker.getCurrentLocationAndLog(context)
}

// React hook for location tracking
export function useLocationTracking(driverId: string | null) {
  const [tracker, setTracker] = React.useState<LocationTracker | null>(null)
  const [isTracking, setIsTracking] = React.useState(false)

  React.useEffect(() => {
    if (driverId) {
      const newTracker = new LocationTracker(driverId)
      setTracker(newTracker)

      return () => {
        newTracker.cleanup()
      }
    }
  }, [driverId])

  const startTracking = React.useCallback((options?: Parameters<LocationTracker['startTracking']>[0]) => {
    if (tracker) {
      tracker.startTracking(options)
      setIsTracking(true)
    }
  }, [tracker])

  const stopTracking = React.useCallback(() => {
    if (tracker) {
      tracker.stopTracking()
      setIsTracking(false)
    }
  }, [tracker])

  const logCurrentLocation = React.useCallback(async (context?: string) => {
    if (tracker) {
      return tracker.getCurrentLocationAndLog(context)
    }
    return null
  }, [tracker])

  return {
    startTracking,
    stopTracking,
    logCurrentLocation,
    isTracking
  }
}