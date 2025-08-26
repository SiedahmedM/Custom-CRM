'use client'

import { useEffect, useState, useCallback } from 'react'
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
  ChevronRight,
  Archive,
  UserCheck,
  X,
  Target,
  TrendingUp,
  Trophy,
  Zap,
  Home,
  FileText,
  Users
} from 'lucide-react'
import { useRealtimeOrders } from '@/hooks/useRealtimeOrders'
import { useRealtimePitches } from '@/hooks/useRealtimePitches'
import { format, startOfToday, subWeeks, subMonths, subYears, isToday } from 'date-fns'
import { motion, AnimatePresence } from 'framer-motion'
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
  const [selectedTimeFrame, setSelectedTimeFrame] = useState<'today' | 'week' | 'month' | 'year'>('today')
  const [showReassignModal, setShowReassignModal] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<{
    id: string
    order_number: string
    total_amount: number
    customer: { shop_name: string }
  } | null>(null)
  const [dismissedOrders, setDismissedOrders] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'home' | 'orders' | 'reports' | 'drivers'>('home')

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

  // Get real-time pitches
  const {
    pitches,
    driverPerformance: pitchDriverPerformance,
    connectionStatus: pitchConnectionStatus
  } = useRealtimePitches({
    date_range: {
      start: (() => {
        const now = new Date()
        switch (selectedTimeFrame) {
          case 'today':
            return startOfToday()
          case 'week':
            return subWeeks(now, 1)
          case 'month':
            return subMonths(now, 1)
          case 'year':
          default:
            return subYears(now, 1)
        }
      })(),
      end: new Date()
    }
  })

  // Get dashboard stats
  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ['dashboard-stats', selectedTimeFrame],
    queryFn: async (): Promise<DashboardStats> => {
      const now = new Date()
      let startDate: Date

      switch (selectedTimeFrame) {
        case 'today':
          startDate = startOfToday()
          break
        case 'week':
          startDate = subWeeks(now, 1)
          break
        case 'month':
          startDate = subMonths(now, 1)
          break
        case 'year':
        default:
          startDate = subYears(now, 1)
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
        .lte('created_at', new Date().toISOString())

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

      const nowDate = new Date()
      const inCreatedRange = (o: {created_at: string}) => new Date(o.created_at) >= startDate && new Date(o.created_at) <= nowDate
      const inStartedRange = (o: {delivery_started_at?: string | null}) => !!o.delivery_started_at && new Date(o.delivery_started_at) >= startDate && new Date(o.delivery_started_at) <= nowDate
      const inDeliveredRange = (o: {delivered_at?: string | null}) => !!o.delivered_at && new Date(o.delivered_at) >= startDate && new Date(o.delivered_at) <= nowDate

      const frameOrders = (timeFrameOrders || []).filter(inCreatedRange)
      const pendingOrders = frameOrders.filter((o: {status: string}) => o.status === 'pending' || o.status === 'needs_reassignment')
      const activeDeliveries = (timeFrameOrders || []).filter((o: {status: string; delivery_started_at?: string | null}) => o.status === 'out_for_delivery' && inStartedRange(o))
      const deliveredOrders = (timeFrameOrders || []).filter((o: {status: string; delivered_at?: string | null}) => o.status === 'delivered' && inDeliveredRange(o))
      
      const outstandingBalance = (customers || []).reduce((sum, c: {current_balance: number}) => sum + c.current_balance, 0)
      const todayRevenue = deliveredOrders.reduce((sum, o: {total_amount: number}) => sum + o.total_amount, 0)

      // Calculate driver performance
      const driverPerformance = (drivers || []).map((driver: {id: string; name: string; last_login?: string; created_at: string; orders?: {status: string; total_amount: number; created_at: string}[]; pitches?: {interest_level: string; created_at: string}[]}) => {
        const inRangeGeneric = (d: string) => {
          const dt = new Date(d)
          return dt >= startDate && dt <= nowDate
        }
        const driverOrders = (driver.orders || []).filter(o => inRangeGeneric(o.created_at))
        const driverPitches = (driver.pitches || []).filter(p => inRangeGeneric(p.created_at))

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
        todayOrders: frameOrders.length,
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

  // Refetch stats when orders change
  useEffect(() => {
    refetchStats()
  }, [orders?.length, refetchStats])

  // Filter orders for display (exclude dismissed orders)
  const urgentOrders = orders.filter(o => 
    !dismissedOrders.has(o.id) && (
      o.status === 'needs_reassignment' || 
      (o.customer?.current_balance > 0 && o.status === 'pending')
    )
  )

  // Show orders from last 24 hours
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const recentOrders = orders
    .filter(o => new Date(o.created_at) >= twentyFourHoursAgo && !dismissedOrders.has(o.id))
    .slice(0, 10)

  const clearRecentOrder = (orderId: string) => {
    setDismissedOrders(prev => new Set([...prev, orderId]))
    toast.success('Order cleared from recent list')
  }

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

  const handleDismissOrder = (orderId: string) => {
    setDismissedOrders(prev => new Set([...prev, orderId]))
    toast.success('Alert dismissed')
  }

  const handleReassignOrder = (order: {
    id: string
    order_number: string
    total_amount: number
    customer: { shop_name: string }
  }) => {
    setSelectedOrder(order)
    setShowReassignModal(true)
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
                onClick={() => router.push('/admin/reports')}
                className="px-3 py-1.5 bg-gray-100 rounded-lg text-[13px] font-medium active:bg-gray-200"
              >
                Reports
              </button>
              <button
                onClick={() => router.push('/admin')}
                className="p-2 active:scale-95 transition-transform"
              >
                <Home className="w-[20px] h-[20px] text-gray-600" />
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
            {(['today', 'week', 'month', 'year'] as const).map((timeFrame) => (
              <button
                key={timeFrame}
                onClick={() => setSelectedTimeFrame(timeFrame)}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                  selectedTimeFrame === timeFrame
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 active:bg-gray-200'
                }`}
              >
                {timeFrame === 'today' ? 'Today' : timeFrame === 'week' ? 'This Week' : timeFrame === 'month' ? 'This Month' : 'This Year'}
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

        {/* Inventory Quick Access */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-200 active:scale-[0.98] transition-transform mt-3"
          onClick={() => router.push('/admin/inventory')}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">Inventory</p>
              <p className="text-[24px] font-bold text-gray-900 leading-tight mt-1">
                {stats?.lowStockItems || 0}
              </p>
              <p className="text-[11px] text-gray-500 mt-1">
                Items need restocking
              </p>
            </div>
            <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
              <Archive className="w-5 h-5 text-orange-600" />
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 ml-3" />
          </div>
        </motion.div>
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
                className="bg-red-50 border border-red-200 rounded-2xl p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 cursor-pointer" onClick={() => router.push(`/admin/orders/${order.id}`)}>
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
                  
                  {/* Action buttons - only show for orders that need reassignment */}
                  <div className="flex items-center gap-2 ml-3">
                    {order.status === 'needs_reassignment' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleReassignOrder(order)
                        }}
                        className="bg-blue-600 text-white p-2 rounded-lg active:bg-blue-700 transition-colors"
                        title="Reassign to another driver"
                      >
                        <UserCheck className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDismissOrder(order.id)
                      }}
                      className="bg-gray-600 text-white p-2 rounded-lg active:bg-gray-700 transition-colors"
                      title="Dismiss alert"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* TOTAL PITCHES CARD */}
      <div className="px-5 py-4 border-t border-gray-100">
        <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-2xl p-4 shadow-sm border border-purple-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-purple-600 rounded-xl flex items-center justify-center">
                <Target className="w-4 h-4 text-white" />
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-gray-900">Total Pitches</h3>
                <p className="text-[11px] text-purple-600">Across all drivers</p>
              </div>
            </div>
            {/* Time Filter Selector */}
            <div className="flex items-center gap-1">
              {(['today', 'week', 'month', 'year'] as const).map((timeFrame) => (
                <button
                  key={timeFrame}
                  onClick={() => setSelectedTimeFrame(timeFrame)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${
                    selectedTimeFrame === timeFrame
                      ? 'bg-purple-600 text-white'
                      : 'bg-white/50 text-gray-600 active:bg-white'
                  }`}
                >
                  {timeFrame === 'today' ? 'Day' : timeFrame === 'week' ? 'Week' : timeFrame === 'month' ? 'Month' : 'Year'}
                </button>
              ))}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-[32px] font-bold text-purple-600">
                {pitches.length}
              </p>
              <p className="text-[12px] text-gray-600 mt-1">
                Total Pitches {selectedTimeFrame === 'today' ? 'Today' : `This ${selectedTimeFrame.charAt(0).toUpperCase() + selectedTimeFrame.slice(1)}`}
              </p>
            </div>
            <div className="text-center">
              <p className="text-[32px] font-bold text-green-600">
                {pitches.filter(p => p.interest_level === 'high').length}
              </p>
              <p className="text-[12px] text-gray-600 mt-1">
                High Interest
              </p>
            </div>
          </div>
          
          <div className="mt-3 pt-3 border-t border-purple-100">
            <div className="flex items-center justify-between text-[11px] text-gray-600">
              <span>Success Rate</span>
              <span className="font-medium text-green-600">
                {pitches.length > 0 
                  ? Math.round((pitches.filter(p => p.interest_level === 'high').length / pitches.length) * 100)
                  : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>

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
            Recent Orders (24 hours)
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/admin/new-order')}
              className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[12px] font-medium active:bg-blue-700 transition-colors"
            >
              + Add Order
            </button>
            {recentOrders.length > 0 && (
              <button
                onClick={() => setDismissedOrders(new Set(recentOrders.map(o => o.id)))}
                className="text-[11px] font-medium text-gray-500 active:text-gray-700 bg-gray-100 px-2 py-1 rounded-lg"
              >
                Clear All
              </button>
            )}
            <button
              onClick={() => router.push('/admin/orders')}
              className="text-[13px] font-medium text-blue-600 active:text-blue-700"
            >
              View All
            </button>
          </div>
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
                <div className="flex-1 cursor-pointer" onClick={() => router.push(`/admin/orders/${order.id}`)}>
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
                <div className="flex items-center gap-2 ml-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      clearRecentOrder(order.id)
                    }}
                    className="p-2 bg-gray-100 text-gray-600 rounded-lg active:bg-gray-200 transition-colors"
                    title="Clear from recent"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Reassign Modal */}
      <AnimatePresence>
        {showReassignModal && selectedOrder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-end justify-center z-50"
            onClick={() => setShowReassignModal(false)}
          >
            <ReassignModal
              order={selectedOrder}
              onClose={() => setShowReassignModal(false)}
              updateOrderStatus={updateOrderStatus}
              onSuccess={() => {
                setShowReassignModal(false)
                setDismissedOrders(prev => new Set([...prev, selectedOrder.id]))
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200/50 z-40"
           style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-4 px-2 py-2">
          <button
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
              activeTab === 'home' 
                ? 'bg-blue-50 text-blue-600' 
                : 'text-gray-500 active:bg-gray-50'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] font-medium">Home</span>
          </button>
          
          <button
            onClick={() => {
              setActiveTab('orders')
              router.push('/admin/orders')
            }}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
              activeTab === 'orders' 
                ? 'bg-blue-50 text-blue-600' 
                : 'text-gray-500 active:bg-gray-50'
            }`}
          >
            <Package className="w-5 h-5" />
            <span className="text-[10px] font-medium">All Orders</span>
          </button>
          
          <button
            onClick={() => {
              setActiveTab('reports')
              router.push('/admin/reports')
            }}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
              activeTab === 'reports' 
                ? 'bg-blue-50 text-blue-600' 
                : 'text-gray-500 active:bg-gray-50'
            }`}
          >
            <FileText className="w-5 h-5" />
            <span className="text-[10px] font-medium">Reports</span>
          </button>
          
          <button
            onClick={() => {
              setActiveTab('drivers')
              router.push('/admin/drivers')
            }}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${
              activeTab === 'drivers' 
                ? 'bg-blue-50 text-blue-600' 
                : 'text-gray-500 active:bg-gray-50'
            }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px] font-medium">Drivers</span>
          </button>
        </div>
      </div>

      {/* Bottom Safe Area */}
      <div style={{ height: 'calc(env(safe-area-inset-bottom) + 70px)' }} />
    </div>
  )
}

