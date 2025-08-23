'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import { ConnectionStatus } from '@/components/ConnectionStatus'
import { 
  Package,
  AlertTriangle,
  DollarSign,
  Clock,
  Navigation,
  Settings,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  ChevronRight
} from 'lucide-react'
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders'
import { format, isToday, isThisWeek, isThisMonth } from 'date-fns'
import { motion } from 'framer-motion'
import { toast } from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'
import { useQuery } from '@tanstack/react-query'

interface DashboardStats {
  todayOrders: number
  pendingOrders: number
  activeDeliveries: number
  todayRevenue: number
  outstandingBalance: number
  lowStockItems: number
  driverPerformance: Array<{
    id: string
    name: string
    todayDeliveries: number
    todayPitches: number
    successRate: number
    revenue: number
    lastActivity: string
  }>
}

export default function AdminDashboard() {
  const { user, isAdmin, logout } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const [refreshing, setRefreshing] = useState(false)
  const [selectedTimeFrame, setSelectedTimeFrame] = useState<'today' | 'week' | 'month'>('today')

  // Protect route
  useEffect(() => {
    if (!user || !isAdmin) {
      router.push('/')
    }
  }, [user, isAdmin, router])

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

  // Get real-time orders
  const { 
    orders, 
    updateOrderStatus,
    refetch: refetchOrders
  } = useRealtimeOrders()

  // Get dashboard stats
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ['dashboard-stats', selectedTimeFrame],
    queryFn: async (): Promise<DashboardStats> => {
      const now = new Date()
      let startDate: Date

      switch (selectedTimeFrame) {
        case 'today':
          startDate = new Date(now.setHours(0, 0, 0, 0))
          break
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
      }

      // Fetch orders for time frame
      const { data: timeFrameOrders } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers(*),
          driver:users(*)
        `)
        .gte('created_at', startDate.toISOString())

      // Fetch outstanding balances
      const { data: customers } = await supabase
        .from('customers')
        .select('current_balance')
        .gt('current_balance', 0)

      // Fetch all inventory items (filter low stock in JS)
      const { data: allInventory } = await supabase
        .from('inventory')
        .select('*')
      
      const inventory = (allInventory || []).filter((item: {current_quantity: number; reorder_threshold: number | null}) => 
        item.current_quantity <= (item.reorder_threshold || 0)
      )

      // Fetch driver performance
      const { data: drivers } = await supabase
        .from('users')
        .select(`
          *,
          orders:orders!driver_id(status, total_amount, created_at),
          pitches:pitch_attempts(interest_level, created_at)
        `)
        .eq('role', 'driver')
        .eq('is_active', true)

      const todayOrders = (timeFrameOrders || []).filter((o: {created_at: string}) => isToday(new Date(o.created_at)))
      const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'needs_reassignment') || []
      const activeDeliveries = orders.filter(o => o.status === 'out_for_delivery') || []
      const deliveredOrders = (timeFrameOrders || []).filter((o: {status: string}) => o.status === 'delivered')
      
      const outstandingBalance = (customers || []).reduce((sum, c: {current_balance: number}) => sum + c.current_balance, 0)
      const todayRevenue = deliveredOrders.reduce((sum, o: {total_amount: number}) => sum + o.total_amount, 0)

      // Calculate driver performance
      const driverPerformance = (drivers || []).map((driver: {id: string; name: string; last_login?: string; created_at: string; orders?: {status: string; total_amount: number; created_at: string}[]; pitches?: {interest_level: string; created_at: string}[]}) => {
        const driverOrders = driver.orders?.filter(o => 
          selectedTimeFrame === 'today' ? isToday(new Date(o.created_at)) :
          selectedTimeFrame === 'week' ? isThisWeek(new Date(o.created_at)) :
          isThisMonth(new Date(o.created_at))
        ) || []
        
        const driverPitches = driver.pitches?.filter(p => 
          selectedTimeFrame === 'today' ? isToday(new Date(p.created_at)) :
          selectedTimeFrame === 'week' ? isThisWeek(new Date(p.created_at)) :
          isThisMonth(new Date(p.created_at))
        ) || []

        const deliveredCount = driverOrders.filter(o => o.status === 'delivered').length
        const revenue = driverOrders.filter(o => o.status === 'delivered')
          .reduce((sum, o) => sum + o.total_amount, 0)
        
        const successfulPitches = driverPitches.filter(p => p.interest_level === 'high').length
        const successRate = driverPitches.length > 0 
          ? (successfulPitches / driverPitches.length) * 100 
          : 0

        return {
          id: driver.id,
          name: driver.name,
          todayDeliveries: deliveredCount,
          todayPitches: driverPitches.length,
          successRate,
          revenue,
          lastActivity: driver.last_login || driver.created_at
        }
      }) || []

      return {
        todayOrders: todayOrders.length,
        pendingOrders: pendingOrders.length,
        activeDeliveries: activeDeliveries.length,
        todayRevenue,
        outstandingBalance,
        lowStockItems: inventory?.length || 0,
        driverPerformance: driverPerformance.sort((a, b) => b.revenue - a.revenue)
      }
    },
    refetchInterval: 30000,
  })

  // Filter orders for display
  const urgentOrders = orders.filter(o => 
    o.status === 'needs_reassignment' || 
    (o.customer?.current_balance > 0 && o.status === 'pending')
  )

  const recentOrders = orders
    .filter(o => isToday(new Date(o.created_at)))
    .slice(0, 5)

  const handleRefresh = async () => {
    setRefreshing(true)
    // Haptic feedback
    if (window.navigator.vibrate) {
      window.navigator.vibrate(10)
    }
    
    await Promise.all([
      refetchOrders(),
      refetchStats()
    ])
    
    setRefreshing(false)
    toast.success('Dashboard refreshed')
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
            <div>
              <h1 className="text-[17px] font-semibold text-gray-900 tracking-tight">
                Admin Dashboard
              </h1>
              <p className="text-[13px] text-gray-500 mt-0.5">
                {format(new Date(), 'EEEE, MMMM d')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 active:scale-95 transition-transform"
              >
                <RefreshCw className={`w-[20px] h-[20px] text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={logout}
                className="p-2 active:scale-95 transition-transform"
              >
                <Settings className="w-[20px] h-[20px] text-gray-600" />
              </button>
            </div>
          </div>
          
          {/* Time Frame Selector */}
          <div className="flex items-center gap-2 mt-3">
            {(['today', 'week', 'month'] as const).map((timeFrame) => (
              <button
                key={timeFrame}
                onClick={() => setSelectedTimeFrame(timeFrame)}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                  selectedTimeFrame === timeFrame
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                }`}
              >
                {timeFrame === 'today' ? 'Today' : timeFrame === 'week' ? 'This Week' : 'This Month'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Stats Overview */}
      <div className="px-5 py-4">
        <div className="grid grid-cols-2 gap-3">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 active:scale-[0.98] transition-transform"
            onClick={() => router.push('/admin/orders')}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Orders</p>
                <p className="text-[28px] font-bold text-gray-900 leading-tight mt-1">
                  {stats?.todayOrders || 0}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">
                  {stats?.pendingOrders || 0} pending
                </p>
              </div>
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <Package className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.05 }}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 active:scale-[0.98] transition-transform"
            onClick={() => router.push('/admin/deliveries')}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Active</p>
                <p className="text-[28px] font-bold text-green-600 leading-tight mt-1">
                  {stats?.activeDeliveries || 0}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">
                  Out for delivery
                </p>
              </div>
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                <Navigation className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 active:scale-[0.98] transition-transform"
            onClick={() => router.push('/admin/revenue')}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Revenue</p>
                <p className="text-[24px] font-bold text-gray-900 leading-tight mt-1">
                  ${(stats?.todayRevenue || 0).toFixed(0)}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">
                  {selectedTimeFrame}
                </p>
              </div>
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 }}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 active:scale-[0.98] transition-transform"
            onClick={() => router.push('/admin/balances')}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Outstanding</p>
                <p className="text-[24px] font-bold text-red-600 leading-tight mt-1">
                  ${(stats?.outstandingBalance || 0).toFixed(0)}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">
                  Customer balances
                </p>
              </div>
              <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Urgent Alerts */}
      {urgentOrders.length > 0 && (
        <div className="px-5 py-4 border-t border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h2 className="text-[15px] font-semibold text-red-600">
              Urgent Attention Required
            </h2>
          </div>
          
          <div className="space-y-3">
            {urgentOrders.slice(0, 3).map((order) => (
              <motion.div
                key={order.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-red-50 border border-red-200 rounded-2xl p-4 active:scale-[0.98] transition-transform"
                onClick={() => router.push(`/admin/orders/${order.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {order.status === 'needs_reassignment' ? (
                        <XCircle className="w-4 h-4 text-red-500" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-orange-500" />
                      )}
                      <span className="text-[13px] font-medium text-red-700">
                        {order.status === 'needs_reassignment' 
                          ? 'Needs Reassignment' 
                          : 'Outstanding Balance'
                        }
                      </span>
                    </div>
                    <p className="font-semibold text-[15px] text-gray-900">
                      {order.customer.shop_name}
                    </p>
                    <p className="text-[13px] text-gray-600 mt-0.5">
                      {order.order_number} • ${order.total_amount.toFixed(2)}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Driver Performance */}
      <div className="px-5 py-4 border-t border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold text-gray-900">
            Driver Performance
          </h2>
          <button
            onClick={() => router.push('/admin/drivers')}
            className="text-[13px] font-medium text-blue-600 active:text-blue-700"
          >
            View All
          </button>
        </div>

        <div className="space-y-3">
          {stats?.driverPerformance.slice(0, 4).map((driver, index) => (
            <motion.div
              key={driver.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 active:scale-[0.98] transition-transform"
              onClick={() => router.push(`/admin/drivers/${driver.id}`)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <span className="text-[13px] font-semibold text-blue-600">
                        {driver.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-[15px] text-gray-900">
                        {driver.name}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        Last active: {format(new Date(driver.lastActivity), 'h:mm a')}
                      </p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-[18px] font-bold text-gray-900">
                        {driver.todayDeliveries}
                      </p>
                      <p className="text-[10px] text-gray-500">Deliveries</p>
                    </div>
                    <div>
                      <p className="text-[18px] font-bold text-blue-600">
                        {driver.todayPitches}
                      </p>
                      <p className="text-[10px] text-gray-500">Pitches</p>
                    </div>
                    <div>
                      <p className="text-[18px] font-bold text-green-600">
                        ${driver.revenue.toFixed(0)}
                      </p>
                      <p className="text-[10px] text-gray-500">Revenue</p>
                    </div>
                  </div>
                  
                  {/* Success Rate Bar */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-gray-500">Success Rate</span>
                      <span className="text-[11px] font-medium text-gray-700">
                        {driver.successRate.toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${driver.successRate}%` }}
                        transition={{ duration: 1, delay: index * 0.1 }}
                        className="bg-green-500 h-1.5 rounded-full"
                      />
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 ml-3" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Recent Orders */}
      <div className="px-5 py-4 border-t border-gray-100 pb-safe">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold text-gray-900">
            Recent Orders
          </h2>
          <button
            onClick={() => router.push('/admin/orders')}
            className="text-[13px] font-medium text-blue-600 active:text-blue-700"
          >
            View All
          </button>
        </div>

        <div className="space-y-3">
          {recentOrders.map((order) => (
            <motion.div
              key={order.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 active:scale-[0.98] transition-transform"
              onClick={() => router.push(`/admin/orders/${order.id}`)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {order.status === 'delivered' ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : order.status === 'out_for_delivery' ? (
                      <Navigation className="w-4 h-4 text-blue-500" />
                    ) : order.status === 'needs_reassignment' ? (
                      <XCircle className="w-4 h-4 text-red-500" />
                    ) : (
                      <Clock className="w-4 h-4 text-orange-500" />
                    )}
                    <span className={`text-[11px] font-medium px-2 py-1 rounded-full ${
                      order.status === 'delivered' ? 'bg-green-50 text-green-700' :
                      order.status === 'out_for_delivery' ? 'bg-blue-50 text-blue-700' :
                      order.status === 'needs_reassignment' ? 'bg-red-50 text-red-700' :
                      'bg-orange-50 text-orange-700'
                    }`}>
                      {order.status.replace('_', ' ')}
                    </span>
                  </div>
                  
                  <p className="font-semibold text-[15px] text-gray-900">
                    {order.customer.shop_name}
                  </p>
                  <p className="text-[13px] text-gray-600 mt-0.5">
                    {order.order_number} • {order.driver?.name || 'Unassigned'}
                  </p>
                  <p className="text-[13px] text-gray-500 mt-1">
                    ${order.total_amount.toFixed(2)} • {format(new Date(order.created_at), 'h:mm a')}
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Bottom Safe Area */}
      <div style={{ height: 'env(safe-area-inset-bottom)' }} />
    </div>
  )
}