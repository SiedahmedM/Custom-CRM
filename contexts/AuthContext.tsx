'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'react-hot-toast'

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
        const { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('access_key', storedKey)
          .eq('is_active', true)
          .single()

        if (data && !error) {
          setUser(data)
          
          // Update last login
          await supabase
            .from('users')
            .update({ last_login: new Date().toISOString() })
            .eq('id', data.id)
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
      
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('access_key', accessKey)
        .eq('is_active', true)
        .single()

      if (error || !data) {
        toast.error('Invalid key, please try again')
        throw new Error('Invalid access key')
      }

      setUser(data)
      localStorage.setItem('access_key', accessKey)
      
      // Update last login
      await supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.id)

      // Log activity
      await supabase
        .from('activity_logs')
        .insert({
          user_id: data.id,
          action: 'login',
          details: { timestamp: new Date().toISOString() }
        })

      toast.success(`Welcome back, ${data.name}!`)
      
      // Redirect based on role
      if (data.role === 'admin') {
        router.push('/admin')
      } else {
        router.push('/driver')
      }
    } catch (error) {
      console.error('Login error:', error)
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
          .insert({
            user_id: user.id,
            action: 'logout',
            details: { timestamp: new Date().toISOString() }
          })
      }

      setUser(null)
      localStorage.removeItem('access_key')
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