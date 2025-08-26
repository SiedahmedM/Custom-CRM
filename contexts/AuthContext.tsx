'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'react-hot-toast'
import { Database } from '@/types/database'
import { checkConnectivity, isNetworkError } from '@/lib/utils/connectivity'
import { cacheUserForOffline, validateOfflineCredentials, clearOfflineCache } from '@/lib/utils/offline-auth'

interface User {
  id: string
  access_key: string
  name: string
  role: 'admin' | 'driver'
  phone?: string
  email?: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (accessKey: string) => Promise<void>
  logout: () => Promise<void>
  isAdmin: boolean
  isDriver: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkUser()
  }, [])

  const checkUser = async () => {
    try {
      const storedKey = localStorage.getItem('access_key')
      if (storedKey) {
        const { data: userRecordRaw, error } = await supabase
          .from('users')
          .select('*')
          .eq('access_key', storedKey)
          .eq('is_active', true)
          .single()
        const userRecord = userRecordRaw as (Database['public']['Tables']['users']['Row'] | null)

        if (userRecord && !error) {
          setUser({
            id: userRecord.id,
            access_key: userRecord.access_key,
            name: userRecord.name,
            role: userRecord.role,
            phone: userRecord.phone || undefined,
            email: userRecord.email || undefined,
          })
          
          // Update last login
          await supabase
            .from('users')
            // @ts-expect-error Supabase typing inference issue for Update payload
            .update({ last_login: new Date().toISOString() })
            .eq('id', userRecord.id)
        } else {
          localStorage.removeItem('access_key')
        }
      }
    } catch (error) {
      console.error('Error checking user:', error)
    } finally {
      setLoading(false)
    }
  }

  const login = async (accessKey: string) => {
    try {
      setLoading(true)
      
      // Check connectivity before attempting login
      const isConnected = await checkConnectivity()
      if (!isConnected) {
        // Try offline validation with cached credentials
        const cachedUser = await validateOfflineCredentials(accessKey)
        if (cachedUser) {
          setUser({
            id: cachedUser.id,
            access_key: accessKey,
            name: cachedUser.name,
            role: cachedUser.role,
            phone: cachedUser.phone,
            email: cachedUser.email,
          })
          
          toast.success(`Welcome back, ${cachedUser.name}! (Offline mode)`)
          
          // Redirect based on role
          if (cachedUser.role === 'admin') {
            router.push('/admin')
          } else {
            router.push('/driver')
          }
          return
        } else {
          toast.error('No internet connection. Please connect to wifi or mobile data to sign in for the first time.')
          throw new Error('No internet connection and no cached credentials')
        }
      }
      
      const { data: userRecordRaw, error } = await supabase
        .from('users')
        .select('*')
        .eq('access_key', accessKey)
        .eq('is_active', true)
        .single()
      const userRecord = userRecordRaw as (Database['public']['Tables']['users']['Row'] | null)

      if (error || !userRecord) {
        toast.error('Invalid key, please try again')
        throw new Error('Invalid access key')
      }

      const newUser = {
        id: userRecord.id,
        access_key: userRecord.access_key,
        name: userRecord.name,
        role: userRecord.role,
        phone: userRecord.phone || undefined,
        email: userRecord.email || undefined,
      }
      
      setUser(newUser)
      localStorage.setItem('access_key', accessKey)
      
      // Cache user for offline access
      await cacheUserForOffline(newUser, accessKey)
      
      // Update last login
      await supabase
        .from('users')
        // @ts-expect-error Supabase typing inference issue for Update payload
        .update({ last_login: new Date().toISOString() })
        .eq('id', userRecord.id)

      // Log activity
      await supabase
        .from('activity_logs')
        // @ts-expect-error Supabase insert typing inference issue; payload matches schema
        .insert({
          user_id: userRecord.id,
          action: 'login',
          details: { timestamp: new Date().toISOString() }
        })

      toast.success(`Welcome back, ${userRecord.name}!`)
      
      // Redirect based on role
      if (userRecord.role === 'admin') {
        router.push('/admin')
      } else {
        router.push('/driver')
      }
    } catch (error) {
      console.error('Login error:', error)
      
      // Additional network error handling for edge cases
      if (isNetworkError(error)) {
        toast.error('Connection failed. Please check your internet connection and try again.')
      }
      
      throw error
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try {
      if (user) {
        // Log activity
        await supabase
          .from('activity_logs')
          // @ts-expect-error Supabase insert typing inference issue; payload matches schema
          .insert({
            user_id: user.id,
            action: 'logout',
            details: { timestamp: new Date().toISOString() }
          })
      }

      setUser(null)
      localStorage.removeItem('access_key')
      clearOfflineCache()
      router.push('/')
      toast.success('Logged out successfully')
    } catch (error) {
      console.error('Logout error:', error)
      toast.error('Error logging out')
    }
  }

  const value = {
    user,
    loading,
    login,
    logout,
    isAdmin: user?.role === 'admin',
    isDriver: user?.role === 'driver'
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}