// Reassign Modal Component
function ReassignModal({ 
  order, 
  onClose, 
  updateOrderStatus, 
  onSuccess 
}: { 
  order: {
    id: string
    order_number: string
    total_amount: number
    customer: { shop_name: string }
  }
  onClose: () => void
  updateOrderStatus: {
    mutateAsync: (params: {
      orderId?: string
      id?: string
      status: 'pending' | 'assigned' | 'needs_reassignment' | 'out_for_delivery' | 'delivered' | 'cancelled'
      notes?: string
      driverId?: string
    }) => Promise<void>
  }
  onSuccess: () => void
}) {
  const supabase = createClient()
  const [drivers, setDrivers] = useState<Array<{
    id: string
    name: string
    access_key: string
  }>>([])
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const fetchDrivers = useCallback(async () => {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'driver')
      .eq('is_active', true)
      .order('name')
    
    setDrivers(data || [])
  }, [supabase])

  useEffect(() => {
    fetchDrivers()
  }, [fetchDrivers])

  const handleReassign = async () => {
    if (!selectedDriverId) {
      toast.error('Please select a driver')
      return
    }

    setIsSubmitting(true)
    try {
      await updateOrderStatus.mutateAsync({
        orderId: order.id,
        status: 'assigned',
        driverId: selectedDriverId
      })

      toast.success(`Order reassigned successfully!`)
      onSuccess()
    } catch (error) {
      toast.error('Failed to reassign order')
      console.error('Reassign error:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      className="bg-white rounded-t-3xl p-6 w-full max-h-[80vh] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[20px] font-bold text-gray-900">Reassign Order</h2>
        <button
          onClick={onClose}
          className="p-2 active:scale-95 transition-transform"
        >
          <X className="w-6 h-6 text-gray-400" />
        </button>
      </div>

      <div className="bg-gray-50 rounded-2xl p-4 mb-6">
        <p className="text-[13px] text-gray-500 mb-1">Order Details</p>
        <p className="font-semibold text-[15px] text-gray-900">
          {order.customer.shop_name}
        </p>
        <p className="text-[13px] text-gray-600">
          {order.order_number} • ${order.total_amount.toFixed(2)}
        </p>
      </div>

      <div className="mb-6">
        <label className="block text-[13px] font-medium text-gray-700 mb-3">
          Select Driver
        </label>
        <div className="space-y-3 max-h-60 overflow-y-auto">
          {drivers.map((driver) => (
            <button
              key={driver.id}
              onClick={() => setSelectedDriverId(driver.id)}
              className={`w-full p-4 rounded-2xl border transition-all ${
                selectedDriverId === driver.id
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-white border-gray-200 active:bg-gray-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  selectedDriverId === driver.id ? 'bg-blue-100' : 'bg-gray-100'
                }`}>
                  <span className={`text-[13px] font-semibold ${
                    selectedDriverId === driver.id ? 'text-blue-600' : 'text-gray-600'
                  }`}>
                    {driver.name.charAt(0)}
                  </span>
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-[15px] text-gray-900">
                    {driver.name}
                  </p>
                  <p className="text-[13px] text-gray-500">
                    Driver • {driver.access_key}
                  </p>
                </div>
                {selectedDriverId === driver.id && (
                  <CheckCircle className="w-5 h-5 text-blue-600" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 bg-gray-100 text-gray-700 py-3 rounded-xl font-medium text-[15px] active:bg-gray-200 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleReassign}
          disabled={!selectedDriverId || isSubmitting}
          className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-medium text-[15px] active:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <UserCheck className="w-4 h-4" />
          )}
          Reassign Order
        </button>
      </div>
    </motion.div>
  )
}