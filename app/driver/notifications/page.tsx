'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { ArrowLeft, Bell, CheckCircle, AlertCircle, Package, DollarSign, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'react-hot-toast'

interface Notification {
  id: string
  title: string
  message: string
  type: 'order' | 'payment' | 'delivery' | 'system'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  is_read: boolean
  related_order_id: string | null
  created_at: string
}

export default function NotificationsPage() {
  const { user, isDriver } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Protect route
  useEffect(() => {
    if (!user || !isDriver) {
      router.push('/')
    }
  }, [user, isDriver, router])

  // Fetch notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      if (!user) return

      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50)

        if (error) throw error
        setNotifications(data || [])
      } catch (error) {
        console.error('Error fetching notifications:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchNotifications()
  }, [user, supabase])

  const markAsRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)

      if (error) throw error

      setNotifications(prev => 
        prev.map(notification => 
          notification.id === notificationId 
            ? { ...notification, is_read: true }
            : notification
        )
      )
    } catch (error) {
      console.error('Error marking notification as read:', error)
      toast.error('Failed to mark as read')
    }
  }

  const markAllAsRead = async () => {
    try {
      const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id)
      
      if (unreadIds.length === 0) return

      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .in('id', unreadIds)

      if (error) throw error

      setNotifications(prev => 
        prev.map(notification => ({ ...notification, is_read: true }))
      )

      toast.success('All notifications marked as read')
    } catch (error) {
      console.error('Error marking all as read:', error)
      toast.error('Failed to mark all as read')
    }
  }

  const getNotificationIcon = (type: string, priority: string) => {
    if (priority === 'urgent') {
      return <AlertCircle className="w-5 h-5 text-red-500" />
    }

    switch (type) {
      case 'order':
        return <Package className="w-5 h-5 text-blue-500" />
      case 'payment':
        return <DollarSign className="w-5 h-5 text-green-500" />
      case 'delivery':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      default:
        return <Bell className="w-5 h-5 text-gray-500" />
    }
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

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
                <h1 className="text-[17px] font-semibold text-gray-900">Notifications</h1>
                {unreadCount > 0 && (
                  <p className="text-[13px] text-blue-600 mt-0.5">
                    {unreadCount} unread
                  </p>
                )}
              </div>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-[13px] font-medium text-blue-600 active:text-blue-700"
              >
                Mark All Read
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="px-5 py-4">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-gray-200 animate-pulse rounded-2xl" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-12">
            <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-[17px] font-semibold text-gray-900 mb-2">
              No notifications
            </h3>
            <p className="text-[15px] text-gray-500">
              You're all caught up! New notifications will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {notifications.map((notification, index) => (
                <motion.div
                  key={notification.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`rounded-2xl p-4 shadow-sm border transition-all ${
                    notification.is_read 
                      ? 'bg-white border-gray-200' 
                      : 'bg-blue-50 border-blue-200'
                  } ${
                    notification.priority === 'urgent' 
                      ? 'border-red-200 bg-red-50' 
                      : ''
                  } active:scale-[0.98]`}
                  onClick={() => {
                    if (!notification.is_read) {
                      markAsRead(notification.id)
                    }
                    if (notification.related_order_id) {
                      router.push(`/driver/delivery/${notification.related_order_id}`)
                    }
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {getNotificationIcon(notification.type, notification.priority)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-1">
                        <h3 className={`text-[15px] font-semibold ${
                          notification.is_read ? 'text-gray-700' : 'text-gray-900'
                        }`}>
                          {notification.title}
                        </h3>
                        <div className="flex items-center gap-2 ml-2">
                          {notification.priority === 'urgent' && (
                            <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                              URGENT
                            </span>
                          )}
                          {!notification.is_read && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full" />
                          )}
                        </div>
                      </div>
                      
                      <p className={`text-[13px] mb-2 ${
                        notification.is_read ? 'text-gray-500' : 'text-gray-700'
                      }`}>
                        {notification.message}
                      </p>
                      
                      <div className="flex items-center gap-2">
                        <Clock className="w-3 h-3 text-gray-400" />
                        <span className="text-[11px] text-gray-500">
                          {format(new Date(notification.created_at), 'MMM d, h:mm a')}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                          notification.type === 'order' ? 'bg-blue-100 text-blue-700' :
                          notification.type === 'payment' ? 'bg-green-100 text-green-700' :
                          notification.type === 'delivery' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {notification.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Bottom Safe Area */}
      <div style={{ height: 'env(safe-area-inset-bottom)' }} />
    </div>
  )
}